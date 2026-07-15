import net from "node:net";
import dayjs from "dayjs";
import db from "../db.js";
import certificateModel from "../models/certificate.js";
import healthCheckModel from "../models/health-check.js";
import proxyHostModel from "../models/proxy_host.js";
import streamModel from "../models/stream.js";
import { health as logger } from "../logger.js";
import { notify, retryPending } from "./events.js";

let interval = null;
let running = false;
let lastCertificateScan = 0;

const tcpCheck = (host, port, timeout) =>
	new Promise((resolve) => {
		const started = Date.now();
		const socket = net.createConnection({ host, port });
		const finish = (success, error = "") => {
			socket.destroy();
			resolve({ success, latency: Date.now() - started, statusCode: "", error });
		};
		socket.setTimeout(timeout, () => finish(false, "Connection timed out"));
		socket.once("connect", () => finish(true));
		socket.once("error", (err) => finish(false, err.message));
	});

const httpCheck = async (host, check) => {
	const started = Date.now();
	const port = host.forward_port ? `:${host.forward_port}` : "";
	const url = `${host.forward_scheme}://${host.forward_host}${port}${check.path || "/"}`;
	try {
		const response = await fetch(url, {
			method: "GET",
			redirect: "manual",
			signal: AbortSignal.timeout(check.timeout_seconds * 1000),
		});
		return {
			success: response.status >= 200 && response.status < 400,
			latency: Date.now() - started,
			statusCode: `${response.status}`,
			error: response.status >= 400 ? `HTTP ${response.status}` : "",
		};
	} catch (err) {
		return { success: false, latency: Date.now() - started, statusCode: "", error: err.message };
	}
};

const resourceForCheck = async (check) => {
	if (check.resource_type === "proxy_host") {
		return proxyHostModel.query().where("id", check.resource_id).where("is_deleted", 0).first();
	}
	if (check.resource_type === "stream") {
		return streamModel.query().where("id", check.resource_id).where("is_deleted", 0).first();
	}
	return null;
};

const runCheck = async (check) => {
	const resource = await resourceForCheck(check);
	if (!resource) return;
	const result =
		check.check_type === "tcp" || check.resource_type === "stream"
			? await tcpCheck(
					resource.forward_host || resource.forwarding_host,
					Number(resource.forward_port || resource.forwarding_port),
					check.timeout_seconds * 1000,
				)
			: await httpCheck(resource, check);

	const failures = result.success ? 0 : check.consecutive_failures + 1;
	const successes = result.success ? check.consecutive_successes + 1 : 0;
	let status = check.status;
	if (!result.success && failures >= check.failure_threshold) status = "unhealthy";
	if (result.success && successes >= check.success_threshold) status = "healthy";
	if (status === "unknown" && result.success) status = "healthy";

	await healthCheckModel.query().patchAndFetchById(check.id, {
		status,
		consecutive_failures: failures,
		consecutive_successes: successes,
		last_checked_on: new Date().toISOString(),
		last_latency_ms: result.latency,
		last_error: result.error,
	});
	await db()("health_check_result").insert({
		created_on: new Date().toISOString(),
		health_check_id: check.id,
		is_success: result.success ? 1 : 0,
		latency_ms: result.latency,
		status_code: result.statusCode,
		error: result.error,
	});

	if (status !== check.status && ["healthy", "unhealthy"].includes(status)) {
		await notify({
			userId: resource.owner_user_id,
			severity: status === "unhealthy" ? "error" : "success",
			eventType: `health.${status}`,
			title: status === "unhealthy" ? "Upstream became unhealthy" : "Upstream recovered",
			message: `${check.resource_type} #${check.resource_id} is ${status}${result.error ? `: ${result.error}` : ""}`,
			resourceType: check.resource_type,
			resourceId: check.resource_id,
			deduplicationKey: `health:${check.id}:${status}`,
			meta: result,
		});
	}
};

const scanCertificates = async () => {
	const certificates = await certificateModel.query().where("is_deleted", 0);
	for (const certificate of certificates) {
		const days = dayjs(certificate.expires_on).diff(dayjs(), "day");
		const threshold = [1, 7, 14, 30].find((value) => days <= value);
		if (threshold !== undefined) {
			await notify({
				userId: certificate.owner_user_id,
				severity: days <= 7 ? "error" : "warning",
				eventType: "certificate.expiring",
				title: "Certificate requires attention",
				message: `${certificate.nice_name || certificate.domain_names.join(", ")} expires in ${Math.max(0, days)} days`,
				resourceType: "certificate",
				resourceId: certificate.id,
				deduplicationKey: `certificate:${certificate.id}:${threshold}`,
				meta: { days_remaining: days, threshold },
			});
		}
	}
};

const tick = async () => {
	if (running) return;
	running = true;
	try {
		const checks = await healthCheckModel.query().where("is_enabled", 1);
		const now = Date.now();
		for (const check of checks) {
			const due = !check.last_checked_on || now - new Date(check.last_checked_on).getTime() >= check.interval_seconds * 1000;
			if (due) await runCheck(check);
		}
		if (now - lastCertificateScan >= 60 * 60 * 1000) {
			lastCertificateScan = now;
			await scanCertificates();
		}
		await retryPending();
		await db()("health_check_result").where("created_on", "<", dayjs().subtract(30, "day").toISOString()).delete();
	} catch (err) {
		logger.error(`Health monitor failed: ${err.message}`);
	} finally {
		running = false;
	}
};

const init = () => {
	if (interval) return;
	logger.info("Health and notification monitor initialized");
	interval = setInterval(tick, 10_000);
	void tick();
};

export { init, runCheck, tick };
