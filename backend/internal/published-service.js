import crypto from "node:crypto";
import errs from "../lib/error.js";
import { assertPublishPolicy } from "../lib/integration-policy.js";
import certificateModel from "../models/certificate.js";
import hostTemplateModel from "../models/host-template.js";
import idempotencyRecordModel from "../models/idempotency-record.js";
import managedResourceModel from "../models/managed-resource.js";
import proxyHostModel from "../models/proxy_host.js";
import healthCheckModel from "../models/health-check.js";
import internalCertificate from "./certificate.js";
import { emit, notify } from "./events.js";
import internalProxyHost from "./proxy-host.js";

const canonicalize = (value) => {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
	}
	return value;
};

const requestHash = (value) => crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");

const beginIdempotency = async (integrationId, key, payload) => {
	if (!key || key.length > 255) throw new errs.ValidationError("A valid Idempotency-Key header is required");
	const hash = requestHash(payload);
	const existing = await idempotencyRecordModel
		.query()
		.where({ integration_id: integrationId, idempotency_key: key })
		.first();
	if (existing) {
		if (existing.request_hash !== hash) {
			const error = new errs.ValidationError("Idempotency key was already used with a different payload");
			error.status = 409;
			throw error;
		}
		if (existing.response_code === 0) {
			const error = new errs.ValidationError("An identical request is already being processed");
			error.status = 409;
			throw error;
		}
		return { replay: existing.response_body, record: existing };
	}
	try {
		const record = await idempotencyRecordModel.query().insertAndFetch({
			integration_id: integrationId,
			idempotency_key: key,
			request_hash: hash,
			response_code: 0,
			response_body: { status: "processing" },
			expires_on: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
		});
		return { replay: null, record };
	} catch (err) {
		const raced = await idempotencyRecordModel
			.query()
			.where({ integration_id: integrationId, idempotency_key: key })
			.first();
		if (raced) return beginIdempotency(integrationId, key, payload);
		throw err;
	}
};

const finishIdempotency = (record, responseCode, responseBody) =>
	idempotencyRecordModel.query().patchAndFetchById(record.id, {
		response_code: responseCode,
		response_body: responseBody,
	});

const abandonIdempotency = (record) => idempotencyRecordModel.query().deleteById(record.id);

const exactDomains = (left, right) => {
	const a = [...left].map((v) => v.toLowerCase()).sort();
	const b = [...right].map((v) => v.toLowerCase()).sort();
	return a.length === b.length && a.every((value, index) => value === b[index]);
};

const findReusableCertificate = async (domains) => {
	const rows = await certificateModel.query().where("is_deleted", 0).andWhere("provider", "letsencrypt");
	return rows.find((row) => exactDomains(row.domain_names, domains)) || null;
};

const getTemplate = async (integration, templateId) => {
	if (!templateId) return {};
	if (!integration.policy.allowed_template_ids?.includes(templateId)) {
		throw new errs.PermissionError("Template is outside the integration policy");
	}
	const template = await hostTemplateModel.query().where("uuid", templateId).orWhere("id", templateId).first();
	if (!template) throw new errs.ItemNotFoundError(templateId);
	return template.configuration || {};
};

const resolveResource = async (integrationId, id) => {
	const query = managedResourceModel.query().where("integration_id", integrationId);
	const resource = /^\d+$/.test(`${id}`)
		? await query.clone().where("id", Number(id)).first()
		: await query.clone().where((builder) => builder.where("uuid", id).orWhere("external_id", id)).first();
	if (!resource) throw new errs.ItemNotFoundError(id);
	return resource;
};

const representation = async (resource) => {
	const proxyHost = await proxyHostModel
		.query()
		.where("id", resource.resource_id)
		.where("is_deleted", 0)
		.withGraphFetched("[certificate,owner,access_lists.[clients,items]]")
		.first();
	return {
		id: resource.uuid,
		external_id: resource.external_id,
		status: proxyHost?.meta?.nginx_online === false ? "error" : resource.status,
		integration_id: resource.integration_id,
		resource_type: resource.resource_type,
		resource_id: resource.resource_id,
		certificate_id: resource.certificate_id || null,
		domain_names: proxyHost?.domain_names || [],
		upstream: proxyHost
			? { scheme: proxyHost.forward_scheme, host: proxyHost.forward_host, port: proxyHost.forward_port }
			: null,
		tls: proxyHost
			? {
				enabled: Boolean(proxyHost.certificate_id),
				forced: proxyHost.ssl_forced,
				http2: proxyHost.http2_support,
				http3: proxyHost.npmplus_http3_support,
				certificate: proxyHost.certificate || null,
			}
			: null,
		health: resource.meta?.health || null,
		metadata: resource.meta?.external || {},
		created_on: resource.created_on,
		modified_on: resource.modified_on,
	};
};

const cleanupCertificateIfUnused = async (access, certificateId) => {
	if (!certificateId) return;
	const references = await proxyHostModel
		.query()
		.where("certificate_id", certificateId)
		.where("is_deleted", 0)
		.resultSize();
	if (references === 0) {
		const certificate = await certificateModel.query().findById(certificateId);
		if (certificate?.meta?.managed_by === "published-service") {
			await internalCertificate.delete(access, { id: certificateId });
		}
	}
};

const preflight = async (integration, payload) => {
	if (!payload.external_id?.trim()) throw new errs.ValidationError("external_id is required");
	if (!Array.isArray(payload.domain_names) || payload.domain_names.length === 0) {
		throw new errs.ValidationError("At least one domain name is required");
	}
	assertPublishPolicy(integration.policy || {}, payload);
	if (process.env.PUBLISH_SKIP_DNS_PREFLIGHT !== "true") {
		for (const domain of payload.domain_names) {
			const result = await internalCertificate.performTestForDomain(domain);
			if (result !== "ok") {
				throw new errs.ValidationError(`DNS/HTTP challenge preflight failed for ${domain}: ${result}`);
			}
		}
	}
};

const create = async ({ access, integration, payload, idempotencyKey }) => {
	const idempotency = await beginIdempotency(integration.id, idempotencyKey, { operation: "create", payload });
	if (idempotency.replay) return { body: idempotency.replay, replayed: true };

	let certificate = null;
	let certificateCreated = false;
	let proxyHost = null;
	try {
		await preflight(integration, payload);
		const duplicate = await managedResourceModel
			.query()
			.where({ integration_id: integration.id, external_id: payload.external_id.trim() })
			.first();
		if (duplicate) {
			const error = new errs.ValidationError("external_id already exists for this integration");
			error.status = 409;
			throw error;
		}

		const template = await getTemplate(integration, payload.template_id);
		certificate = await findReusableCertificate(payload.domain_names);
		if (!certificate) {
			certificate = await internalCertificate.createQuickCertificate(access, {
				domain_names: payload.domain_names,
				meta: { managed_by: "published-service", integration_id: integration.id },
			});
			certificateCreated = true;
		}

		const upstream = payload.upstream || {};
		proxyHost = await internalProxyHost.create(access, {
			...template,
			domain_names: payload.domain_names,
			forward_scheme: upstream.scheme || payload.forward_scheme || "http",
			forward_host: upstream.host || payload.forward_host,
			forward_port: Number(upstream.port || payload.forward_port),
			certificate_id: certificate.id,
			ssl_forced: true,
			http2_support: true,
			npmplus_http3_support: true,
			block_exploits: template.block_exploits !== false,
			enabled: true,
			meta: { ...(template.meta || {}), managed_by: "published-service", integration_id: integration.id },
		});
		const verified = await proxyHostModel.query().findById(proxyHost.id);
		if (verified?.meta?.nginx_online === false) {
			throw new errs.ConfigurationError(verified.meta.nginx_err || "NGINX configuration validation failed");
		}

		const managed = await managedResourceModel.query().insertAndFetch({
			integration_id: integration.id,
			external_id: payload.external_id.trim(),
			resource_type: "proxy_host",
			resource_id: proxyHost.id,
			certificate_id: certificate.id,
			status: "active",
			meta: { external: payload.metadata || {}, template_id: payload.template_id || null },
		});
		if (template.health_check?.is_enabled) {
			await healthCheckModel.query().insert({
				resource_type: "proxy_host",
				resource_id: proxyHost.id,
				is_enabled: true,
				check_type: template.health_check.check_type || "http",
				path: template.health_check.path || "/",
				interval_seconds: template.health_check.interval_seconds || 30,
				timeout_seconds: template.health_check.timeout_seconds || 5,
				failure_threshold: template.health_check.failure_threshold || 3,
				success_threshold: template.health_check.success_threshold || 2,
			});
		}
		const body = await representation(managed);
		await finishIdempotency(idempotency.record, 201, body);
		await emit("published_service.created", { published_service: body }, integration.owner_user_id);
		return { body, replayed: false };
	} catch (err) {
		if (proxyHost?.id) {
			try {
				await internalProxyHost.delete(access, { id: proxyHost.id });
			} catch {}
		}
		if (certificateCreated && certificate?.id) {
			try {
				await cleanupCertificateIfUnused(access, certificate.id);
			} catch {}
		}
		await abandonIdempotency(idempotency.record);
		await notify({
			userId: integration.owner_user_id,
			severity: "error",
			eventType: "published_service.failed",
			title: "Service publishing failed",
			message: `${payload.external_id || "Unknown service"}: ${err.message}`,
			resourceType: "published_service",
			resourceId: payload.external_id || "",
			deduplicationKey: `publish:${integration.id}:${payload.external_id}:${requestHash(payload)}`,
		});
		throw err;
	}
};

const proxySnapshot = (row) => {
	const fields = [
		"domain_names",
		"forward_scheme",
		"forward_host",
		"forward_port",
		"certificate_id",
		"ssl_forced",
		"hsts_enabled",
		"hsts_subdomains",
		"trust_forwarded_proto",
		"http2_support",
		"npmplus_http3_support",
		"block_exploits",
		"caching_enabled",
		"allow_websocket_upgrade",
		"npmplus_access_list_ids",
		"npmplus_access_list_type",
		"npmplus_noindex",
		"npmplus_crowdsec_appsec",
		"npmplus_proxy_request_buffering",
		"npmplus_proxy_response_buffering",
		"npmplus_disable_uri_sanitisation",
		"npmplus_spoof_host_header",
		"npmplus_upstream_compression",
		"npmplus_fancyindex",
		"npmplus_x_frame_options",
		"npmplus_auth_request",
		"npmplus_auth_request_upstream",
		"advanced_config",
		"npmplus_location_config",
		"locations",
		"enabled",
		"meta",
	];
	return Object.fromEntries(fields.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
};

const update = async ({ access, integration, id, payload, idempotencyKey }) => {
	const idempotency = await beginIdempotency(integration.id, idempotencyKey, { operation: "update", id, payload });
	if (idempotency.replay) return { body: idempotency.replay, replayed: true };
	const resource = await resolveResource(integration.id, id);
	const oldHost = await proxyHostModel.query().findById(resource.resource_id);
	if (!oldHost || oldHost.is_deleted) throw new errs.ItemNotFoundError(id);
	const snapshot = proxySnapshot(oldHost);
	let certificate = await certificateModel.query().findById(oldHost.certificate_id);
	let certificateCreated = false;
	try {
		const upstream = payload.upstream || {};
		const proposed = {
			external_id: resource.external_id,
			domain_names: payload.domain_names || oldHost.domain_names,
			forward_scheme: upstream.scheme || payload.forward_scheme || oldHost.forward_scheme,
			forward_host: upstream.host || payload.forward_host || oldHost.forward_host,
			forward_port: Number(upstream.port || payload.forward_port || oldHost.forward_port),
			template_id: payload.template_id || resource.meta?.template_id,
		};
		await preflight(integration, proposed);
		const template = await getTemplate(integration, proposed.template_id);
		if (!certificate || !exactDomains(certificate.domain_names, proposed.domain_names)) {
			certificate = await findReusableCertificate(proposed.domain_names);
			if (!certificate) {
				certificate = await internalCertificate.createQuickCertificate(access, {
					domain_names: proposed.domain_names,
					meta: { managed_by: "published-service", integration_id: integration.id },
				});
				certificateCreated = true;
			}
		}
		const updated = await internalProxyHost.update(access, {
			id: oldHost.id,
			...template,
			domain_names: proposed.domain_names,
			forward_scheme: proposed.forward_scheme,
			forward_host: proposed.forward_host,
			forward_port: proposed.forward_port,
			certificate_id: certificate.id,
			ssl_forced: true,
			http2_support: true,
			npmplus_http3_support: true,
			meta: { ...(oldHost.meta || {}), ...(template.meta || {}), managed_by: "published-service" },
		});
		if (updated.meta?.nginx_online === false) {
			throw new errs.ConfigurationError(updated.meta.nginx_err || "NGINX configuration validation failed");
		}
		const managed = await managedResourceModel.query().patchAndFetchById(resource.id, {
			certificate_id: certificate.id,
			status: "active",
			meta: {
				...resource.meta,
				external: payload.metadata ?? resource.meta?.external ?? {},
				template_id: proposed.template_id || null,
			},
		});
		if (oldHost.certificate_id !== certificate.id) await cleanupCertificateIfUnused(access, oldHost.certificate_id);
		const body = await representation(managed);
		await finishIdempotency(idempotency.record, 200, body);
		await emit("published_service.updated", { published_service: body }, integration.owner_user_id);
		return { body, replayed: false };
	} catch (err) {
		try {
			await internalProxyHost.update(access, { id: oldHost.id, ...snapshot });
		} catch {}
		if (certificateCreated && certificate?.id) {
			try {
				await cleanupCertificateIfUnused(access, certificate.id);
			} catch {}
		}
		await abandonIdempotency(idempotency.record);
		await notify({
			userId: integration.owner_user_id,
			severity: "error",
			eventType: "published_service.failed",
			title: "Service update failed",
			message: `${resource.external_id}: ${err.message}`,
			resourceType: "published_service",
			resourceId: resource.uuid,
			deduplicationKey: `publish-update:${integration.id}:${resource.uuid}:${requestHash(payload)}`,
		});
		throw err;
	}
};

const remove = async ({ access, integration, id }) => {
	const resource = await resolveResource(integration.id, id);
	const body = await representation(resource);
	await internalProxyHost.delete(access, { id: resource.resource_id });
	await healthCheckModel.query().where({ resource_type: "proxy_host", resource_id: resource.resource_id }).delete();
	await managedResourceModel.query().deleteById(resource.id);
	await cleanupCertificateIfUnused(access, resource.certificate_id);
	await emit("published_service.deleted", { published_service: body }, integration.owner_user_id);
};

export default {
	beginIdempotency,
	finishIdempotency,
	abandonIdempotency,
	create,
	update,
	remove,
	get: async (integrationId, id) => representation(await resolveResource(integrationId, id)),
	list: async (integrationId) => {
		const rows = await managedResourceModel
			.query()
			.where("integration_id", integrationId)
			.orderBy("created_on", "desc");
		return Promise.all(rows.map(representation));
	},
};
