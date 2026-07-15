import { getCompiledSchema } from "./index.js";

const transformPath = (path) => {
	if (path.startsWith("/nginx/")) return path.replace("/nginx/", "/");
	if (path.startsWith("/audit-log")) return path.replace("/audit-log", "/audit-events");
	return path;
};

const security = [{ cookieAuth: [] }, { bearerAuth: [] }];
const secured = (operation) => ({ ...operation, security });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const content = (schema) => ({ "application/json": { schema } });
const response = (description, schema) => ({ description, ...(schema ? { content: content(schema) } : {}) });
const body = (schema, required = true) => ({ required, content: content(schema) });
const pathParameter = (name, description = name) => ({
	in: "path",
	name,
	required: true,
	description,
	schema: { oneOf: [{ type: "integer" }, { type: "string" }] },
});
const integrationQuery = {
	in: "query",
	name: "integration_id",
	description: "Required for browser sessions; inferred from integration API keys.",
	schema: { type: "integer" },
};
const idempotencyHeader = {
	in: "header",
	name: "Idempotency-Key",
	required: true,
	description: "Unique mutation key retained for 24 hours. Exact retries replay the original response.",
	schema: { type: "string", maxLength: 255 },
};

const operation = ({ operationId, summary, tag, request, schema, status = "200", parameters = [] }) => ({
	operationId,
	summary,
	tags: [tag],
	security,
	...(parameters.length ? { parameters } : {}),
	...(request ? { requestBody: body(request) } : {}),
	responses: {
		[status]: response(status === "204" ? "No content" : "Successful response", status === "204" ? null : schema),
		default: response("Problem response", ref("Problem")),
	},
});

const platformSchemas = {
	Problem: {
		type: "object",
		required: ["title", "status", "detail"],
		properties: {
			type: { type: "string", format: "uri" },
			title: { type: "string" },
			status: { type: "integer" },
			detail: { type: "string" },
			request_id: { type: "string" },
		},
	},
	IntegrationPolicy: {
		type: "object",
		required: ["allowed_domain_suffixes", "allowed_upstream_cidrs", "allowed_ports", "allowed_schemes"],
		properties: {
			allowed_domain_suffixes: { type: "array", items: { type: "string" } },
			allowed_upstream_cidrs: { type: "array", items: { type: "string" } },
			allowed_ports: { type: "array", items: { oneOf: [{ type: "integer" }, { type: "string" }] } },
			allowed_schemes: { type: "array", items: { type: "string", enum: ["http", "https"] } },
			allowed_template_ids: { type: "array", items: { type: "string" } },
		},
	},
	IntegrationKey: {
		type: "object",
		properties: {
			id: { type: "integer" },
			name: { type: "string" },
			prefix: { type: "string" },
			token: { type: "string", description: "Only present in the key creation response." },
			created_on: { type: "string", format: "date-time" },
			expires_on: { type: ["string", "null"], format: "date-time" },
			revoked_on: { type: ["string", "null"], format: "date-time" },
			last_used_on: { type: ["string", "null"], format: "date-time" },
			last_used_ip: { type: "string" },
		},
	},
	Integration: {
		type: "object",
		required: ["name", "policy", "scopes"],
		properties: {
			id: { type: "integer" },
			uuid: { type: "string", format: "uuid" },
			name: { type: "string" },
			description: { type: "string" },
			is_enabled: { type: "boolean" },
			scopes: { type: "array", items: { type: "string" } },
			policy: ref("IntegrationPolicy"),
			rate_limit: { type: "integer", minimum: 1 },
			keys: { type: "array", items: ref("IntegrationKey") },
			created_key: ref("IntegrationKey"),
		},
	},
	PublishedServiceInput: {
		type: "object",
		required: ["external_id", "domain_names", "upstream"],
		properties: {
			integration_id: { type: "integer", description: "Required only for browser sessions." },
			external_id: { type: "string" },
			domain_names: { type: "array", minItems: 1, items: { type: "string", format: "hostname" } },
			upstream: {
				type: "object",
				required: ["scheme", "host", "port"],
				properties: {
					scheme: { type: "string", enum: ["http", "https"] },
					host: { type: "string", description: "An IP address inside the integration CIDR policy." },
					port: { type: "integer", minimum: 1, maximum: 65535 },
				},
			},
			template_id: { type: "string" },
			metadata: { type: "object", additionalProperties: true },
		},
	},
	PublishedService: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			external_id: { type: "string" },
			status: { type: "string", enum: ["active", "error"] },
			integration_id: { type: "integer" },
			resource_type: { type: "string" },
			resource_id: { type: "integer" },
			certificate_id: { type: ["integer", "null"] },
			domain_names: { type: "array", items: { type: "string" } },
			upstream: ref("Upstream"),
			tls: { type: "object", additionalProperties: true },
			health: { type: ["object", "null"], additionalProperties: true },
			metadata: { type: "object", additionalProperties: true },
			created_on: { type: "string", format: "date-time" },
			modified_on: { type: "string", format: "date-time" },
		},
	},
	Upstream: {
		type: ["object", "null"],
		properties: { scheme: { type: "string" }, host: { type: "string" }, port: { type: "integer" } },
	},
	HostTemplate: {
		type: "object",
		required: ["name"],
		properties: {
			id: { type: "integer" },
			uuid: { type: "string", format: "uuid" },
			name: { type: "string" },
			description: { type: "string" },
			is_default: { type: "boolean" },
			configuration: { type: "object", additionalProperties: true },
			meta: { type: "object", additionalProperties: true },
		},
	},
	HealthCheck: {
		type: "object",
		properties: {
			id: { type: "integer" },
			resource_type: { type: "string", enum: ["proxy_host", "stream"] },
			resource_id: { type: "integer" },
			is_enabled: { type: "boolean" },
			check_type: { type: "string", enum: ["http", "tcp"] },
			path: { type: "string" },
			interval_seconds: { type: "integer" },
			timeout_seconds: { type: "integer" },
			failure_threshold: { type: "integer" },
			success_threshold: { type: "integer" },
			status: { type: "string", enum: ["unknown", "healthy", "unhealthy"] },
			last_checked_on: { type: ["string", "null"], format: "date-time" },
			last_latency_ms: { type: ["integer", "null"] },
			last_error: { type: "string" },
		},
	},
	Notification: {
		type: "object",
		properties: {
			id: { type: "integer" },
			severity: { type: "string" },
			event_type: { type: "string" },
			title: { type: "string" },
			message: { type: "string" },
			resource_type: { type: "string" },
			resource_id: { type: "string" },
			read_on: { type: ["string", "null"], format: "date-time" },
			created_on: { type: "string", format: "date-time" },
		},
	},
	Webhook: {
		type: "object",
		required: ["name", "url"],
		properties: {
			id: { type: "integer" },
			uuid: { type: "string", format: "uuid" },
			name: { type: "string" },
			url: { type: "string", format: "uri" },
			is_enabled: { type: "boolean" },
			events: { type: "array", items: { type: "string" } },
			secret: { type: "string", description: "Only present in the webhook creation response." },
		},
	},
	WebhookDelivery: {
		type: "object",
		properties: {
			id: { type: "integer" },
			event_id: { type: "string" },
			event_type: { type: "string" },
			status: { type: "string" },
			attempts: { type: "integer" },
			response_status: { type: ["integer", "null"] },
			last_error: { type: "string" },
		},
	},
	SavedView: {
		type: "object",
		required: ["resource_type", "name", "configuration"],
		properties: {
			id: { type: "integer" },
			uuid: { type: "string", format: "uuid" },
			resource_type: { type: "string" },
			name: { type: "string" },
			configuration: { type: "object", additionalProperties: true },
		},
	},
	DataCollection: {
		type: "object",
		properties: { data: { type: "array", items: {} }, meta: { type: "object", additionalProperties: true } },
	},
};

const collection = (item) => ({
	type: "object",
	properties: { data: { type: "array", items: ref(item) }, meta: { type: "object", additionalProperties: true } },
});

const getV1Schema = async () => {
	const legacy = structuredClone(await getCompiledSchema());
	const paths = {};
	for (const [path, definition] of Object.entries(legacy.paths)) {
		if (["/tokens", "/tokens/2fa", "/schema"].includes(path)) continue;
		paths[transformPath(path)] = Object.fromEntries(
			Object.entries(definition).map(([method, legacyOperation]) => [
				method === "put" ? "patch" : method,
				secured(legacyOperation),
			]),
		);
	}
	Object.assign(paths, {
		"/session": {
			get: operation({
				operationId: "getSession",
				summary: "Get current session",
				tag: "authentication",
				schema: { type: "object", additionalProperties: true },
			}),
		},
		"/published-services": {
			get: operation({
				operationId: "listPublishedServices",
				summary: "List managed published services",
				tag: "published-services",
				schema: collection("PublishedService"),
				parameters: [integrationQuery],
			}),
			post: operation({
				operationId: "createPublishedService",
				summary: "Atomically publish a managed service",
				tag: "published-services",
				request: ref("PublishedServiceInput"),
				schema: ref("PublishedService"),
				status: "201",
				parameters: [idempotencyHeader],
			}),
		},
		"/published-services/{serviceID}": {
			get: operation({
				operationId: "getPublishedService",
				summary: "Get a managed published service",
				tag: "published-services",
				schema: ref("PublishedService"),
				parameters: [pathParameter("serviceID"), integrationQuery],
			}),
			patch: operation({
				operationId: "updatePublishedService",
				summary: "Update a managed published service",
				tag: "published-services",
				request: { ...ref("PublishedServiceInput") },
				schema: ref("PublishedService"),
				parameters: [pathParameter("serviceID"), idempotencyHeader],
			}),
			delete: operation({
				operationId: "deletePublishedService",
				summary: "Delete a managed published service",
				tag: "published-services",
				status: "204",
				parameters: [pathParameter("serviceID"), integrationQuery],
			}),
		},
		"/integrations": {
			get: operation({
				operationId: "listIntegrations",
				summary: "List integration credentials",
				tag: "integrations",
				schema: { type: "array", items: ref("Integration") },
			}),
			post: operation({
				operationId: "createIntegration",
				summary: "Create an integration and initial key",
				tag: "integrations",
				request: ref("Integration"),
				schema: ref("Integration"),
				status: "201",
			}),
		},
		"/integrations/{integrationID}": {
			get: operation({
				operationId: "getIntegration",
				summary: "Get an integration",
				tag: "integrations",
				schema: ref("Integration"),
				parameters: [pathParameter("integrationID")],
			}),
			patch: operation({
				operationId: "updateIntegration",
				summary: "Update an integration",
				tag: "integrations",
				request: ref("Integration"),
				schema: ref("Integration"),
				parameters: [pathParameter("integrationID")],
			}),
			delete: operation({
				operationId: "disableIntegration",
				summary: "Disable an integration and revoke its keys",
				tag: "integrations",
				status: "204",
				parameters: [pathParameter("integrationID")],
			}),
		},
		"/integrations/{integrationID}/keys": {
			post: operation({
				operationId: "createIntegrationKey",
				summary: "Create a replacement integration key",
				tag: "integrations",
				request: {
					type: "object",
					properties: {
						name: { type: "string" },
						expires_on: { type: ["string", "null"], format: "date-time" },
					},
				},
				schema: ref("IntegrationKey"),
				status: "201",
				parameters: [pathParameter("integrationID")],
			}),
		},
		"/integrations/{integrationID}/keys/{keyID}": {
			delete: operation({
				operationId: "revokeIntegrationKey",
				summary: "Revoke an integration key",
				tag: "integrations",
				status: "204",
				parameters: [pathParameter("integrationID"), pathParameter("keyID")],
			}),
		},
		"/templates": {
			get: operation({
				operationId: "listHostTemplates",
				summary: "List host templates",
				tag: "templates",
				schema: collection("HostTemplate"),
			}),
			post: operation({
				operationId: "createHostTemplate",
				summary: "Create a host template",
				tag: "templates",
				request: ref("HostTemplate"),
				schema: ref("HostTemplate"),
				status: "201",
			}),
		},
		"/templates/{templateID}": {
			patch: operation({
				operationId: "updateHostTemplate",
				summary: "Update a host template",
				tag: "templates",
				request: ref("HostTemplate"),
				schema: ref("HostTemplate"),
				parameters: [pathParameter("templateID")],
			}),
			delete: operation({
				operationId: "deleteHostTemplate",
				summary: "Delete a host template",
				tag: "templates",
				status: "204",
				parameters: [pathParameter("templateID")],
			}),
		},
		"/health-checks": {
			get: operation({
				operationId: "listHealthChecks",
				summary: "List visible health checks",
				tag: "health",
				schema: collection("HealthCheck"),
			}),
		},
		"/health-checks/{resourceType}/{resourceID}": {
			put: operation({
				operationId: "configureHealthCheck",
				summary: "Configure an opt-in health check",
				tag: "health",
				request: ref("HealthCheck"),
				schema: ref("HealthCheck"),
				parameters: [pathParameter("resourceType"), pathParameter("resourceID")],
			}),
		},
		"/notifications": {
			get: operation({
				operationId: "listNotifications",
				summary: "List notifications",
				tag: "notifications",
				schema: collection("Notification"),
				parameters: [
					{ in: "query", name: "unread", schema: { type: "boolean" } },
					{ in: "query", name: "cursor", schema: { type: "integer" } },
					{ in: "query", name: "limit", schema: { type: "integer", maximum: 100 } },
				],
			}),
		},
		"/notifications/{notificationID}": {
			patch: operation({
				operationId: "acknowledgeNotification",
				summary: "Set notification read state",
				tag: "notifications",
				request: { type: "object", required: ["read"], properties: { read: { type: "boolean" } } },
				schema: ref("Notification"),
				parameters: [pathParameter("notificationID")],
			}),
		},
		"/webhooks": {
			get: operation({
				operationId: "listWebhooks",
				summary: "List signed webhooks",
				tag: "webhooks",
				schema: collection("Webhook"),
			}),
			post: operation({
				operationId: "createWebhook",
				summary: "Create a signed webhook",
				tag: "webhooks",
				request: ref("Webhook"),
				schema: ref("Webhook"),
				status: "201",
			}),
		},
		"/webhooks/{webhookID}": {
			patch: operation({
				operationId: "updateWebhook",
				summary: "Update a signed webhook",
				tag: "webhooks",
				request: ref("Webhook"),
				schema: ref("Webhook"),
				parameters: [pathParameter("webhookID")],
			}),
			delete: operation({
				operationId: "deleteWebhook",
				summary: "Delete a signed webhook",
				tag: "webhooks",
				status: "204",
				parameters: [pathParameter("webhookID")],
			}),
		},
		"/webhooks/{webhookID}/deliveries": {
			get: operation({
				operationId: "listWebhookDeliveries",
				summary: "List recent webhook deliveries",
				tag: "webhooks",
				schema: collection("WebhookDelivery"),
				parameters: [pathParameter("webhookID")],
			}),
		},
		"/saved-views": {
			get: operation({
				operationId: "listSavedViews",
				summary: "List saved filters",
				tag: "saved-views",
				schema: collection("SavedView"),
				parameters: [{ in: "query", name: "resource_type", schema: { type: "string" } }],
			}),
			post: operation({
				operationId: "createSavedView",
				summary: "Create a saved filter",
				tag: "saved-views",
				request: ref("SavedView"),
				schema: ref("SavedView"),
				status: "201",
			}),
		},
		"/saved-views/{savedViewID}": {
			delete: operation({
				operationId: "deleteSavedView",
				summary: "Delete a saved filter",
				tag: "saved-views",
				status: "204",
				parameters: [pathParameter("savedViewID")],
			}),
		},
	});
	return {
		...legacy,
		info: {
			...legacy.info,
			title: "NaCl NPMplus REST API",
			version: "1.0.0",
			description:
				"Supported, versioned API for the NaCl NPMplus UI and service integrations. Browser sessions use a secure cookie; integrations use revocable bearer API keys.",
		},
		servers: [{ url: "/api/v1" }],
		components: {
			...legacy.components,
			securitySchemes: {
				...(legacy.components?.securitySchemes || {}),
				bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "NPMplus API key" },
			},
			schemas: { ...(legacy.components?.schemas || {}), ...platformSchemas },
		},
		paths,
	};
};

export { getV1Schema };
