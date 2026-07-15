import {
	IconActivityHeartbeat,
	IconAlertTriangle,
	IconArrowRight,
	IconCertificate,
	IconPlus,
	IconRoute,
	IconShieldCheck,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import { platformApi } from "src/api/v1";
import { Button } from "src/components";
import { useCertificates, useHostReport, useUser } from "src/hooks";
import { T } from "src/locale";
import styles from "./index.module.css";

export default function Dashboard() {
	const { data: hostReport } = useHostReport();
	const { data: certificates } = useCertificates();
	const { data: currentUser } = useUser("me");
	const isAdmin = currentUser?.roles.includes("admin");
	const health = useQuery({ queryKey: ["v1", "health-checks"], queryFn: platformApi.listHealthChecks });
	const notifications = useQuery({
		queryKey: ["v1", "notifications", "unread"],
		queryFn: () => platformApi.listNotifications(true),
	});
	const navigate = useNavigate();
	const totalHosts =
		(hostReport?.proxy || 0) + (hostReport?.redirection || 0) + (hostReport?.stream || 0) + (hostReport?.dead || 0);
	const unhealthy = health.data?.data.filter((item) => item.status === "unhealthy").length || 0;
	const healthy = health.data?.data.filter((item) => item.status === "healthy").length || 0;
	const expiring =
		certificates?.filter((item) => differenceInDays(new Date(item.expiresOn), new Date()) <= 30).length || 0;

	return (
		<div className={styles.page}>
			<header className={styles.hero}>
				<div>
					<p>
						<T id="dashboard.eyebrow" />
					</p>
					<h1>
						<T id="dashboard.title" />
					</h1>
					<span>
						<T id="dashboard.description" />
					</span>
				</div>
				<div className={styles.heroActions}>
					<Button onClick={() => navigate("/nginx/proxy")}>
						<IconRoute size={18} />
						<T id="proxy-hosts" />
					</Button>
					{isAdmin && (
						<Button color="azure" onClick={() => navigate("/publish")}>
							<IconPlus size={18} />
							<T id="publish.action" />
						</Button>
					)}
				</div>
			</header>

			<section className={styles.metrics}>
				<article>
					<span className={styles.blue}>
						<IconRoute />
					</span>
					<div>
						<small>
							<T id="dashboard.total-hosts" />
						</small>
						<strong>{totalHosts}</strong>
						<p>
							{hostReport?.proxy || 0} proxy · {hostReport?.stream || 0} stream
						</p>
					</div>
				</article>
				<article>
					<span className={unhealthy ? styles.red : styles.green}>
						<IconActivityHeartbeat />
					</span>
					<div>
						<small>
							<T id="dashboard.health" />
						</small>
						<strong>{unhealthy ? unhealthy : healthy}</strong>
						<p>
							<T id={unhealthy ? "dashboard.unhealthy-copy" : "dashboard.healthy-copy"} />
						</p>
					</div>
				</article>
				<article>
					<span className={expiring ? styles.amber : styles.green}>
						<IconCertificate />
					</span>
					<div>
						<small>
							<T id="dashboard.certificates" />
						</small>
						<strong>{certificates?.length || 0}</strong>
						<p>
							{expiring} <T id="dashboard.expiring" />
						</p>
					</div>
				</article>
				<article>
					<span className={notifications.data?.data.length ? styles.amber : styles.green}>
						<IconAlertTriangle />
					</span>
					<div>
						<small>
							<T id="dashboard.attention" />
						</small>
						<strong>{notifications.data?.data.length || 0}</strong>
						<p>
							<T id="dashboard.unread-alerts" />
						</p>
					</div>
				</article>
			</section>

			<div className={styles.contentGrid}>
				<section className={styles.panel}>
					<header>
						<div>
							<h2>
								<T id="dashboard.edge-health" />
							</h2>
							<p>
								<T id="dashboard.edge-health-copy" />
							</p>
						</div>
						<Button size="sm" onClick={() => navigate("/nginx/proxy")}>
							<T id="view" />
							<IconArrowRight size={16} />
						</Button>
					</header>
					<div className={styles.healthSummary}>
						<div
							className={styles.healthRing}
							style={
								{
									"--health-value": `${health.data?.data.length ? Math.round((healthy / health.data.data.length) * 100) : 100}%`,
								} as any
							}
						>
							<strong>
								{health.data?.data.length ? Math.round((healthy / health.data.data.length) * 100) : 100}
								%
							</strong>
							<small>
								<T id="dashboard.healthy" />
							</small>
						</div>
						<div className={styles.healthLegend}>
							<div>
								<span className={styles.legendGreen} />
								<strong>{healthy}</strong>
								<small>
									<T id="dashboard.healthy-upstreams" />
								</small>
							</div>
							<div>
								<span className={styles.legendRed} />
								<strong>{unhealthy}</strong>
								<small>
									<T id="dashboard.unhealthy-upstreams" />
								</small>
							</div>
							<div>
								<span className={styles.legendGray} />
								<strong>
									{health.data?.data.filter((item) => item.status === "unknown").length || 0}
								</strong>
								<small>
									<T id="dashboard.not-checked" />
								</small>
							</div>
						</div>
					</div>
					<div className={styles.checkList}>
						{health.data?.data.slice(0, 5).map((check) => (
							<div key={check.id}>
								<span className={styles[check.status]} />
								<div>
									<strong>
										{check.resourceType.replace("_", " ")} #{check.resourceId}
									</strong>
									<small>
										{check.lastError ||
											(check.lastLatencyMs
												? `${check.lastLatencyMs} ms`
												: "Waiting for first check")}
									</small>
								</div>
								<time>
									{check.lastCheckedOn ? new Date(check.lastCheckedOn).toLocaleTimeString() : "—"}
								</time>
							</div>
						))}
					</div>
				</section>

				<section className={styles.panel}>
					<header>
						<div>
							<h2>
								<T id="dashboard.recent-alerts" />
							</h2>
							<p>
								<T id="dashboard.recent-alerts-copy" />
							</p>
						</div>
						<Button size="sm" onClick={() => navigate("/notifications")}>
							<T id="view-all" />
							<IconArrowRight size={16} />
						</Button>
					</header>
					<div className={styles.alertList}>
						{notifications.data?.data.length === 0 && (
							<div className={styles.allClear}>
								<IconShieldCheck />
								<h3>
									<T id="notifications.clear" />
								</h3>
								<p>
									<T id="notifications.clear-copy" />
								</p>
							</div>
						)}
						{notifications.data?.data.slice(0, 6).map((item) => (
							<div key={item.id}>
								<span className={styles[`alert-${item.severity}`]}>
									<IconAlertTriangle size={17} />
								</span>
								<div>
									<strong>{item.title}</strong>
									<small>{item.message}</small>
								</div>
								<time>{new Date(item.createdOn).toLocaleDateString()}</time>
							</div>
						))}
					</div>
				</section>
			</div>
		</div>
	);
}
