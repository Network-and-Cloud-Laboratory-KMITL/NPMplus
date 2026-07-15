import { randomUUID } from "node:crypto";
import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class ManagedResource extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		this.uuid ||= randomUUID();
		this.meta ||= {};
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get tableName() {
		return "managed_resource";
	}

	static get jsonAttributes() {
		return ["meta"];
	}
}

export default ManagedResource;
