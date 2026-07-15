import { randomUUID } from "node:crypto";
import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";

Model.knex(db());

class HostTemplate extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		this.uuid ||= randomUUID();
		this.configuration ||= {};
		this.meta ||= {};
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	$parseDatabaseJson(json) {
		return convertIntFieldsToBool(super.$parseDatabaseJson(json), ["is_default"]);
	}

	$formatDatabaseJson(json) {
		return super.$formatDatabaseJson(convertBoolFieldsToInt({ ...json }, ["is_default"]));
	}

	static get tableName() {
		return "host_template";
	}

	static get jsonAttributes() {
		return ["configuration", "meta"];
	}
}

export default HostTemplate;
