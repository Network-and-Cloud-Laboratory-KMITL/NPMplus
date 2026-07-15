import {
	IconBell,
	IconCertificate,
	IconCheck,
	IconCircleCheck,
	IconExclamationCircle,
	IconHeartbeat,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformApi, type PlatformNotification } from "src/api/v1";
import { Button } from "src/components";
import { T } from "src/locale";
import styles from "./index.module.css";

const eventIcon = (notification: PlatformNotification) => {
	if (notification.eventType.startsWith("health")) return IconHeartbeat;
	if (notification.eventType.startsWith("certificate")) return IconCertificate;
	if (notification.severity === "success") return IconCircleCheck;
	return IconExclamationCircle;
};

export default function Notifications() {
	const queryClient = useQueryClient();
	const query = useQuery({ queryKey: ["v1", "notifications"], queryFn: () => platformApi.listNotifications() });
	const markRead = useMutation({
		mutationFn: (id: number) => platformApi.readNotification(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["v1", "notifications"] }),
	});
	const unread = query.data?.data.filter((item) => !item.readOn).length || 0;

	return (
		<div className={styles.page}>
			<header>
				<div>
					<p>
						<T id="notifications.eyebrow" />
					</p>
					<h1>
						<T id="notifications.title" />
					</h1>
					<span>
						<T id="notifications.description" />
					</span>
				</div>
				<div className={styles.unread}>
					<IconBell size={18} />
					{unread} <T id="notifications.unread" />
				</div>
			</header>
			<section className={styles.list}>
				{query.data?.data.length === 0 && (
					<div className={styles.empty}>
						<IconCircleCheck size={42} />
						<h2>
							<T id="notifications.clear" />
						</h2>
						<p>
							<T id="notifications.clear-copy" />
						</p>
					</div>
				)}
				{query.data?.data.map((notification) => {
					const Icon = eventIcon(notification);
					return (
						<article
							key={notification.id}
							className={`${styles.item} ${!notification.readOn ? styles.new : ""}`}
						>
							<span className={`${styles.icon} ${styles[notification.severity]}`}>
								<Icon size={21} />
							</span>
							<div>
								<div className={styles.itemTitle}>
									<strong>{notification.title}</strong>
									<time>{new Date(notification.createdOn).toLocaleString()}</time>
								</div>
								<p>{notification.message}</p>
								<small>{notification.eventType.replaceAll(".", " · ")}</small>
							</div>
							{!notification.readOn && (
								<Button size="sm" onClick={() => markRead.mutate(notification.id)}>
									<IconCheck size={16} />
									<T id="notifications.acknowledge" />
								</Button>
							)}
						</article>
					);
				})}
			</section>
		</div>
	);
}
