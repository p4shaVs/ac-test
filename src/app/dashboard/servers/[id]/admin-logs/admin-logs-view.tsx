"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";
import { Icons, type IconName } from "@/components/icons";
import { Ago, Avatar, DetailEmpty, DetailShell, Field, JsonBlock, ListItem, ListShell, SearchBox, SplitView } from "@/components/log-ui";
import { formatDateTime, cn } from "@/lib/utils";

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

const ACTION_META: Record<string, { label: string; icon: IconName; cls: string }> = {
  BAN: { label: "Ban", icon: "ban", cls: "text-rose-300 bg-rose-400/10 ring-rose-400/20" },
  KICK: { label: "Kick", icon: "kick", cls: "text-amber-300 bg-amber-400/10 ring-amber-400/20" },
  WARN: { label: "Warning", icon: "warn", cls: "text-amber-300 bg-amber-400/10 ring-amber-400/20" },
  UNBAN: { label: "Unban", icon: "undo", cls: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/20" },
  "UNBAN ALL": { label: "Unban all", icon: "undo", cls: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/20" },
  "FALSE BAN FIXED": { label: "False ban fixed", icon: "wand", cls: "text-amber-200 bg-amber-400/10 ring-amber-400/20" },
  "MARKED FALSE POSITIVE": { label: "Marked false positive", icon: "check", cls: "text-amber-200 bg-amber-400/10 ring-amber-400/20" },
  "UNMARKED FALSE POSITIVE": { label: "Unmarked false positive", icon: "x", cls: "text-slate-300 bg-white/[0.05] ring-white/10" },
  "BAN NOTE": { label: "Ban note", icon: "note", cls: "text-slate-300 bg-white/[0.05] ring-white/10" },
  CONFIG: { label: "Configuration", icon: "sliders", cls: "text-slate-200 bg-white/[0.05] ring-white/10" },
  RESOURCE: { label: "Resource", icon: "cube", cls: "text-slate-200 bg-white/[0.05] ring-white/10" },
  CONSOLE: { label: "Console command", icon: "terminal", cls: "text-slate-200 bg-white/[0.05] ring-white/10" },
  PANEL: { label: "Panel", icon: "dashboard", cls: "text-slate-300 bg-white/[0.05] ring-white/10" },
};

function meta(action: string) {
  return (
    ACTION_META[action] ?? {
      label: action.charAt(0) + action.slice(1).toLowerCase(),
      icon: "activity" as IconName,
      cls: "text-slate-300 bg-white/[0.05] ring-white/10",
    }
  );
}

const SOURCE_LABEL: Record<string, string> = {
  moderation: "Moderation queue",
  panel: "Web panel",
  admin: "Admin menu",
  ingame: "In game",
  console: "Web console",
};

function Select({ value, onChange, options, icon }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; icon: IconName }) {
  const Icon = Icons[icon];
  return (
    <label className="relative flex h-9 items-center">
      <Icon size={13} className="pointer-events-none absolute left-3 text-slate-500" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-lg border border-white/10 bg-white/[0.03] pl-8 pr-8 text-[12.5px] text-slate-200 outline-none transition hover:border-white/20 focus:border-white/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#141416]">
            {o.label}
          </option>
        ))}
      </select>
      <Icons.chevronDown size={12} className="pointer-events-none absolute right-3 text-slate-500" />
    </label>
  );
}

export function AdminLogsView({ rows }: { rows: AdminLogRow[] }) {
  const [action, setAction] = useState("all");
  const [actor, setActor] = useState("all");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const actions = useMemo(() => Array.from(new Set(rows.map((r) => r.action))).sort(), [rows]);
  const actors = useMemo(() => Array.from(new Set(rows.map((r) => r.actor))).sort((a, b) => a.localeCompare(b)), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (action !== "all" && r.action !== action) return false;
      if (actor !== "all" && r.actor !== actor) return false;
      if (!q) return true;
      return [r.description, r.target, r.actor, r.action].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [rows, action, actor, query]);

  const selected = filtered.find((r) => r.id === sel) ?? null;

  if (rows.length === 0) {
    return <EmptyState icon="history" title="No staff activity yet" description="When an admin bans, kicks, warns, changes the configuration or runs a console command, it is recorded here." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2">
          <Select
            icon="filter"
            value={action}
            onChange={setAction}
            options={[{ value: "all", label: "All actions" }, ...actions.map((a) => ({ value: a, label: meta(a).label }))]}
          />
          <Select icon="user" value={actor} onChange={setActor} options={[{ value: "all", label: "All admins" }, ...actors.map((a) => ({ value: a, label: a }))]} />
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder="Search description, player, admin…" className="w-full lg:ml-auto lg:w-80" />
      </div>

      <SplitView
        hasSelection={!!selected}
        onBack={() => setSel(null)}
        list={
          <ListShell footer={`${filtered.length} of ${rows.length} entries`}>
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-slate-500">Nothing matches.</p>
            ) : (
              filtered.map((r) => {
                const m = meta(r.action);
                const Icon = Icons[m.icon];
                return (
                  <ListItem key={r.id} active={r.id === sel} onClick={() => setSel(r.id)}>
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset", m.cls)}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-slate-100">
                        {m.label}
                        {r.target ? <span className="font-normal text-slate-400"> · {r.target}</span> : null}
                      </span>
                      <span className="block truncate text-[12px] text-slate-500">{r.description}</span>
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-slate-500">
                      <span className="block max-w-[110px] truncate text-slate-400">{r.actor}</span>
                      <Ago at={r.at} />
                    </span>
                  </ListItem>
                );
              })
            )}
          </ListShell>
        }
        detail={
          selected ? (
            <DetailShell>
              <div className="flex items-center gap-3.5 border-b border-white/[0.06] px-5 py-4">
                {(() => {
                  const m = meta(selected.action);
                  const Icon = Icons[m.icon];
                  return (
                    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset", m.cls)}>
                      <Icon size={18} />
                    </span>
                  );
                })()}
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold text-white">{meta(selected.action).label}</p>
                  <p className="text-[12px] text-slate-500">{formatDateTime(selected.at)}</p>
                </div>
              </div>
              <div className="space-y-5 px-5 py-5">
                <Field label="Description">{selected.description}</Field>
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Field label="Actor">
                    <span className="flex items-center gap-2">
                      <Avatar name={selected.actor} size={22} />
                      {selected.actor}
                    </span>
                  </Field>
                  <Field label="Action">{meta(selected.action).label}</Field>
                  <Field label="Target">{selected.target ?? "—"}</Field>
                  <Field label="When">{formatDateTime(selected.at)}</Field>
                  <Field label="Source">{SOURCE_LABEL[selected.source] ?? selected.source}</Field>
                </div>
                <JsonBlock title="Full details" value={selected.raw} />
              </div>
            </DetailShell>
          ) : (
            <DetailEmpty icon="history" text="Select an entry to see who did what, to whom, and the full record." />
          )
        }
      />
    </div>
  );
}
