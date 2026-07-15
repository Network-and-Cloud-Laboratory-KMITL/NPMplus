import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import knex from "knex";

const temp = await mkdtemp(path.join(os.tmpdir(), "npmplus-platform-"));
process.env.DB_SQLITE_FILE = path.join(temp, "database.sqlite");
process.env.NPMPLUS_KEYS_FILE = path.join(temp, "keys.json");
process.env.OIDC_ADMIN_GROUPS = "nacl-edge-admins";
process.env.OIDC_USER_GROUPS = "nacl-edge-users";
process.env.OIDC_GROUPS_CLAIM = "groups";

const { default: db } = await import("../db.js");
const { default: internalIntegration } = await import("../internal/integration.js");
const { default: provisionOidcUser } = await import("../internal/oidc-user.js");
const { default: publishedService } = await import("../internal/published-service.js");
const { assertPublishPolicy, domainAllowed, portAllowed, upstreamAllowed } = await import("../lib/integration-policy.js");
const { getV1Schema } = await import("../schema/v1.js");

const timestamps = (table) => {
	table.dateTime("created_on").notNull();
	table.dateTime("modified_on").notNull();
};

test.before(async () => {
	await db().schema.createTable("integration", (table) => {
		table.increments().primary(); timestamps(table); table.string("uuid").notNull().unique(); table.integer("owner_user_id").notNull();
		table.string("name").notNull(); table.text("description").notNull(); table.integer("is_enabled").notNull(); table.json("scopes").notNull();
		table.json("policy").notNull(); table.integer("rate_limit").notNull(); table.json("meta").notNull();
	});
	await db().schema.createTable("integration_key", (table) => {
		table.increments().primary(); timestamps(table); table.integer("integration_id").notNull(); table.string("name").notNull();
		table.string("prefix").notNull().unique(); table.string("secret_digest").notNull().unique(); table.dateTime("expires_on"); table.dateTime("revoked_on");
		table.dateTime("last_used_on"); table.string("last_used_ip").notNull();
	});
	await db().schema.createTable("idempotency_record", (table) => {
		table.increments().primary(); timestamps(table); table.integer("integration_id").notNull(); table.string("idempotency_key").notNull();
		table.string("request_hash").notNull(); table.integer("response_code").notNull(); table.json("response_body").notNull(); table.dateTime("expires_on").notNull();
		table.unique(["integration_id", "idempotency_key"]);
	});
	await db().schema.createTable("user", (table) => {
		table.increments().primary(); timestamps(table); table.integer("is_deleted").notNull(); table.integer("is_disabled").notNull();
		table.string("email").notNull(); table.string("name").notNull(); table.string("nickname").notNull(); table.string("avatar").notNull(); table.json("roles").notNull();
	});
	await db().schema.createTable("user_permission", (table) => {
		table.increments().primary(); timestamps(table); table.integer("user_id").notNull().unique(); table.string("visibility").notNull();
		for (const name of ["proxy_hosts", "redirection_hosts", "dead_hosts", "streams", "access_lists", "certificates"]) table.string(name).notNull();
	});
	await db().schema.createTable("oidc_identity", (table) => {
		table.increments().primary(); timestamps(table); table.integer("user_id").notNull(); table.string("issuer").notNull(); table.string("subject").notNull(); table.json("claims").notNull();
		table.unique(["issuer", "subject"]);
	});
});

test.after(async () => {
	await db().destroy();
	await rm(temp, { recursive: true, force: true });
});

test("integration policy constrains domains, networks, ports, and schemes", () => {
	assert.equal(domainAllowed("vm.apps.example.com", ["apps.example.com"]), true);
	assert.equal(domainAllowed("apps.example.net", ["apps.example.com"]), false);
	assert.equal(upstreamAllowed("10.20.4.8", ["10.20.0.0/16"]), true);
	assert.equal(upstreamAllowed("10.21.4.8", ["10.20.0.0/16"]), false);
	assert.equal(portAllowed(8443, [80, "8000-8999"]), true);
	assert.throws(() => assertPublishPolicy({
		allowed_domain_suffixes: ["apps.example.com"], allowed_upstream_cidrs: ["10.20.0.0/16"],
		allowed_ports: ["8000-8999"], allowed_schemes: ["http"], allowed_template_ids: [],
	}, { domain_names: ["vm.apps.example.com"], forward_host: "192.168.1.2", forward_port: 8080, forward_scheme: "http" }));
});

test("integration keys are high entropy, stored as digests, and only revealed once", async () => {
	const integration = await internalIntegration.create(1, {
		name: "CloudStack", policy: { allowed_domain_suffixes: ["apps.example.com"] },
	});
	assert.match(integration.created_key.token, /^npmplus_[a-f0-9]{12}_[A-Za-z0-9_-]{40,}$/);
	const loaded = await internalIntegration.get(integration.id);
	assert.equal(loaded.keys[0].token, undefined);
	assert.equal(loaded.keys[0].prefix, integration.created_key.prefix);
});

test("idempotency records replay exact requests and reject payload changes", async () => {
	const first = await publishedService.beginIdempotency(1, "stable-key", { operation: "create", value: 1 });
	await publishedService.finishIdempotency(first.record, 201, { id: "service-1" });
	const replay = await publishedService.beginIdempotency(1, "stable-key", { operation: "create", value: 1 });
	assert.deepEqual(replay.replay, { id: "service-1" });
	await assert.rejects(
		publishedService.beginIdempotency(1, "stable-key", { operation: "create", value: 2 }),
		(error) => error.status === 409,
	);
});

test("OIDC group mapping provisions users and maps administrator roles", async () => {
	const user = await provisionOidcUser({
		sub: "subject-1", email: "operator@example.com", name: "NaCl Operator", preferred_username: "operator", groups: ["nacl-edge-admins"],
	}, "https://auth.example.com");
	assert.deepEqual(user.roles, ["admin"]);
	const repeat = await provisionOidcUser({
		sub: "subject-1", email: "operator@example.com", name: "Updated Operator", groups: ["nacl-edge-admins"],
	}, "https://auth.example.com");
	assert.equal(repeat.id, user.id);
	await assert.rejects(provisionOidcUser({ sub: "subject-2", email: "denied@example.com", groups: ["unrelated"] }, "https://auth.example.com"));
});

test("v1 OpenAPI covers legacy resources and platform capabilities", async () => {
	const schema = await getV1Schema();
	for (const route of ["/proxy-hosts", "/certificates", "/users", "/published-services", "/integrations", "/health-checks", "/webhooks"]) {
		assert.ok(schema.paths[route], `Missing ${route}`);
	}
	assert.equal(schema.components.securitySchemes.bearerAuth.scheme, "bearer");
});

test("platform migration applies and rolls back on SQLite", async () => {
	const database = knex({ client: "better-sqlite3", connection: { filename: path.join(temp, "migration.sqlite") }, useNullAsDefault: true });
	await database.schema.createTable("audit_log", (table) => {
		table.increments().primary();
		table.integer("user_id").notNull();
	});
	const migration = await import("../migrations/20261507100000_platform_redesign.js");
	await migration.up(database);
	assert.equal(await database.schema.hasTable("integration"), true);
	assert.equal(await database.schema.hasColumn("audit_log", "actor_type"), true);
	await migration.down(database);
	assert.equal(await database.schema.hasTable("integration"), false);
	await database.destroy();
});
