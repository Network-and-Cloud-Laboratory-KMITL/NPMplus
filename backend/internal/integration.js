import crypto from "node:crypto";
import errs from "../lib/error.js";
import integrationKeyModel from "../models/integration-key.js";
import integrationModel from "../models/integration.js";

const digestKey = (value) => crypto.createHash("sha256").update(value).digest("hex");
const defaultScopes = ["published_services.read", "published_services.write"];
const defaultPolicy = {
	allowed_domain_suffixes: [],
	allowed_upstream_cidrs: [],
	allowed_ports: [],
	allowed_schemes: ["http", "https"],
	allowed_template_ids: [],
};

const publicKey = (key) => ({
	id: key.id,
	name: key.name,
	prefix: key.prefix,
	created_on: key.created_on,
	modified_on: key.modified_on,
	expires_on: key.expires_on,
	revoked_on: key.revoked_on,
	last_used_on: key.last_used_on,
	last_used_ip: key.last_used_ip,
});

const get = async (id) => {
	const integration = await integrationModel.query().findById(id).withGraphFetched("keys");
	if (!integration) throw new errs.ItemNotFoundError(id);
	integration.keys = integration.keys.map(publicKey);
	return integration;
};

const createKey = async (integrationId, data = {}) => {
	await get(integrationId);
	const prefix = crypto.randomBytes(6).toString("hex");
	const secret = crypto.randomBytes(32).toString("base64url");
	const token = `npmplus_${prefix}_${secret}`;
	const row = await integrationKeyModel.query().insertAndFetch({
		integration_id: integrationId,
		name: data.name?.trim() || "Primary key",
		prefix,
		secret_digest: digestKey(token),
		expires_on: data.expires_on || null,
		last_used_ip: "",
	});
	return { ...publicKey(row), token };
};

export default {
	digestKey,
	publicKey,
	get,
	list: async () => {
		const rows = await integrationModel.query().orderBy("name", "asc").withGraphFetched("keys");
		return rows.map((row) => ({ ...row, keys: row.keys.map(publicKey) }));
	},
	create: async (ownerUserId, data) => {
		if (!data?.name?.trim()) throw new errs.ValidationError("Integration name is required");
		const row = await integrationModel.query().insertAndFetch({
			owner_user_id: ownerUserId,
			name: data.name.trim(),
			description: data.description?.trim() || "",
			is_enabled: data.is_enabled !== false,
			scopes: data.scopes || defaultScopes,
			policy: { ...defaultPolicy, ...(data.policy || {}) },
			rate_limit: data.rate_limit || 120,
			meta: data.meta || {},
		});
		const key = await createKey(row.id, { name: data.key_name });
		return { ...(await get(row.id)), created_key: key };
	},
	update: async (id, data) => {
		await get(id);
		const allowed = ["name", "description", "is_enabled", "scopes", "policy", "rate_limit", "meta"];
		const patch = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));
		await integrationModel.query().patchAndFetchById(id, patch);
		return get(id);
	},
	delete: async (id) => {
		await get(id);
		await integrationModel.query().patchAndFetchById(id, { is_enabled: false });
		await integrationKeyModel.query().where("integration_id", id).whereNull("revoked_on").patch({
			revoked_on: new Date().toISOString(),
		});
		return true;
	},
	createKey,
	revokeKey: async (integrationId, keyId) => {
		const key = await integrationKeyModel.query().findById(keyId);
		if (!key || key.integration_id !== integrationId) throw new errs.ItemNotFoundError(keyId);
		await integrationKeyModel.query().patchAndFetchById(keyId, { revoked_on: new Date().toISOString() });
		return true;
	},
};
