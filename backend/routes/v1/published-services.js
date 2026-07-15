import express from "express";
import errs from "../../lib/error.js";
import { platformAuth, requireScope } from "../../lib/express/platform-auth.js";
import integrationModel from "../../models/integration.js";
import internalPublishedService from "../../internal/published-service.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });

router.use(platformAuth(), requireScope("published_services.read", "published_services.write"));

const getIntegration = async (req, res) => {
	if (res.locals.actor.type === "integration") return res.locals.actor.integration;
	const integrationId = Number(req.body?.integration_id || req.query.integration_id);
	if (!integrationId) throw new errs.ValidationError("integration_id is required for user sessions");
	const integration = await integrationModel.query().findById(integrationId);
	if (!integration?.is_enabled) throw new errs.ItemNotFoundError(integrationId);
	return integration;
};

router.get("/", async (req, res, next) => {
	try {
		const integration = await getIntegration(req, res);
		res.send({ data: await internalPublishedService.list(integration.id) });
	} catch (err) {
		next(err);
	}
});

router.post("/", async (req, res, next) => {
	try {
		const integration = await getIntegration(req, res);
		const result = await internalPublishedService.create({
			access: res.locals.access,
			integration,
			payload: req.body,
			idempotencyKey: req.get("idempotency-key"),
		});
		res.set("Idempotency-Replayed", result.replayed ? "true" : "false");
		res.status(result.replayed ? 200 : 201).send(result.body);
	} catch (err) {
		next(err);
	}
});

router.get("/:service_id", async (req, res, next) => {
	try {
		const integration = await getIntegration(req, res);
		res.send(await internalPublishedService.get(integration.id, req.params.service_id));
	} catch (err) {
		next(err);
	}
});

router.patch("/:service_id", async (req, res, next) => {
	try {
		const integration = await getIntegration(req, res);
		const result = await internalPublishedService.update({
			access: res.locals.access,
			integration,
			id: req.params.service_id,
			payload: req.body,
			idempotencyKey: req.get("idempotency-key"),
		});
		res.set("Idempotency-Replayed", result.replayed ? "true" : "false");
		res.send(result.body);
	} catch (err) {
		next(err);
	}
});

router.delete("/:service_id", async (req, res, next) => {
	try {
		const integration = await getIntegration(req, res);
		await internalPublishedService.remove({
			access: res.locals.access,
			integration,
			id: req.params.service_id,
		});
		res.status(204).send();
	} catch (err) {
		next(err);
	}
});

export default router;
