import Link from "next/link";
import { db } from "@/lib/db";
import { Icons } from "@/components/icons";
import { isMemberRole, parsePermissions, roleLabel, PERMISSIONS } from "@/lib/team";
import { InviteActions } from "@/app/invite/[token]/invite-actions";
import { cn, timeAgo } from "@/lib/utils";

/** Team invites waiting for this account and the servers others shared with it. */
export async function loadTeamInbox(userId: string) {
  const [invites, memberships] = await Promise.all([
    db.serverInvite.findMany({
      where: { userId, acceptedAt: null, revokedAt: null, declinedAt: null, expiresAt: { gt: new Date() } },
      include: { server: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.serverMember.findMany({
      where: { userId },
      include: { server: { select: { id: true, name: true, status: true, lastSeenAt: true, ip: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const inviters = new Map(
    (await db.user.findMany({ where: { id: { in: invites.map((i) => i.createdById) } }, select: { id: true, username: true } })).map((u) => [u.id, u.username])
  );
  return {
    invites: invites
      .filter((i) => isMemberRole(i.role))
      .map((i) => ({ id: i.id, serverName: i.server.name, role: i.role as "ADMIN" | "MODERATOR" | "VIEWER", invitedBy: inviters.get(i.createdById) ?? null, perms: parsePermissions(i.permissions) })),
    shared: memberships
      .filter((m) => isMemberRole(m.role))
      .map((m) => ({ ...m.server, role: m.role as "ADMIN" | "MODERATOR" | "VIEWER", perms: parsePermissions(m.permissions) })),
  };
}

type Inbox = Awaited<ReturnType<typeof loadTeamInbox>>;

const SHORT: Record<string, string> = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.label]));

export function TeamInvitesCard({ invites }: { invites: Inbox["invites"] }) {
  if (invites.length === 0) return null;
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-white/15 bg-[#0e0e10]">
      <header className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3.5">
        <Icons.mail size={15} className="text-slate-300" />
        <h2 className="text-[13.5px] font-semibold text-white">Team invites</h2>
        <span className="rounded-full bg-white px-1.5 text-[10.5px] font-bold text-[#0a0a0b]">{invites.length}</span>
      </header>
      <ul className="divide-y divide-white/[0.05]">
        {invites.map((i) => (
          <li key={i.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] text-slate-300">
                <b className="font-semibold text-white">{i.invitedBy ?? "Someone"}</b> invited you to <b className="font-semibold text-white">{i.serverName}</b> as{" "}
                <b className="font-semibold text-white">{roleLabel(i.role)}</b>
              </p>
              <p className="mt-0.5 truncate text-[12px] text-slate-500">
                {i.perms.length ? i.perms.map((p) => SHORT[p]).join(" · ") : "View only"}
              </p>
            </div>
            <InviteActions inviteId={i.id} serverName={i.serverName} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SharedServersGrid({ shared, title = "Shared with you" }: { shared: Inbox["shared"]; title?: string }) {
  if (shared.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        <Icons.users size={13} /> {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shared.map((s) => (
          <Link
            key={s.id}
            href={`/dashboard/servers/${s.id}`}
            className="group flex items-center gap-3.5 rounded-2xl border border-white/[0.08] bg-[#0e0e10] px-4 py-3.5 transition hover:border-white/20"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[14px] font-semibold text-white">
              {s.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-semibold text-white">{s.name}</span>
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.status === "ONLINE" ? "bg-emerald-400" : "bg-slate-600")} />
              </span>
              <span className="block truncate text-[11.5px] text-slate-500">
                {roleLabel(s.role)} · {s.lastSeenAt ? `seen ${timeAgo(s.lastSeenAt)}` : "never connected"}
              </span>
            </span>
            <Icons.chevronRight size={15} className="shrink-0 text-slate-600 transition group-hover:text-slate-300" />
          </Link>
        ))}
      </div>
    </section>
  );
}
