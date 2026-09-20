"use client";

import { useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui";
import { Icons } from "@/components/icons";
import { cn, timeAgo } from "@/lib/utils";

export type EventKind = "DETECTION" | "BAN" | "KICK" | "WARN" | "UNBAN";

export interface EventRow {
  id: string;
  kind: EventKind;
  title: string;
  player: string;
  detail: string;
  severity?: string;
  action?: string;
  at: string; // ISO
}

const FILTERS: { id: string; label: string; kinds: EventKind[] }[] = [
  { id: "all", label: "All", kinds: ["DETECTION", "BAN", "KICK", "WARN", "UNBAN"] },
  { id: "detections", label: "Detections", kinds: ["DETECTION"] },
  { id: "bans", label: "Bans", kinds: ["BAN", "UNBAN"] },
  { id: "kicks", label: "Kicks", kinds: ["KICK"] },
  { id: "warns", label: "Warnings", kinds: ["WARN"] },
];

const KIND_META: Record<EventKind, { label: string; tone: "violet" | "red" | "amber" | "green"; icon: keyof typeof Icons }> = {
  DETECTION: { label: "Detection", tone: "violet", icon: "shieldCheck" },
  BAN: { label: "Ban", tone: "red", icon: "ban" },
  KICK: { label: "Kick", tone: "amber", icon: "kick" },
  WARN: { label: "Warning", tone: "amber", icon: "warn" },
  UNBAN: { label: "Unban", tone: "green", icon: "check" },
};

const SEV_TONE: Record<string, "red" | "amber" | "blue" | "gray"> = {
  CRITICAL: "red",
  HIGH: "amber",
  MEDIUM: "blue",
  LOW: "gray",
};
const ACT_TONE: Record<string, "red" | "amber" | "gray"> = { BAN: "red", KICK: "amber", LOG: "gray" };

const ICON_WRAP: Record<string, string> = {
  violet: "bg-purple-500/10 text-purple-300",
  red: "bg-rose-500/10 text-rose-300",
  amber: "bg-amber-500/10 text-amber-300",
  green: "bg-emerald-500/10 text-emerald-300",
};

export function EventsFeed({ rows }: { rows: EventRow[] }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.id] = rows.filter((r) => f.kinds.includes(r.kind)).length;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const kinds = FILTERS.find((f) => f.id === filter)?.kinds ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        kinds.includes(r.kind) &&
        (!needle || r.player.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle))
    );
  }, [rows, filter, q]);

  return (
    <Card className="flex flex-col">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                filter === f.id
                  ? "border-brand-500/50 bg-brand-500/15 text-white"
                  : "border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200"
              )}
            >
              {f.label}
              <span className={cn("rounded px-1.5 text-[10px]", filter === f.id ? "bg-brand-500/30 text-brand-100" : "bg-white/5 text-slate-500")}>
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Icons.search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search player or type…"
            className="w-full rounded-lg border border-white/10 bg-base-900/60 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none transition focus:border-brand-500/50 lg:w-64"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/5 text-slate-500 ring-1 ring-inset ring-white/10">
            <Icons.activity size={20} />
          </span>
          <p className="text-sm text-slate-500">{q.trim() ? "Nothing matches your search." : "No events in this category yet."}</p>
        </div>
      ) : (
        <ul className="-mx-2 divide-y divide-white/5">
          {shown.map((e) => {
            const meta = KIND_META[e.kind];
            const Icon = Icons[meta.icon];
            return (
              <li key={e.id} className="flex items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-white/[0.02]">
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", ICON_WRAP[meta.tone])}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-200">{e.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {e.player}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </p>
                </div>
                {e.kind === "DETECTION" && e.severity && (
                  <Badge tone={SEV_TONE[e.severity] ?? "gray"}>{e.severity}</Badge>
                )}
                {e.kind === "DETECTION" && e.action && (
                  <span className={cn("hidden rounded-md px-2 py-0.5 text-[10px] font-bold uppercase sm:inline",
                    e.action === "BAN" ? "text-rose-300 bg-rose-500/10" : e.action === "KICK" ? "text-amber-300 bg-amber-500/10" : "text-slate-400 bg-white/5")}>
                    {e.action}
                  </span>
                )}
                <Badge tone={meta.tone === "violet" ? "violet" : meta.tone === "red" ? "red" : meta.tone === "green" ? "green" : "amber"}>
                  {meta.label}
                </Badge>
                <span className="w-16 shrink-0 text-right text-xs text-slate-500">{timeAgo(e.at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
