import { db } from "./db";
import type { CurrentUser } from "./session";
import { parsePermissions, permissionsOf, isMemberRole, type Access, type MemberRole } from "./team";

// How often a member's "last active" is written (an access check runs on every
// page and request; one write every few minutes is plenty).
const SEEN_EVERY_MS = 5 * 60_000;

/**
 * The user's access to a server, or null when they have none. The server row
 * (with its licence) comes back with it so callers do not load it twice.
 */
export async function resolveAccess(user: CurrentUser, serverId: string) {
  const server = await db.server.findUnique({
    where: { id: serverId },
    include: { licenseKey: { include: { product: true } } },
  });
  if (!server) return null;
  if (server.ownerId === user.id) {
    const access: Access = { isOwner: true, role: "OWNER", perms: permissionsOf("OWNER", []), memberId: null };
    return { server, access };
  }
  const m = await db.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: user.id } } });
  if (!m || !isMemberRole(m.role)) return null;
  if (!m.lastSeenAt || Date.now() - m.lastSeenAt.getTime() > SEEN_EVERY_MS) {
    void db.serverMember.update({ where: { id: m.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  const access: Access = {
    isOwner: false,
    role: m.role,
    perms: permissionsOf(m.role, parsePermissions(m.permissions)),
    memberId: m.id,
  };
  return { server, access };
}

/** Every server the user can open: owned first, then shared with them. */
export async function accessibleServers(userId: string) {
  const [owned, memberships] = await Promise.all([
    db.server.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } }),
    db.serverMember.findMany({ where: { userId }, include: { server: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return [
    ...owned.map((server) => ({ server, role: "OWNER" as const, perms: [...permissionsOf("OWNER", [])] })),
    ...memberships
      .filter((m) => isMemberRole(m.role))
      .map((m) => ({ server: m.server, role: m.role as MemberRole, perms: parsePermissions(m.permissions) })),
  ];
}

/** IDs of every server the user can open. */
export async function accessibleServerIds(userId: string): Promise<string[]> {
  return (await accessibleServers(userId)).map((s) => s.server.id);
}
