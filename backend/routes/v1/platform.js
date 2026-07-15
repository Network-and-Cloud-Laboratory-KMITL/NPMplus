import express from "express";
import internalAuditLog from "../../internal/audit-log.js";
import errs from "../../lib/error.js";
import { hasScope, platformAuth } from "../../lib/express/platform-auth.js";
import healthCheckModel from "../../models/health-check.js";
import hostTemplateModel from "../../models/host-template.js";
import notificationModel from "../../models/notification.js";
import managedResourceModel from "../../models/managed-resource.js";
import proxyHostModel from "../../models/proxy_host.js";
import savedViewModel from "../../models/saved-view.js";
import streamModel from "../../models/stream.js";
import userModel from "../../models/user.js";
import webhookDeliveryModel from "../../models/webhook-delivery.js";
import webhookModel from "../../models/webhook.js";
import { publicWebhook } from "../../internal/events.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });
router.use(platformAuth());

const deny = (scope) => {
	const error = new errs.PermissionError();
	error.message = `The credential does not have the '${scope}' scope`;
	return error;
};

const requireActorScope = (res, scope) => {
	if (!hasScope(res.locals.actor, scope)) throw deny(scope);
};

const requireUser = (res) => {
	if (res.locals.actor.type !== "user") throw new errs.PermissionError();
	return res.locals.actor.user_id;
};

const auditPlatform = (res, action, objectType, objectId, meta = {}) =>
	internalAuditLog.add(res.locals.access, {
		action,
		object_type: objectType,
		object_id: objectId,
		meta,
	});

const findUuidOrId = (model, id) => {
	const query = model.query();
	return /^\d+$/.test(`${id}`) ? query.findById(Number(id)) : query.where("uuid", id).first();
};

const authorizeHealthResource = async (res, resourceType, resourceId, write = false) => {
	if (res.locals.actor.type === "integration") {
		const managed = await managedResourceModel
			.query()
			.where({
				integration_id: res.locals.actor.integration.id,
				resource_type: resourceType,
				resource_id: resourceId,
			})
			.first();
		if (!managed) throw new errs.PermissionError("The integration does not own this resource");
		return;
	}
	const permissionType = resourceType === "proxy_host" ? "proxy_hosts" : "streams";
	await res.locals.access.can(`${permissionType}:${write ? "update" : "get"}`, resourceId);
};

const visibleHealthResourceIds = async (res, resourceType) => {
	if (res.locals.actor.type === "integration") {
		return managedResourceModel
			.query()
			.where({ integration_id: res.locals.actor.integration.id, resource_type: resourceType })
			.select("resource_id")
			.then((rows) => rows.map((row) => row.resource_id));
	}
	const permissionType = resourceType === "proxy_host" ? "proxy_hosts" : "streams";
	let permission;
	try {
		permission = await res.locals.access.can(`${permissionType}:list`);
	} catch (err) {
		if (err.status === 403) return [];
		throw err;
	}
	const model = resourceType === "proxy_host" ? proxyHostModel : streamModel;
	const query = model.query().select("id").where("is_deleted", 0);
	if (permission.permission_visibility !== "all") query.where("owner_user_id", res.locals.actor.user_id);
	return query.then((rows) => rows.map((row) => row.id));
};

router.get("/session", async (_req, res, next) => {
	try {
		if (res.locals.actor.type === "integration") {
			const { policy, scopes, id, uuid, name } = res.locals.actor.integration;
			return res.send({ actor_type: "integration", integration: { id, uuid, name, scopes, policy } });
		}
		const user = await userModel
			.query()
			.findById(res.locals.actor.user_id)
			.where("is_deleted", 0)
			.withGraphFetched("permissions");
		res.send({ actor_type: "user", user });
	} catch (err) {
		next(err);
	}
});

router.get("/templates", async (_req, res, next) => {
	try {
		requireActorScope(res, "templates.read");
		let query = hostTemplateModel.query().orderBy("name", "asc");
		if (res.locals.actor.type === "integration") {
			query = query.whereIn("uuid", res.locals.actor.integration.policy.allowed_template_ids || []);
		}
		res.send({ data: await query });
	} catch (err) {
		next(err);
	}
});

router.post("/templates", async (req, res, next) => {
	try {
		requireActorScope(res, "templates.write");
		const ownerUserId = requireUser(res);
		if (!req.body.name?.trim()) throw new errs.ValidationError("Template name is required");
		const row = await hostTemplateModel.query().insertAndFetch({
			owner_user_id: ownerUserId,
			name: req.body.name.trim(),
			description: req.body.description || "",
			is_default: req.body.is_default || false,
			configuration: req.body.configuration || {},
			meta: req.body.meta || {},
		});
		await auditPlatform(res, "created", "host-template", row.id, { name: row.name });
		res.status(201).send(row);
	} catch (err) {
		next(err);
	}
});

router.patch("/templates/:id", async (req, res, next) => {
	try {
		requireActorScope(res, "templates.write");
		const ownerUserId = requireUser(res);
		const row = await findUuidOrId(hostTemplateModel, req.params.id);
		if (!row || row.owner_user_id !== ownerUserId) throw new errs.ItemNotFoundError(req.params.id);
		const allowed = ["name", "description", "is_default", "configuration", "meta"];
		const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
		const updated = await hostTemplateModel.query().patchAndFetchById(row.id, data);
		await auditPlatform(res, "updated", "host-template", row.id, data);
		res.send(updated);
	} catch (err) {
		next(err);
	}
});

router.delete("/templates/:id", async (req, res, next) => {
	try {
		requireActorScope(res, "templates.write");
		const ownerUserId = requireUser(res);
		const row = await findUuidOrId(hostTemplateModel, req.params.id);
		if (!row || row.owner_user_id !== ownerUserId) throw new errs.ItemNotFoundError(req.params.id);
		await hostTemplateModel.query().deleteById(row.id);
		await auditPlatform(res, "deleted", "host-template", row.id, { name: row.name });
		res.status(204).send();
	} catch (err) {
		next(err);
	}
});

router.get("/health-checks", async (_req, res, next) => {
	try {
		requireActorScope(res, "health_checks.read");
		const [proxyHostIds, streamIds] = await Promise.all([
			visibleHealthResourceIds(res, "proxy_host"),
			visibleHealthResourceIds(res, "stream"),
		]);
		const rows = await healthCheckModel.query().orderBy("resource_type", "asc").orderBy("resource_id", "asc");
		res.send({
			data: rows.filter((row) =>
				row.resource_type === "proxy_host"
					? proxyHostIds.includes(row.resource_id)
					: streamIds.includes(row.resource_id),
			),
		});
	} catch (err) {
		next(err);
	}
});

router.put("/health-checks/:resource_type/:resource_id", async (req, res, next) => {
	try {
		requireActorScope(res, "health_checks.write");
		if (!["proxy_host", "stream"].includes(req.params.resource_type)) {
			throw new errs.ValidationError("Unsupported health-check resource type");
		}
		const resourceId = Number(req.params.resource_id);
		if (!Number.isInteger(resourceId) || resourceId < 1) throw new errs.ValidationError("Invalid resource ID");
		await authorizeHealthResource(res, req.params.resource_type, resourceId, true);
		const values = {
			resource_type: req.params.resource_type,
			resource_id: resourceId,
			is_enabled: req.body.is_enabled ?? true,
			check_type: req.body.check_type || "http",
			path: req.body.path || "/",
			interval_seconds: Math.max(10, Math.min(3600, Number(req.body.interval_seconds || 30))),
			timeout_seconds: Math.max(1, Math.min(30, Number(req.body.timeout_seconds || 5))),
			failure_threshold: Math.max(1, Math.min(20, Number(req.body.failure_threshold || 3))),
			success_threshold: Math.max(1, Math.min(20, Number(req.body.success_threshold || 2))),
		};
		const existing = await healthCheckModel
			.query()
			.where({ resource_type: values.resource_type, resource_id: values.resource_id })
			.first();
		const row = existing
			? await healthCheckModel.query().patchAndFetchById(existing.id, values)
			: await healthCheckModel.query().insertAndFetch(values);
		await auditPlatform(res, existing ? "updated" : "created", "health-check", row.id, values);
		res.status(existing ? 200 : 201).send(row);
	} catch (err) {
		next(err);
	}
});

router.get("/notifications", async (req, res, next) => {
	try {
		const userId = requireUser(res);
		const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
		let query = notificationModel
			.query()
			.where("user_id", userId)
			.orderBy("id", "desc")
			.limit(limit + 1);
		if (req.query.cursor) query = query.where("id", "<", Number(req.query.cursor));
		if (req.query.unread === "true") query = query.whereNull("read_on");
		const rows = await query;
		const hasMore = rows.length > limit;
		const data = rows.slice(0, limit);
		res.send({ data, meta: { next_cursor: hasMore ? data.at(-1)?.id : null } });
	} catch (err) {
		next(err);
	}
});

router.patch("/notifications/:id", async (req, res, next) => {
	try {
		const userId = requireUser(res);
		const row = await notificationModel.query().findById(Number(req.params.id));
		if (!row || row.user_id !== userId) throw new errs.ItemNotFoundError(req.params.id);
		res.send(
			await notificationModel
				.query()
				.patchAndFetchById(row.id, { read_on: req.body.read ? new Date().toISOString() : null }),
		);
	} catch (err) {
		next(err);
	}
});

router.get("/webhooks", async (_req, res, next) => {
	try {
		const userId = requireUser(res);
		res.send({
			data: (await webhookModel.query().where("owner_user_id", userId).orderBy("name")).map((row) =>
				publicWebhook(row),
			),
		});
	} catch (err) {
		next(err);
	}
});

router.post("/webhooks", async (req, res, next) => {
	try {
		const userId = requireUser(res);
		const url = new URL(req.body.url);
		if (url.protocol !== "https:" && process.env.WEBHOOK_ALLOW_HTTP !== "true") {
			throw new errs.ValidationError("Webhook URL must use HTTPS");
		}
		const row = await webhookModel.query().insertAndFetch({
			owner_user_id: userId,
			name: req.body.name?.trim() || url.hostname,
			url: url.toString(),
			is_enabled: req.body.is_enabled !== false,
			events: req.body.events || ["*"],
			meta: {},
		});
		await auditPlatform(res, "created", "webhook", row.id, { name: row.name, url: row.url, events: row.events });
		res.status(201).send(publicWebhook(row, true));
	} catch (err) {
		next(err);
	}
});

router.patch("/webhooks/:id", async (req, res, next) => {
	try {
		const userId = requireUser(res);
		const row = await findUuidOrId(webhookModel, req.params.id);
		if (!row || row.owner_user_id !== userId) throw new errs.ItemNotFoundError(req.params.id);
		const allowed = ["name", "url", "is_enabled", "events"];
		const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
		const updated = await webhookModel.query().patchAndFetchById(row.id, data);
		await auditPlatform(res, "updated", "webhook", row.id, data);
		res.send(publicWebhook(updated));
	} catch (err) {
		next(err);
	}
});

router.delete("/webhooks/:id", async (req, res, next) => {
	try {
		const userId = requireUser(res);
		const row = await findUuidOrId(webhookModel, req.params.id);
		if (!row || row.owner_user_id !== userId) throw new errs.ItemNotFoundError(req.params.id);
		await webhookModel.query().deleteById(row.id);
		await auditPlatform(res, "deleted", "webhook", row.id, { name: row.name, url: row.url });
		res.status(204).send();
	} catch (err) {
		next(err);
	}
});

router.get("/webhooks/:id/deliveries", async (req, res, next) => {
	try {
		const userId = requireUser(res);
		const webhook = await findUuidOrId(webhookModel, req.params.id);
		if (!webhook || webhook.owner_user_id !== userId) throw new errs.ItemNotFoundError(req.params.id);
		res.send({
			data: await webhookDeliveryModel.query().where("webhook_id", webhook.id).orderBy("id", "desc").limit(100),
		});
	} catch (err) {
		next(err);
	}
});

router.get("/saved-views", async (req, res, next) => {
	try {
		const userId = requireUser(res);
		let query = savedViewModel.query().where("user_id", userId).orderBy("name");
		if (req.query.resource_type) query = query.where("resource_type", req.query.resource_type);
		res.send({ data: await query });
	} catch (err) {
		next(err);
	}
});

router.post("/saved-views", async (req, res, next) => {
	try {
		const userId = requireUser(res);
		if (!req.body.name || !req.body.resource_type)
			throw new errs.ValidationError("name and resource_type are required");
		const row = await savedViewModel.query().insertAndFetch({ user_id: userId, ...req.body });
		await auditPlatform(res, "created", "saved-view", row.id, { resource_type: row.resource_type, name: row.name });
		res.status(201).send(row);
	} catch (err) {
		next(err);
	}
});

router.delete("/saved-views/:id", async (req, res, next) => {
	try {
		const userId = requireUser(res);
		const row = await findUuidOrId(savedViewModel, req.params.id);
		if (!row || row.user_id !== userId) throw new errs.ItemNotFoundError(req.params.id);
		await savedViewModel.query().deleteById(row.id);
		await auditPlatform(res, "deleted", "saved-view", row.id, { resource_type: row.resource_type, name: row.name });
		res.status(204).send();
	} catch (err) {
		next(err);
	}
});

export default router;
