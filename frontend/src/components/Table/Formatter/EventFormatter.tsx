import {
	IconApi,
	IconArrowsCross,
	IconBolt,
	IconBoltOff,
	IconBookmark,
	IconDisc,
	IconHeartbeat,
	IconLock,
	IconShield,
	IconTemplate,
	IconUser,
	IconWebhook,
} from "@tabler/icons-react";
import cn from "classnames";
import type { AuditLog } from "src/api/backend";
import { useLocaleState } from "src/context";
import { formatDateTime, T } from "src/locale";

const getEventValue = (event: AuditLog) => {
	switch (event.objectType) {
		case "access-list":
		case "user":
		case "integration":
		case "host-template":
		case "webhook":
		case "saved-view":
			return event.meta?.name;
		case "health-check":
			return `${event.meta?.resourceType?.replace("_", " ") || "resource"} #${event.meta?.resourceId || event.objectId}`;
		case "proxy-host":
		case "redirection-host":
		case "dead-host":
			return event.meta?.domainNames?.join(", ") || "N/A";
		case "stream":
			return event.meta?.incomingPort || "N/A";
		case "certificate":
			return event.meta?.domainNames?.join(", ") || event.meta?.niceName || "N/A";
		default:
			return `${event.objectType} #${event.objectId}`;
	}
};

const getColorForAction = (action: string) => {
	switch (action) {
		case "created":
			return "text-lime";
		case "deleted":
			return "text-red";
		default:
			return "text-blue";
	}
};

const getIcon = (row: AuditLog) => {
	const c = cn(getColorForAction(row.action), "me-1");
	let ico = null;
	switch (row.objectType) {
		case "user":
			ico = <IconUser size={16} className={c} />;
			break;
		case "proxy-host":
			ico = <IconBolt size={16} className={c} />;
			break;
		case "redirection-host":
			ico = <IconArrowsCross size={16} className={c} />;
			break;
		case "dead-host":
			ico = <IconBoltOff size={16} className={c} />;
			break;
		case "stream":
			ico = <IconDisc size={16} className={c} />;
			break;
		case "access-list":
			ico = <IconLock size={16} className={c} />;
			break;
		case "certificate":
			ico = <IconShield size={16} className={c} />;
			break;
		case "integration":
			ico = <IconApi size={16} className={c} />;
			break;
		case "host-template":
			ico = <IconTemplate size={16} className={c} />;
			break;
		case "health-check":
			ico = <IconHeartbeat size={16} className={c} />;
			break;
		case "webhook":
			ico = <IconWebhook size={16} className={c} />;
			break;
		case "saved-view":
			ico = <IconBookmark size={16} className={c} />;
			break;
	}

	return ico;
};

interface Props {
	row: AuditLog;
}
export function EventFormatter({ row }: Props) {
	const { locale } = useLocaleState();
	return (
		<div className="flex-fill">
			<div className="font-weight-medium">
				{getIcon(row)}
				<T id={`object.event.${row.action}`} tData={{ object: row.objectType }} />
				&nbsp; &mdash; <span className="badge">{getEventValue(row)}</span>
			</div>
			<div className="text-secondary mt-1">{formatDateTime(row.createdOn, locale)}</div>
		</div>
	);
}
