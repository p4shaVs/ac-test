import { ApiError, requireUser } from "./api";
import { resolveAccess } from "./team-access";
import { PERMISSIONS, type Permission } from "./team";

/**
 * API routes under /api/servers/[id]: the server, the user and their access.
 *   perm omitted → any team member (reading)
 *   perm = a Permission → members holding it (and the owner)
 *   perm = "owner" → the owner only (token, installer, deleting the server)
 * No access at all → 404, so a stranger cannot even learn the server exists.
 */
export async function requireServerAccess(serverId: string, perm?: Permission | "owner") {
  const user = await requireUser();
  const r = await resolveAccess(user, serverId);
  if (!r) throw new ApiError(404, "Server not found");
  if (perm === "owner" && !r.access.isOwner) {
    throw new ApiError(403, "Only the server owner can do this.", "OWNER_ONLY");
  }
  if (perm && perm !== "owner" && !r.access.perms.has(perm)) {
    const label = PERMISSIONS.find((p) => p.key === perm)?.label ?? perm;
    throw new ApiError(403, `Your role on this server does not allow this (needs “${label}”).`, "FORBIDDEN");
  }
  return { server: r.server, user, access: r.access };
}

/** Owner-only routes. */
export async function requireOwnedServer(serverId: string) {
  return requireServerAccess(serverId, "owner");
}
