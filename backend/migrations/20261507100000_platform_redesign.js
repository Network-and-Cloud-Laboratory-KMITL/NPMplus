import { migrate as logger } from "../logger.js";

const migrateName = "platform-redesign";

const addTimestamps = (table) => {
	table.dateTime("created_on").notNull();
	table.dateTime("modified_on").notNull();
};

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.createTable("integration", (table) => {
		table.increments().primary();
		addTimestamps(table);
		table.string("uuid", 36).notNull().unique();
		table.integer("owner_user_id").notNull().unsigned();
		table.string("name", 255).notNull();
		table.text("description").notNull().defaultTo("");
		table.integer("is_enabled").notNull().unsigned().defaultTo(1);
		table.json("scopes").notNull();
		table.json("policy").notNull();
		table.integer("rate_limit").notNull().unsigned().defaultTo(120);
		table.json("meta").notNull();
	});

	await knex.schema.createTable("integration_key", (table) => {
		table.increments().primary();
		addTimestamps(table);
		table.integer("integration_id").notNull().unsigned().index();
		table.string("name", 255).notNull();
		table.string("prefix", 32).notNull().unique();
		table.string("secret_digest", 64).notNull().unique();
		table.dateTime("expires_on").nullable();
		table.dateTime("revoked_on").nullable();
		table.dateTime("last_used_on").nullable();
		table.string("last_used_ip", 255).notNull().defaultTo("");
	});

	await knex.schema.createTable("managed_resource", (table) => {
		table.increments().primary();
		addTimestamps(table);
		table.string("uuid", 36).notNull().unique();
		table.integer("integration_id").notNull().unsigned().index();
		table.string("external_id", 255).notNull();
		table.string("resource_type", 50).notNull();
		table.integer("resource_id").notNull().unsigned();
		table.integer("certificate_id").notNull().unsigned().defaultTo(0);
		table.string("status", 30).notNull().defaultTo("active");
		table.json("meta").notNull();
		table.unique(["integration_id", "external_id"]);
		table.unique(["resource_type", "resource_id"]);
	});

	await knex.schema.createTable("idempotency_record", (table) => {
		table.increments().primary();
		addTimestamps(table);
		table.integer("integration_id").notNull().unsigned().index();
		table.string("idempotency_key", 255).notNull();
		table.string("request_hash", 64).notNull();
		table.integer("response_code").notNull().unsigned();
		table.json("response_body").notNull();
		table.dateTime("expires_on").notNull();
		table.unique(["integration_id", "idempotency_key"]);
	});

	await knex.schema.createTable("oidc_identity", (table) => {
		table.increments().primary();
		addTimestamps(table);
		table.integer("user_id").notNull().unsigned().index();
		table.string("issuer", 1024).notNull();
		table.string("subject", 512).notNull();
		table.json("claims").notNull();
		table.unique(["issuer", "subject"]);
	});

	await knex.schema.createTable("host_template", (table) => {
		table.increments().primary();
		addTimestamps(table);
		table.string("uuid", 36).notNull().unique();
		table.integer("owner_user_id").notNull().unsigned();
		table.string("name", 255).notNull();
		table.text("description").notNull().defaultTo("");
		table.integer("is_default").notNull().unsigned().defaultTo(0);
		table.json("configuration").notNull();
		table.json("meta").notNull();
	});

	await knex.schema.createTable("health_check", (table) => {
		table.increments().primary();
		addTimestamps(table);
		table.string("resource_type", 50).notNull();
		table.integer("resource_id").notNull().unsigned();
		table.integer("is_enabled").notNull().unsigned().defaultTo(0);
		table.string("check_type", 20).notNull().defaultTo("http");
		table.string("path", 2048).notNull().defaultTo("/");
		table.integer("interval_seconds").notNull().unsigned().defaultTo(30);
		table.integer("timeout_seconds").notNull().unsigned().defaultTo(5);
		table.integer("failure_threshold").notNull().unsigned().defaultTo(3);
		table.integer("success_threshold").notNull().unsigned().defaultTo(2);
		table.string("status", 20).notNull().defaultTo("unknown");
		table.integer("consecutive_failures").notNull().unsigned().defaultTo(0);
		table.integer("consecutive_successes").notNull().unsigned().defaultTo(0);
		table.dateTime("last_checked_on").nullable();
		table.integer("last_latency_ms").nullable().unsigned();
		table.text("last_error").notNull().defaultTo("");
		table.unique(["resource_type", "resource_id"]);
	});

	await knex.schema.createTable("health_check_result", (table) => {
		table.increments().primary();
		table.dateTime("created_on").notNull().index();
		table.integer("health_check_id").notNull().unsigned().index();
		table.integer("is_success").notNull().unsigned();
		table.integer("latency_ms").nullable().unsigned();
		table.string("status_code", 20).notNull().defaultTo("");
		table.text("error").notNull().defaultTo("");
	});

	await knex.schema.createTable("notification", (table) => {
		table.increments().primary();
		addTimestamps(table);
		table.integer("user_id").notNull().unsigned().index();
		table.string("severity", 20).notNull();
		table.string("event_type", 100).notNull();
		table.string("title", 255).notNull();
		table.text("message").notNull();
		table.string("resource_type", 50).notNull().defaultTo("");
		table.string("resource_id", 255).notNull().defaultTo("");
		table.dateTime("read_on").nullable();
		table.string("deduplication_key", 255).nullable().index();
		table.json("meta").notNull();
	});

	await knex.schema.createTable("webhook", (table) => {
		table.increments().primary();
		addTimestamps(table);
		table.string("uuid", 36).notNull().unique();
		table.integer("owner_user_id").notNull().unsigned();
		table.string("name", 255).notNull();
		table.string("url", 2048).notNull();
		table.string("secret", 255).notNull();
		table.integer("is_enabled").notNull().unsigned().defaultTo(1);
		table.json("events").notNull();
		table.json("meta").notNull();
	});

	await knex.schema.createTable("webhook_delivery", (table) => {
		table.increments().primary();
		addTimestamps(table);
		table.string("event_id", 36).notNull().index();
		table.integer("webhook_id").notNull().unsigned().index();
		table.string("event_type", 100).notNull();
		table.json("payload").notNull();
		table.integer("attempts").notNull().unsigned().defaultTo(0);
		table.string("status", 20).notNull().defaultTo("pending");
		table.integer("response_status").nullable().unsigned();
		table.text("last_error").notNull().defaultTo("");
		table.dateTime("next_attempt_on").nullable();
	});

	await knex.schema.createTable("saved_view", (table) => {
		table.increments().primary();
		addTimestamps(table);
		table.string("uuid", 36).notNull().unique();
		table.integer("user_id").notNull().unsigned().index();
		table.string("resource_type", 50).notNull();
		table.string("name", 255).notNull();
		table.json("configuration").notNull();
	});

	await knex.schema.alterTable("audit_log", (table) => {
		table.string("actor_type", 20).notNull().defaultTo("user");
		table.integer("actor_id").notNull().unsigned().defaultTo(0);
		table.string("request_id", 36).notNull().defaultTo("");
		table.string("remote_address", 255).notNull().defaultTo("");
	});
};

const down = async (knex) => {
	await knex.schema.alterTable("audit_log", (table) => {
		table.dropColumns("actor_type", "actor_id", "request_id", "remote_address");
	});
	for (const table of [
		"saved_view",
		"webhook_delivery",
		"webhook",
		"notification",
		"health_check_result",
		"health_check",
		"host_template",
		"oidc_identity",
		"idempotency_record",
		"managed_resource",
		"integration_key",
		"integration",
	]) {
		await knex.schema.dropTableIfExists(table);
	}
};

export { up, down };
