import cn from "classnames";
import styles from "./BrandMark.module.css";

interface Props {
	className?: string;
}

export function BrandMark({ className }: Props) {
	return (
		<span className={cn(styles.mark, className)} aria-hidden="true">
			<span className={styles.nodeTop} />
			<span className={styles.nodeLeft} />
			<span className={styles.nodeRight} />
		</span>
	);
}
