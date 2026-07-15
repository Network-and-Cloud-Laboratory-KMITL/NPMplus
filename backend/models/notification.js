import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class Notification extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		this.meta ||= {};
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get tableName() {
		return "notification";
	}

	static get jsonAttributes() {
		return ["meta"];
	}
}

export default Notification;
