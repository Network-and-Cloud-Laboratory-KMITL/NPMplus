import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class WebhookDelivery extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		this.payload ||= {};
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get tableName() {
		return "webhook_delivery";
	}

	static get jsonAttributes() {
		return ["payload"];
	}
}

export default WebhookDelivery;
