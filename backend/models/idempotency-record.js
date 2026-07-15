import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class IdempotencyRecord extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get tableName() {
		return "idempotency_record";
	}

	static get jsonAttributes() {
		return ["response_body"];
	}
}

export default IdempotencyRecord;
