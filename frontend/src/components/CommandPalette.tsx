import {
	IconApi,
	IconBell,
	IconCertificate,
	IconHome,
	IconPlus,
	IconRoute,
	IconSearch,
	IconServer,
	IconSettings,
	IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "src/hooks";
import { T } from "src/locale";
import styles from "./CommandPalette.module.css";

const commands = [
	{ label: "Dashboard", hint: "Overview and operational status", to: "/", icon: IconHome },
	{
		label: "Publish service",
		hint: "Expose a service with automatic HTTPS",
		to: "/publish",
		icon: IconPlus,
		adminOnly: true,
	},
	{ label: "Proxy hosts", hint: "Search and manage HTTP routes", to: "/nginx/proxy", icon: IconRoute },
	{ label: "Streams", hint: "Manage TCP and UDP routes", to: "/nginx/stream", icon: IconServer },
	{ label: "Certificates", hint: "Inspect TLS and renewals", to: "/certificates", icon: IconCertificate },
	{
		label: "Integrations",
		hint: "API keys, policies, templates and webhooks",
		to: "/integrations",
		icon: IconApi,
		adminOnly: true,
	},
	{ label: "Notifications", hint: "Health and certificate alerts", to: "/notifications", icon: IconBell },
	{ label: "Settings", hint: "Platform configuration", to: "/settings", icon: IconSettings, adminOnly: true },
];

export function CommandPalette() {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const navigate = useNavigate();
	const { data: currentUser } = useUser("me");
	const isAdmin = currentUser?.roles.includes("admin") || false;

	useEffect(() => {
		const openPalette = () => setOpen(true);
		const keydown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen((value) => !value);
			}
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("nacl-command-open", openPalette);
		window.addEventListener("keydown", keydown);
		return () => {
			window.removeEventListener("nacl-command-open", openPalette);
			window.removeEventListener("keydown", keydown);
		};
	}, []);

	useEffect(() => {
		if (open) window.setTimeout(() => input.current?.focus(), 50);
		else setQuery("");
	}, [open]);
	const filtered = useMemo(
		() =>
			commands.filter(
				(item) =>
					(!item.adminOnly || isAdmin) &&
					`${item.label} ${item.hint}`.toLowerCase().includes(query.toLowerCase()),
			),
		[isAdmin, query],
	);
	if (!open) return null;

	return (
		<div className={styles.backdrop}>
			<button
				type="button"
				className={styles.dismiss}
				onClick={() => setOpen(false)}
				aria-label="Close command palette"
			/>
			<section className={styles.palette} role="dialog" aria-modal="true" aria-label="Command palette">
				<header>
					<IconSearch />
					<input
						ref={input}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search resources or run a command…"
					/>
					<button type="button" onClick={() => setOpen(false)} aria-label="Close command palette">
						<IconX />
					</button>
				</header>
				<div className={styles.results}>
					<p>
						<T id="nav.quick-actions" />
					</p>
					{filtered.map((item) => (
						<button
							type="button"
							key={item.to}
							onClick={() => {
								navigate(item.to);
								setOpen(false);
							}}
						>
							<span>
								<item.icon />
							</span>
							<div>
								<strong>{item.label}</strong>
								<small>{item.hint}</small>
							</div>
						</button>
					))}
					{!filtered.length && <div className={styles.empty}>No commands match “{query}”</div>}
				</div>
				<footer>
					<span>
						<kbd>↑</kbd>
						<kbd>↓</kbd> Navigate
					</span>
					<span>
						<kbd>esc</kbd> Close
					</span>
				</footer>
			</section>
		</div>
	);
}
