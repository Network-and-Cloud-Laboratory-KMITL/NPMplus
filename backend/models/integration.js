import { randomUUID } from "node:crypto";
import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import IntegrationKey from "./integration-key.js";
import now from "./now_helper.js";

Model.knex(db());

class Integration extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		this.uuid ||= randomUUID();
		this.scopes ||= [];
		this.policy ||= {};
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
		return "integration";
	}

	static get jsonAttributes() {
		return ["scopes", "policy", "meta"];
	}

	static get relationMappings() {
		return {
			keys: {
				relation: Model.HasManyRelation,
				modelClass: IntegrationKey,
				join: { from: "integration.id", to: "integration_key.integration_id" },
			},
		};
	}
}

export default Integration;
