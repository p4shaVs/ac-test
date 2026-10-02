import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireServerAccess } from "@/lib/api-guards";
import { clientIp, isDemoEmail } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import {
  PERMISSIONS,
  ROLES,
  INVITE_DAYS,
  MAX_MEMBERS,
  MAX_PENDING_INVITES,
  canManage,
  isMemberRole,
  parsePermissions,
  permissionChangeAllowed,
  permissionsOf,
  roleLabel,
  sanitizePermissions,
  type MemberRole,
  type Permission,
} from "@/lib/team";
import {
  describePermissionChange,
  inviteState,
  maskEmail,
  newInviteToken,
  revokeStaleInvitesBy,
  roleName,
  teamLog,
} from "@/lib/team-ops";

// =============================================================================
// /api/servers/[id]/team — the panel team of one server.
//   GET   everyone on the team sees who else is on it; e-mail addresses and
//         pending invites only for those who can manage the team.
//   POST  { action: "invite" | "revokeInvite" | "relink" | "update" | "remove" | "leave" }
// The rules (src/lib/team.ts): the team permission, a strictly higher rank than
// the member you touch, and only permissions you hold yourself change hands.
// =============================================================================

const permLabel = (p: Permission) => PERMISSIONS.find((x) => x.key === p)?.label ?? p;
const pendingWhere = () => ({ acceptedAt: null, revokedAt: null, declinedAt: null, expiresAt: { gt: new Date() } });

export const GET = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, access } = await requireServerAccess(ctx.params.id);
  const manager = access.perms.has("team");
  const [owner, members, invites] = await Promise.all([
    db.user.findUnique({ where: { id: server.ownerId }, select: { id: true, username: true, email: true, avatarUrl: true } }),
    db.serverMember.findMany({
      where: { serverId: server.id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, username: true, email: true, avatarUrl: true } } },
    }),
    manager
      ? db.serverInvite.findMany({ where: { serverId: server.id, ...pendingWhere() }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
  ]);
  return ok({
    owner: owner && { id: owner.id, username: owner.username, email: manager ? owner.email : null },
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      username: m.user.username,
      email: manager ? m.user.email : null,
      role: m.role,
      permissions: parsePermissions(m.permissions),
      createdAt: m.createdAt.toISOString(),
      lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      permissions: parsePermissions(i.permissions),
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
      boundToAccount: !!i.userId,
    })),
  });
});

const roleSchema = z.enum(["ADMIN", "MODERATOR", "VIEWER"]);
const permsSchema = z.array(z.string().max(32)).max(16);

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("invite"),
    // An e-mail address or a username.
    identifier: z.string().trim().min(2).max(120),
    role: roleSchema,
    permissions: permsSchema.optional(),
  }),
  z.object({ action: z.literal("revokeInvite"), inviteId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("relink"), inviteId: z.string().min(1).max(40) }),
  z.object({
    action: z.literal("update"),
    memberId: z.string().min(1).max(40),
    role: roleSchema.optional(),
    permissions: permsSchema.optional(),
  }),
  z.object({ action: z.literal("remove"), memberId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("leave") }),
]);

export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, user, access } = await requireServerAccess(ctx.params.id);
  const ip = clientIp(headers());
  const body = bodySchema.parse(await req.json());

  const rl = rateLimit(`team:${user.id}`, 40, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many team changes — wait a minute.");

  // ---------------------------------------------------------------- leave
  if (body.action === "leave") {
    if (access.isOwner) throw new ApiError(400, "The owner cannot leave their own server.");
    const m = await db.serverMember.findUnique({ where: { id: access.memberId! } });
    if (!m) throw new ApiError(404, "You are not on this team.");
    await db.serverMember.delete({ where: { id: m.id } });
    await revokeStaleInvitesBy(server.id, user.id);
    await teamLog({ serverId: server.id, action: "TEAM LEAVE", target: user.username, detail: roleName(m.role), actor: user, ip });
    return ok({ left: true });
  }

  // Everything else manages other people.
  if (!access.perms.has("team")) {
    throw new ApiError(403, "Your role on this server does not allow this (needs “Team”).", "FORBIDDEN");
  }
  const actor = { role: access.role, perms: access.perms };

  // --------------------------------------------------------------- invite
  if (body.action === "invite") {
    const irl = rateLimit(`team-invite:${user.id}`, 20, 60 * 60_000);
    if (!irl.success) throw new ApiError(429, "Too many invites in the last hour.");

    const role = body.role as MemberRole;
    const perms = body.permissions ? sanitizePermissions(body.permissions) : ROLES[role].perms;
    if (!canManage(actor, { role })) {
      throw new ApiError(403, `You can only invite roles below your own — not ${roleLabel(role)}.`, "FORBIDDEN");
    }
    if (!permissionChangeAllowed(actor, [], perms)) {
      throw new ApiError(403, "You can only hand out permissions you have yourself.", "FORBIDDEN");
    }

    const ident = body.identifier;
    const byEmail = ident.includes("@");
    if (byEmail && !z.string().email().max(120).safeParse(ident).success) throw new ApiError(422, "That is not a valid e-mail address.");
    const email = byEmail ? ident.toLowerCase() : null;
    const target = byEmail
      ? await db.user.findUnique({ where: { email: email! }, select: { id: true, email: true, username: true } })
      : await db.user.findUnique({ where: { username: ident }, select: { id: true, email: true, username: true } });
    if (!byEmail && !target) {
      throw new ApiError(404, "No account with that username. Invite them by e-mail instead — they can sign up with it.");
    }
    const inviteEmail = (target?.email ?? email!).toLowerCase();
    if (isDemoEmail(inviteEmail)) throw new ApiError(400, "The public demo account cannot join a team.");
    if (target?.id === user.id) throw new ApiError(400, "That is you.");
    if (target?.id === server.ownerId) throw new ApiError(400, "That account owns this server.");
    if (target) {
      const already = await db.serverMember.findUnique({ where: { serverId_userId: { serverId: server.id, userId: target.id } } });
      if (already) throw new ApiError(409, `${target.username} is already on the team.`);
    }

    const [memberCount, pending] = await Promise.all([
      db.serverMember.count({ where: { serverId: server.id } }),
      db.serverInvite.findMany({ where: { serverId: server.id, ...pendingWhere() }, select: { id: true, email: true } }),
    ]);
    const replacing = pending.filter((p) => p.email === inviteEmail);
    if (memberCount >= MAX_MEMBERS) throw new ApiError(400, `A server can have at most ${MAX_MEMBERS} team members.`);
    if (pending.length - replacing.length >= MAX_PENDING_INVITES) {
      throw new ApiError(400, `At most ${MAX_PENDING_INVITES} invites can be open at once — revoke some first.`);
    }

    const { token, hash } = newInviteToken();
    const invite = await db.$transaction(async (tx) => {
      // A new invite for the same address replaces the old link.
      if (replacing.length) {
        await tx.serverInvite.updateMany({ where: { id: { in: replacing.map((r) => r.id) } }, data: { revokedAt: new Date() } });
      }
      return tx.serverInvite.create({
        data: {
          serverId: server.id,
          email: inviteEmail,
          userId: target?.id ?? null,
          role,
          permissions: JSON.stringify(perms),
          tokenHash: hash,
          createdById: user.id,
          expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
        },
      });
    });
    await teamLog({
      serverId: server.id,
      action: "TEAM INVITE",
      // Admin Logs is visible to the whole team; addresses stay with the managers.
      target: target?.username ?? maskEmail(inviteEmail),
      detail: roleLabel(role),
      actor: user,
      ip,
      meta: { inviteId: invite.id, permissions: perms },
    });
    // The token leaves the server once, in this response; only its hash is kept.
    return ok({
      inviteId: invite.id,
      path: `/invite/${token}`,
      boundToAccount: !!target,
      username: target?.username ?? null,
      expiresAt: invite.expiresAt.toISOString(),
    });
  }

  // ---------------------------------------------------- revoke / new link
  if (body.action === "revokeInvite" || body.action === "relink") {
    const inv = await db.serverInvite.findFirst({ where: { id: body.inviteId, serverId: server.id } });
    if (!inv || inviteState(inv) !== "pending") throw new ApiError(404, "That invite is no longer open.");
    if (!isMemberRole(inv.role) || !canManage(actor, { role: inv.role })) {
      throw new ApiError(403, "That invite is for a role you cannot manage.", "FORBIDDEN");
    }
    if (body.action === "revokeInvite") {
      await db.serverInvite.update({ where: { id: inv.id }, data: { revokedAt: new Date() } });
      await teamLog({ serverId: server.id, action: "TEAM INVITE REVOKED", target: maskEmail(inv.email), detail: roleName(inv.role), actor: user, ip });
      return ok({ revoked: true });
    }
    if (!permissionChangeAllowed(actor, [], parsePermissions(inv.permissions))) {
      throw new ApiError(403, "That invite hands out permissions you do not have.", "FORBIDDEN");
    }
    const { token, hash } = newInviteToken();
    const updated = await db.serverInvite.update({
      where: { id: inv.id },
      data: { tokenHash: hash, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
    });
    return ok({ inviteId: updated.id, path: `/invite/${token}`, expiresAt: updated.expiresAt.toISOString() });
  }

  // -------------------------------------------------------- update / remove
  const m = await db.serverMember.findFirst({
    where: { id: body.memberId, serverId: server.id },
    include: { user: { select: { id: true, username: true } } },
  });
  if (!m || !isMemberRole(m.role)) throw new ApiError(404, "That member is not on this team.");
  if (m.userId === user.id) throw new ApiError(400, "You cannot change your own role — ask someone above you.");
  if (!canManage(actor, { role: m.role })) {
    throw new ApiError(403, `Only someone ranked above a ${roleLabel(m.role)} can change them.`, "FORBIDDEN");
  }

  if (body.action === "remove") {
    await db.serverMember.delete({ where: { id: m.id } });
    await revokeStaleInvitesBy(server.id, m.userId);
    await teamLog({ serverId: server.id, action: "TEAM REMOVE", target: m.user.username, detail: roleName(m.role), actor: user, ip });
    return ok({ removed: true });
  }

  // update
  const oldRole = m.role as MemberRole;
  const oldPerms = parsePermissions(m.permissions);
  const newRole = (body.role ?? oldRole) as MemberRole;
  // A role change without an explicit list takes the new role's preset.
  const newPerms =
    body.permissions !== undefined ? sanitizePermissions(body.permissions) : body.role && body.role !== oldRole ? ROLES[newRole].perms : oldPerms;

  if (newRole !== oldRole && !canManage(actor, { role: newRole })) {
    throw new ApiError(403, `You can only hand out roles below your own — not ${roleLabel(newRole)}.`, "FORBIDDEN");
  }
  if (!permissionChangeAllowed(actor, oldPerms, newPerms)) {
    throw new ApiError(403, "You can only add or remove permissions you have yourself.", "FORBIDDEN");
  }

  await db.serverMember.update({
    where: { id: m.id },
    data: { role: newRole, permissions: JSON.stringify(newPerms) },
  });
  if (newRole !== oldRole) {
    await teamLog({
      serverId: server.id,
      action: "TEAM ROLE",
      target: m.user.username,
      detail: `${roleLabel(oldRole)} → ${roleLabel(newRole)}`,
      actor: user,
      ip,
      meta: { permissions: newPerms },
    });
  }
  const permsChanged = oldPerms.join() !== newPerms.join();
  if (permsChanged && (newRole === oldRole || body.permissions !== undefined)) {
    await teamLog({
      serverId: server.id,
      action: "TEAM PERMISSIONS",
      target: m.user.username,
      detail: describePermissionChange(oldPerms, newPerms, permLabel),
      actor: user,
      ip,
      meta: { before: oldPerms, after: newPerms },
    });
  }
  // Whatever they can no longer hand out, their open invites cannot either.
  const revoked = await revokeStaleInvitesBy(server.id, m.userId);
  const effective = [...permissionsOf(newRole, newPerms)];
  return ok({ id: m.id, role: newRole, permissions: effective, invitesRevoked: revoked });
});
