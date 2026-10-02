import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, requireUser } from "@/lib/api";
import { clientIp, isDemoEmail } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { MAX_MEMBERS, isMemberRole, roleLabel } from "@/lib/team";
import { hashInviteToken, inviteState, inviterStillAllowed, isInviteTokenShape, teamLog } from "@/lib/team-ops";

// =============================================================================
// POST /api/invites — accept or decline a panel team invite.
//   { token, action }     from the /invite/<token> link
//   { inviteId, action }  from the dashboard, for invites made to an existing
//                         account (bound to it by user id)
// A link alone is never enough: the signed-in account must be the one invited
// (same user id, or — for an address that had no account yet — same e-mail).
// =============================================================================

const schema = z
  .object({
    token: z.string().max(64).optional(),
    inviteId: z.string().max(40).optional(),
    action: z.enum(["accept", "decline"]),
  })
  .refine((b) => !!b.token !== !!b.inviteId, "token or inviteId");

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const ip = clientIp(headers()) ?? "unknown";
  const rl = rateLimit(`invite:${ip}`, 30, 10 * 60_000);
  if (!rl.success) throw new ApiError(429, "Too many attempts — try again in a few minutes.");

  const body = schema.parse(await req.json());
  if (isDemoEmail(user.email)) throw new ApiError(403, "The public demo account cannot join a team.");

  let invite;
  if (body.token) {
    if (!isInviteTokenShape(body.token)) throw new ApiError(404, "This invite link is not valid.");
    invite = await db.serverInvite.findUnique({ where: { tokenHash: hashInviteToken(body.token) } });
  } else {
    invite = await db.serverInvite.findUnique({ where: { id: body.inviteId! } });
    // Without the link, only invites bound to this very account.
    if (invite && invite.userId !== user.id) invite = null;
  }
  if (!invite) throw new ApiError(404, "This invite link is not valid.");

  const forMe = invite.userId ? invite.userId === user.id : invite.email === user.email.toLowerCase();
  if (!forMe) throw new ApiError(403, "This invite is for a different account.", "WRONG_ACCOUNT");

  const state = inviteState(invite);
  if (state !== "pending") {
    throw new ApiError(410, state === "expired" ? "This invite has expired — ask for a new one." : "This invite is no longer open.", state.toUpperCase());
  }

  const server = await db.server.findUnique({ where: { id: invite.serverId }, select: { id: true, name: true, ownerId: true } });
  if (!server) throw new ApiError(404, "This server no longer exists.");

  if (body.action === "decline") {
    await db.serverInvite.update({ where: { id: invite.id }, data: { declinedAt: new Date() } });
    return ok({ declined: true });
  }

  if (server.ownerId === user.id) throw new ApiError(400, "You already own this server.");
  if (!isMemberRole(invite.role) || !(await inviterStillAllowed(invite))) {
    throw new ApiError(410, "Whoever sent this invite can no longer hand it out — ask for a new one.", "STALE");
  }

  const already = await db.serverMember.findUnique({ where: { serverId_userId: { serverId: server.id, userId: user.id } } });
  if (already) {
    await db.serverInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), acceptedById: user.id } });
    return ok({ serverId: server.id, already: true });
  }
  if ((await db.serverMember.count({ where: { serverId: server.id } })) >= MAX_MEMBERS) {
    throw new ApiError(400, "This team is full — ask the owner to make room.");
  }

  // Single use: the invite is claimed and the membership created together, and
  // the claim only succeeds while the invite is still open (two tabs, one join).
  await db.$transaction(async (tx) => {
    const claimed = await tx.serverInvite.updateMany({
      where: { id: invite!.id, acceptedAt: null, revokedAt: null, declinedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date(), acceptedById: user.id },
    });
    if (claimed.count !== 1) throw new ApiError(410, "This invite is no longer open.");
    await tx.serverMember.create({
      data: {
        serverId: server.id,
        userId: user.id,
        role: invite!.role,
        permissions: invite!.permissions,
        addedById: invite!.createdById,
      },
    });
  });

  await teamLog({
    serverId: server.id,
    action: "TEAM JOIN",
    target: user.username,
    detail: roleLabel(invite.role as "ADMIN" | "MODERATOR" | "VIEWER"),
    actor: user,
    ip,
    meta: { inviteId: invite.id },
  });
  return ok({ serverId: server.id, already: false });
});
