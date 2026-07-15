import { Loading } from "src/components";
import styles from "./LoadingPage.module.css";

interface Props {
	label?: string;
	noLogo?: boolean;
}
export function LoadingPage({ label, noLogo }: Props) {
	return (
		<div className={styles.page}>
			<div className={styles.content}>
				<Loading label={label} noLogo={noLogo} />
			</div>
		</div>
	);
}
