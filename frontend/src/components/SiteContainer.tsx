interface Props {
	children: React.ReactNode;
}
export function SiteContainer({ children }: Props) {
	return <main className="container-fluid px-3 px-lg-4 py-4 min-w-0 overflow-x-auto">{children}</main>;
}
