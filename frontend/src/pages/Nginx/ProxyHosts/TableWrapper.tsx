import { IconBookmark, IconHelp, IconPlayerPause, IconPlayerPlay, IconSearch } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SortingState } from "@tanstack/react-table";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { useNavigate } from "react-router-dom";
import { deleteProxyHost, toggleProxyHost } from "src/api/backend";
import { platformApi } from "src/api/v1";
import { Button, HasPermission, LoadingPage } from "src/components";
import { getDirectory, useProxyHosts } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showProxyHostModal } from "src/modals";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [search, setSearch] = useState("");
	const [sorting, setSorting] = useState<SortingState>([]);
	const [selectedIds, setSelectedIds] = useState<number[]>([]);
	const { isFetching, isLoading, isError, error, data } = useProxyHosts([
		"owner",
		"access_lists",
		"certificate",
		"managed_resource",
	]);
	const savedViews = useQuery({
		queryKey: ["v1", "saved-views", "proxy-hosts"],
		queryFn: () => platformApi.listSavedViews("proxy-hosts"),
	});
	const saveView = useMutation({
		mutationFn: () =>
			platformApi.createSavedView({
				resourceType: "proxy-hosts",
				name: search || "All proxy hosts",
				configuration: { search },
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["v1", "saved-views", "proxy-hosts"] }),
	});

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteProxyHost(id);
		showObjectSuccess("proxy-host", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleProxyHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["proxy-host", id] });
		showObjectSuccess("proxy-host", enabled ? "enabled" : "disabled");
	};

	const handleBulkToggle = async (enabled: boolean) => {
		const targets = selectedIds.filter((id) => data?.find((host) => host.id === id)?.enabled !== enabled);
		await Promise.all(targets.map((id) => toggleProxyHost(id, enabled)));
		setSelectedIds([]);
		await queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
	};

	const handleDeleteClick = (id: number) => {
		const host = data?.find((h) => h.id === id);
		showDeleteConfirmModal({
			title: <T id="object.delete" tData={{ object: "proxy-host" }} />,
			onConfirm: () => handleDelete(id),
			invalidations: [["proxy-hosts"], ["proxy-host", id]],
			children: (
				<>
					<T id="object.delete.content" tData={{ object: "proxy-host" }} />
					{host?.domainNames?.length ? (
						<div className="mt-2 fw-bold text-break">{host.domainNames.join(", ")}</div>
					) : null}
					{host?.forwardHost ? (
						<div className="mt-1 text-muted small">
							({host.forwardScheme}://{host.forwardHost}:{host.forwardPort})
						</div>
					) : null}
				</>
			),
		});
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			const directory = getDirectory(item).toLowerCase();
			return (
				item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
				item.forwardHost.toLowerCase().includes(search) ||
				`${item.forwardPort}`.includes(search) ||
				directory.includes(search)
			);
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	const displayedHosts = filtered ?? data ?? [];
	const groupingActive = displayedHosts.some((item) => getDirectory(item));

	const sharedTableProps = {
		isFiltered: !!search,
		isFetching,
		sorting,
		onSortingChange: setSorting,
		onEdit: (id: number) => showProxyHostModal(id),
		onInspect: (id: number) => navigate(`/nginx/proxy/${id}`),
		onClone: (id: number) => showProxyHostModal(id, true),
		onDelete: handleDeleteClick,
		onDisableToggle: handleDisableToggle,
		onNew: () => showProxyHostModal("new"),
		selectedIds,
		onSelectionChange: setSelectedIds,
	};

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-lime" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="proxy-hosts" />
							</h2>
						</div>
						<div className="col-md-auto col-sm-12">
							<div className="ms-auto d-flex flex-wrap btn-list">
								{selectedIds.length > 0 && (
									<>
										<span className="badge bg-azure-lt align-self-center">
											{selectedIds.length} <T id="table.selected" />
										</span>
										<Button size="sm" onClick={() => handleBulkToggle(true)}>
											<IconPlayerPlay size={16} />
											<T id="action.enable" />
										</Button>
										<Button size="sm" onClick={() => handleBulkToggle(false)}>
											<IconPlayerPause size={16} />
											<T id="action.disable" />
										</Button>
									</>
								)}
								{data?.length ? (
									<>
										<select
											className="form-select form-select-sm w-auto"
											aria-label="Saved filter"
											value=""
											onChange={(event) => {
												const view = savedViews.data?.data.find(
													(item) => item.id === Number(event.target.value),
												);
												if (view) setSearch(`${view.configuration.search || ""}`);
											}}
										>
											<option value="">
												<T id="table.saved-views" />
											</option>
											{savedViews.data?.data.map((view) => (
												<option key={view.id} value={view.id}>
													{view.name}
												</option>
											))}
										</select>
										<div className="input-group input-group-flat w-auto">
											<span className="input-group-text input-group-text-sm">
												<IconSearch size={16} />
											</span>
											<input
												id="advanced-table-search"
												type="text"
												className="form-control form-control-sm"
												autoComplete="off"
												value={search}
												onChange={(e: any) => setSearch(e.target.value.toLowerCase())}
											/>
										</div>
										{search && (
											<Button
												size="sm"
												onClick={() => saveView.mutate()}
												title="Save current filter"
											>
												<IconBookmark size={16} />
											</Button>
										)}
									</>
								) : null}
								<Button size="sm" onClick={() => showHelpModal("ProxyHosts")}>
									<IconHelp size={20} />
								</Button>
								<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
									{data?.length ? (
										<Button
											size="sm"
											className="btn-lime"
											onClick={() => showProxyHostModal("new")}
										>
											<T id="object.add" tData={{ object: "proxy-host" }} />
										</Button>
									) : null}
								</HasPermission>
							</div>
						</div>
					</div>
				</div>
				<Table
					data={displayedHosts}
					groupBy={groupingActive ? getDirectory : undefined}
					renderGroupLabel={(key) => (key === "" ? <T id="proxy-host.no-directory" /> : key)}
					{...sharedTableProps}
				/>
			</div>
		</div>
	);
}
