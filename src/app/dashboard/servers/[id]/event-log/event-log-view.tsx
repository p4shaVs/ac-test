"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, PageHeader, Badge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

interface LiveEvent {
  id: string;
  t: number;
  kind: string;
  player: string;
  detail: string;
}

const FILTERS = ["all", "spawn", "remove", "explosion", "damage", "particle", "kill"] as const;
const KIND_TONE: Record<string, "violet" | "red" | "amber" | "blue" | "green" | "gray"> = {
  spawn: "green",
  remove: "gray",
  explosion: "red",
  damage: "amber",
  particle: "violet",
  kill: "red",
  other: "gray",
};

export function EventLogView({ serverId, initialEnabled }: { serverId: string; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const sinceRef = useRef<string | undefined>(undefined);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/event-log${sinceRef.current ? `?since=${sinceRef.current}` : ""}`);
      const json = await res.json();
      if (!res.ok || !json.ok) return;
      setEnabled(json.data.enabled);
      const incoming: LiveEvent[] = json.data.events ?? [];
      if (incoming.length) {
        sinceRef.current = incoming[incoming.length - 1].id;
        setEvents((prev) => [...prev, ...incoming].slice(-400));
      }
    } catch {
      /* ignore */
    }
  }, [serverId]);

  useEffect(() => {
    if (!enabled || paused) return;
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [enabled, paused, poll]);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/event-log`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) {
        setEnabled(next);
        if (!next) {
          setEvents([]);
          sinceRef.current = undefined;
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setEvents([]);
    sinceRef.current = undefined;
    await fetch(`/api/servers/${serverId}/event-log`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, clear: true }),
    }).catch(() => {});
  }

  const needle = q.trim().toLowerCase();
  const shown = events
    .filter((e) => (filter === "all" || e.kind === filter) && (!needle || e.player.toLowerCase().includes(needle) || e.detail.toLowerCase().includes(needle) || e.kind.includes(needle)))
    .slice(-250)
    .reverse();

  return (
    <>
      <PageHeader
        title="Event Log"
        description="A live feed of game events. Turn it on while you watch a player; turn it off when you are done."
      />

      <Card className="flex flex-col" style={{ minHeight: "60vh" }}>
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                disabled={!enabled}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition disabled:opacity-40",
                  filter === f ? "border-brand-500/50 bg-brand-500/15 text-white" : "border-white/10 text-slate-400 hover:bg-white/5"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Icons.search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                disabled={!enabled}
                placeholder="Search…"
                className="w-full rounded-lg border border-white/10 bg-base-900/60 py-1.5 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-brand-500/50 disabled:opacity-40 lg:w-48"
              />
            </div>
            <button
              onClick={() => setPaused((p) => !p)}
              disabled={!enabled}
              className={cn("rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40", paused ? "border-amber-500/50 bg-amber-500/10 text-amber-300" : "border-white/10 text-slate-300 hover:bg-white/5")}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button onClick={clear} disabled={!enabled} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-40">
              Clear
            </button>
            <button
              onClick={() => toggle(!enabled)}
              disabled={busy}
              className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition", enabled ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30" : "bg-brand-gradient text-white")}
            >
              <span className={cn("h-2 w-2 rounded-full", enabled ? "bg-emerald-400" : "bg-white/70")} />
              {enabled ? "Logging" : "Enable"}
            </button>
          </div>
        </div>

        {!enabled ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-slate-400 ring-1 ring-inset ring-white/10">
              <Icons.pause size={22} />
            </span>
            <h3 className="text-sm font-semibold text-slate-200">Event logging is off</h3>
            <p className="max-w-sm text-sm text-slate-500">
              Turn it on while you watch. It streams live game events; turn it off when you are done so the server does no extra work.
            </p>
            <button onClick={() => toggle(true)} disabled={busy} className="btn-primary mt-1">
              {busy ? "…" : "Enable Event Log"}
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center text-slate-500">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500/20 border-t-brand-400" />
            <p className="text-sm">{paused ? "Paused." : "Waiting for events… interact in-game to see them here."}</p>
          </div>
        ) : (
          <ul className="-mx-2 flex-1 divide-y divide-white/5 overflow-auto">
            {shown.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-2 py-2">
                <Badge tone={KIND_TONE[e.kind] ?? "gray"}>{e.kind}</Badge>
                <span className="w-40 shrink-0 truncate text-sm font-medium text-slate-200">{e.player}</span>
                <span className="flex-1 truncate font-mono text-xs text-slate-500">{e.detail}</span>
                <span className="w-16 shrink-0 text-right text-[11px] text-slate-500">{fmtTime(e.t)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function fmtTime(t: number): string {
  const d = new Date(t);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
