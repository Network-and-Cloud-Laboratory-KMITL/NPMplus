import {
	IconArrowLeft,
	IconArrowRight,
	IconCheck,
	IconCloudLock,
	IconGlobe,
	IconRocket,
	IconServer,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import Alert from "react-bootstrap/Alert";
import { platformApi, type PublishedService } from "src/api/v1";
import { Button } from "src/components";
import { T } from "src/locale";
import styles from "./index.module.css";

interface Draft {
	integrationId: number;
	externalId: string;
	domain: string;
	scheme: string;
	host: string;
	port: string;
	account: string;
	project: string;
	panel: string;
}

const initialDraft: Draft = {
	integrationId: 0,
	externalId: "",
	domain: "",
	scheme: "http",
	host: "",
	port: "",
	account: "",
	project: "",
	panel: "",
};

const steps = [
	{ number: 1, icon: IconGlobe, label: "publish.step-identity" },
	{ number: 2, icon: IconServer, label: "publish.step-upstream" },
	{ number: 3, icon: IconCloudLock, label: "publish.step-review" },
];

export default function PublishService() {
	const integrations = useQuery({ queryKey: ["v1", "integrations"], queryFn: platformApi.listIntegrations });
	const [step, setStep] = useState(1);
	const [draft, setDraft] = useState(initialDraft);
	const [result, setResult] = useState<PublishedService | null>(null);
	const publish = useMutation({
		mutationFn: () =>
			platformApi.publishService(
				draft.integrationId,
				{
					externalId: draft.externalId,
					domainNames: [draft.domain],
					upstream: { scheme: draft.scheme, host: draft.host, port: Number(draft.port) },
					metadata: { account: draft.account, project: draft.project, source: "nacl-ui" },
				},
				crypto.randomUUID(),
			),
		onSuccess: (data) => {
			setResult(data);
			setStep(4);
		},
	});

	const update = (field: keyof Draft, value: string | number) =>
		setDraft((current) => ({ ...current, [field]: value }));
	const next = (event: FormEvent) => {
		event.preventDefault();
		setStep((value) => Math.min(3, value + 1));
	};

	return (
		<div className={styles.page}>
			<header>
				<div>
					<p>
						<T id="publish.eyebrow" />
					</p>
					<h1>
						<T id="publish.title" />
					</h1>
					<span>
						<T id="publish.description" />
					</span>
				</div>
			</header>
			<div className={styles.layout}>
				<aside>
					{steps.map(({ number, icon: Icon, label }) => (
						<div
							key={`${number}`}
							className={`${styles.step} ${step === number ? styles.current : ""} ${step > Number(number) ? styles.complete : ""}`}
						>
							<span>{step > Number(number) ? <IconCheck /> : <Icon />}</span>
							<div>
								<small>Step {number}</small>
								<strong>
									<T id={`${label}`} />
								</strong>
							</div>
						</div>
					))}
					<div className={styles.promise}>
						<IconCloudLock />
						<p>
							<T id="publish.promise" />
						</p>
					</div>
				</aside>
				<section className={styles.card}>
					{publish.error && <Alert variant="danger">{publish.error.message}</Alert>}
					{step === 1 && (
						<form onSubmit={next}>
							<div className={styles.formHeading}>
								<span>
									<IconGlobe />
								</span>
								<div>
									<h2>
										<T id="publish.identity-title" />
									</h2>
									<p>
										<T id="publish.identity-copy" />
									</p>
								</div>
							</div>
							<div className={styles.formGrid}>
								<label htmlFor="publish-integration">
									<T id="publish.integration" />
									<select
										id="publish-integration"
										className="form-select"
										required
										value={draft.integrationId}
										onChange={(e) => update("integrationId", Number(e.target.value))}
									>
										<option value="">Select an integration</option>
										{integrations.data
											?.filter((item) => item.isEnabled)
											.map((item) => (
												<option value={item.id} key={item.id}>
													{item.name}
												</option>
											))}
									</select>
								</label>
								<label htmlFor="publish-external-id">
									<T id="publish.external-id" />
									<input
										id="publish-external-id"
										className="form-control"
										required
										value={draft.externalId}
										onChange={(e) => update("externalId", e.target.value)}
										placeholder="vm-8f2c-public-web"
									/>
								</label>
								<label className={styles.full} htmlFor="publish-domain">
									<T id="publish.domain" />
									<div className="input-group">
										<span className="input-group-text">https://</span>
										<input
											id="publish-domain"
											className="form-control"
											required
											value={draft.domain}
											onChange={(e) => update("domain", e.target.value)}
											placeholder="app.example.com"
										/>
									</div>
									<small>
										<T id="publish.dns-help" />
									</small>
								</label>
							</div>
							<div className={styles.actions}>
								<Button type="submit" color="azure">
									<T id="continue" />
									<IconArrowRight size={18} />
								</Button>
							</div>
						</form>
					)}
					{step === 2 && (
						<form onSubmit={next}>
							<div className={styles.formHeading}>
								<span>
									<IconServer />
								</span>
								<div>
									<h2>
										<T id="publish.upstream-title" />
									</h2>
									<p>
										<T id="publish.upstream-copy" />
									</p>
								</div>
							</div>
							<div className={styles.upstreamRow}>
								<select
									aria-label="Upstream scheme"
									className="form-select"
									value={draft.scheme}
									onChange={(e) => update("scheme", e.target.value)}
								>
									<option value="http">HTTP</option>
									<option value="https">HTTPS</option>
								</select>
								<input
									aria-label="Upstream IP address"
									className="form-control"
									required
									value={draft.host}
									onChange={(e) => update("host", e.target.value)}
									placeholder="10.20.5.42"
								/>
								<input
									aria-label="Upstream port"
									className="form-control"
									required
									type="number"
									min="1"
									max="65535"
									value={draft.port}
									onChange={(e) => update("port", e.target.value)}
									placeholder="8080"
								/>
							</div>
							<div className={styles.formGrid}>
								<label htmlFor="publish-account">
									<T id="publish.account" />
									<input
										id="publish-account"
										className="form-control"
										value={draft.account}
										onChange={(e) => update("account", e.target.value)}
									/>
								</label>
								<label htmlFor="publish-project">
									<T id="publish.project" />
									<input
										id="publish-project"
										className="form-control"
										value={draft.project}
										onChange={(e) => update("project", e.target.value)}
									/>
								</label>
							</div>
							<div className={styles.actions}>
								<Button type="button" onClick={() => setStep(1)}>
									<IconArrowLeft size={18} />
									<T id="back" />
								</Button>
								<Button type="submit" color="azure">
									<T id="continue" />
									<IconArrowRight size={18} />
								</Button>
							</div>
						</form>
					)}
					{step === 3 && (
						<div>
							<div className={styles.formHeading}>
								<span>
									<IconCloudLock />
								</span>
								<div>
									<h2>
										<T id="publish.review-title" />
									</h2>
									<p>
										<T id="publish.review-copy" />
									</p>
								</div>
							</div>
							<div className={styles.review}>
								<div>
									<small>
										<T id="publish.domain" />
									</small>
									<strong>{draft.domain}</strong>
								</div>
								<div>
									<small>
										<T id="column.destination" />
									</small>
									<strong>
										{draft.scheme}://{draft.host}:{draft.port}
									</strong>
								</div>
								<div>
									<small>
										<T id="publish.external-id" />
									</small>
									<strong>{draft.externalId}</strong>
								</div>
								<div>
									<small>
										<T id="column.ssl" />
									</small>
									<strong>
										<T id="publish.automatic-https" />
									</strong>
								</div>
							</div>
							<ul className={styles.preflight}>
								<li>
									<IconCheck />
									<T id="publish.check-policy" />
								</li>
								<li>
									<IconCheck />
									<T id="publish.check-dns" />
								</li>
								<li>
									<IconCheck />
									<T id="publish.check-nginx" />
								</li>
							</ul>
							<div className={styles.actions}>
								<Button type="button" onClick={() => setStep(2)}>
									<IconArrowLeft size={18} />
									<T id="back" />
								</Button>
								<Button
									type="button"
									color="azure"
									isLoading={publish.isPending}
									onClick={() => publish.mutate()}
								>
									<IconRocket size={18} />
									<T id="publish.action" />
								</Button>
							</div>
						</div>
					)}
					{step === 4 && result && (
						<div className={styles.success}>
							<span>
								<IconCheck />
							</span>
							<p>
								<T id="publish.success-eyebrow" />
							</p>
							<h2>
								<T id="publish.success-title" />
							</h2>
							<a href={`https://${result.domainNames[0]}`} target="_blank" rel="noreferrer">
								https://{result.domainNames[0]}
							</a>
							<div>
								<small>
									<T id="publish.resource-id" />
								</small>
								<code>{result.id}</code>
							</div>
							<Button
								color="azure"
								onClick={() => {
									setDraft(initialDraft);
									setResult(null);
									setStep(1);
								}}
							>
								<T id="publish.another" />
							</Button>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
