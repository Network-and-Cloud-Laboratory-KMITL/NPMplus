import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class OidcIdentity extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		this.claims ||= {};
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get tableName() {
		return "oidc_identity";
	}

	static get jsonAttributes() {
		return ["claims"];
	}
}

export default OidcIdentity;
