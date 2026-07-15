import express from "express";
import swaggerUi from "swagger-ui-express";
import { debug, express as logger } from "../logger.js";
import PACKAGE from "../package.json" with { type: "json" };
import { getCompiledSchema } from "../schema/index.js";
import { getV1Schema } from "../schema/v1.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router.use("/", swaggerUi.serve);

router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET / (Now serves the Swagger UI interface)
	 */
	.get(async (req, res, next) => {
		try {
			const swaggerJSON = req.query.legacy === "true" ? await getCompiledSchema() : await getV1Schema();
			swaggerJSON.info.version = PACKAGE.version;
			swaggerJSON.servers[0].url = `${req.protocol}://${req.host}${req.query.legacy === "true" ? "/api" : "/api/v1"}`;
			res.status(200).send(swaggerUi.generateHTML(swaggerJSON));
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.originalUrl}: ${err}`);
			next(err);
		}
	});

export default router;
