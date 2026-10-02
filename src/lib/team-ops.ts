// =============================================================================
// Panel team — server-side operations shared by the Team API, the invite API
// and the pages: invite tokens, invite state, the team log lines that Admin
// Logs reads, and cleaning up invites someone may no longer hand out.
// =============================================================================

import { createHash, randomBytes } from "crypto";
import { db } from "./db";
import { audit } from "./audit";
import {
  canManage,
  isMemberRole,
  parsePermissions,
  permissionsOf,
  roleLabel,
  type MemberRole,
  type Permission,
} from "./team";

/** A fresh invite token (shown once, in the link) and the hash that is stored. */
export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Tokens are 43 base64url characters; anything else is not worth a query. */
export function isInviteTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export type InviteState = "pending" | "accepted" | "revoked" | "declined" | "expired";

export function inviteState(inv: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  declinedAt: Date | null;
  expiresAt: Date;
}): InviteState {
  if (inv.acceptedAt) return "accepted";
  if (inv.declinedAt) return "declined";
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt.getTime() <= Date.now()) return "expired";
  return "pending";
}

/** "hamza@example.com" → "ha***@example.com" — enough to recognise, not to harvest. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

/**
 * One line in the server log ("TEAM ROLE → name (Moderator → Admin) — actor"),
 * which Admin Logs shows under Team, plus the account-level audit record.
 */
export async function teamLog(opts: {
  serverId: string;
  action: "TEAM INVITE" | "TEAM INVITE REVOKED" | "TEAM JOIN" | "TEAM ROLE" | "TEAM PERMISSIONS" | "TEAM REMOVE" | "TEAM LEAVE";
  target: string;
  detail?: string;
  actor: { id: string; username: string };
  ip?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  // The Admin Logs parser splits on " — " and "(…)"; keep both out of the parts.
  const clean = (v: string) => v.replace(/[—()\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  const detail = opts.detail ? ` (${clean(opts.detail)})` : "";
  await db.serverLog
    .create({
      data: {
        serverId: opts.serverId,
        level: "INFO",
        source: "panel",
        message: `${opts.action} → ${clean(opts.target)}${detail} — ${clean(opts.actor.username)}`,
        meta: JSON.stringify({ team: true, ...(opts.meta ?? {}) }),
      },
    })
    .catch(() => undefined);
  await audit({
    userId: opts.actor.id,
    action: "TEAM_" + opts.action.replace(/^TEAM /, "").replace(/ /g, "_"),
    targetType: "Server",
    targetId: opts.serverId,
    ip: opts.ip ?? null,
    meta: { target: opts.target, detail: opts.detail ?? null, ...(opts.meta ?? {}) },
  });
}

/** "+Console & resources, −Moderate players" — for the log line. */
export function describePermissionChange(before: readonly Permission[], after: readonly Permission[], label: (p: Permission) => string): string {
  const added = after.filter((p) => !before.includes(p)).map((p) => "+" + label(p));
  const removed = before.filter((p) => !after.includes(p)).map((p) => "−" + label(p));
  return [...added, ...removed].join(", ") || "no change";
}

/**
 * The access a member who created invites holds right now (null: not on the
 * team any more). The owner always qualifies.
 */
async function currentInviterAccess(serverId: string, ownerId: string, userId: string) {
  if (userId === ownerId) return { role: "OWNER" as const, perms: permissionsOf("OWNER", []) };
  const m = await db.serverMember.findUnique({ where: { serverId_userId: { serverId, userId } } });
  if (!m || !isMemberRole(m.role)) return null;
  return { role: m.role, perms: permissionsOf(m.role, parsePermissions(m.permissions)) };
}

/**
 * Is the invite still one its creator could hand out today? An Admin who was
 * demoted or removed after inviting someone must not still bring them in.
 */
export async function inviterStillAllowed(invite: {
  serverId: string;
  createdById: string;
  role: string;
  permissions: string;
}): Promise<boolean> {
  const server = await db.server.findUnique({ where: { id: invite.serverId }, select: { ownerId: true } });
  if (!server || !isMemberRole(invite.role)) return false;
  const actor = await currentInviterAccess(invite.serverId, server.ownerId, invite.createdById);
  if (!actor) return false;
  return canManage(actor, { role: invite.role as MemberRole }, parsePermissions(invite.permissions));
}

/**
 * After a member's role or permissions shrink (or they leave): withdraw the
 * pending invites they could no longer create.
 */
export async function revokeStaleInvitesBy(serverId: string, userId: string): Promise<number> {
  const pending = await db.serverInvite.findMany({
    where: { serverId, createdById: userId, acceptedAt: null, revokedAt: null, declinedAt: null, expiresAt: { gt: new Date() } },
  });
  let n = 0;
  for (const inv of pending) {
    if (await inviterStillAllowed(inv)) continue;
    await db.serverInvite.update({ where: { id: inv.id }, data: { revokedAt: new Date() } });
    n++;
  }
  return n;
}

export function roleName(role: string): string {
  return isMemberRole(role) ? roleLabel(role) : role;
}
