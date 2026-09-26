"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

interface LiveEvent {
  id: string;
  t: number;
  kind: string;
  player: string;
  src?: number;
  detail: string;
  count?: number;
}

// Kind → short label + colour. Colours follow meaning: red = harm, amber =
// damage, green = entity spawn, sky = script events you watch, slate = session.
const KINDS: Record<string, { label: string; cls: string }> = {
  event: { label: "EVENT", cls: "text-sky-300 bg-sky-500/10 ring-sky-500/25" },
  kill: { label: "KILL", cls: "text-rose-300 bg-rose-500/10 ring-rose-500/25" },
  damage: { label: "DAMAGE", cls: "text-amber-300 bg-amber-500/10 ring-amber-500/25" },
  explosion: { label: "EXPLOSION", cls: "text-orange-300 bg-orange-500/10 ring-orange-500/25" },
  spawn: { label: "SPAWN", cls: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/25" },
  particle: { label: "PARTICLE", cls: "text-purple-300 bg-purple-500/10 ring-purple-500/25" },
  join: { label: "JOIN", cls: "text-slate-300 bg-white/5 ring-white/10" },
  leave: { label: "LEAVE", cls: "text-slate-400 bg-white/5 ring-white/10" },
  remove: { label: "REMOVE", cls: "text-slate-400 bg-white/5 ring-white/10" },
  other: { label: "OTHER", cls: "text-slate-400 bg-white/5 ring-white/10" },
};
const FILTER_ORDER = ["event", "kill", "damage", "explosion", "spawn", "particle", "join", "leave"];

export function EventLogView({ serverId, initialEnabled }: { serverId: string; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [watch, setWatch] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newEvent, setNewEvent] = useState("");
  const sinceRef = useRef<string | undefined>(undefined);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/event-log${sinceRef.current ? `?since=${sinceRef.current}` : ""}`);
      const json = await res.json();
      if (!res.ok || !json.ok) return;
      setEnabled(json.data.enabled);
      setWatch(json.data.watchEvents ?? []);
      const incoming: LiveEvent[] = json.data.events ?? [];
      if (incoming.length) {
        sinceRef.current = incoming[incoming.length - 1].id;
        setEvents((prev) => [...prev, ...incoming].slice(-600));
      }
    } catch {
      /* ignore */
    }
  }, [serverId]);

  // Watched list is useful even while logging is off.
  useEffect(() => { poll(); }, [poll]);

  useEffect(() => {
    if (!enabled || paused) return;
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [enabled, paused, poll]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/event-log`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setEnabled(json.data.enabled);
        setWatch(json.data.watchEvents ?? []);
        if (!json.data.enabled) {
          setEvents([]);
          sinceRef.current = undefined;
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function addWatch() {
    const name = newEvent.trim();
    if (!name || watch.includes(name)) return;
    setNewEvent("");
    patch({ watchEvents: [...watch, name] });
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + (e.count ?? 1);
    return c;
  }, [events]);

  const needle = q.trim().toLowerCase();
  const shown = events
    .filter((e) => (filter === "all" || e.kind === filter) &&
      (!needle || e.player.toLowerCase().includes(needle) || e.detail.toLowerCase().includes(needle) || String(e.src ?? "").includes(needle)))
    .slice(-300)
    .reverse();

  return (
    <>
      <PageHeader
        title="Event Log"
        description="Live feed of what players do: script events you watch, kills, damage, explosions and spawns. Turn it on while you watch, off when you are done."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="flex min-w-0 flex-col" style={{ minHeight: "64vh" }}>
          {/* toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => patch({ enabled: !enabled })}
              disabled={busy}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                enabled ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30" : "btn-primary"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", enabled ? (paused ? "bg-amber-400" : "animate-pulse bg-emerald-400") : "bg-white/70")} />
              {enabled ? (paused ? "Paused" : "Live") : "Enable"}
            </button>
            <button onClick={() => setPaused((p) => !p)} disabled={!enabled} className="btn-ghost text-xs disabled:opacity-40">
              {paused ? <><Icons.play size={13} /> Resume</> : <><Icons.pause size={13} /> Pause</>}
            </button>
            <button onClick={() => { setEvents([]); sinceRef.current = undefined; patch({ clear: true }); }} disabled={!enabled} className="btn-ghost text-xs disabled:opacity-40">
              Clear
            </button>
            <div className="relative ml-auto">
              <Icons.search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Player, ID or event…"
                className="w-56 rounded-lg border border-white/10 bg-base-900/60 py-1.5 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-brand-500/50"
              />
            </div>
          </div>

          {/* kind filter */}
          <div className="mb-3 flex flex-wrap gap-1.5 border-b border-white/5 pb-3">
            {["all", ...FILTER_ORDER].map((f) => {
              const n = f === "all" ? events.reduce((s, e) => s + (e.count ?? 1), 0) : counts[f] ?? 0;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition",
                    filter === f ? "border-brand-500/50 bg-brand-500/15 text-white" : "border-white/10 text-slate-400 hover:bg-white/5"
                  )}
                >
                  {f}
                  <span className="font-mono text-[10px] text-slate-500">{n}</span>
                </button>
              );
            })}
          </div>

          {!enabled ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-slate-400 ring-1 ring-inset ring-white/10">
                <Icons.pause size={22} />
              </span>
              <h3 className="text-sm font-semibold text-slate-200">Event logging is off</h3>
              <p className="max-w-sm text-sm text-slate-500">
                It starts streaming within ~5 seconds of enabling. The server does no extra work while it is off.
              </p>
              <button onClick={() => patch({ enabled: true })} disabled={busy} className="btn-primary mt-1">
                {busy ? "…" : "Enable Event Log"}
              </button>
            </div>
          ) : shown.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center text-slate-500">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500/20 border-t-brand-400" />
              <p className="text-sm">{paused ? "Paused." : "Waiting for events… play in-game to see them here."}</p>
            </div>
          ) : (
            <div className="-mx-2 flex-1 overflow-auto">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    <th className="w-20 px-2 pb-2">Time</th>
                    <th className="w-24 px-2 pb-2">Kind</th>
                    <th className="w-44 px-2 pb-2">Player</th>
                    <th className="px-2 pb-2">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {shown.map((e) => {
                    const k = KINDS[e.kind] ?? KINDS.other;
                    return (
                      <tr key={e.id} className="hover:bg-white/[0.02]">
                        <td className="px-2 py-1.5 font-mono text-[11px] text-slate-500">{fmtTime(e.t)}</td>
                        <td className="px-2 py-1.5">
                          <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ring-1 ring-inset", k.cls)}>{k.label}</span>
                        </td>
                        <td className="truncate px-2 py-1.5">
                          <span className="font-medium text-slate-200">{e.player}</span>
                          {e.src ? <span className="ml-1.5 font-mono text-[11px] text-slate-500">#{e.src}</span> : null}
                        </td>
                        <td className="truncate px-2 py-1.5 font-mono text-xs text-slate-400" title={e.detail}>
                          {e.detail}
                          {(e.count ?? 1) > 1 && (
                            <span className="ml-2 rounded bg-white/10 px-1.5 py-px text-[10px] font-bold text-slate-200">×{e.count}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icons.activity size={15} className="text-sky-300" /> Watched events
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              FiveM has no way to see every script event, so add the ones you care about (money, jobs, admin actions). When a
              player sends one it shows up as <b className="text-sky-300">EVENT</b> with who sent it and the arguments.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addWatch()}
                placeholder="qb-bankrobbery:server:setBankState"
                className="input min-w-0 flex-1 font-mono text-xs"
              />
              <button className="btn-primary text-xs" disabled={busy || !newEvent.trim()} onClick={addWatch}>Watch</button>
            </div>
            <ul className="mt-3 space-y-1.5">
              {watch.length === 0 && <li className="text-xs text-slate-600">Nothing watched yet.</li>}
              {watch.map((w) => (
                <li key={w} className="flex items-center gap-2 rounded-lg border border-white/5 bg-base-900/50 px-2.5 py-1.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">{w}</code>
                  <button
                    title="Stop watching"
                    disabled={busy}
                    onClick={() => patch({ watchEvents: watch.filter((x) => x !== w) })}
                    className="text-slate-500 transition hover:text-rose-300"
                  >
                    <Icons.x size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-white">What is logged</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
              <li><b className="text-slate-300">Spawn</b> — only vehicles, peds and objects a player created (traffic is left out).</li>
              <li><b className="text-slate-300">Damage / Kill</b> — weapon, damage and the player who was hit.</li>
              <li><b className="text-slate-300">Explosion</b> — explosion type; “vehicle” when a car blew up.</li>
              <li>Identical lines inside two seconds are merged as <b className="text-slate-300">×N</b>. Busy kinds are capped so one type can never drown the rest.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
