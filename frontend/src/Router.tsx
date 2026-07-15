import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import {
	ErrorNotFound,
	HasPermission,
	LoadingPage,
	Page,
	SiteContainer,
	CommandPalette,
	SiteFooter,
	SiteHeader,
	SiteMenu,
	Unhealthy,
} from "src/components";
import { useAuthState } from "src/context";
import { useHealth } from "src/hooks";
import { ADMIN, VIEW } from "src/modules/Permissions";
import styles from "./Router.module.css";

const Setup = lazy(() => import("src/pages/Setup"));
const Login = lazy(() => import("src/pages/Login"));
const Dashboard = lazy(() => import("src/pages/Dashboard"));
const Settings = lazy(() => import("src/pages/Settings"));
const Certificates = lazy(() => import("src/pages/Certificates"));
const Access = lazy(() => import("src/pages/Access"));
const AuditLog = lazy(() => import("src/pages/AuditLog"));
const Users = lazy(() => import("src/pages/Users"));
const ProxyHosts = lazy(() => import("src/pages/Nginx/ProxyHosts"));
const ProxyHostDetails = lazy(() => import("src/pages/Nginx/ProxyHostDetails"));
const RedirectionHosts = lazy(() => import("src/pages/Nginx/RedirectionHosts"));
const DeadHosts = lazy(() => import("src/pages/Nginx/DeadHosts"));
const Streams = lazy(() => import("src/pages/Nginx/Streams"));
const Integrations = lazy(() => import("src/pages/Integrations"));
const Notifications = lazy(() => import("src/pages/Notifications"));
const PublishService = lazy(() => import("src/pages/PublishService"));

function Router() {
	const health = useHealth();
	const { authenticated } = useAuthState();

	if (health.isLoading) {
		return <LoadingPage />;
	}

	if (health.isError || health.data?.status !== "OK") {
		return <Unhealthy />;
	}

	if (!health.data?.setup) {
		return <Setup />;
	}

	if (!authenticated) {
		return (
			<Suspense fallback={<LoadingPage />}>
				<Login />
			</Suspense>
		);
	}

	return (
		<BrowserRouter>
			<CommandPalette />
			<Page className={styles.page}>
				<div className={styles.shell}>
					<SiteMenu />
					<div className={styles.workspace}>
						<SiteHeader />
						<SiteContainer>
							<Suspense fallback={<LoadingPage noLogo />}>
								<Routes>
									<Route path="*" element={<ErrorNotFound />} />
									<Route path="/certificates" element={<Certificates />} />
									<Route path="/access" element={<Access />} />
									<Route path="/audit-log" element={<AuditLog />} />
									<Route path="/settings" element={<Settings />} />
									<Route path="/users" element={<Users />} />
									<Route path="/nginx/proxy" element={<ProxyHosts />} />
									<Route path="/nginx/proxy/:hostId" element={<ProxyHostDetails />} />
									<Route path="/nginx/redirection" element={<RedirectionHosts />} />
									<Route path="/nginx/404" element={<DeadHosts />} />
									<Route path="/nginx/stream" element={<Streams />} />
									<Route
										path="/integrations"
										element={
											<HasPermission section={ADMIN} permission={VIEW} pageLoading loadingNoLogo>
												<Integrations />
											</HasPermission>
										}
									/>
									<Route path="/notifications" element={<Notifications />} />
									<Route
										path="/publish"
										element={
											<HasPermission section={ADMIN} permission={VIEW} pageLoading loadingNoLogo>
												<PublishService />
											</HasPermission>
										}
									/>
									<Route path="/" element={<Dashboard />} />
								</Routes>
							</Suspense>
						</SiteContainer>
						<SiteFooter />
					</div>
				</div>
			</Page>
		</BrowserRouter>
	);
}

export default Router;
