import {
	IconApi,
	IconCheck,
	IconCopy,
	IconKey,
	IconPlus,
	IconShieldCheck,
	IconTrash,
	IconWebhook,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import Alert from "react-bootstrap/Alert";
import { platformApi } from "src/api/v1";
import { Button } from "src/components";
import { T } from "src/locale";
import styles from "./index.module.css";

const split = (value: string) =>
	value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);

export default function Integrations() {
	const queryClient = useQueryClient();
	const integrations = useQuery({ queryKey: ["v1", "integrations"], queryFn: platformApi.listIntegrations });
	const templates = useQuery({ queryKey: ["v1", "templates"], queryFn: platformApi.listTemplates });
	const webhooks = useQuery({ queryKey: ["v1", "webhooks"], queryFn: platformApi.listWebhooks });
	const [secret, setSecret] = useState<{ title: string; value: string } | null>(null);
	const [showCreate, setShowCreate] = useState(false);
	const [showTemplate, setShowTemplate] = useState(false);
	const [showWebhook, setShowWebhook] = useState(false);

	const createIntegration = useMutation({
		mutationFn: (form: FormData) =>
			platformApi.createIntegration({
				name: `${form.get("name")}`,
				description: `${form.get("description")}`,
				keyName: "Primary key",
				scopes: ["published_services.read", "published_services.write", "health_checks.read"],
				policy: {
					allowedDomainSuffixes: split(`${form.get("domains")}`),
					allowedUpstreamCidrs: split(`${form.get("cidrs")}`),
					allowedPorts: split(`${form.get("ports")}`),
					allowedSchemes: ["http", "https"],
					allowedTemplateIds: [],
				},
			}),
		onSuccess: (data) => {
			if (data.createdKey?.token) setSecret({ title: data.name, value: data.createdKey.token });
			setShowCreate(false);
			queryClient.invalidateQueries({ queryKey: ["v1", "integrations"] });
		},
	});

	const rotateKey = useMutation({
		mutationFn: ({ id, name }: { id: number; name: string }) => platformApi.createIntegrationKey(id, name),
		onSuccess: (data) => {
			if (data.token) setSecret({ title: data.name, value: data.token });
			queryClient.invalidateQueries({ queryKey: ["v1", "integrations"] });
		},
	});

	const revokeKey = useMutation({
		mutationFn: ({ integrationId, keyId }: { integrationId: number; keyId: number }) =>
			platformApi.revokeIntegrationKey(integrationId, keyId),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["v1", "integrations"] }),
	});

	const createTemplate = useMutation({
		mutationFn: (form: FormData) =>
			platformApi.createTemplate({
				name: `${form.get("name")}`,
				description: `${form.get("description")}`,
				configuration: {
					blockExploits: true,
					hstsEnabled: form.get("hsts") === "on",
					healthCheck: { isEnabled: form.get("health") === "on", checkType: "http", path: "/" },
				},
			}),
		onSuccess: () => {
			setShowTemplate(false);
			queryClient.invalidateQueries({ queryKey: ["v1", "templates"] });
		},
	});

	const createWebhook = useMutation({
		mutationFn: (form: FormData) =>
			platformApi.createWebhook({ name: `${form.get("name")}`, url: `${form.get("url")}`, events: ["*"] }),
		onSuccess: (data) => {
			if (data.secret) setSecret({ title: data.name, value: data.secret });
			setShowWebhook(false);
			queryClient.invalidateQueries({ queryKey: ["v1", "webhooks"] });
		},
	});

	const submit = (mutation: { mutate: (form: FormData) => void }) => (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		mutation.mutate(new FormData(event.currentTarget));
	};

	return (
		<div className={styles.page}>
			<div className={styles.pageHeader}>
				<div>
					<p>
						<T id="integrations.eyebrow" />
					</p>
					<h1>
						<T id="integrations.title" />
					</h1>
					<span>
						<T id="integrations.description" />
					</span>
				</div>
				<Button color="azure" onClick={() => setShowCreate(true)}>
					<IconPlus size={18} />
					<T id="integrations.create" />
				</Button>
			</div>

			{secret && (
				<Alert variant="success" className={styles.secretAlert}>
					<div>
						<IconCheck />
						<span>
							<strong>
								<T id="integrations.secret-title" />
							</strong>
							<small>
								<T id="integrations.secret-copy" />
							</small>
						</span>
					</div>
					<code>{secret.value}</code>
					<Button size="sm" onClick={() => navigator.clipboard.writeText(secret.value)}>
						<IconCopy size={16} />
						<T id="action.copy" />
					</Button>
				</Alert>
			)}

			{showCreate && (
				<form className={styles.editor} onSubmit={submit(createIntegration)}>
					<div className={styles.editorHeading}>
						<IconApi />
						<div>
							<h2>
								<T id="integrations.new-title" />
							</h2>
							<p>
								<T id="integrations.policy-help" />
							</p>
						</div>
					</div>
					<div className={styles.formGrid}>
						<label htmlFor="integration-name">
							<T id="column.name" />
							<input id="integration-name" className="form-control" name="name" required />
						</label>
						<label htmlFor="integration-description">
							<T id="description" />
							<input id="integration-description" className="form-control" name="description" />
						</label>
						<label htmlFor="integration-domains">
							<T id="integrations.domains" />
							<input
								id="integration-domains"
								className="form-control"
								name="domains"
								placeholder="apps.example.com, lab.example.org"
								required
							/>
						</label>
						<label htmlFor="integration-cidrs">
							<T id="integrations.cidrs" />
							<input
								id="integration-cidrs"
								className="form-control"
								name="cidrs"
								placeholder="10.20.0.0/16, 192.168.50.0/24"
								required
							/>
						</label>
						<label htmlFor="integration-ports">
							<T id="integrations.ports" />
							<input
								id="integration-ports"
								className="form-control"
								name="ports"
								placeholder="80, 443, 8000-8999"
								required
							/>
						</label>
					</div>
					<div className={styles.formActions}>
						<Button type="button" onClick={() => setShowCreate(false)}>
							<T id="cancel" />
						</Button>
						<Button type="submit" color="azure" isLoading={createIntegration.isPending}>
							<T id="integrations.create" />
						</Button>
					</div>
				</form>
			)}

			<div className={styles.cards}>
				{integrations.data?.map((integration) => (
					<article className={styles.integrationCard} key={integration.id}>
						<header>
							<div className={styles.cardIcon}>
								<IconApi />
							</div>
							<div>
								<h2>{integration.name}</h2>
								<p>{integration.description || "Managed service integration"}</p>
							</div>
							<span className={integration.isEnabled ? styles.active : styles.disabled}>
								{integration.isEnabled ? "Active" : "Disabled"}
							</span>
						</header>
						<div className={styles.policyGrid}>
							<div>
								<small>
									<T id="integrations.domains" />
								</small>
								<strong>{integration.policy.allowedDomainSuffixes.join(", ") || "—"}</strong>
							</div>
							<div>
								<small>
									<T id="integrations.networks" />
								</small>
								<strong>{integration.policy.allowedUpstreamCidrs.join(", ") || "—"}</strong>
							</div>
							<div>
								<small>
									<T id="integrations.ports" />
								</small>
								<strong>{integration.policy.allowedPorts.join(", ") || "—"}</strong>
							</div>
							<div>
								<small>
									<T id="integrations.rate" />
								</small>
								<strong>{integration.rateLimit}/min</strong>
							</div>
						</div>
						<div className={styles.keySection}>
							<div className={styles.sectionTitle}>
								<span>
									<IconKey size={18} />
									<T id="integrations.keys" />
								</span>
								<Button
									size="sm"
									onClick={() =>
										rotateKey.mutate({
											id: integration.id,
											name: `Rotated ${new Date().toLocaleDateString()}`,
										})
									}
								>
									<IconPlus size={15} />
									<T id="integrations.rotate" />
								</Button>
							</div>
							{integration.keys.map((key) => (
								<div className={styles.keyRow} key={key.id}>
									<code>npmplus_{key.prefix}_••••••••</code>
									<span>
										{key.lastUsedOn
											? `Last used ${new Date(key.lastUsedOn).toLocaleString()}`
											: "Never used"}
									</span>
									{!key.revokedOn && (
										<button
											type="button"
											onClick={() =>
												revokeKey.mutate({ integrationId: integration.id, keyId: key.id })
											}
											aria-label="Revoke key"
										>
											<IconTrash size={16} />
										</button>
									)}
								</div>
							))}
						</div>
						<footer>
							<IconShieldCheck size={17} />
							<T id="integrations.guarded" />
						</footer>
					</article>
				))}
			</div>

			<div className={styles.splitSections}>
				<section className={styles.resourceSection}>
					<div className={styles.resourceHeading}>
						<div>
							<h2>
								<T id="integrations.templates" />
							</h2>
							<p>
								<T id="integrations.templates-copy" />
							</p>
						</div>
						<Button size="sm" onClick={() => setShowTemplate((v) => !v)}>
							<IconPlus size={16} />
							<T id="object.add" tData={{ object: "template" }} />
						</Button>
					</div>
					{showTemplate && (
						<form className={styles.compactForm} onSubmit={submit(createTemplate)}>
							<input className="form-control" name="name" placeholder="Production web app" required />
							<input className="form-control" name="description" placeholder="Description" />
							<label>
								<input type="checkbox" name="hsts" /> HSTS
							</label>
							<label>
								<input type="checkbox" name="health" /> Health check
							</label>
							<Button type="submit" color="azure">
								Save
							</Button>
						</form>
					)}
					{templates.data?.data.map((template) => (
						<div className={styles.resourceRow} key={template.id}>
							<span className={styles.rowIcon}>
								<IconShieldCheck size={18} />
							</span>
							<div>
								<strong>{template.name}</strong>
								<small>{template.description || "Reusable security and health defaults"}</small>
							</div>
						</div>
					))}
				</section>
				<section className={styles.resourceSection}>
					<div className={styles.resourceHeading}>
						<div>
							<h2>
								<T id="integrations.webhooks" />
							</h2>
							<p>
								<T id="integrations.webhooks-copy" />
							</p>
						</div>
						<Button size="sm" onClick={() => setShowWebhook((v) => !v)}>
							<IconPlus size={16} />
							<T id="object.add" tData={{ object: "webhook" }} />
						</Button>
					</div>
					{showWebhook && (
						<form className={styles.compactForm} onSubmit={submit(createWebhook)}>
							<input className="form-control" name="name" placeholder="CloudStack events" required />
							<input
								className="form-control"
								name="url"
								type="url"
								placeholder="https://cloudstack.example/webhooks/npmplus"
								required
							/>
							<Button type="submit" color="azure">
								Save
							</Button>
						</form>
					)}
					{webhooks.data?.data.map((webhook) => (
						<div className={styles.resourceRow} key={webhook.id}>
							<span className={styles.rowIcon}>
								<IconWebhook size={18} />
							</span>
							<div>
								<strong>{webhook.name}</strong>
								<small>{webhook.url}</small>
							</div>
						</div>
					))}
				</section>
			</div>
		</div>
	);
}
