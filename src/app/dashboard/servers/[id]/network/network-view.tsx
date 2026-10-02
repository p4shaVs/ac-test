"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons, type IconName } from "@/components/icons";
import { Avatar, Ago } from "@/components/log-ui";
import { cn } from "@/lib/utils";

type Action = "OFF" | "LOG" | "KICK";
type Strength = "weak" | "strong";

export interface Category {
  type: string;
  label: string;
  count: number;
}

export interface OnlineFlag {
  id: string;
  name: string;
  strength: Strength;
  communities: number;
  summary: string;
  categories: Category[];
}

export interface FlagRow {
  id: string;
  playerId: string | null;
  playerName: string;
  action: "LOG" | "KICK";
  live: boolean;
  strength: Strength | null;
  communities: number;
  categories: Category[];
  at: string;
}

export interface SharedRow {
  id: string;
  playerName: string;
  label: string;
  at: string;
}

interface Reputation {
  flagged: boolean;
  strength: "none" | Strength;
  distinctOwners: number;
  evidenceOwners: number;
  totalBans: number;
  automatic: number;
  manual: number;
  categories: Category[];
  firstBanAt: string | null;
  lastBanAt: string | null;
  olderBans: number;
}

const MODES: { key: Action; label: string; desc: string; icon: IconName }[] = [
  { key: "OFF", label: "Off", desc: "Players are not checked against the network.", icon: "x" },
  { key: "LOG", label: "Log only", desc: "Flagged players get in; you see it here, in Detections and on Discord.", icon: "eye" },
  { key: "KICK", label: "Keep them out", desc: "Flagged players are refused at the door — and removed if flagged mid-game.", icon: "ban" },
];

function StrengthPill({ s }: { s: Strength | null }) {
  if (!s) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[10.5px] font-semibold",
        s === "strong" ? "border-rose-400/30 bg-rose-400/[0.08] text-rose-200" : "border-amber-400/30 bg-amber-400/[0.08] text-amber-200"
      )}
      title={s === "strong" ? "Backed by automatic detections or cheat bans on at least two other communities" : "Some of those bans are staff bans with an unclear reason"}
    >
      {s === "strong" ? "Strong" : "Weak"}
    </span>
  );
}

function Chips({ list }: { list: Category[] }) {
  if (!list.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {list.map((c) => (
        <span key={c.type} className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10.5px] text-slate-300">
          {c.label}
          {c.count > 1 && <span className="ml-1 text-slate-500">×{c.count}</span>}
        </span>
      ))}
    </span>
  );
}

function Panel({ title, icon, right, children }: { title: string; icon: IconName; right?: React.ReactNode; children: React.ReactNode }) {
  const Icon = Icons[icon];
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0e0e10]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
          <Icon size={14} className="text-slate-400" /> {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function NetworkView({
  serverId,
  policy: initialPolicy,
  stats,
  onlineFlags,
  onlineCount,
  flags,
  shared: initialShared,
  minOwners,
  windowDays,
  canConfigure = true,
}: {
  /** Team members without "Configure protection" see the network read-only. */
  canConfigure?: boolean;
  serverId: string;
  policy: { action: Action; contribute: boolean; strongOnly: boolean };
  stats: { communities: number; networkBans: number; flags30: number; removed30: number; myShared: number };
  onlineFlags: OnlineFlag[];
  onlineCount: number;
  flags: FlagRow[];
  shared: SharedRow[];
  minOwners: number;
  windowDays: number;
}) {
  const router = useRouter();
  const [policy, setPolicy] = useState(initialPolicy);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(initialShared);
  const [ids, setIds] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ reputation: Reputation; summary: string | null } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    const res = await fetch(`/api/servers/${serverId}/network`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Request failed");
    return json.data;
  }

  async function savePolicy(patch: Partial<typeof policy>) {
    const prev = policy;
    const next = { ...policy, ...patch };
    setPolicy(next);
    setSaving(true);
    setError(null);
    try {
      const data = await post({ action: "policy", policy: patch });
      setPolicy(data.policy);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      setPolicy(prev);
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function withdraw(row: SharedRow) {
    if (!confirm(`Stop sharing the ban of ${row.playerName} with the network? It stays banned on your server.`)) return;
    try {
      await post({ action: "withdraw", id: row.id });
      setShared((s) => s.filter((x) => x.id !== row.id));
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not withdraw");
    }
  }

  async function check() {
    if (!ids.trim()) return;
    setChecking(true);
    setCheckError(null);
    setResult(null);
    try {
      setResult(await post({ action: "check", identifiers: ids }));
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : "Look-up failed");
    } finally {
      setChecking(false);
    }
  }

  const rep = result?.reputation;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------- protection */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0e10] bg-gradient-to-br from-white/[0.035] to-transparent">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">Protection on this server</p>
            <p className="mt-0.5 text-[13px] text-slate-300">
              {policy.action === "OFF"
                ? "The network is not checked."
                : policy.action === "LOG"
                  ? "Flagged players are let in and reported."
                  : policy.strongOnly
                    ? "Strong flags are kept out; weak ones are reported."
                    : "Every flagged player is kept out."}
            </p>
          </div>
          {canConfigure ? (
            <span className={cn("text-[12px]", error ? "text-rose-300" : "text-slate-500")}>{error ?? (saving ? "Saving…" : saved ? "Saved" : "")}</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
              <Icons.lock size={12} /> View only
            </span>
          )}
        </div>
        <div className="grid gap-px bg-white/[0.06] sm:grid-cols-3">
          {MODES.map((m) => {
            const on = policy.action === m.key;
            const Icon = Icons[m.icon];
            return (
              <button
                key={m.key}
                type="button"
                disabled={saving || !canConfigure}
                onClick={() => !on && savePolicy({ action: m.key })}
                className={cn("relative bg-[#0e0e10] px-6 py-4 text-left transition disabled:cursor-default", on ? "bg-white/[0.05]" : canConfigure && "hover:bg-white/[0.025]")}
                aria-pressed={on}
              >
                {on && <span className="absolute inset-x-6 top-0 h-[2px] rounded-full bg-white" />}
                <span className="flex items-center gap-2">
                  <Icon size={14} className={on ? "text-white" : "text-slate-500"} />
                  <span className={cn("text-[13.5px] font-semibold", on ? "text-white" : "text-slate-300")}>{m.label}</span>
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-slate-500">{m.desc}</span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-px border-t border-white/[0.06] bg-white/[0.06] sm:grid-cols-2">
          {[
            {
              key: "contribute" as const,
              label: "Share my cheat bans",
              desc: "Your permanent bans for cheating feed the network as anonymous hashes. Behaviour bans (toxicity, RDM…) are never shared.",
            },
            {
              key: "strongOnly" as const,
              label: "Keep out only strong flags",
              desc: `Block only players with automatic detections or cheat bans on ${minOwners}+ other communities; weaker flags are reported.`,
            },
          ].map((t) => {
            const on = policy[t.key];
            const disabled = saving || !canConfigure || (t.key === "strongOnly" && policy.action !== "KICK");
            return (
              <button
                key={t.key}
                type="button"
                disabled={disabled}
                onClick={() => savePolicy({ [t.key]: !on })}
                className="flex items-start gap-3.5 bg-[#0e0e10] px-6 py-4 text-left transition hover:bg-white/[0.025] disabled:cursor-not-allowed disabled:opacity-50"
                aria-pressed={on}
              >
                <span className={cn("switch mt-0.5 shrink-0", on ? "switch-on" : "switch-off")}>
                  <span className={cn("switch-knob", on ? "translate-x-[18px] bg-[#0a0a0b]" : "translate-x-[3px] bg-slate-400")} />
                </span>
                <span>
                  <span className="block text-[13px] font-medium text-slate-100">{t.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-500">{t.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------ stats */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] lg:grid-cols-4">
        {[
          { label: "Communities", value: stats.communities, sub: "sharing bans in the network" },
          { label: "Cheat bans shared", value: stats.networkBans, sub: `${stats.myShared} of them yours` },
          { label: "Flags here", value: stats.flags30, sub: "last 30 days" },
          { label: "Kept out / removed", value: stats.removed30, sub: "last 30 days" },
        ].map((s) => (
          <div key={s.label} className="bg-[#0e0e10] px-5 py-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">{s.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{s.value.toLocaleString("en-US")}</p>
            <p className="mt-0.5 text-[11.5px] text-slate-500">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {/* ------------------------------------------------- online now */}
          <Panel title="Flagged and online now" icon="activity" right={<span className="text-[12px] text-slate-500">{onlineCount} online checked</span>}>
            {onlineFlags.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-slate-500">Nobody playing right now is flagged by the network.</p>
            ) : (
              <ul className="p-2">
                {onlineFlags.map((f) => (
                  <li key={f.id}>
                    <Link href={`/dashboard/servers/${serverId}/lookup?p=${f.id}`} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-white/[0.03]">
                      <Avatar name={f.name} tone={f.strength === "strong" ? "red" : "amber"} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-medium text-white">{f.name}</span>
                          <StrengthPill s={f.strength} />
                        </span>
                        <span className="mt-1 block">
                          <Chips list={f.categories} />
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[11.5px] text-slate-500">
                        <b className="text-[15px] font-semibold text-white">{f.communities}</b>
                        <span className="block">communities</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* ---------------------------------------------------- recent flags */}
          <Panel title="Recent flags on this server" icon="globe" right={<span className="text-[12px] text-slate-500">{flags.length}</span>}>
            {flags.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-slate-500">
                No flags yet. When a player banned for cheating on {minOwners}+ other communities joins, it shows here.
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {flags.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 px-5 py-3.5">
                    <Avatar name={f.playerName} size={32} tone={f.action === "KICK" ? "red" : "neutral"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {f.playerId ? (
                          <Link href={`/dashboard/servers/${serverId}/lookup?p=${f.playerId}`} className="truncate text-[13.5px] font-medium text-white hover:underline">
                            {f.playerName}
                          </Link>
                        ) : (
                          <span className="truncate text-[13.5px] font-medium text-white">{f.playerName}</span>
                        )}
                        <StrengthPill s={f.strength} />
                        <span
                          className={cn(
                            "rounded-full border px-2 text-[10.5px]",
                            f.action === "KICK" ? "border-rose-400/25 text-rose-200" : "border-white/10 text-slate-400"
                          )}
                        >
                          {f.action === "KICK" ? (f.live ? "Removed while playing" : "Kept out at the door") : f.live ? "Flagged while playing" : "Logged on join"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-slate-500">
                        <span>
                          {f.communities} communit{f.communities === 1 ? "y" : "ies"}
                        </span>
                        <Chips list={f.categories} />
                      </div>
                    </div>
                    <span className="shrink-0 text-[11.5px] text-slate-500">
                      <Ago at={f.at} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          {/* -------------------------------------------------------- look-up */}
          <Panel title="Check an identifier" icon="search">
            <div className="space-y-3 p-5">
              <textarea
                value={ids}
                onChange={(e) => setIds(e.target.value)}
                rows={2}
                spellCheck={false}
                placeholder="license:…, discord:…, steam:… or a SteamID64"
                className="input resize-none font-mono text-[12.5px]"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] text-slate-600">Counts and cheat types only — never another server's name.</span>
                <button type="button" onClick={check} disabled={checking || !ids.trim()} className="btn-primary h-9 shrink-0 px-4 text-xs">
                  {checking ? "Checking…" : "Check"}
                </button>
              </div>
              {checkError && <p className="text-[12px] text-rose-300">{checkError}</p>}
              {rep && (
                <div className={cn("rounded-xl border p-4", rep.flagged ? (rep.strength === "strong" ? "border-rose-400/25 bg-rose-400/[0.05]" : "border-amber-400/25 bg-amber-400/[0.05]") : "border-emerald-400/20 bg-emerald-400/[0.04]")}>
                  <div className="flex items-center gap-2">
                    {rep.flagged ? <Icons.alert size={15} className={rep.strength === "strong" ? "text-rose-300" : "text-amber-200"} /> : <Icons.check size={15} className="text-emerald-300" />}
                    <span className="text-[13.5px] font-semibold text-white">
                      {rep.flagged ? `Flagged (${rep.strength})` : rep.distinctOwners ? "Not flagged" : "Clean"}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-slate-400">
                    {rep.distinctOwners
                      ? result?.summary
                      : rep.olderBans
                        ? `Only bans older than ${windowDays} days — they no longer count.`
                        : "No other community has banned this player for cheating."}
                  </p>
                  {rep.distinctOwners > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-3 text-[11.5px]">
                      <span>
                        <span className="block text-slate-500">Automatic</span>
                        <b className="text-[14px] text-white">{rep.automatic}</b>
                      </span>
                      <span>
                        <span className="block text-slate-500">Staff</span>
                        <b className="text-[14px] text-white">{rep.manual}</b>
                      </span>
                      <span>
                        <span className="block text-slate-500">Last ban</span>
                        <b className="text-[13px] text-white">{rep.lastBanAt ? <Ago at={rep.lastBanAt} /> : "—"}</b>
                      </span>
                    </div>
                  )}
                  {rep.categories.length > 0 && (
                    <div className="mt-3">
                      <Chips list={rep.categories} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </Panel>

          {/* --------------------------------------------------- your shares */}
          <Panel title="Your shared bans" icon="layers" right={<span className="text-[12px] text-slate-500">{shared.length}</span>}>
            {!policy.contribute && <p className="border-b border-white/[0.06] px-5 py-2.5 text-[12px] text-amber-200/90">Sharing is off — new bans stay private.</p>}
            {shared.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-slate-500">Nothing shared from this server yet.</p>
            ) : (
              <ul className="max-h-[360px] divide-y divide-white/[0.05] overflow-y-auto">
                {shared.map((r) => (
                  <li key={r.id} className="group flex items-center gap-3 px-5 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-slate-100">{r.playerName}</span>
                      <span className="block truncate text-[11.5px] text-slate-500">
                        {r.label} · <Ago at={r.at} />
                      </span>
                    </span>
                    {canConfigure && <button type="button" onClick={() => withdraw(r)} className="text-[11.5px] text-slate-500 opacity-0 transition hover:text-rose-300 group-hover:opacity-100 focus:opacity-100">
                      Withdraw
                    </button>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* ------------------------------------------------- how it decides */}
          <Panel title="How the network decides" icon="info">
            <ul className="space-y-2.5 px-5 py-4 text-[12.5px] leading-relaxed text-slate-400">
              <li>
                <b className="font-medium text-slate-200">Flagged</b> — banned on at least {minOwners} other communities (one owner's servers count once, so nobody can brand a player alone).
              </li>
              <li>
                <b className="font-medium text-slate-200">Strong</b> — those bans come from automatic CoreAC detections or staff bans for cheating. <b className="font-medium text-slate-200">Weak</b> — some are staff bans with an unclear reason.
              </li>
              <li>
                <b className="font-medium text-slate-200">Fair</b> — behaviour bans are never shared, bans older than {windowDays} days stop counting, and an unban or a false-ban fix takes the share back.
              </li>
              <li>
                <b className="font-medium text-slate-200">Private</b> — only one-way hashes of licence, Steam and Discord are kept; no IPs, and no community ever sees another's name.
              </li>
              <li>
                <b className="font-medium text-slate-200">Never a ban</b> — the network only logs or keeps a player out; bans are always your own.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
