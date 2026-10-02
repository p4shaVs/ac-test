"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icons, type IconName } from "@/components/icons";
import { Avatar, CopyButton, IdentChip } from "@/components/log-ui";
import { OfflineBanDialog } from "@/components/offline-ban";
import { formatDateTime, timeAgo, cn } from "@/lib/utils";

interface Result {
  id: string;
  name: string;
  license: string | null;
  steam: string | null;
  discord: string | null;
  ip: string | null;
  online: boolean;
  trustScore: number;
  playtimeSec: number;
  firstSeenAt: string;
  lastSeenAt: string;
  banCount: number;
  activeBan: { reason: string; createdAt: string } | null;
  altAccounts: number;
}

interface Dossier {
  player: {
    id: string;
    name: string;
    online: boolean;
    trustScore: number;
    playtimeSec: number;
    firstSeenAt: string;
    lastSeenAt: string;
    license: string | null;
    steam: string | null;
    discord: string | null;
    ip: string | null;
    deviceId: string | null;
    tokens: number;
    ping: number | null;
    activity: string | null;
  };
  servers: {
    serverId: string;
    serverName: string;
    current: boolean;
    playtimeSec: number;
    nameUsed: string;
    firstSeenAt: string;
    lastSeenAt: string;
    online: boolean;
    banned: boolean;
  }[];
  totalPlaytimeSec: number;
  names: { name: string; where: string; at: string }[];
  bans: {
    id: string;
    serverId: string;
    serverName: string;
    current: boolean;
    code: string | null;
    reason: string;
    active: boolean;
    permanent: boolean;
    falsePositive: boolean;
    evasionOf: string | null;
    expiresAt: string | null;
    createdAt: string;
    bannedBy: string;
  }[];
  actions: { id: string; type: string; reason: string; issuedBy: string; createdAt: string }[];
  detections: {
    total: number;
    last30: number;
    byType: { type: string; label: string; count: number; last: string | null }[];
    recent: { id: string; label: string; severity: string; action: string; createdAt: string }[];
  };
  linked: { id: string; name: string; via: string[]; online: boolean; banned: boolean; lastSeenAt: string }[];
  network: {
    flagged: boolean;
    strength: "none" | "weak" | "strong";
    distinctOwners: number;
    totalBans: number;
    topType: string | null;
    categories: { type: string; label: string; count: number }[];
  };
}

const RECENT_KEY = "coreac.lookup.recent";
// Server shares in the playtime bar: white first, then greys.
const SHADES = ["#ececef", "#a8a8b0", "#7a7a82", "#56565c", "#3c3c42", "#2c2c31"];

function hm(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function TrustRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 70 ? "#ececef" : score >= 40 ? "#f2b33d" : "#f0605d";
  return (
    <div className="relative grid h-[68px] w-[68px] place-items-center">
      <svg width="68" height="68" viewBox="0 0 68 68" className="-rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <div className="absolute text-center">
        <p className="text-[17px] font-semibold leading-none tabular-nums text-white">{score}</p>
        <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">trust</p>
      </div>
    </div>
  );
}

function Signal({ icon, label, value, sub, tone = "neutral" }: { icon: IconName; label: string; value: React.ReactNode; sub: string; tone?: "neutral" | "red" | "amber" | "green" }) {
  const Icon = Icons[icon];
  return (
    <div className="bg-[#0e0e10] px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        <Icon size={12} /> {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-xl font-semibold tabular-nums",
          tone === "red" ? "text-rose-300" : tone === "amber" ? "text-amber-200" : tone === "green" ? "text-emerald-300" : "text-white"
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{sub}</p>
    </div>
  );
}

function Section({ title, right, children, className }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-white/[0.07] bg-[#0e0e10]", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <h3 className="text-[13.5px] font-semibold text-white">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function LookupClient({
  serverId,
  initialQuery = "",
  initialPlayer = null,
  canModerate = true,
}: {
  serverId: string;
  initialQuery?: string;
  initialPlayer?: string | null;
  canModerate?: boolean;
}) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialPlayer);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dLoading, setDLoading] = useState(false);
  const [dError, setDError] = useState<string | null>(null);
  const [banOpen, setBanOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").slice(0, 6));
    } catch {
      /* private mode */
    }
  }, []);

  const remember = useCallback((term: string) => {
    setRecent((prev) => {
      const next = [term, ...prev.filter((x) => x !== term)].slice(0, 6);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Keep ?q= and ?p= in the address so a dossier can be shared with staff.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (q.trim()) url.searchParams.set("q", q.trim());
    else url.searchParams.delete("q");
    if (selected) url.searchParams.set("p", selected);
    else url.searchParams.delete("p");
    window.history.replaceState(null, "", url.toString());
  }, [q, selected]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/servers/${serverId}/lookup?q=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        if (json.ok) setResults(json.data.results);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q, serverId]);

  const loadDossier = useCallback(
    async (id: string) => {
      setDLoading(true);
      setDError(null);
      try {
        const res = await fetch(`/api/servers/${serverId}/lookup/${id}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not load this player");
        setDossier(json.data);
      } catch (e) {
        setDError(e instanceof Error ? e.message : "Could not load this player");
        setDossier(null);
      } finally {
        setDLoading(false);
      }
    },
    [serverId]
  );

  useEffect(() => {
    if (selected) void loadDossier(selected);
    else setDossier(null);
  }, [selected, loadDossier]);

  function open(id: string) {
    if (q.trim().length >= 2) remember(q.trim());
    setSelected(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const d = dossier;
  const activeHere = d?.bans.find((b) => b.active && b.current) ?? null;
  const record = useMemo(() => {
    if (!d) return [];
    const items: { at: string; kind: "ban" | "kick" | "warn"; title: string; detail: string; by: string; href?: string; tag?: string }[] = [];
    for (const b of d.bans) {
      items.push({
        at: b.createdAt,
        kind: "ban",
        title: b.active ? (b.permanent ? "Banned permanently" : "Banned (temporary)") : b.falsePositive ? "Ban — corrected as false positive" : "Ban — lifted",
        detail: b.reason,
        by: b.bannedBy,
        href: `/dashboard/servers/${b.serverId}/bans?ban=${b.id}`,
        tag: b.current ? b.code ?? undefined : `${b.serverName}${b.code ? ` · ${b.code}` : ""}`,
      });
    }
    for (const a of d.actions) {
      items.push({ at: a.createdAt, kind: a.type === "KICK" ? "kick" : "warn", title: a.type === "KICK" ? "Kicked" : "Warned", detail: a.reason, by: a.issuedBy });
    }
    return items.sort((x, y) => (x.at < y.at ? 1 : -1));
  }, [d]);

  const allIds = d ? [d.player.license, d.player.discord, d.player.steam].filter(Boolean).join("\n") : "";

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------------- search */}
      <div className={cn("transition-all", selected ? "" : "pt-6")}>
        {!selected && (
          <div className="mb-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Moderation</p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-tight text-white">Player lookup</h1>
            <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-400">
              One profile per player: playtime across your servers, every name they used, bans, detections and the accounts linked to them.
            </p>
          </div>
        )}
        <div className={cn("relative", selected ? "max-w-xl" : "mx-auto max-w-2xl")}>
          <Icons.search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            autoFocus={!selected}
            className={cn("input pl-11 pr-24", selected ? "h-10 text-[13.5px]" : "h-14 rounded-2xl text-[15px]")}
            placeholder="Name, licence, Discord, Steam, IP or Ban ID"
            value={q}
            spellCheck={false}
            onChange={(e) => {
              setQ(e.target.value);
              if (selected) setSelected(null);
            }}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11.5px] text-slate-500">{loading ? "Searching…" : results ? `${results.length} found` : ""}</span>
        </div>
        {!selected && !results && recent.length > 0 && (
          <div className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11.5px] text-slate-600">Recent</span>
            {recent.map((r) => (
              <button key={r} type="button" onClick={() => setQ(r)} className="h-7 rounded-full border border-white/10 px-2.5 font-mono text-[11.5px] text-slate-400 transition hover:border-white/25 hover:text-white">
                {r.length > 24 ? `${r.slice(0, 22)}…` : r}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* -------------------------------------------------------- results */}
      {!selected &&
        (results === null ? (
          <div className="mx-auto grid max-w-3xl gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-3">
            {[
              { icon: "clock" as IconName, title: "Playtime across servers", text: "Hours, name used, first and last seen on each of your servers." },
              { icon: "link" as IconName, title: "Linked accounts", text: "Other accounts sharing an IP, the device marker or hardware tokens." },
              { icon: "ban" as IconName, title: "Full record", text: "Bans on every server you own, kicks, warnings and detections." },
            ].map((c) => {
              const Icon = Icons[c.icon];
              return (
                <div key={c.title} className="bg-[#0e0e10] p-5">
                  <Icon size={17} className="text-slate-400" />
                  <p className="mt-3 text-[13px] font-semibold text-slate-100">{c.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{c.text}</p>
                </div>
              );
            })}
          </div>
        ) : results.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Nobody on this server matches “{q.trim()}”.</p>
        ) : (
          <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0e0e10]">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => open(r.id)}
                className="flex w-full items-center gap-3.5 border-b border-white/[0.05] px-5 py-3.5 text-left transition last:border-b-0 hover:bg-white/[0.03]"
              >
                <Avatar name={r.name} tone={r.activeBan ? "red" : "neutral"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-white">{r.name}</span>
                    {r.online && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Online" />}
                    {r.activeBan && <span className="rounded-full border border-rose-400/25 px-2 text-[10.5px] text-rose-200">Banned</span>}
                  </span>
                  <span className="block truncate font-mono text-[11.5px] text-slate-500">{(r.license ?? r.discord ?? r.steam ?? "").replace(/^(license|discord|steam):/, "")}</span>
                </span>
                <span className="hidden text-right text-[11.5px] text-slate-500 sm:block">
                  <span className="block text-slate-300">{hm(r.playtimeSec)}</span>
                  {r.online ? "online now" : timeAgo(r.lastSeenAt)}
                </span>
                <span className={cn("w-10 text-right text-[13px] font-semibold tabular-nums", r.trustScore >= 70 ? "text-slate-200" : r.trustScore >= 40 ? "text-amber-200" : "text-rose-300")}>{r.trustScore}</span>
                <Icons.chevronRight size={15} className="text-slate-600" />
              </button>
            ))}
          </div>
        ))}

      {/* -------------------------------------------------------- dossier */}
      {selected && (
        <div className="space-y-5">
          <button type="button" onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-[12.5px] text-slate-400 hover:text-white">
            <Icons.chevronRight size={14} className="rotate-180" /> {results?.length ? "Back to results" : "New search"}
          </button>

          {dLoading && !d && (
            <div className="space-y-4">
              <div className="h-36 animate-pulse rounded-2xl bg-white/[0.03]" />
              <div className="h-56 animate-pulse rounded-2xl bg-white/[0.03]" />
            </div>
          )}
          {dError && <p className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 text-sm text-rose-200">{dError}</p>}

          {d && (
            <>
              {/* header */}
              <div className="flex flex-col gap-5 rounded-2xl border border-white/[0.07] bg-[#0e0e10] bg-gradient-to-br from-white/[0.035] to-transparent p-5 sm:flex-row sm:items-center">
                <Avatar name={d.player.name} size={60} tone={activeHere ? "red" : "neutral"} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-[22px] font-semibold tracking-tight text-white">{d.player.name}</h2>
                    {d.player.online ? (
                      <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-emerald-400/25 px-2.5 text-[11px] font-medium text-emerald-200">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Online{d.player.ping ? ` · ${d.player.ping} ms` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex h-6 items-center rounded-full border border-white/10 px-2.5 text-[11px] text-slate-400">Last seen {timeAgo(d.player.lastSeenAt)}</span>
                    )}
                    {activeHere && (
                      <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-400/[0.08] px-2.5 text-[11px] font-medium text-rose-200">
                        <Icons.ban size={11} /> Banned here
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    First seen {formatDateTime(d.player.firstSeenAt)} · {hm(d.totalPlaytimeSec)} played on {d.servers.length} server{d.servers.length === 1 ? "" : "s"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeHere ? (
                      <Link href={`/dashboard/servers/${serverId}/bans?ban=${activeHere.id}`} className="btn-secondary h-8 px-3 text-xs">
                        <Icons.ban size={12} /> Open the ban
                      </Link>
                    ) : canModerate ? (
                      <button type="button" onClick={() => setBanOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-400/30 px-3 text-xs font-medium text-rose-200 transition hover:bg-rose-400/10">
                        <Icons.ban size={12} /> Ban
                      </button>
                    ) : null}
                    <CopyButton text={allIds} label="Copy identifiers" className="h-8 px-3" />
                    <button type="button" onClick={() => loadDossier(d.player.id)} className="btn-ghost h-8 px-3 text-xs">
                      <Icons.refresh size={12} className={cn(dLoading && "animate-spin")} /> Refresh
                    </button>
                  </div>
                </div>
                <TrustRing score={d.player.trustScore} />
              </div>

              {/* signals */}
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] lg:grid-cols-4">
                <Signal
                  icon="ban"
                  label="Bans"
                  value={d.bans.filter((b) => b.active).length ? `${d.bans.filter((b) => b.active).length} active` : d.bans.length}
                  sub={d.bans.length ? `${d.bans.length} on record across your servers` : "Clean record"}
                  tone={d.bans.some((b) => b.active) ? "red" : "neutral"}
                />
                <Signal icon="shieldCheck" label="Detections" value={d.detections.last30} sub={`last 30 days · ${d.detections.total} in total`} tone={d.detections.last30 ? "amber" : "neutral"} />
                <Signal icon="link" label="Linked accounts" value={d.linked.length} sub={d.linked.some((l) => l.banned) ? "includes a banned account" : "shared IP, device or tokens"} tone={d.linked.some((l) => l.banned) ? "red" : d.linked.length ? "amber" : "neutral"} />
                <Signal
                  icon="globe"
                  label="CoreAC network"
                  value={d.network.distinctOwners ? `${d.network.distinctOwners} communit${d.network.distinctOwners === 1 ? "y" : "ies"}` : "Clean"}
                  sub={
                    d.network.distinctOwners
                      ? `${d.network.flagged ? `${d.network.strength} flag` : "not flagged"}${d.network.categories?.[0] ? ` · ${d.network.categories[0].label}` : ""}`
                      : "no cheat bans on other servers"
                  }
                  tone={d.network.strength === "strong" ? "red" : d.network.distinctOwners ? "amber" : "green"}
                />
              </div>

              {/* playtime across servers */}
              <Section title={`Playtime across your servers`} right={<span className="text-[12px] text-slate-500">{hm(d.totalPlaytimeSec)} total</span>}>
                <div className="px-5 pt-4">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
                    {d.servers.map((s, i) =>
                      s.playtimeSec > 0 ? (
                        <span
                          key={s.serverId}
                          title={`${s.serverName}: ${hm(s.playtimeSec)}`}
                          style={{ width: `${(s.playtimeSec / Math.max(1, d.totalPlaytimeSec)) * 100}%`, background: SHADES[i % SHADES.length] }}
                          className="h-full border-r border-[#0e0e10] last:border-r-0"
                        />
                      ) : null
                    )}
                  </div>
                </div>
                <div className="p-2">
                  {d.servers.map((s, i) => {
                    const share = d.totalPlaytimeSec ? Math.round((s.playtimeSec / d.totalPlaytimeSec) * 100) : 0;
                    return (
                      <div key={s.serverId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-xl px-3 py-3 transition hover:bg-white/[0.025] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_120px]">
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: SHADES[i % SHADES.length] }} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[13.5px] font-medium text-white">{s.serverName}</span>
                              {s.current && <span className="rounded border border-white/15 px-1.5 text-[10px] text-slate-400">this server</span>}
                              {s.banned && <span className="rounded border border-rose-400/25 px-1.5 text-[10px] text-rose-200">banned</span>}
                              {s.online && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Online now" />}
                            </span>
                            <span className="block text-[11.5px] text-slate-500 md:hidden">as {s.nameUsed}</span>
                          </span>
                        </span>
                        <span className="hidden min-w-0 md:block">
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">Name used</span>
                          <span className="block truncate text-[12.5px] text-slate-200">{s.nameUsed}</span>
                        </span>
                        <span className="hidden md:block" title={formatDateTime(s.firstSeenAt)}>
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">First seen</span>
                          <span className="block text-[12.5px] text-slate-300">{new Date(s.firstSeenAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                        </span>
                        <span className="hidden md:block" title={formatDateTime(s.lastSeenAt)}>
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">Last seen</span>
                          <span className="block text-[12.5px] text-slate-300">{s.online ? "now" : timeAgo(s.lastSeenAt)}</span>
                        </span>
                        <span className="col-span-1 text-right md:text-left">
                          <span className="block text-[13.5px] font-semibold tabular-nums text-white">{hm(s.playtimeSec)}</span>
                          <span className="block text-[11px] tabular-nums text-slate-500">{share}% of total</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Section>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                {/* record */}
                <Section title="Record" right={<span className="text-[12px] text-slate-500">{record.length} entries</span>}>
                  {record.length === 0 ? (
                    <p className="px-5 py-8 text-center text-[13px] text-slate-500">No bans, kicks or warnings. </p>
                  ) : (
                    <ol className="px-5 py-4">
                      {record.map((r, i) => {
                        const tone = r.kind === "ban" ? "text-rose-300 border-rose-400/30" : "text-amber-300 border-amber-400/30";
                        const Icon = r.kind === "ban" ? Icons.ban : r.kind === "kick" ? Icons.kick : Icons.warn;
                        const body = (
                          <>
                            <span className={cn("relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full border bg-[#0e0e10]", tone)}>
                              <Icon size={13} />
                            </span>
                            <span className="min-w-0 flex-1 pb-4">
                              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                                <span className="text-[13px] font-medium text-slate-100">{r.title}</span>
                                <span className="text-[11px] tabular-nums text-slate-500">{formatDateTime(r.at)}</span>
                              </span>
                              <span className="block text-[12.5px] text-slate-400">{r.detail}</span>
                              <span className="block text-[11px] text-slate-600">
                                by {r.by === "AntiCheat" ? "CoreAC" : r.by}
                                {r.tag ? ` · ${r.tag}` : ""}
                              </span>
                            </span>
                          </>
                        );
                        return (
                          <li key={i} className="relative">
                            {i < record.length - 1 && <span className="absolute bottom-0 left-[13px] top-7 w-px bg-white/[0.07]" />}
                            {r.href ? (
                              <Link href={r.href} className="flex gap-3 rounded-lg transition hover:bg-white/[0.02]">
                                {body}
                              </Link>
                            ) : (
                              <div className="flex gap-3">{body}</div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </Section>

                <div className="space-y-5">
                  <Section title="Detections" right={<Link href={`/dashboard/servers/${serverId}/detections`} className="text-[12px] text-slate-500 hover:text-white">All detections →</Link>}>
                    {d.detections.byType.length === 0 ? (
                      <p className="px-5 py-6 text-center text-[13px] text-slate-500">Nothing detected on this server.</p>
                    ) : (
                      <ul className="space-y-3 px-5 py-4">
                        {d.detections.byType.map((t) => (
                          <li key={t.type}>
                            <div className="mb-1 flex items-center justify-between gap-3 text-[12.5px]">
                              <span className="truncate text-slate-200">{t.label}</span>
                              <span className="shrink-0 text-[11px] text-slate-500">
                                <b className="font-semibold text-slate-200">{t.count}</b>
                                {t.last ? ` · ${timeAgo(t.last)}` : ""}
                              </span>
                            </div>
                            <div className="h-1 overflow-hidden rounded-full bg-white/[0.05]">
                              <div className="h-full rounded-full bg-white/60" style={{ width: `${Math.max(4, (t.count / d.detections.byType[0].count) * 100)}%` }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  <Section title="Linked accounts">
                    {d.linked.length === 0 ? (
                      <p className="px-5 py-6 text-center text-[13px] text-slate-500">No other account shares an IP, device or hardware tokens.</p>
                    ) : (
                      <ul className="p-2">
                        {d.linked.map((l) => (
                          <li key={l.id}>
                            <button type="button" onClick={() => open(l.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.03]">
                              <Avatar name={l.name} size={30} tone={l.banned ? "red" : "neutral"} />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="truncate text-[13px] text-white">{l.name}</span>
                                  {l.banned && <span className="text-[10.5px] text-rose-300">banned</span>}
                                  {l.online && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                                </span>
                                <span className="block truncate text-[11.5px] text-slate-500">via {l.via.join(" · ")}</span>
                              </span>
                              <Icons.chevronRight size={14} className="text-slate-600" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  <Section title="Names used" right={<span className="text-[12px] text-slate-500">{d.names.length}</span>}>
                    <ul className="flex flex-wrap gap-1.5 px-5 py-4">
                      {d.names.map((n) => (
                        <li key={n.name} title={`${n.where} · ${formatDateTime(n.at)}`} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[12px] text-slate-200">
                          {n.name}
                          <span className="ml-1.5 text-[10.5px] text-slate-500">{timeAgo(n.at)}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                </div>
              </div>

              <Section title="Identifiers" right={<span className="text-[11.5px] text-slate-600">click to copy</span>}>
                <div className="flex flex-wrap gap-2 px-5 py-4">
                  <IdentChip label="License" value={d.player.license} />
                  <IdentChip label="Discord" value={d.player.discord} />
                  <IdentChip label="Steam" value={d.player.steam} />
                  <IdentChip label="IP" value={d.player.ip} masked />
                  <IdentChip label="Device" value={d.player.deviceId} />
                  <span className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11.5px]">
                    <span className="font-semibold uppercase tracking-wide text-slate-500">HW tokens</span>
                    <span className="font-mono text-slate-200">{d.player.tokens}</span>
                  </span>
                </div>
              </Section>
            </>
          )}
        </div>
      )}

      {banOpen && d && (
        <OfflineBanDialog
          serverId={serverId}
          initialName={d.player.name}
          initialIdentifiers={[d.player.license, d.player.discord, d.player.steam].filter(Boolean).join("\n")}
          onClose={() => setBanOpen(false)}
          onDone={() => loadDossier(d.player.id)}
        />
      )}
    </div>
  );
}
