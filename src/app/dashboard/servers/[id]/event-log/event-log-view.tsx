"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui";
import { Icons } from "@/components/icons";
import { DetailShell, Field, FilterChips, JsonBlock, ListItem, ListShell, SearchBox, SplitView } from "@/components/log-ui";
import { cn } from "@/lib/utils";

interface LiveEvent {
  id: string;
  t: number;
  kind: string;
  player: string;
  src?: number;
  detail: string;
  count?: number;
  data?: Record<string, unknown>;
}

// Kind → label + colour. Colour carries meaning only: red = harm, amber =
// damage, green = something was created, neutral = everything else.
const KINDS: Record<string, { label: string; tag: string; dot: string; help: string }> = {
  spawn: { label: "Spawn", tag: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/20", dot: "bg-emerald-400", help: "A player created a vehicle, ped or object (traffic is left out)." },
  remove: { label: "Remove", tag: "text-slate-300 bg-white/[0.05] ring-white/10", dot: "bg-slate-400", help: "A player-created entity was deleted." },
  explosion: { label: "Explosion", tag: "text-orange-300 bg-orange-400/10 ring-orange-400/20", dot: "bg-orange-400", help: "An explosion, with its type and whether a vehicle blew up." },
  damage: { label: "Damage", tag: "text-amber-300 bg-amber-400/10 ring-amber-400/20", dot: "bg-amber-400", help: "Weapon damage: weapon, amount, head hits and the player who was hit." },
  particle: { label: "Particle", tag: "text-violet-200 bg-violet-300/10 ring-violet-300/20", dot: "bg-violet-300", help: "A networked particle effect, with its scale and position." },
  kill: { label: "Kill", tag: "text-rose-300 bg-rose-400/10 ring-rose-400/20", dot: "bg-rose-400", help: "A hit that killed: weapon and victim." },
  event: { label: "Event", tag: "text-sky-200 bg-sky-300/10 ring-sky-300/20", dot: "bg-sky-300", help: "A script event from your watch list, with its arguments." },
  join: { label: "Join", tag: "text-slate-200 bg-white/[0.05] ring-white/10", dot: "bg-slate-300", help: "A player connected." },
  leave: { label: "Leave", tag: "text-slate-400 bg-white/[0.04] ring-white/10", dot: "bg-slate-500", help: "A player left, with the reason." },
  other: { label: "Other", tag: "text-slate-400 bg-white/[0.04] ring-white/10", dot: "bg-slate-500", help: "" },
};
const FILTER_ORDER = ["spawn", "remove", "explosion", "damage", "particle", "kill", "event", "join", "leave"];

function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function EventLogView({
  serverId,
  initialEnabled,
  canConfigure = true,
}: {
  serverId: string;
  initialEnabled: boolean;
  /** Turning the feed on/off, clearing it for everyone and the watch list need "Configure protection". */
  canConfigure?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [watch, setWatch] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newEvent, setNewEvent] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [watchOpen, setWatchOpen] = useState(false);
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

  // The watch list is useful even while logging is off.
  useEffect(() => {
    poll();
  }, [poll]);

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
          setSel(null);
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
  const total = useMemo(() => events.reduce((s, e) => s + (e.count ?? 1), 0), [events]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      events
        .filter(
          (e) =>
            (filter === "all" || e.kind === filter) &&
            (!needle || e.player.toLowerCase().includes(needle) || e.detail.toLowerCase().includes(needle) || String(e.src ?? "").includes(needle))
        )
        .slice(-300)
        .reverse(),
    [events, filter, needle]
  );
  const selected = events.find((e) => e.id === sel) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Logs"
        title="Event Log"
        description="A live feed of what players do — spawns, removals, explosions, damage, particles, kills and the script events you watch. Select a line for its full JSON."
        actions={
          <>
            {canConfigure ? (
            <button
              type="button"
              onClick={() => patch({ enabled: !enabled })}
              disabled={busy}
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition",
                enabled ? "border border-emerald-400/25 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15" : "btn-primary"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", enabled ? (paused ? "bg-amber-300" : "animate-pulse bg-emerald-400") : "bg-black/60")} />
              {enabled ? (paused ? "Paused" : "Live — turn off") : "Turn on"}
            </button>
            ) : (
              <span className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] px-3.5 text-xs text-slate-400">
                <span className={cn("h-2 w-2 rounded-full", enabled ? (paused ? "bg-amber-300" : "animate-pulse bg-emerald-400") : "bg-slate-600")} />
                {enabled ? (paused ? "Paused" : "Live") : "Off"}
              </span>
            )}
            <button type="button" onClick={() => setPaused((p) => !p)} disabled={!enabled} className="btn-secondary h-9 px-3 text-xs disabled:opacity-40">
              {paused ? <Icons.play size={13} /> : <Icons.pause size={13} />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEvents([]);
                setSel(null);
                sinceRef.current = undefined;
                // Members who cannot configure only clear their own view.
                if (canConfigure) patch({ clear: true });
              }}
              disabled={!enabled}
              className="btn-secondary h-9 px-3 text-xs disabled:opacity-40"
            >
              <Icons.trash size={13} /> Clear
            </button>
          </>
        }
      />

      {/* Watched events */}
      <div className="mb-4 rounded-2xl border border-white/[0.07] bg-[#0e0e10]">
        <button type="button" onClick={() => setWatchOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left">
          <Icons.activity size={15} className="text-slate-400" />
          <span className="text-[13px] font-medium text-slate-100">Watched script events</span>
          <span className="rounded-full bg-white/[0.06] px-2 text-[11px] tabular-nums text-slate-400">{watch.length}</span>
          <span className="ml-auto hidden truncate text-[12px] text-slate-500 sm:block">
            FiveM cannot see every script event — add the ones you care about (money, jobs, admin actions).
          </span>
          <Icons.chevronDown size={14} className={cn("shrink-0 text-slate-500 transition", watchOpen && "rotate-180")} />
        </button>
        {watchOpen && (
          <div className="border-t border-white/[0.06] px-5 py-4">
            {canConfigure && (
            <div className="flex gap-2">
              <input
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addWatch()}
                placeholder="qb-bankrobbery:server:setBankState"
                className="input h-9 min-w-0 flex-1 font-mono text-xs"
                maxLength={100}
              />
              <button type="button" className="btn-primary h-9 px-4 text-xs" disabled={busy || !newEvent.trim()} onClick={addWatch}>
                Watch
              </button>
            </div>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {watch.length === 0 && <span className="text-xs text-slate-600">Nothing watched yet.</span>}
              {watch.map((w) => (
                <span key={w} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] py-1 pl-2.5 pr-1.5 font-mono text-[11.5px] text-slate-300">
                  {w}
                  {canConfigure && (
                    <button type="button" title="Stop watching" disabled={busy} onClick={() => patch({ watchEvents: watch.filter((x) => x !== w) })} className="text-slate-500 transition hover:text-rose-300">
                      <Icons.x size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "All", count: total },
            ...FILTER_ORDER.map((k) => ({ key: k, label: KINDS[k].label, count: counts[k] ?? 0, dot: KINDS[k].dot })),
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Player, server ID or detail…" className="w-full xl:w-72" />
      </div>

      {!enabled ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.08] py-20 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400">
            <Icons.pause size={20} />
          </span>
          <h3 className="text-sm font-semibold text-slate-100">The event log is off</h3>
          <p className="max-w-sm text-sm text-slate-500">It starts streaming within about five seconds of turning it on. The game server does no extra work while it is off.</p>
          {canConfigure ? (
            <button type="button" onClick={() => patch({ enabled: true })} disabled={busy} className="btn-primary mt-1">
              {busy ? "…" : "Turn on the event log"}
            </button>
          ) : (
            <p className="text-[12px] text-slate-600">Ask someone who can configure protection to turn it on.</p>
          )}
        </div>
      ) : (
        <SplitView
          hasSelection={!!selected}
          onBack={() => setSel(null)}
          list={
            <ListShell footer={paused ? "Paused — new events are held until you resume." : `${shown.length} shown · updates every 2 s`}>
              {shown.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-slate-500">
                  {!paused && <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />}
                  <p className="text-[13px]">{paused ? "Paused." : events.length ? "Nothing matches this filter." : "Waiting for events — play in game to see them here."}</p>
                </div>
              ) : (
                shown.map((e) => {
                  const k = KINDS[e.kind] ?? KINDS.other;
                  return (
                    <ListItem key={e.id} active={e.id === sel} onClick={() => setSel(e.id)}>
                      <span className={cn("w-[76px] shrink-0 rounded-md py-1 text-center text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset", k.tag)}>{k.label}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-slate-100">{e.player}</span>
                          {e.src ? <span className="font-mono text-[11px] text-slate-500">#{e.src}</span> : null}
                          {(e.count ?? 1) > 1 && <span className="rounded bg-white/10 px-1.5 text-[10px] font-bold text-slate-200">×{e.count}</span>}
                        </span>
                        <span className="block truncate font-mono text-[11.5px] text-slate-400">{e.detail}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-slate-500">{fmtTime(e.t)}</span>
                    </ListItem>
                  );
                })
              )}
            </ListShell>
          }
          detail={
            selected ? (
              <DetailShell>
                <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
                  <span className={cn("rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset", (KINDS[selected.kind] ?? KINDS.other).tag)}>
                    {(KINDS[selected.kind] ?? KINDS.other).label}
                  </span>
                  <span className="min-w-0 truncate text-[15px] font-semibold text-white">{selected.player}</span>
                  <span className="ml-auto font-mono text-[12px] text-slate-500">{fmtTime(selected.t)}</span>
                </div>
                <div className="space-y-5 px-5 py-5">
                  <Field label="Description" mono>
                    {selected.detail}
                  </Field>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                    <Field label="Player">{selected.player}</Field>
                    <Field label="Server ID" mono>
                      {selected.src || "—"}
                    </Field>
                    <Field label="Repeated">{(selected.count ?? 1) > 1 ? `×${selected.count} in 2 s` : "once"}</Field>
                    <Field label="Time">{new Date(selected.t).toLocaleString("en-GB")}</Field>
                  </div>
                  <JsonBlock
                    title="Event details"
                    value={{
                      kind: selected.kind,
                      player: selected.player,
                      serverId: selected.src ?? 0,
                      time: new Date(selected.t).toISOString(),
                      count: selected.count ?? 1,
                      summary: selected.detail,
                      ...(selected.data ? { data: selected.data } : {}),
                    }}
                  />
                  {KINDS[selected.kind]?.help && <p className="text-[12px] text-slate-500">{KINDS[selected.kind].help}</p>}
                </div>
              </DetailShell>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.08] p-6">
                <p className="text-[13px] font-medium text-slate-200">Select an event</p>
                <p className="mt-1 text-[12.5px] text-slate-500">Its full record opens here as JSON — weapon, damage, victim, model, coordinates or script arguments.</p>
                <ul className="mt-4 space-y-2">
                  {FILTER_ORDER.map((k) => (
                    <li key={k} className="flex gap-2.5 text-[12px] text-slate-400">
                      <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", KINDS[k].dot)} />
                      <span>
                        <b className="font-medium text-slate-200">{KINDS[k].label}</b> — {KINDS[k].help}
                      </span>
                    </li>
                  ))}
                  <li className="pt-1 text-[11.5px] text-slate-600">Identical lines inside two seconds are merged as ×N; busy kinds are capped so one type never drowns the rest.</li>
                </ul>
              </div>
            )
          }
        />
      )}
    </>
  );
}
