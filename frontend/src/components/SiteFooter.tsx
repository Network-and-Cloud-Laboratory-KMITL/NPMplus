import { IconApi, IconBrandGithub, IconCircleCheck } from "@tabler/icons-react";
import { useCheckVersion, useHealth } from "src/hooks";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
	const health = useHealth();
	const { data: versionData } = useCheckVersion();
	const version = health.data?.version || "";

	return (
		<footer className={styles.footer}>
			<div>
				<span className={styles.status}>
					<IconCircleCheck size={15} /> Operational
				</span>
				<span>NaCl Edge · NPMplus {version}</span>
				{versionData?.updateAvailable && (
					<a href="https://github.com/ZoeyVid/NPMplus/releases" target="_blank" rel="noreferrer">
						Update {versionData.latest} available
					</a>
				)}
			</div>
			<nav>
				<a href="/api/docs" target="_blank" rel="noopener">
					<IconApi size={16} /> API
				</a>
				<a href="https://github.com/ZoeyVid/NPMplus" target="_blank" rel="noreferrer">
					<IconBrandGithub size={16} /> Source
				</a>
			</nav>
		</footer>
	);
}
