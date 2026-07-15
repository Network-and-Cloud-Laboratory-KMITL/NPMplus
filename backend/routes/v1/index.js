import express from "express";
import accessListsRoutes from "../nginx/access_lists.js";
import certificatesRoutes from "../nginx/certificates.js";
import deadHostsRoutes from "../nginx/dead_hosts.js";
import proxyHostsRoutes from "../nginx/proxy_hosts.js";
import redirectionHostsRoutes from "../nginx/redirection_hosts.js";
import streamsRoutes from "../nginx/streams.js";
import auditLogRoutes from "../audit-log.js";
import reportsRoutes from "../reports.js";
import settingsRoutes from "../settings.js";
import usersRoutes from "../users.js";
import versionRoutes from "../version.js";
import { platformAuth, requireScope } from "../../lib/express/platform-auth.js";
import { assertPublishPolicy } from "../../lib/integration-policy.js";
import integrationsRoutes from "./integrations.js";
import publishedServicesRoutes from "./published-services.js";
import platformRoutes from "./platform.js";
import { getV1Schema } from "../../schema/v1.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });

const collectionControls = (req, res, next) => {
	if (req.method !== "GET") return next();
	const originalSend = res.send.bind(res);
	res.send = (body) => {
		if (!Array.isArray(body)) return originalSend(body);
		const controlsRequested = req.query.limit || req.query.cursor || req.query.sort || Object.keys(req.query).some((key) => key.startsWith("filter["));
		if (!controlsRequested) return originalSend(body);
		let rows = [...body];
		for (const [key, value] of Object.entries(req.query)) {
			const match = key.match(/^filter\[([^\]]+)\]$/);
			if (match && typeof value === "string") {
				rows = rows.filter((row) => `${row[match[1]] ?? ""}`.toLowerCase().includes(value.toLowerCase()));
			}
		}
		if (typeof req.query.sort === "string") {
			const fields = req.query.sort.split(",");
			rows.sort((left, right) => {
				for (const fieldValue of fields) {
					const descending = fieldValue.startsWith("-");
					const field = descending ? fieldValue.slice(1) : fieldValue;
					const comparison = `${left[field] ?? ""}`.localeCompare(`${right[field] ?? ""}`, undefined, { numeric: true });
					if (comparison !== 0) return descending ? -comparison : comparison;
				}
				return 0;
			});
		}
		let offset = 0;
		if (typeof req.query.cursor === "string") {
			try {
				offset = JSON.parse(Buffer.from(req.query.cursor, "base64url").toString()).offset || 0;
			} catch {
				offset = 0;
			}
		}
		const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
		const data = rows.slice(offset, offset + limit);
		const nextOffset = offset + data.length;
		return originalSend({
			data,
			meta: {
				total: rows.length,
				limit,
				next_cursor: nextOffset < rows.length ? Buffer.from(JSON.stringify({ offset: nextOffset })).toString("base64url") : null,
			},
		});
	};
	next();
};

router.get("/", (_req, res) => {
	res.send({ name: "NaCl NPMplus API", version: "v1", status: "OK", request_id: res.locals.requestId });
});

router.get("/openapi.json", async (_req, res, next) => {
	try {
		res.send(await getV1Schema());
	} catch (err) {
		next(err);
	}
});

router.use("/integrations", integrationsRoutes);
router.use("/published-services", publishedServicesRoutes);
router.use("/", platformRoutes);

const protect = (readScope, writeScope = readScope, policy = false) => {
	const middleware = [
		platformAuth(),
		requireScope(readScope, writeScope),
		(req, _res, next) => {
			if (req.method === "PATCH") req.method = "PUT";
			next();
		},
		collectionControls,
	];
	if (policy) {
		middleware.push((req, res, next) => {
			try {
				if (res.locals.actor.type === "integration" && !["GET", "HEAD", "OPTIONS", "DELETE"].includes(req.method)) {
					assertPublishPolicy(res.locals.actor.integration.policy || {}, req.body);
				}
				next();
			} catch (err) {
				next(err);
			}
		});
	}
	return middleware;
};

router.use("/proxy-hosts", ...protect("proxy_hosts.read", "proxy_hosts.write", true), proxyHostsRoutes);
router.use("/redirection-hosts", ...protect("redirection_hosts.read", "redirection_hosts.write"), redirectionHostsRoutes);
router.use("/dead-hosts", ...protect("dead_hosts.read", "dead_hosts.write"), deadHostsRoutes);
router.use("/streams", ...protect("streams.read", "streams.write"), streamsRoutes);
router.use("/access-lists", ...protect("access_lists.read", "access_lists.write"), accessListsRoutes);
router.use("/certificates", ...protect("certificates.read", "certificates.write"), certificatesRoutes);
router.use("/users", ...protect("users.read", "users.write"), usersRoutes);
router.use("/settings", ...protect("settings.read", "settings.write"), settingsRoutes);
router.use("/audit-events", ...protect("audit.read"), auditLogRoutes);
router.use("/reports", ...protect("reports.read"), reportsRoutes);
router.use("/version", ...protect("reports.read"), versionRoutes);

export default router;
