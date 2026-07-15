import { randomBytes, randomUUID } from "node:crypto";
import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";

Model.knex(db());

class Webhook extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		this.uuid ||= randomUUID();
		this.secret ||= randomBytes(32).toString("base64url");
		this.events ||= [];
		this.meta ||= {};
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	$parseDatabaseJson(json) {
		return convertIntFieldsToBool(super.$parseDatabaseJson(json), ["is_enabled"]);
	}

	$formatDatabaseJson(json) {
		return super.$formatDatabaseJson(convertBoolFieldsToInt({ ...json }, ["is_enabled"]));
	}

	static get tableName() {
		return "webhook";
	}

	static get jsonAttributes() {
		return ["events", "meta"];
	}
}

export default Webhook;
