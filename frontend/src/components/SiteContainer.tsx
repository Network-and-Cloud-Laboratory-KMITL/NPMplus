import styles from "./SiteContainer.module.css";

interface Props {
	children: React.ReactNode;
}

export function SiteContainer({ children }: Props) {
	return <main className={styles.container}>{children}</main>;
}
