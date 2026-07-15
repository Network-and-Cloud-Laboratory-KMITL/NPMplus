import type { ReactNode } from "react";
import { BrandMark } from "src/components/BrandMark";
import { T } from "src/locale";
import styles from "./Loading.module.css";

interface Props {
	label?: string | ReactNode;
	noLogo?: boolean;
}
export function Loading({ label, noLogo }: Props) {
	return (
		<div className={styles.loading}>
			{noLogo ? null : (
				<div className={styles.brand}>
					<BrandMark className={styles.mark} />
					<span>NaCl Edge</span>
				</div>
			)}
			<div className={styles.label}>{label || <T id="loading" />}</div>
			<div className={styles.progress} aria-hidden="true">
				<span />
				<span />
				<span />
			</div>
		</div>
	);
}
