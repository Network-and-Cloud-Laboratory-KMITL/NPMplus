import errs from "../lib/error.js";
import oidcIdentityModel from "../models/oidc-identity.js";
import userModel from "../models/user.js";
import userPermissionModel from "../models/user_permission.js";

const csv = (value) => (value || "").split(",").map((item) => item.trim()).filter(Boolean);

const claimValue = (claims, path) => path.split(".").reduce((value, part) => value?.[part], claims);

const intersection = (left, right) => left.some((item) => right.includes(item));

const defaultPermissions = (isAdmin) => ({
	visibility: isAdmin ? "all" : "user",
	proxy_hosts: "manage",
	redirection_hosts: "manage",
	dead_hosts: "manage",
	streams: "manage",
	access_lists: "manage",
	certificates: "manage",
});

export default async (claims, issuer) => {
	if (!claims.sub) throw new errs.AuthError("The Identity Provider didn't send the 'sub' claim");
	if (!claims.email) throw new errs.AuthError("The Identity Provider didn't send the 'email' claim");

	const adminGroups = csv(process.env.OIDC_ADMIN_GROUPS);
	const userGroups = csv(process.env.OIDC_USER_GROUPS);
	const groupRulesConfigured = adminGroups.length > 0 || userGroups.length > 0;
	const rawGroups = claimValue(claims, process.env.OIDC_GROUPS_CLAIM || "groups");
	const groups = Array.isArray(rawGroups) ? rawGroups.map(String) : rawGroups ? [String(rawGroups)] : [];
	const isAdmin = intersection(groups, adminGroups);
	const isUser = isAdmin || intersection(groups, userGroups);

	const identity = await oidcIdentityModel.query().where({ issuer, subject: claims.sub }).first();
	let user = identity ? await userModel.query().findById(identity.user_id) : null;
	if (!user) {
		user = await userModel
			.query()
			.where("email", claims.email.toLowerCase().trim())
			.where("is_deleted", 0)
			.first();
	}

	if (groupRulesConfigured && !isUser) throw new errs.AuthError("Your NaCl Auth groups do not grant NPMplus access");
	if (!user && !groupRulesConfigured) {
		throw new errs.AuthError("Your NPMplus account has not been provisioned and no OIDC group mapping is configured");
	}

	const profile = {
		email: claims.email.toLowerCase().trim(),
		name: claims.name || claims.preferred_username || claims.email,
		nickname: claims.preferred_username || claims.nickname || claims.name || claims.email.split("@")[0],
		avatar: claims.picture || "/images/default-avatar.jpg",
		...(groupRulesConfigured ? { roles: isAdmin ? ["admin"] : [] } : {}),
		is_disabled: 0,
	};
	if (!user) {
		user = await userModel.query().insertAndFetch({ ...profile, is_deleted: 0 });
		await userPermissionModel.query().insert({ user_id: user.id, ...defaultPermissions(isAdmin) });
	} else {
		user = await userModel.query().patchAndFetchById(user.id, profile);
		if (groupRulesConfigured) {
			const permissions = await userPermissionModel.query().where("user_id", user.id).first();
			if (permissions) await userPermissionModel.query().patchAndFetchById(permissions.id, defaultPermissions(isAdmin));
			else await userPermissionModel.query().insert({ user_id: user.id, ...defaultPermissions(isAdmin) });
		}
	}

	if (identity) {
		await oidcIdentityModel.query().patchAndFetchById(identity.id, { user_id: user.id, claims: { groups } });
	} else {
		await oidcIdentityModel.query().insert({ user_id: user.id, issuer, subject: claims.sub, claims: { groups } });
	}
	return user;
};
