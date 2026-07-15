import express from "express";
import internalIntegration from "../../internal/integration.js";
import internalAuditLog from "../../internal/audit-log.js";
import { platformAuth } from "../../lib/express/platform-auth.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });

router.use(platformAuth());
router.use(async (_req, res, next) => {
	try {
		if (res.locals.actor.type !== "user") return res.status(403).send({ error: "User administrator required" });
		await res.locals.access.can("users:list");
		next();
	} catch (err) {
		next(err);
	}
});

router.get("/", async (_req, res, next) => {
	try {
		res.send(await internalIntegration.list());
	} catch (err) {
		next(err);
	}
});

router.post("/", async (req, res, next) => {
	try {
		const integration = await internalIntegration.create(res.locals.actor.user_id, req.body);
		await internalAuditLog.add(res.locals.access, {
			action: "created",
			object_type: "integration",
			object_id: integration.id,
			meta: { name: integration.name, scopes: integration.scopes, policy: integration.policy },
		});
		res.status(201).send(integration);
	} catch (err) {
		next(err);
	}
});

router.get("/:integration_id", async (req, res, next) => {
	try {
		res.send(await internalIntegration.get(Number(req.params.integration_id)));
	} catch (err) {
		next(err);
	}
});

router.patch("/:integration_id", async (req, res, next) => {
	try {
		const integrationId = Number(req.params.integration_id);
		const integration = await internalIntegration.update(integrationId, req.body);
		await internalAuditLog.add(res.locals.access, {
			action: "updated",
			object_type: "integration",
			object_id: integrationId,
			meta: req.body,
		});
		res.send(integration);
	} catch (err) {
		next(err);
	}
});

router.delete("/:integration_id", async (req, res, next) => {
	try {
		const integrationId = Number(req.params.integration_id);
		await internalIntegration.delete(integrationId);
		await internalAuditLog.add(res.locals.access, {
			action: "disabled",
			object_type: "integration",
			object_id: integrationId,
			meta: {},
		});
		res.status(204).send();
	} catch (err) {
		next(err);
	}
});

router.post("/:integration_id/keys", async (req, res, next) => {
	try {
		const integrationId = Number(req.params.integration_id);
		const key = await internalIntegration.createKey(integrationId, req.body);
		await internalAuditLog.add(res.locals.access, {
			action: "key-created",
			object_type: "integration",
			object_id: integrationId,
			meta: { key_id: key.id, name: key.name, prefix: key.prefix, expires_on: key.expires_on },
		});
		res.status(201).send(key);
	} catch (err) {
		next(err);
	}
});

router.delete("/:integration_id/keys/:key_id", async (req, res, next) => {
	try {
		const integrationId = Number(req.params.integration_id);
		const keyId = Number(req.params.key_id);
		await internalIntegration.revokeKey(integrationId, keyId);
		await internalAuditLog.add(res.locals.access, {
			action: "key-revoked",
			object_type: "integration",
			object_id: integrationId,
			meta: { key_id: keyId },
		});
		res.status(204).send();
	} catch (err) {
		next(err);
	}
});

export default router;
