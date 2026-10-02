"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { Icons, type IconName } from "@/components/icons";
import { Avatar, Field, JsonBlock, SearchBox } from "@/components/log-ui";
import { cn } from "@/lib/utils";

export interface AdminLogRow {
  id: string;
  action: string;
  actor: string;
  target: string | null;
  description: string;
  source: string;
  at: string;
  raw: Record<string, unknown>;
}

type Group = "all" | "moderation" | "appeals" | "config" | "console" | "other";

// How each action reads in the feed: "<actor> <verb> <target>".
const ACTIONS: Record<string, { label: string; verb: string; icon: IconName; tone: string; group: Group }> = {
  BAN: { label: "Ban", verb: "banned", icon: "ban", tone: "text-rose-300 border-rose-400/30 bg-rose-400/10", group: "moderation" },
  "OFFLINE BAN": { label: "Offline ban", verb: "banned offline", icon: "ban", tone: "text-rose-300 border-rose-400/30 bg-rose-400/10", group: "moderation" },
  KICK: { label: "Kick", verb: "kicked", icon: "kick", tone: "text-amber-300 border-amber-400/30 bg-amber-400/10", group: "moderation" },
  WARN: { label: "Warning", verb: "warned", icon: "warn", tone: "text-amber-300 border-amber-400/30 bg-amber-400/10", group: "moderation" },
  UNBAN: { label: "Unban", verb: "lifted the ban on", icon: "undo", tone: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10", group: "appeals" },
  "UNBAN ALL": { label: "Unban all", verb: "lifted every active ban", icon: "undo", tone: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10", group: "appeals" },
  "FALSE BAN FIXED": { label: "False ban fixed", verb: "corrected a false ban on", icon: "wand", tone: "text-amber-200 border-amber-300/30 bg-amber-300/10", group: "appeals" },
  "MARKED FALSE POSITIVE": { label: "Marked false positive", verb: "marked as a false positive the ban of", icon: "check", tone: "text-amber-200 border-amber-300/30 bg-amber-300/10", group: "appeals" },
  "UNMARKED FALSE POSITIVE": { label: "Unmarked false positive", verb: "removed the false-positive mark from", icon: "x", tone: "text-slate-300 border-white/15 bg-white/[0.05]", group: "appeals" },
  "BAN NOTE": { label: "Ban note", verb: "added a note to the ban of", icon: "note", tone: "text-slate-200 border-white/15 bg-white/[0.05]", group: "appeals" },
  CONFIG: { label: "Configuration", verb: "changed the configuration", icon: "sliders", tone: "text-slate-200 border-white/15 bg-white/[0.05]", group: "config" },
  RESOURCE: { label: "Resource", verb: "managed a resource", icon: "cube", tone: "text-slate-200 border-white/15 bg-white/[0.05]", group: "config" },
  CONSOLE: { label: "Console", verb: "ran a console command", icon: "terminal", tone: "text-slate-200 border-white/15 bg-white/[0.05]", group: "console" },
  INSTALL: { label: "Install", verb: "installed CoreAC on", icon: "download", tone: "text-slate-200 border-white/15 bg-white/[0.05]", group: "config" },
  PANEL: { label: "Panel", verb: "did", icon: "dashboard", tone: "text-slate-300 border-white/15 bg-white/[0.05]", group: "other" },
};

function meta(action: string) {
  return (
    ACTIONS[action] ?? {
      label: action.charAt(0) + action.slice(1).toLowerCase(),
      verb: action.toLowerCase(),
      icon: "activity" as IconName,
      tone: "text-slate-300 border-white/15 bg-white/[0.05]",
      group: "other" as Group,
    }
  );
}

const GROUPS: { key: Group; label: string; icon: IconName }[] = [
  { key: "all", label: "Everything", icon: "layers" },
  { key: "moderation", label: "Moderation", icon: "ban" },
  { key: "appeals", label: "Unbans & appeals", icon: "undo" },
  { key: "config", label: "Configuration", icon: "sliders" },
  { key: "console", label: "Console", icon: "terminal" },
  { key: "other", label: "Other", icon: "dashboard" },
];

const SOURCE_LABEL: Record<string, string> = {
  moderation: "Moderation queue",
  panel: "Web panel",
  admin: "Admin menu (in game)",
  ingame: "In game",
  console: "Web console",
};

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function AdminLogsView({ serverId, rows }: { serverId: string; rows: AdminLogRow[] }) {
  const [group, setGroup] = useState<Group>("all");
  const [actor, setActor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const now = Date.now();
  const stats = useMemo(() => {
    const day = rows.filter((r) => now - new Date(r.at).getTime() < 86_400_000).length;
    const week = rows.filter((r) => now - new Date(r.at).getTime() < 7 * 86_400_000).length;
    const staff = new Map<string, number>();
    for (const r of rows) staff.set(r.actor, (staff.get(r.actor) ?? 0) + 1);
    const byGroup = new Map<Group, number>();
    for (const r of rows) {
      const g = meta(r.action).group;
      byGroup.set(g, (byGroup.get(g) ?? 0) + 1);
    }
    return { day, week, staff: [...staff.entries()].sort((a, b) => b[1] - a[1]), byGroup };
  }, [rows, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (group !== "all" && meta(r.action).group !== group) return false;
      if (actor && r.actor !== actor) return false;
      if (!q) return true;
      return [r.description, r.target, r.actor, meta(r.action).label].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [rows, group, actor, query]);

  const days = useMemo(() => {
    const out: { key: string; label: string; items: AdminLogRow[] }[] = [];
    for (const r of filtered) {
      const k = dayKey(r.at);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(r);
      else out.push({ key: k, label: dayLabel(r.at), items: [r] });
    }
    return out;
  }, [filtered]);

  function exportJson() {
    const blob = new Blob([JSON.stringify(filtered.map((r) => ({ ...r.raw, action: r.action, actor: r.actor, target: r.target })), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (rows.length === 0) {
    return <EmptyState icon="history" title="No staff activity yet" description="When an admin bans, kicks, warns, changes the configuration or runs a console command, it is recorded here." />;
  }

  const maxStaff = stats.staff[0]?.[1] ?? 1;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* ------------------------------------------------------------ feed */}
      <div className="min-w-0">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBox value={query} onChange={setQuery} placeholder="Search what happened, who did it, to whom…" className="w-full sm:max-w-md" />
          <div className="flex items-center gap-2 sm:ml-auto">
            {(actor || group !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setActor(null);
                  setGroup("all");
                }}
                className="btn-ghost h-9 px-3 text-xs"
              >
                <Icons.x size={13} /> Clear filters
              </button>
            )}
            <button type="button" onClick={exportJson} className="btn-secondary h-9 px-3 text-xs" disabled={!filtered.length}>
              <Icons.braces size={13} /> Export JSON
            </button>
          </div>
        </div>

        {/* Mobile filter strip */}
        <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 xl:hidden">
          <select
            value={actor ?? ""}
            onChange={(e) => setActor(e.target.value || null)}
            className="h-8 shrink-0 rounded-lg border border-white/10 bg-[#0e0e10] px-2 text-[12px] text-slate-300"
            aria-label="Filter by staff member"
          >
            <option value="">All staff</option>
            {stats.staff.map(([name]) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroup(g.key)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12px] transition",
                group === g.key ? "border-white/40 bg-white/[0.08] text-white" : "border-white/10 text-slate-400"
              )}
            >
              {g.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="search" title="Nothing matches" description="Try another filter or search term." />
        ) : (
          <div className="space-y-7">
            {days.map((d) => (
              <section key={d.key}>
                <div className="sticky top-16 z-10 -mx-1 mb-2 flex items-center gap-3 bg-[#070708]/95 px-1 py-1.5">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300">{d.label}</h3>
                  <span className="h-px flex-1 bg-white/[0.07]" />
                  <span className="text-[11px] tabular-nums text-slate-600">{d.items.length}</span>
                </div>
                <ol className="relative">
                  <span className="absolute bottom-3 left-[67px] top-3 w-px bg-white/[0.07]" aria-hidden />
                  {d.items.map((r) => {
                    const m = meta(r.action);
                    const Icon = Icons[m.icon];
                    const isOpen = open === r.id;
                    const sentenceTarget = r.target && !["UNBAN ALL", "CONFIG", "RESOURCE", "CONSOLE"].includes(r.action);
                    return (
                      <li key={r.id} className="relative">
                        <button
                          type="button"
                          onClick={() => setOpen(isOpen ? null : r.id)}
                          className={cn(
                            "group flex w-full items-start gap-3 rounded-xl px-1 py-2.5 text-left transition",
                            isOpen ? "bg-white/[0.04]" : "hover:bg-white/[0.025]"
                          )}
                          aria-expanded={isOpen}
                        >
                          <span className="w-12 shrink-0 pt-1.5 text-right font-mono text-[11.5px] tabular-nums text-slate-500">{time(r.at)}</span>
                          <span className={cn("relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full border", m.tone)}>
                            <Icon size={13} />
                          </span>
                          <span className="min-w-0 flex-1 pt-0.5">
                            <span className="block text-[13.5px] leading-snug text-slate-400">
                              <b className="font-semibold text-slate-100">{r.actor}</b> {m.verb}{" "}
                              {sentenceTarget && <b className="font-semibold text-slate-100">{r.target}</b>}
                            </span>
                            {r.description && (
                              <span className={cn("mt-0.5 block text-[12.5px] text-slate-500", !isOpen && "truncate")}>
                                {r.action === "CONSOLE" ? <code className="font-mono text-slate-300">{r.description}</code> : r.description}
                              </span>
                            )}
                          </span>
                          <span className="hidden shrink-0 pt-1 text-[11px] text-slate-600 sm:block">{SOURCE_LABEL[r.source] ?? r.source}</span>
                          <Icons.chevronDown size={14} className={cn("mt-1.5 shrink-0 text-slate-600 transition", isOpen && "rotate-180 text-slate-300")} />
                        </button>
                        {isOpen && (
                          <div className="mb-3 ml-[88px] mt-1 space-y-4 rounded-xl border border-white/[0.08] bg-[#0e0e10] p-4">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                              <Field label="Actor">
                                <span className="flex items-center gap-2">
                                  <Avatar name={r.actor} size={20} />
                                  {r.actor}
                                </span>
                              </Field>
                              <Field label="Action">{m.label}</Field>
                              <Field label="Target">{r.target ?? "—"}</Field>
                              <Field label="When">{new Date(r.at).toLocaleString("en-GB")}</Field>
                            </div>
                            <JsonBlock title="Full details" value={r.raw} maxHeight={260} defaultOpen={false} />
                            <div className="flex flex-wrap gap-2">
                              {r.target && (
                                <Link href={`/dashboard/servers/${serverId}/lookup?q=${encodeURIComponent(r.target)}`} className="btn-secondary h-8 px-3 text-xs">
                                  <Icons.search size={12} /> Look up {r.target}
                                </Link>
                              )}
                              <button type="button" onClick={() => setActor(r.actor)} className="btn-ghost h-8 px-3 text-xs">
                                <Icons.user size={12} /> Only {r.actor}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* --------------------------------------------------------- sidebar */}
      <aside className="hidden space-y-4 xl:block">
        <div className="sticky top-20 space-y-4">
          <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0e0e10]">
            <div className="border-r border-white/[0.06] px-4 py-3.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">24 hours</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{stats.day}</p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">7 days</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{stats.week}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e10] p-2">
            <p className="px-2.5 pb-1.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">What</p>
            {GROUPS.map((g) => {
              const Icon = Icons[g.icon];
              const n = g.key === "all" ? rows.length : stats.byGroup.get(g.key) ?? 0;
              if (g.key !== "all" && n === 0) return null;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGroup(g.key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition",
                    group === g.key ? "bg-white/[0.07] text-white" : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-200"
                  )}
                >
                  <Icon size={14} className={group === g.key ? "text-white" : "text-slate-500"} />
                  <span className="flex-1">{g.label}</span>
                  <span className="tabular-nums text-slate-600">{n}</span>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e10] p-2">
            <p className="px-2.5 pb-1.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">Who</p>
            {stats.staff.map(([name, n]) => (
              <button
                key={name}
                type="button"
                onClick={() => setActor(actor === name ? null : name)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                  actor === name ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"
                )}
              >
                <Avatar name={name} size={26} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[12.5px]", actor === name ? "text-white" : "text-slate-300")}>{name}</span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.05]">
                    <span className="block h-full rounded-full bg-white/50" style={{ width: `${Math.max(6, (n / maxStaff) * 100)}%` }} />
                  </span>
                </span>
                <span className="text-[11.5px] tabular-nums text-slate-500">{n}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
