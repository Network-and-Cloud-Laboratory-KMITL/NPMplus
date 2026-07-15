import { camelizeKeys, decamelizeKeys } from "humps";

export interface IntegrationPolicy {
	allowedDomainSuffixes: string[];
	allowedUpstreamCidrs: string[];
	allowedPorts: Array<number | string>;
	allowedSchemes: string[];
	allowedTemplateIds: string[];
}

export interface IntegrationKey {
	id: number;
	name: string;
	prefix: string;
	createdOn: string;
	expiresOn: string | null;
	revokedOn: string | null;
	lastUsedOn: string | null;
	lastUsedIp: string;
	token?: string;
}

export interface Integration {
	id: number;
	uuid: string;
	name: string;
	description: string;
	isEnabled: boolean;
	scopes: string[];
	policy: IntegrationPolicy;
	rateLimit: number;
	keys: IntegrationKey[];
	createdKey?: IntegrationKey;
}

export interface PlatformNotification {
	id: number;
	severity: "success" | "warning" | "error" | "info";
	eventType: string;
	title: string;
	message: string;
	resourceType: string;
	resourceId: string;
	readOn: string | null;
	createdOn: string;
}

export interface HostTemplate {
	id: number;
	uuid: string;
	name: string;
	description: string;
	isDefault: boolean;
	configuration: Record<string, any>;
}

export interface HealthCheck {
	id: number;
	resourceType: string;
	resourceId: number;
	isEnabled: boolean;
	checkType: "http" | "tcp";
	path: string;
	intervalSeconds: number;
	timeoutSeconds: number;
	failureThreshold: number;
	successThreshold: number;
	status: "unknown" | "healthy" | "unhealthy";
	lastCheckedOn: string | null;
	lastLatencyMs: number | null;
	lastError: string;
}

export interface PublishedService {
	id: string;
	externalId: string;
	status: string;
	domainNames: string[];
	upstream: { scheme: string; host: string; port: number };
	tls: { enabled: boolean; forced: boolean; http2: boolean; http3: boolean };
	metadata: Record<string, any>;
}

export interface Webhook {
	id: number;
	uuid: string;
	name: string;
	url: string;
	isEnabled: boolean;
	events: string[];
	secret?: string;
}

export interface SavedView {
	id: number;
	uuid: string;
	resourceType: string;
	name: string;
	configuration: Record<string, any>;
}

interface RequestOptions {
	method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
	body?: unknown;
	headers?: Record<string, string>;
}

async function v1<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const headers: Record<string, string> = { Accept: "application/json", ...(options.headers || {}) };
	if (options.body !== undefined) headers["Content-Type"] = "application/json";
	const response = await fetch(`/api/v1${path}`, {
		method: options.method || "GET",
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(decamelizeKeys(options.body)),
	});
	if (response.status === 204) return undefined as T;
	const payload = await response.json();
	if (!response.ok) {
		const error = new Error(payload.detail || payload.error?.message || "The request could not be completed");
		(error as any).payload = payload;
		throw error;
	}
	return camelizeKeys(payload) as T;
}

export const platformApi = {
	listIntegrations: () => v1<Integration[]>("/integrations/"),
	createIntegration: (body: Partial<Integration> & { keyName?: string }) =>
		v1<Integration>("/integrations/", { method: "POST", body }),
	updateIntegration: (id: number, body: Partial<Integration>) =>
		v1<Integration>(`/integrations/${id}`, { method: "PATCH", body }),
	createIntegrationKey: (id: number, name: string) =>
		v1<IntegrationKey>(`/integrations/${id}/keys`, { method: "POST", body: { name } }),
	revokeIntegrationKey: (integrationId: number, keyId: number) =>
		v1<void>(`/integrations/${integrationId}/keys/${keyId}`, { method: "DELETE" }),
	listNotifications: (unread = false) =>
		v1<{ data: PlatformNotification[]; meta: { nextCursor: number | null } }>(`/notifications?unread=${unread}`),
	readNotification: (id: number, read = true) =>
		v1<PlatformNotification>(`/notifications/${id}`, { method: "PATCH", body: { read } }),
	listTemplates: () => v1<{ data: HostTemplate[] }>("/templates"),
	createTemplate: (body: Partial<HostTemplate>) => v1<HostTemplate>("/templates", { method: "POST", body }),
	listWebhooks: () => v1<{ data: Webhook[] }>("/webhooks"),
	createWebhook: (body: Partial<Webhook>) => v1<Webhook>("/webhooks", { method: "POST", body }),
	deleteWebhook: (id: number) => v1<void>(`/webhooks/${id}`, { method: "DELETE" }),
	listHealthChecks: () => v1<{ data: HealthCheck[] }>("/health-checks"),
	configureHealthCheck: (resourceType: "proxy_host" | "stream", resourceId: number, body: Partial<HealthCheck>) =>
		v1<HealthCheck>(`/health-checks/${resourceType}/${resourceId}`, { method: "PUT", body }),
	listSavedViews: (resourceType: string) => v1<{ data: SavedView[] }>(`/saved-views?resource_type=${resourceType}`),
	createSavedView: (body: Omit<SavedView, "id" | "uuid">) => v1<SavedView>("/saved-views", { method: "POST", body }),
	deleteSavedView: (id: number) => v1<void>(`/saved-views/${id}`, { method: "DELETE" }),
	listPublishedServices: (integrationId: number) =>
		v1<{ data: PublishedService[] }>(`/published-services/?integration_id=${integrationId}`),
	publishService: (integrationId: number, body: Record<string, unknown>, idempotencyKey: string) =>
		v1<PublishedService>("/published-services/", {
			method: "POST",
			body: { ...body, integrationId },
			headers: { "Idempotency-Key": idempotencyKey },
		}),
};

export { v1 };
