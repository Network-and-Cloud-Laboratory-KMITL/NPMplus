import cn from "classnames";
import { useLocation, useNavigate } from "react-router-dom";

interface Props {
	children: React.ReactNode;
	to?: string;
	isDropdownItem?: boolean;
	onClick?: () => void;
	className?: string;
}
export function NavLink({ children, to, isDropdownItem, onClick, className }: Props) {
	const navigate = useNavigate();
	const location = useLocation();
	const active = Boolean(to && (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to)));

	return (
		<a
			className={cn(isDropdownItem ? "dropdown-item" : "nav-link", className, { active })}
			href={to}
			onClick={(e) => {
				e.preventDefault();
				if (onClick) {
					onClick();
				}
				if (to) {
					navigate(to);
				}
			}}
		>
			{children}
		</a>
	);
}
