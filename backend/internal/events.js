import crypto from "node:crypto";
import notificationModel from "../models/notification.js";
import webhookDeliveryModel from "../models/webhook-delivery.js";
import webhookModel from "../models/webhook.js";

const publicWebhook = (row, revealSecret = false) => ({
	id: row.id,
	uuid: row.uuid,
	name: row.name,
	url: row.url,
	is_enabled: row.is_enabled,
	events: row.events,
	created_on: row.created_on,
	modified_on: row.modified_on,
	...(revealSecret ? { secret: row.secret } : {}),
});

const deliver = async (delivery, webhook) => {
	const timestamp = Math.floor(Date.now() / 1000).toString();
	const body = JSON.stringify(delivery.payload);
	const signature = crypto.createHmac("sha256", webhook.secret).update(`${timestamp}.${body}`).digest("hex");
	try {
		const response = await fetch(webhook.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-NaCl-Event": delivery.event_type,
				"X-NaCl-Event-Id": delivery.event_id,
				"X-NaCl-Timestamp": timestamp,
				"X-NaCl-Signature": `sha256=${signature}`,
			},
			body,
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
		await webhookDeliveryModel.query().patchAndFetchById(delivery.id, {
			attempts: delivery.attempts + 1,
			status: "delivered",
			response_status: response.status,
			last_error: "",
			next_attempt_on: null,
		});
	} catch (err) {
		const attempts = delivery.attempts + 1;
		const terminal = attempts >= 6;
		await webhookDeliveryModel.query().patchAndFetchById(delivery.id, {
			attempts,
			status: terminal ? "failed" : "pending",
			last_error: err.message,
			next_attempt_on: terminal
				? null
				: new Date(Date.now() + Math.min(6 * 60 * 60 * 1000, 60_000 * 2 ** (attempts - 1))).toISOString(),
		});
	}
};

const emit = async (eventType, payload, ownerUserId = null) => {
	const eventId = crypto.randomUUID();
	const event = {
		id: eventId,
		type: eventType,
		created_at: new Date().toISOString(),
		data: payload,
	};
	let webhookQuery = webhookModel.query().where("is_enabled", 1);
	if (ownerUserId) webhookQuery = webhookQuery.where("owner_user_id", ownerUserId);
	const webhooks = await webhookQuery;
	for (const webhook of webhooks.filter((item) => item.events.includes("*") || item.events.includes(eventType))) {
		const delivery = await webhookDeliveryModel.query().insertAndFetch({
			event_id: eventId,
			webhook_id: webhook.id,
			event_type: eventType,
			payload: event,
			attempts: 0,
			status: "pending",
			last_error: "",
			next_attempt_on: new Date().toISOString(),
		});
		void deliver(delivery, webhook);
	}
	return event;
};

const notify = async ({ userId, severity, eventType, title, message, resourceType, resourceId, deduplicationKey, meta }) => {
	if (deduplicationKey) {
		const duplicate = await notificationModel
			.query()
			.where({ user_id: userId, deduplication_key: deduplicationKey })
			.orderBy("id", "desc")
			.first();
		if (duplicate && Date.now() - new Date(duplicate.created_on).getTime() < 24 * 60 * 60 * 1000) return duplicate;
	}
	const row = await notificationModel.query().insertAndFetch({
		user_id: userId,
		severity,
		event_type: eventType,
		title,
		message,
		resource_type: resourceType || "",
		resource_id: `${resourceId || ""}`,
		deduplication_key: deduplicationKey || null,
		meta: meta || {},
	});
	await emit(eventType, { notification: row }, userId);
	return row;
};

const retryPending = async () => {
	const deliveries = await webhookDeliveryModel
		.query()
		.where("status", "pending")
		.where("next_attempt_on", "<=", new Date().toISOString())
		.limit(25);
	for (const delivery of deliveries) {
		const webhook = await webhookModel.query().findById(delivery.webhook_id);
		if (webhook?.is_enabled) void deliver(delivery, webhook);
	}
};

export { emit, notify, publicWebhook, retryPending };
