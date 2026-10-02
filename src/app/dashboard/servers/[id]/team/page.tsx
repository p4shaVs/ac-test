import { getServerAccess } from "@/lib/guards";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import {
  INVITE_DAYS,
  MAX_MEMBERS,
  accessSummary,
  assignableRoles,
  canManage,
  isMemberRole,
  parsePermissions,
} from "@/lib/team";
import { TeamView, type InviteRow, type MemberRow, type TeamEvent } from "./team-view";

export const dynamic = "force-dynamic";

// "TEAM ROLE → bob (Moderator → Admin) — hamza"
const LINE = /^(TEAM [A-Z ]+?) → (.+?)(?: \((.*)\))? — ([^—]+)$/;

export default async function TeamPage({ params }: { params: { id: string } }) {
  const { server, user, access } = await getServerAccess(params.id);
  const manager = access.perms.has("team");
  const actor = { role: access.role, perms: access.perms };

  const [owner, members, invites, logs] = await Promise.all([
    db.user.findUnique({ where: { id: server.ownerId }, select: { username: true, email: true, lastLoginAt: true } }),
    db.serverMember.findMany({
      where: { serverId: server.id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { username: true, email: true } } },
    }),
    manager
      ? db.serverInvite.findMany({
          where: { serverId: server.id, acceptedAt: null, revokedAt: null, declinedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    db.serverLog.findMany({
      where: { serverId: server.id, source: "panel", message: { startsWith: "TEAM " } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, message: true, createdAt: true },
    }),
  ]);

  // Who added whom / who sent which invite.
  const people = new Set<string>([...members.map((m) => m.addedById ?? ""), ...invites.map((i) => i.createdById)].filter(Boolean));
  const names = new Map(
    (await db.user.findMany({ where: { id: { in: [...people] } }, select: { id: true, username: true } })).map((u) => [u.id, u.username])
  );

  const memberRows: MemberRow[] = members
    .filter((m) => isMemberRole(m.role))
    .map((m) => {
      const role = m.role as MemberRow["role"];
      return {
        id: m.id,
        username: m.user.username,
        email: manager ? m.user.email : null,
        role,
        permissions: parsePermissions(m.permissions),
        joinedAt: m.createdAt.toISOString(),
        lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
        addedBy: m.addedById ? names.get(m.addedById) ?? null : null,
        isMe: m.userId === user.id,
        manageable: m.userId !== user.id && canManage(actor, { role }),
      };
    });

  const inviteRows: InviteRow[] = invites
    .filter((i) => isMemberRole(i.role))
    .map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role as InviteRow["role"],
      permissions: parsePermissions(i.permissions),
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
      boundToAccount: !!i.userId,
      invitedBy: names.get(i.createdById) ?? null,
      manageable: canManage(actor, { role: i.role as InviteRow["role"] }),
    }));

  const events: TeamEvent[] = logs.flatMap((l) => {
    const m = LINE.exec(l.message);
    return m ? [{ id: l.id, action: m[1], target: m[2], detail: m[3] ?? null, actor: m[4].trim(), at: l.createdAt.toISOString() }] : [];
  });

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Team"
        description="Your staff get their own panel login for this server — no shared passwords. Pick a role, fine-tune what it may do, and every action they take shows up under their name in Admin Logs."
      />
      <TeamView
        serverId={server.id}
        serverName={server.name}
        me={{ ...accessSummary(access), username: user.username }}
        owner={{
          username: owner?.username ?? "Owner",
          email: manager ? owner?.email ?? null : null,
          lastSeenAt: owner?.lastLoginAt?.toISOString() ?? null,
          isMe: access.isOwner,
        }}
        members={memberRows}
        invites={inviteRows}
        events={events}
        assignable={assignableRoles(actor)}
        limits={{ maxMembers: MAX_MEMBERS, inviteDays: INVITE_DAYS }}
      />
    </>
  );
}
