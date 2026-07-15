import net from "node:net";
import errs from "./error.js";

const normalizeDomain = (domain) => domain.toLowerCase().replace(/\.$/, "");

const domainAllowed = (domain, suffixes = []) => {
	const normalized = normalizeDomain(domain);
	return suffixes.some((suffix) => {
		const allowed = normalizeDomain(suffix).replace(/^\*\./, "");
		return normalized === allowed || normalized.endsWith(`.${allowed}`);
	});
};

const upstreamAllowed = (host, cidrs = []) => {
	const family = net.isIP(host);
	if (!family) return false;
	const blockList = new net.BlockList();
	for (const cidr of cidrs) {
		const [address, prefixRaw] = cidr.split("/");
		const type = net.isIP(address) === 6 ? "ipv6" : "ipv4";
		const prefix = Number.parseInt(prefixRaw ?? (type === "ipv6" ? "128" : "32"), 10);
		if (net.isIP(address)) blockList.addSubnet(address, prefix, type);
	}
	return blockList.check(host, family === 6 ? "ipv6" : "ipv4");
};

const portAllowed = (port, allowed = []) =>
	allowed.some((entry) => {
		if (typeof entry === "number") return entry === port;
		const [from, to = from] = `${entry}`.split("-").map(Number);
		return Number.isInteger(from) && Number.isInteger(to) && port >= from && port <= to;
	});

const assertPublishPolicy = (policy, payload) => {
	const domains = payload.domain_names || (payload.domain_name ? [payload.domain_name] : []);
	if (!domains.length || domains.some((domain) => !domainAllowed(domain, policy.allowed_domain_suffixes))) {
		throw new errs.PermissionError("Domain is outside the integration policy");
	}
	const host = payload.forward_host ?? payload.upstream?.host;
	if (!upstreamAllowed(host, policy.allowed_upstream_cidrs)) {
		throw new errs.PermissionError("Upstream address is outside the integration policy");
	}
	const port = Number(payload.forward_port ?? payload.upstream?.port);
	if (!portAllowed(port, policy.allowed_ports)) {
		throw new errs.PermissionError("Upstream port is outside the integration policy");
	}
	const scheme = payload.forward_scheme ?? payload.upstream?.scheme ?? "http";
	if (!policy.allowed_schemes?.includes(scheme)) {
		throw new errs.PermissionError("Upstream scheme is outside the integration policy");
	}
	if (payload.template_id && !policy.allowed_template_ids?.includes(payload.template_id)) {
		throw new errs.PermissionError("Template is outside the integration policy");
	}
};

export { assertPublishPolicy, domainAllowed, portAllowed, upstreamAllowed };
