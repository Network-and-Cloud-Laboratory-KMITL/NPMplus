import {
	IconBell,
	IconCommand,
	IconLock,
	IconLogout,
	IconMenu2,
	IconSearch,
	IconShieldLock,
	IconUser,
} from "@tabler/icons-react";
import { LocalePicker, NavLink, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { showChangePasswordModal, showTwoFactorModal, showUserModal } from "src/modals";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
	const { data: currentUser } = useUser("me");
	const isAdmin = currentUser?.roles.includes("admin");
	const { logout } = useAuthState();

	const openMobile = () => {
		document.querySelector("[data-app-sidebar]")?.classList.add("is-mobile-open");
		document.body.classList.add("sidebar-open");
	};

	return (
		<header className={styles.header}>
			<button type="button" className={styles.menuButton} onClick={openMobile} aria-label="Open navigation">
				<IconMenu2 />
			</button>
			<button
				type="button"
				className={styles.search}
				aria-label={intl.formatMessage({ id: "nav.search" })}
				onClick={() => window.dispatchEvent(new Event("nacl-command-open"))}
			>
				<IconSearch size={19} />
				<span>
					<T id="nav.search" />
				</span>
				<kbd>
					<IconCommand size={13} /> K
				</kbd>
			</button>
			<div className={styles.utilities}>
				<div className={styles.desktopUtilities}>
					<LocalePicker />
					<ThemeSwitcher />
				</div>
				<NavLink to="/notifications" className={styles.iconButton}>
					<IconBell size={21} />
					<span className="visually-hidden">
						<T id="notifications.title" />
					</span>
					<span className={styles.notificationDot} />
				</NavLink>
				<div className="dropdown">
					<a href="/" className={styles.userButton} data-bs-toggle="dropdown" aria-label="Open user menu">
						<span
							className="avatar avatar-sm"
							style={{ backgroundImage: `url(${currentUser?.avatar || "/images/default-avatar.jpg"})` }}
						/>
						<span>
							<strong>{currentUser?.nickname}</strong>
							<small>
								<T id={isAdmin ? "role.admin" : "role.standard-user"} />
							</small>
						</span>
					</a>
					<div className="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
						<button className="dropdown-item" type="button" onClick={() => showUserModal("me")}>
							<IconUser width={18} />
							<T id="user.edit-profile" />
						</button>
						<button className="dropdown-item" type="button" onClick={() => showChangePasswordModal("me")}>
							<IconLock width={18} />
							<T id="user.change-password" />
						</button>
						<button className="dropdown-item" type="button" onClick={() => showTwoFactorModal("me")}>
							<IconShieldLock width={18} />
							<T id="user.two-factor" />
						</button>
						<div className="dropdown-divider" />
						<button className="dropdown-item" type="button" onClick={logout}>
							<IconLogout width={18} />
							<T id="user.logout" />
						</button>
					</div>
				</div>
			</div>
		</header>
	);
}
