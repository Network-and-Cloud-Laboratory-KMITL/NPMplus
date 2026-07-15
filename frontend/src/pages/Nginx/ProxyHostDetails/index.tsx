import {
	IconActivityHeartbeat,
	IconArrowLeft,
	IconCertificate,
	IconClock,
	IconExternalLink,
	IconLock,
	IconPencil,
	IconRoute,
	IconServer,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import { Link, useParams } from "react-router-dom";
import { getProxyHost } from "src/api/backend";
import { platformApi } from "src/api/v1";
import { Button, HasPermission, LoadingPage } from "src/components";
import { useAuditLogs } from "src/hooks";
import { T } from "src/locale";
import { showProxyHostModal } from "src/modals";
import { PROXY_HOSTS, VIEW } from "src/modules/Permissions";
import styles from "./index.module.css";

const labelAction = (action: string) => action.replaceAll("-", " ").replaceAll("_", " ");

export default function ProxyHostDetails() {
	const hostId = Number(useParams().hostId);
	const queryClient = useQueryClient();
	const hostQuery = useQuery({
		queryKey: ["proxy-host", hostId, "details"],
		queryFn: () => getProxyHost(hostId, ["owner", "certificate", "access_lists", "managed_resource"]),
		enabled: Number.isInteger(hostId) && hostId > 0,
	});
	const healthQuery = useQuery({ queryKey: ["v1", "health-checks"], queryFn: platformApi.listHealthChecks });
	const auditQuery = useAuditLogs(["user"]);
	const health = healthQuery.data?.data.find(
		(item) => item.resourceType === "proxy_host" && item.resourceId === hostId,
	);
	const configureHealth = useMutation({
		mutationFn: (enabled: boolean) =>
			platformApi.configureHealthCheck("proxy_host", hostId, {
				isEnabled: enabled,
				checkType: "http",
				path: "/",
				intervalSeconds: 30,
				timeoutSeconds: 5,
				failureThreshold: 3,
				successThreshold: 2,
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["v1", "health-checks"] }),
	});

	if (hostQuery.isLoading) return <LoadingPage noLogo />;
	if (hostQuery.isError || !hostQuery.data) {
		return <Alert variant="danger">{hostQuery.error?.message || <T id="proxy-host.details-not-found" />}</Alert>;
	}

	const host = hostQuery.data;
	const online = host.enabled && host.meta.nginxOnline;
	const protocol = host.sslForced || host.certificate ? "https" : "http";
	const publicUrl = `${protocol}://${host.domainNames[0] || ""}`;
	const events = (auditQuery.data || [])
		.filter((event) => event.objectType === "proxy-host" && Number(event.objectId) === hostId)
		.slice(0, 12);

	return (
		<HasPermission section={PROXY_HOSTS} permission={VIEW} pageLoading loadingNoLogo>
			<div className={styles.page}>
				<div className={styles.backRow}>
					<Link to="/nginx/proxy">
						<IconArrowLeft size={16} />
						<T id="proxy-host.back" />
					</Link>
				</div>
				<header className={styles.hero}>
					<div>
						<div className={styles.eyebrow}>
							<T id="proxy-host.details-eyebrow" /> · #{host.id}
						</div>
						<h1>{host.domainNames[0]}</h1>
						<p>{host.domainNames.slice(1).join(" · ") || <T id="proxy-host.details-single-domain" />}</p>
					</div>
					<div className={styles.heroActions}>
						{host.domainNames[0] && (
							<a className="btn btn-outline-primary" href={publicUrl} target="_blank" rel="noreferrer">
								<IconExternalLink size={16} />
								<T id="proxy-host.open-service" />
							</a>
						)}
						<Button actionType="primary" onClick={() => showProxyHostModal(host.id)}>
							<IconPencil size={16} />
							<T id="action.edit" />
						</Button>
					</div>
				</header>

				<section className={styles.metrics}>
					<article>
						<span className={online ? styles.good : styles.bad}>
							<IconActivityHeartbeat size={21} />
						</span>
						<div>
							<small>
								<T id="column.status" />
							</small>
							<strong>
								{!host.enabled ? <T id="disabled" /> : online ? <T id="online" /> : <T id="offline" />}
							</strong>
						</div>
					</article>
					<article>
						<span className={styles.blue}>
							<IconRoute size={21} />
						</span>
						<div>
							<small>
								<T id="column.destination" />
							</small>
							<strong>
								{host.forwardScheme}://{host.forwardHost}:{host.forwardPort}
							</strong>
						</div>
					</article>
					<article>
						<span className={styles.purple}>
							<IconLock size={21} />
						</span>
						<div>
							<small>
								<T id="column.ssl" />
							</small>
							<strong>{host.certificate ? host.certificate.provider : <T id="no-tls" />}</strong>
						</div>
					</article>
					<article>
						<span className={styles.amber}>
							<IconServer size={21} />
						</span>
						<div>
							<small>
								<T id="proxy-host.source" />
							</small>
							<strong>
								{host.managedResource ? <T id="proxy-host.managed" /> : <T id="proxy-host.manual" />}
							</strong>
						</div>
					</article>
				</section>

				<div className={styles.grid}>
					<section className={styles.panel}>
						<header>
							<div>
								<h2>
									<T id="proxy-host.diagnostics" />
								</h2>
								<p>
									<T id="proxy-host.diagnostics-copy" />
								</p>
							</div>
						</header>
						<div className={styles.diagnostics}>
							<div>
								<span className={online ? styles.dotGood : styles.dotBad} />
								<div>
									<strong>
										<T id="proxy-host.nginx-config" />
									</strong>
									<small>
										{online ? (
											<T id="proxy-host.nginx-valid" />
										) : (
											host.meta.nginxErr || <T id="proxy-host.nginx-unavailable" />
										)}
									</small>
								</div>
							</div>
							<div>
								<IconCertificate size={18} />
								<div>
									<strong>
										<T id="proxy-host.certificate" />
									</strong>
									<small>
										{host.certificate ? (
											`${host.certificate.niceName} · ${new Date(host.certificate.expiresOn).toLocaleDateString()}`
										) : (
											<T id="proxy-host.certificate-none" />
										)}
									</small>
								</div>
							</div>
							<div>
								<IconActivityHeartbeat size={18} />
								<div>
									<strong>
										<T id="proxy-host.health-check" />
									</strong>
									<small>
										{health?.isEnabled ? (
											`${health.status} · ${health.lastLatencyMs ?? "—"} ms`
										) : (
											<T id="proxy-host.health-disabled" />
										)}
									</small>
								</div>
								<Button
									size="sm"
									isLoading={configureHealth.isPending}
									onClick={() => configureHealth.mutate(!health?.isEnabled)}
								>
									<T
										id={
											health?.isEnabled ? "proxy-host.health-disable" : "proxy-host.health-enable"
										}
									/>
								</Button>
							</div>
							{host.managedResource && (
								<div>
									<IconServer size={18} />
									<div>
										<strong>
											<T id="proxy-host.integration-owner" />
										</strong>
										<small>
											{host.managedResource.externalId} · {host.managedResource.status}
										</small>
									</div>
								</div>
							)}
						</div>
					</section>

					<section className={styles.panel}>
						<header>
							<div>
								<h2>
									<T id="proxy-host.activity" />
								</h2>
								<p>
									<T id="proxy-host.activity-copy" />
								</p>
							</div>
						</header>
						<div className={styles.timeline}>
							{events.length === 0 && (
								<div className={styles.empty}>
									<IconClock size={28} />
									<T id="proxy-host.activity-empty" />
								</div>
							)}
							{events.map((event) => (
								<article key={event.id}>
									<span />
									<div>
										<strong>{labelAction(event.action)}</strong>
										<small>
											{event.actorType === "integration"
												? `Integration #${event.actorId}`
												: event.user?.name || `User #${event.userId}`}
										</small>
									</div>
									<time>{new Date(event.createdOn).toLocaleString()}</time>
								</article>
							))}
						</div>
					</section>
				</div>
			</div>
		</HasPermission>
	);
}
