import { randomUUID } from "node:crypto";
import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class SavedView extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		this.uuid ||= randomUUID();
		this.configuration ||= {};
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get tableName() {
		return "saved_view";
	}

	static get jsonAttributes() {
		return ["configuration"];
	}
}

export default SavedView;
