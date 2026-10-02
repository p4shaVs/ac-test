"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons, type IconName } from "@/components/icons";
import { Modal } from "@/components/modal";
import { Avatar, Ago, CopyButton } from "@/components/log-ui";
import { PERMISSIONS, ROLES, roleLabel, type MemberRole, type Permission, type Role } from "@/lib/team";
import { cn } from "@/lib/utils";

export interface MemberRow {
  id: string;
  username: string;
  email: string | null;
  role: MemberRole;
  permissions: Permission[];
  joinedAt: string;
  lastSeenAt: string | null;
  addedBy: string | null;
  isMe: boolean;
  manageable: boolean;
}

export interface InviteRow {
  id: string;
  email: string;
  role: MemberRole;
  permissions: Permission[];
  createdAt: string;
  expiresAt: string;
  boundToAccount: boolean;
  invitedBy: string | null;
  manageable: boolean;
}

export interface TeamEvent {
  id: string;
  action: string;
  target: string;
  detail: string | null;
  actor: string;
  at: string;
}

const SHORT: Record<Permission, string> = {
  moderate: "Moderate",
  console: "Console",
  config: "Configure",
  admins: "In-game admins",
  settings: "Settings",
  team: "Team",
};

const PERM_ICON: Record<Permission, IconName> = {
  moderate: "ban",
  console: "terminal",
  config: "sliders",
  admins: "user",
  settings: "config",
  team: "users",
};

const ROLE_ICON: Record<Role, IconName> = { OWNER: "crown", ADMIN: "shieldCheck", MODERATOR: "shield", VIEWER: "eye" };

const ROLE_TONE: Record<Role, string> = {
  OWNER: "border-white/30 bg-white text-[#0a0a0b]",
  ADMIN: "border-white/25 bg-white/[0.1] text-white",
  MODERATOR: "border-white/15 bg-white/[0.05] text-slate-200",
  VIEWER: "border-white/10 bg-transparent text-slate-400",
};

// Only the owner, whatever the role — shown in the role guide.
const OWNER_ONLY = ["Licence key", "Server token", "Installer & resource files", "Deleting the server"];

const EVENT_TEXT: Record<string, { verb: string; icon: IconName; self?: boolean }> = {
  "TEAM INVITE": { verb: "invited", icon: "mail" },
  "TEAM INVITE REVOKED": { verb: "revoked the invite of", icon: "x" },
  "TEAM JOIN": { verb: "joined the team", icon: "userPlus", self: true },
  "TEAM ROLE": { verb: "changed the role of", icon: "user" },
  "TEAM PERMISSIONS": { verb: "changed the permissions of", icon: "key" },
  "TEAM REMOVE": { verb: "removed", icon: "logout" },
  "TEAM LEAVE": { verb: "left the team", icon: "logout", self: true },
};

function RoleChip({ role, className }: { role: Role; className?: string }) {
  const Icon = Icons[ROLE_ICON[role]];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold", ROLE_TONE[role], className)}>
      <Icon size={11} /> {roleLabel(role)}
    </span>
  );
}

function PermChips({ perms, all }: { perms: Permission[]; all?: boolean }) {
  if (all) return <span className="text-[11.5px] text-slate-400">Everything</span>;
  if (perms.length === 0) return <span className="text-[11.5px] text-slate-500">View only</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {perms.map((p) => (
        <span key={p} className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-px text-[10.5px] text-slate-300">
          {SHORT[p]}
        </span>
      ))}
    </span>
  );
}

/** Role cards — the presets. */
function RolePicker({ roles, value, onChange }: { roles: MemberRole[]; value: MemberRole; onChange: (r: MemberRole) => void }) {
  return (
    <div className="grid gap-2">
      {roles.map((r) => {
        const on = value === r;
        const Icon = Icons[ROLE_ICON[r]];
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            aria-pressed={on}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition",
              on ? "border-white/40 bg-white/[0.06]" : "border-white/[0.08] hover:border-white/20 hover:bg-white/[0.02]"
            )}
          >
            <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border", on ? "border-white/30 bg-white text-[#0a0a0b]" : "border-white/10 text-slate-400")}>
              <Icon size={14} />
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[13px] font-semibold", on ? "text-white" : "text-slate-200")}>{ROLES[r].label}</span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-slate-500">{ROLES[r].desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Permission switches — what the role actually may do. */
function PermissionPicker({
  value,
  onChange,
  held,
}: {
  value: Permission[];
  onChange: (p: Permission[]) => void;
  /** Permissions the person editing holds; the others are locked. */
  held: Permission[];
}) {
  return (
    <div className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.08]">
      {PERMISSIONS.map((p) => {
        const on = value.includes(p.key);
        const locked = !held.includes(p.key);
        const Icon = Icons[PERM_ICON[p.key]];
        return (
          <button
            key={p.key}
            type="button"
            disabled={locked}
            onClick={() => onChange(on ? value.filter((x) => x !== p.key) : [...value, p.key])}
            className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/[0.025] disabled:cursor-not-allowed disabled:hover:bg-transparent"
            aria-pressed={on}
          >
            <Icon size={14} className={cn("mt-0.5 shrink-0", on ? "text-white" : "text-slate-600")} />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-[12.5px] font-medium", on ? "text-slate-100" : "text-slate-400")}>
                {p.label}
                {locked && <span className="ml-1.5 text-[10.5px] font-normal text-slate-600">— you don’t have this</span>}
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{p.desc}</span>
            </span>
            <span className={cn("switch mt-0.5 shrink-0", on ? "switch-on" : "switch-off", locked && "opacity-40")}>
              <span className={cn("switch-knob", on ? "translate-x-[18px] bg-[#0a0a0b]" : "translate-x-[3px] bg-slate-400")} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Switching role loads its preset — but permissions the editor does not hold
 * cannot change, so those keep their current state.
 */
function presetFor(role: MemberRole, current: Permission[], held: Permission[]): Permission[] {
  const preset = ROLES[role].perms;
  return PERMISSIONS.map((p) => p.key).filter((k) => (held.includes(k) ? preset.includes(k) : current.includes(k)));
}

function LinkBox({ path, who, bound, days }: { path: string; who: string; bound: boolean; days: number }) {
  const url = typeof window !== "undefined" ? window.location.origin + path : path;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 p-2 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-200">{url}</code>
        <CopyButton text={url} label="Copy link" className="h-8 shrink-0" />
      </div>
      <ul className="space-y-1.5 text-[12px] leading-relaxed text-slate-400">
        <li className="flex gap-2">
          <Icons.discord size={13} className="mt-0.5 shrink-0 text-slate-500" /> Send it to them yourself — on Discord, for example. The panel sends no e-mail.
        </li>
        <li className="flex gap-2">
          <Icons.lock size={13} className="mt-0.5 shrink-0 text-slate-500" />
          <span>
            It works once, only for <b className="font-medium text-slate-200">{who}</b>, for {days} days. Anyone else who opens it is turned away.
          </span>
        </li>
        {bound ? (
          <li className="flex gap-2">
            <Icons.bell size={13} className="mt-0.5 shrink-0 text-slate-500" /> They already have an account, so the invite also waits on their dashboard.
          </li>
        ) : (
          <li className="flex gap-2">
            <Icons.userPlus size={13} className="mt-0.5 shrink-0 text-slate-500" /> No account uses this address yet — they sign up with exactly this e-mail, then open the link.
          </li>
        )}
        <li className="flex gap-2">
          <Icons.eyeOff size={13} className="mt-0.5 shrink-0 text-slate-500" /> The link is shown only now. Lost it? Use “New link” on the pending invite.
        </li>
      </ul>
    </div>
  );
}

export function TeamView({
  serverId,
  serverName,
  me,
  owner,
  members,
  invites,
  events,
  assignable,
  limits,
}: {
  serverId: string;
  serverName: string;
  me: { role: Role; perms: Permission[]; isOwner: boolean; username: string };
  owner: { username: string; email: string | null; lastSeenAt: string | null; isMe: boolean };
  members: MemberRow[];
  invites: InviteRow[];
  events: TeamEvent[];
  assignable: MemberRole[];
  limits: { maxMembers: number; inviteDays: number };
}) {
  const router = useRouter();
  const manager = me.perms.includes("team");
  const inviteRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // invite form
  const [ident, setIdent] = useState("");
  const firstRole = assignable.includes("MODERATOR") ? "MODERATOR" : assignable[0] ?? "VIEWER";
  const [role, setRole] = useState<MemberRole>(firstRole);
  const [perms, setPerms] = useState<Permission[]>(presetFor(firstRole, [], me.perms));
  const [created, setCreated] = useState<{ path: string; who: string; bound: boolean } | null>(null);

  // edit / link dialogs
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [editRole, setEditRole] = useState<MemberRole>("VIEWER");
  const [editPerms, setEditPerms] = useState<Permission[]>([]);
  const [relinked, setRelinked] = useState<{ path: string; who: string; bound: boolean } | null>(null);

  const counts = useMemo(() => {
    const c: Record<MemberRole, number> = { ADMIN: 0, MODERATOR: 0, VIEWER: 0 };
    for (const m of members) c[m.role]++;
    return c;
  }, [members]);

  async function call(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Request failed");
      return json.data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!ident.trim()) return;
    const data = await call({ action: "invite", identifier: ident.trim(), role, permissions: perms }, "invite");
    if (!data) return;
    setCreated({ path: data.path, who: data.username ?? ident.trim().toLowerCase(), bound: data.boundToAccount });
    setIdent("");
    router.refresh();
  }

  function openEdit(m: MemberRow) {
    setEditing(m);
    setEditRole(m.role);
    setEditPerms(m.permissions);
    setError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const data = await call({ action: "update", memberId: editing.id, role: editRole, permissions: editPerms }, "edit");
    if (!data) return;
    setEditing(null);
    router.refresh();
  }

  async function remove(m: MemberRow) {
    if (!confirm(`Remove ${m.username} from the ${serverName} team? They lose access to this server in the panel right away.`)) return;
    if (await call({ action: "remove", memberId: m.id }, "rm" + m.id)) router.refresh();
  }

  async function leave() {
    if (!confirm(`Leave the ${serverName} team? You will need a new invite to come back.`)) return;
    if (await call({ action: "leave" }, "leave")) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  async function revoke(i: InviteRow) {
    if (!confirm(`Revoke the invite for ${i.email}? The link stops working.`)) return;
    if (await call({ action: "revokeInvite", inviteId: i.id }, "rv" + i.id)) router.refresh();
  }

  async function relink(i: InviteRow) {
    const data = await call({ action: "relink", inviteId: i.id }, "rl" + i.id);
    if (!data) return;
    setRelinked({ path: data.path, who: i.email, bound: i.boundToAccount });
    router.refresh();
  }

  const total = members.length + 1;

  return (
    <div className="space-y-5">
      {error && !editing && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-4 py-3 text-[13px] text-rose-200">
          <Icons.alert size={15} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-200/70 hover:text-rose-100" aria-label="Dismiss">
            <Icons.x size={14} />
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------ roster band */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0e10] bg-gradient-to-br from-white/[0.04] to-transparent">
        <div className="flex flex-col gap-5 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              {[owner.username, ...members.map((m) => m.username)].slice(0, 5).map((n, i) => (
                <span key={n + i} className="rounded-xl ring-2 ring-[#0e0e10]">
                  <Avatar name={n} size={36} />
                </span>
              ))}
              {total > 5 && (
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-[11px] font-semibold text-slate-300 ring-2 ring-[#0e0e10]">+{total - 5}</span>
              )}
            </div>
            <div>
              <p className="text-[15px] font-semibold text-white">
                {total} {total === 1 ? "person" : "people"} can open {serverName}
              </p>
              <p className="mt-0.5 text-[12.5px] text-slate-500">
                {members.length === 0 ? "Only you so far — invite your staff so nobody shares your login." : `${members.length} of ${limits.maxMembers} team seats used`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["ADMIN", "MODERATOR", "VIEWER"] as MemberRole[]).map((r) => (
              <span key={r} className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] px-3 text-[12px] text-slate-400">
                <b className="font-semibold tabular-nums text-white">{counts[r]}</b> {ROLES[r].label}
                {counts[r] === 1 ? "" : "s"}
              </span>
            ))}
            {manager && assignable.length > 0 && (
              <button type="button" onClick={() => inviteRef.current?.focus()} className="btn-primary h-8 px-3 text-xs">
                <Icons.userPlus size={14} /> Invite
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {/* --------------------------------------------------------- your access */}
          {!me.isOwner && (
            <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[#0e0e10] px-5 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">Your access</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <RoleChip role={me.role} />
                  <PermChips perms={me.perms} />
                </div>
                <p className="mt-2 text-[12px] text-slate-500">You can see every page and log of this server. Anything else needs the permissions above.</p>
              </div>
              <button type="button" onClick={leave} disabled={busy !== null} className="btn-secondary h-9 shrink-0 px-3 text-xs hover:border-rose-400/30 hover:text-rose-200">
                <Icons.logout size={14} /> {busy === "leave" ? "Leaving…" : "Leave team"}
              </button>
            </section>
          )}

          {/* -------------------------------------------------------------- members */}
          <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0e10]">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
                <Icons.users size={15} className="text-slate-400" /> Members
              </h2>
              <span className="hidden text-[12px] text-slate-500 sm:inline">Owner first, then by join date</span>
            </header>
            <ul className="divide-y divide-white/[0.05]">
              <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <span className="relative">
                  <Avatar name={owner.username} size={38} />
                  <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-white text-[#0a0a0b] ring-2 ring-[#0e0e10]">
                    <Icons.crown size={9} />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium text-white">
                    {owner.username}
                    {owner.isMe && <span className="rounded bg-white/10 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">You</span>}
                  </span>
                  <span className="block truncate text-[11.5px] text-slate-500">{owner.email ?? "Server owner"}</span>
                </span>
                <span className="hidden w-48 sm:block">
                  <PermChips perms={[]} all />
                  <span className="block text-[10.5px] text-slate-600">incl. licence, token, deleting the server</span>
                </span>
                <RoleChip role="OWNER" />
                <span className="hidden w-[136px] sm:block" aria-hidden />
              </li>
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <Avatar name={m.username} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13.5px] font-medium text-white">
                      {m.username}
                      {m.isMe && <span className="rounded bg-white/10 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">You</span>}
                    </span>
                    <span className="block truncate text-[11.5px] text-slate-500">
                      {m.email ? `${m.email} · ` : ""}
                      {m.lastSeenAt ? (
                        <>
                          active <Ago at={m.lastSeenAt} />
                        </>
                      ) : (
                        "not opened yet"
                      )}
                    </span>
                  </span>
                  <span className="hidden w-48 sm:block">
                    <PermChips perms={m.permissions} />
                    <span className="mt-0.5 block text-[10.5px] text-slate-600">
                      joined <Ago at={m.joinedAt} />
                      {m.addedBy ? ` · by ${m.addedBy}` : ""}
                    </span>
                  </span>
                  <RoleChip role={m.role} />
                  <span className="flex justify-end gap-1.5 sm:w-[136px]">
                    {m.manageable ? (
                      <>
                        <button type="button" onClick={() => openEdit(m)} className="btn-secondary h-8 px-2.5 text-[11.5px]">
                          <Icons.pencil size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(m)}
                          disabled={busy !== null}
                          title="Remove from team"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-rose-400/30 hover:text-rose-300"
                        >
                          <Icons.trash size={13} />
                        </button>
                      </>
                    ) : m.isMe ? (
                      <span className="text-[11px] text-slate-600">that’s you</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-slate-600">
                        <Icons.lock size={11} /> above you
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {members.length === 0 && (
              <p className="border-t border-white/[0.05] px-5 py-6 text-center text-[12.5px] text-slate-500">
                Nobody else yet. {manager ? "Invite your first staff member on the right." : ""}
              </p>
            )}
          </section>

          {/* --------------------------------------------------------- pending invites */}
          {manager && (
            <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0e10]">
              <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
                  <Icons.mail size={15} className="text-slate-400" /> Pending invites
                </h2>
                <span className="text-[12px] text-slate-500">{invites.length} open</span>
              </header>
              {invites.length === 0 ? (
                <p className="px-5 py-6 text-center text-[12.5px] text-slate-500">No open invites.</p>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {invites.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-dashed border-white/15 text-slate-500">
                        <Icons.mail size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-slate-100">{i.email}</span>
                        <span className="block truncate text-[11.5px] text-slate-500">
                          {i.boundToAccount ? "Has an account — sees it on their dashboard" : "Signs up with this e-mail, then opens the link"}
                          {i.invitedBy ? ` · by ${i.invitedBy}` : ""}
                        </span>
                      </span>
                      <span className="text-[11.5px] text-slate-500">
                        expires <ExpiresIn at={i.expiresAt} />
                      </span>
                      <RoleChip role={i.role} />
                      {i.manageable && (
                        <span className="flex gap-1.5">
                          <button type="button" onClick={() => relink(i)} disabled={busy !== null} className="btn-secondary h-8 px-2.5 text-[11.5px]">
                            <Icons.refresh size={13} /> New link
                          </button>
                          <button
                            type="button"
                            onClick={() => revoke(i)}
                            disabled={busy !== null}
                            title="Revoke invite"
                            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-rose-400/30 hover:text-rose-300"
                          >
                            <Icons.x size={13} />
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* ---------------------------------------------------------------- activity */}
          <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0e10]">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
                <Icons.history size={15} className="text-slate-400" /> Team activity
              </h2>
              <Link href={`/dashboard/servers/${serverId}/admin-logs`} className="text-[12px] text-slate-500 hover:text-white">
                Everything staff did → Admin Logs
              </Link>
            </header>
            {events.length === 0 ? (
              <p className="px-5 py-6 text-center text-[12.5px] text-slate-500">Invites, joins, role changes and removals will show up here.</p>
            ) : (
              <ul className="space-y-0.5 px-3 py-2">
                {events.map((e) => {
                  const t = EVENT_TEXT[e.action] ?? { verb: e.action.toLowerCase(), icon: "activity" as IconName };
                  const Icon = Icons[t.icon];
                  return (
                    <li key={e.id} className="flex items-start gap-3 rounded-lg px-2 py-2">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-slate-400">
                        <Icon size={11} />
                      </span>
                      <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-slate-400">
                        <b className="font-medium text-slate-100">{e.actor}</b> {t.verb}
                        {!t.self && (
                          <>
                            {" "}
                            <b className="font-medium text-slate-100">{e.target}</b>
                          </>
                        )}
                        {e.detail && <span className="text-slate-500"> · {e.detail}</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-600">
                        <Ago at={e.at} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-5">
          {/* ------------------------------------------------------------------ invite */}
          {manager && assignable.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0e0e10]">
              <header className="border-b border-white/[0.06] px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
                  <Icons.userPlus size={15} className="text-slate-400" /> Invite staff
                </h2>
                <p className="mt-0.5 text-[12px] text-slate-500">By the e-mail or username of their CoreAC account.</p>
              </header>
              {created ? (
                <div className="space-y-4 px-5 py-4">
                  <p className="flex items-center gap-2 text-[13px] font-medium text-emerald-200">
                    <Icons.check size={15} /> Invite ready for {created.who}
                  </p>
                  <LinkBox path={created.path} who={created.who} bound={created.bound} days={limits.inviteDays} />
                  <button type="button" onClick={() => setCreated(null)} className="btn-secondary h-9 w-full justify-center text-xs">
                    <Icons.plus size={14} /> Invite someone else
                  </button>
                </div>
              ) : (
                <form onSubmit={invite} className="space-y-4 px-5 py-4">
                  <div>
                    <label className="label" htmlFor="team-invite">
                      E-mail or username
                    </label>
                    <input
                      id="team-invite"
                      ref={inviteRef}
                      value={ident}
                      onChange={(e) => setIdent(e.target.value)}
                      placeholder="moderator@example.com"
                      className="input"
                      maxLength={120}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <p className="label">Role</p>
                    <RolePicker
                      roles={assignable}
                      value={role}
                      onChange={(r) => {
                        setRole(r);
                        setPerms(presetFor(r, perms, me.perms));
                      }}
                    />
                  </div>
                  <div>
                    <p className="label flex items-center justify-between">
                      <span>What they may do</span>
                      <span className="font-normal normal-case tracking-normal text-slate-600">viewing is always included</span>
                    </p>
                    <PermissionPicker value={perms} onChange={setPerms} held={me.perms} />
                  </div>
                  <button type="submit" disabled={busy !== null || !ident.trim()} className="btn-primary h-10 w-full justify-center">
                    <Icons.link size={15} /> {busy === "invite" ? "Creating…" : "Create invite link"}
                  </button>
                </form>
              )}
            </section>
          )}

          {/* -------------------------------------------------------------- role guide */}
          <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0e10]">
            <header className="border-b border-white/[0.06] px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
                <Icons.layers size={15} className="text-slate-400" /> Who can do what
              </h2>
              <p className="mt-0.5 text-[12px] text-slate-500">Role presets — each member’s switches can differ.</p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-5 py-2.5 text-left font-semibold">&nbsp;</th>
                    {(["OWNER", "ADMIN", "MODERATOR", "VIEWER"] as Role[]).map((r) => (
                      <th key={r} className="px-2 py-2.5 text-center font-semibold">
                        {roleLabel(r)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  <tr>
                    <td className="px-5 py-2 text-slate-300">See every page & log</td>
                    {[1, 1, 1, 1].map((v, i) => (
                      <td key={i} className="px-2 py-2 text-center">
                        <Tick on={!!v} />
                      </td>
                    ))}
                  </tr>
                  {PERMISSIONS.map((p) => (
                    <tr key={p.key}>
                      <td className="px-5 py-2 text-slate-300">{p.label}</td>
                      <td className="px-2 py-2 text-center">
                        <Tick on />
                      </td>
                      {(["ADMIN", "MODERATOR", "VIEWER"] as MemberRole[]).map((r) => (
                        <td key={r} className="px-2 py-2 text-center">
                          <Tick on={ROLES[r].perms.includes(p.key)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {OWNER_ONLY.map((label) => (
                    <tr key={label}>
                      <td className="px-5 py-2 text-slate-400">{label}</td>
                      <td className="px-2 py-2 text-center">
                        <Tick on />
                      </td>
                      {[0, 1, 2].map((i) => (
                        <td key={i} className="px-2 py-2 text-center">
                          <Tick on={false} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-1.5 border-t border-white/[0.06] px-5 py-3.5 text-[11.5px] leading-relaxed text-slate-500">
              <li>• You only manage people ranked below you — an Admin cannot touch another Admin or the owner.</li>
              <li>• You only hand out permissions you hold yourself.</li>
              <li>• Removing someone cuts their access on the next click; their open invites are withdrawn.</li>
            </ul>
          </section>
        </div>
      </div>

      {/* ------------------------------------------------------------------ dialogs */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.username}` : "Edit"}
        footer={
          <>
            <button type="button" onClick={() => setEditing(null)} className="btn-secondary h-9 px-4 text-xs">
              Cancel
            </button>
            <button type="button" onClick={saveEdit} disabled={busy !== null} className="btn-primary h-9 px-4 text-xs">
              {busy === "edit" ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            {error && <p className="rounded-lg border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2 text-[12.5px] text-rose-200">{error}</p>}
            <div>
              <p className="label">Role</p>
              <RolePicker
                roles={assignable}
                value={editRole}
                onChange={(r) => {
                  setEditRole(r);
                  setEditPerms(presetFor(r, editPerms, me.perms));
                }}
              />
            </div>
            <div>
              <p className="label">What they may do</p>
              <PermissionPicker value={editPerms} onChange={setEditPerms} held={me.perms} />
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!relinked} onClose={() => setRelinked(null)} title="New invite link">
        {relinked && (
          <div className="space-y-3">
            <p className="text-[12.5px] text-slate-400">The old link no longer works. The invite runs for another {limits.inviteDays} days.</p>
            <LinkBox path={relinked.path} who={relinked.who} bound={relinked.bound} days={limits.inviteDays} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function Tick({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-grid h-5 w-5 place-items-center rounded-md bg-white/[0.08] text-white">
      <Icons.check size={12} />
    </span>
  ) : (
    <span className="inline-block h-1 w-2.5 rounded-full bg-white/[0.08]" aria-label="no" />
  );
}

function ExpiresIn({ at }: { at: string }) {
  const ms = new Date(at).getTime() - Date.now();
  const d = Math.floor(ms / 86_400_000);
  const h = Math.max(1, Math.floor(ms / 3_600_000));
  return <span suppressHydrationWarning>{d >= 1 ? `in ${d}d` : `in ${h}h`}</span>;
}
