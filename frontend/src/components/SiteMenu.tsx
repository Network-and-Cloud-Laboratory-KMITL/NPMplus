import {
	IconActivityHeartbeat,
	IconAdjustments,
	IconApi,
	IconBook,
	IconChevronLeft,
	IconHome,
	IconLock,
	IconRoute,
	IconServer,
	IconSettings,
	IconShield,
	IconUser,
	IconX,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { HasPermission, LocalePicker, NavLink, ThemeSwitcher } from "src/components";
import { T } from "src/locale";
import {
	ACCESS_LISTS,
	ADMIN,
	CERTIFICATES,
	DEAD_HOSTS,
	PROXY_HOSTS,
	REDIRECTION_HOSTS,
	STREAMS,
	type Section,
	VIEW,
} from "src/modules/Permissions";
import styles from "./SiteMenu.module.css";

const links: Array<{ to: string; icon: ElementType; label: string; section?: Section }> = [
	{ to: "/", icon: IconHome, label: "dashboard" },
	{ to: "/nginx/proxy", icon: IconRoute, label: "proxy-hosts", section: PROXY_HOSTS },
	{ to: "/nginx/redirection", icon: IconAdjustments, label: "redirection-hosts", section: REDIRECTION_HOSTS },
	{ to: "/nginx/stream", icon: IconServer, label: "streams", section: STREAMS },
	{ to: "/nginx/404", icon: IconActivityHeartbeat, label: "dead-hosts", section: DEAD_HOSTS },
	{ to: "/access", icon: IconLock, label: "access-lists", section: ACCESS_LISTS },
	{ to: "/certificates", icon: IconShield, label: "certificates", section: CERTIFICATES },
];

const adminLinks = [
	{ to: "/integrations", icon: IconApi, label: "nav.integrations" },
	{ to: "/users", icon: IconUser, label: "users" },
	{ to: "/audit-log", icon: IconBook, label: "auditlogs" },
	{ to: "/settings", icon: IconSettings, label: "settings" },
];

export function SiteMenu() {
	const [collapsed, setCollapsed] = useState(() => localStorage.getItem("nacl-sidebar-collapsed") === "true");

	useEffect(() => {
		document.documentElement.dataset.sidebarCollapsed = `${collapsed}`;
		localStorage.setItem("nacl-sidebar-collapsed", `${collapsed}`);
	}, [collapsed]);

	const closeMobile = () => {
		document.querySelector("[data-app-sidebar]")?.classList.remove("is-mobile-open");
		document.body.classList.remove("sidebar-open");
	};

	return (
		<>
			<aside className={styles.sidebar} data-app-sidebar>
				<div className={styles.brand}>
					<img src="/images/nacl-logo-text-horizontal.png" alt="NaCl" className={styles.fullLogo} />
					<img src="/images/logo-no-text.svg" alt="NaCl" className={styles.markLogo} />
					<button
						type="button"
						className={styles.mobileClose}
						onClick={closeMobile}
						aria-label="Close navigation"
					>
						<IconX />
					</button>
				</div>
				<div className={styles.environment}>
					<span />
					<div>
						<strong>
							<T id="nav.control-plane" />
						</strong>
						<small>
							<T id="nav.operational" />
						</small>
					</div>
				</div>
				<nav className={styles.navigation} aria-label="Primary navigation">
					<p className={styles.groupLabel}>
						<T id="nav.edge" />
					</p>
					{links.map((item) => (
						<HasPermission key={item.to} section={item.section} permission={VIEW} hideError>
							<NavLink to={item.to} className={styles.link} onClick={closeMobile}>
								<item.icon size={21} stroke={1.8} />
								<span>
									<T id={item.label} />
								</span>
							</NavLink>
						</HasPermission>
					))}
					<HasPermission section={ADMIN} permission={VIEW} hideError>
						<p className={styles.groupLabel}>
							<T id="nav.administration" />
						</p>
						{adminLinks.map((item) => (
							<NavLink key={item.to} to={item.to} className={styles.link} onClick={closeMobile}>
								<item.icon size={21} stroke={1.8} />
								<span>
									<T id={item.label} />
								</span>
							</NavLink>
						))}
					</HasPermission>
				</nav>
				<div className={styles.mobilePreferences}>
					<LocalePicker />
					<ThemeSwitcher />
				</div>
				<button
					type="button"
					className={styles.collapse}
					onClick={() => setCollapsed((value) => !value)}
					aria-label="Toggle sidebar"
				>
					<IconChevronLeft size={19} />
					<span>
						<T id="nav.collapse" />
					</span>
				</button>
			</aside>
			<button type="button" className={styles.backdrop} onClick={closeMobile} aria-label="Close navigation" />
		</>
	);
}
