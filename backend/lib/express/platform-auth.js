import crypto from "node:crypto";
import Access from "../access.js";
import integrationKeyModel from "../../models/integration-key.js";
import integrationModel from "../../models/integration.js";
import internalIntegration from "../../internal/integration.js";
import jwtdecode from "./jwt-decode.js";

const rateBuckets = new Map();

const unauthorized = (res, detail = "Authentication required") =>
	res.status(401).type("application/problem+json").send({
		type: "https://nacl.example/problems/authentication",
		title: "Authentication failed",
		status: 401,
		detail,
		request_id: res.locals.requestId,
	});

const platformAuth = () => async (req, res, next) => {
	const authorization = req.get("authorization");
	if (!authorization) {
		return jwtdecode()(req, res, () => {
			res.locals.actor = {
				type: "user",
				id: res.locals.access.token.getUserId(),
				user_id: res.locals.access.token.getUserId(),
			};
			res.locals.access.actor = { ...res.locals.actor, request_id: res.locals.requestId, remote_address: req.ip || "" };
			next();
		});
	}

	if (!authorization.startsWith("Bearer ")) return unauthorized(res, "Unsupported authorization scheme");
	const token = authorization.slice(7).trim();
	if (!/^npmplus_[a-f0-9]{12}_[A-Za-z0-9_-]{40,}$/.test(token)) return unauthorized(res, "Invalid API key");

	const digest = internalIntegration.digestKey(token);
	const key = await integrationKeyModel.query().where("secret_digest", digest).first();
	if (!key || key.revoked_on || (key.expires_on && new Date(key.expires_on) <= new Date())) {
		return unauthorized(res, "Invalid or expired API key");
	}
	const integration = await integrationModel.query().findById(key.integration_id);
	if (!integration?.is_enabled) return unauthorized(res, "Integration is disabled");

	const access = new Access(null);
	await access.load(true);
	access.token.set("attrs", { id: integration.owner_user_id });
	res.locals.access = access;
	res.locals.actor = {
		type: "integration",
		id: integration.id,
		user_id: integration.owner_user_id,
		integration,
		key_id: key.id,
	};
	access.actor = { ...res.locals.actor, request_id: res.locals.requestId, remote_address: req.ip || "" };
	const now = Date.now();
	const bucket = rateBuckets.get(key.id);
	const rateLimit = Math.max(1, integration.rate_limit || 120);
	if (!bucket || bucket.resetAt <= now) {
		rateBuckets.set(key.id, { count: 1, resetAt: now + 60_000 });
		res.set({ "RateLimit-Limit": `${rateLimit}`, "RateLimit-Remaining": `${rateLimit - 1}` });
	} else {
		bucket.count += 1;
		res.set({
			"RateLimit-Limit": `${rateLimit}`,
			"RateLimit-Remaining": `${Math.max(0, rateLimit - bucket.count)}`,
			"RateLimit-Reset": `${Math.ceil((bucket.resetAt - now) / 1000)}`,
		});
		if (bucket.count > rateLimit) {
			return res.status(429).type("application/problem+json").send({
				type: "https://nacl.example/problems/rate-limit",
				title: "Rate limit exceeded",
				status: 429,
				detail: "Too many integration requests",
				request_id: res.locals.requestId,
			});
		}
	}

	const presented = Buffer.from(digest, "hex");
	const stored = Buffer.from(key.secret_digest, "hex");
	if (presented.length !== stored.length || !crypto.timingSafeEqual(presented, stored)) {
		return unauthorized(res, "Invalid API key");
	}
	void integrationKeyModel.query().patchAndFetchById(key.id, {
		last_used_on: new Date().toISOString(),
		last_used_ip: req.ip || "",
	});
	next();
};

const hasScope = (actor, scope) =>
	actor?.type === "user" || actor?.integration?.scopes?.includes("*") || actor?.integration?.scopes?.includes(scope);

const requireScope = (readScope, writeScope = readScope) => (req, res, next) => {
	const scope = ["GET", "HEAD", "OPTIONS"].includes(req.method) ? readScope : writeScope;
	if (hasScope(res.locals.actor, scope)) return next();
	return res.status(403).type("application/problem+json").send({
		type: "https://nacl.example/problems/permission",
		title: "Permission denied",
		status: 403,
		detail: `The credential does not have the '${scope}' scope`,
		request_id: res.locals.requestId,
	});
};

export { hasScope, platformAuth, requireScope };
