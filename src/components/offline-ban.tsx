"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icons } from "@/components/icons";
import { Avatar } from "@/components/log-ui";
import { DURATION_UNITS, MAX_BAN_MINUTES, identityFrom, parseIdentifiers, type ParsedIdent } from "@/lib/identifiers";
import { cn, timeAgo } from "@/lib/utils";
import { Portal } from "@/components/portal";

interface KnownPlayer {
  id: string;
  name: string;
  license: string | null;
  steam: string | null;
  discord: string | null;
  online: boolean;
  trustScore: number;
  playtimeSec: number;
  lastSeenAt: string;
  activeBan: { reason: string } | null;
}

const KIND_LABEL: Record<ParsedIdent["kind"], string> = {
  license: "Licence",
  steam: "Steam",
  discord: "Discord",
  ip: "IP",
  license2: "license2",
  fivem: "FiveM",
  xbl: "Xbox",
  live: "Live",
  unknown: "?",
};

const QUICK_REASONS = ["Cheating", "Cheat menu / executor", "Exploiting", "Ban evasion", "Modded weapons", "Griefing"];
const QUICK_DURATIONS: { label: string; minutes: number }[] = [
  { label: "1 h", minutes: 60 },
  { label: "12 h", minutes: 720 },
  { label: "1 d", minutes: 1440 },
  { label: "3 d", minutes: 4320 },
  { label: "7 d", minutes: 10080 },
  { label: "30 d", minutes: 43200 },
];

function short(v: string) {
  const s = v.replace(/^(license|steam|discord):/, "");
  return s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
}

function humanMinutes(min: number) {
  if (min % 10080 === 0) return `${min / 10080} week${min === 10080 ? "" : "s"}`;
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"}`;
  if (min % 60 === 0) return `${min / 60} hour${min === 60 ? "" : "s"}`;
  return `${min} minute${min === 1 ? "" : "s"}`;
}

export function OfflineBanDialog({
  serverId,
  initialName = "",
  initialIdentifiers = "",
  onClose,
  onDone,
}: {
  serverId: string;
  initialName?: string;
  initialIdentifiers?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [idText, setIdText] = useState(initialIdentifiers);
  const [reason, setReason] = useState("");
  const [name, setName] = useState(initialName);
  const [permanent, setPermanent] = useState(true);
  const [amount, setAmount] = useState(7);
  const [unit, setUnit] = useState<(typeof DURATION_UNITS)[number]["key"]>("d");
  const [known, setKnown] = useState<KnownPlayer | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; code: string } | null>(null);
  const idRef = useRef<HTMLTextAreaElement>(null);

  const parsed = useMemo(() => parseIdentifiers(idText), [idText]);
  const identity = useMemo(() => identityFrom(parsed), [parsed]);
  const minutes = Math.min(MAX_BAN_MINUTES, Math.max(1, Math.floor(amount || 0)) * (DURATION_UNITS.find((u) => u.key === unit)?.minutes ?? 1440));
  const endsAt = permanent ? null : new Date(Date.now() + minutes * 60_000);

  useEffect(() => {
    idRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Is this someone the server already knows?
  const probe = "identity" in identity ? identity.identity.license ?? identity.identity.discord ?? identity.identity.steam : null;
  useEffect(() => {
    if (!probe || !("identity" in identity)) {
      setKnown(null);
      return;
    }
    const ids = identity.identity;
    let cancelled = false;
    setLooking(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/lookup?q=${encodeURIComponent(probe)}`, { cache: "no-store" });
        const json = await res.json();
        const hit = ((json?.data?.results ?? []) as KnownPlayer[]).find(
          (p) => (ids.license && p.license === ids.license) || (ids.discord && p.discord === ids.discord) || (ids.steam && p.steam === ids.steam)
        );
        if (!cancelled) setKnown(hit ?? null);
      } catch {
        if (!cancelled) setKnown(null);
      } finally {
        if (!cancelled) setLooking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe, serverId]);

  const canSubmit = "identity" in identity && reason.trim().length >= 2 && !busy && !known?.activeBan;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/bans/offline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), reason: reason.trim(), identifiers: idText, durationMinutes: permanent ? null : minutes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not ban");
      setDone({ id: json.data.id, code: json.data.code });
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not ban");
    } finally {
      setBusy(false);
    }
  }

  const usable = parsed.filter((p) => p.usable);

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-3 py-6 sm:py-12" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="animate-rise w-full max-w-[820px] overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0e] shadow-pop" role="dialog" aria-modal="true" aria-label="Offline ban">
        {/* Header */}
        <div className="flex items-start gap-3.5 border-b border-white/[0.07] px-6 py-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-rose-400/25 bg-rose-400/[0.08] text-rose-300">
            <Icons.ban size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-white">Ban someone who is not online</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500">Saved now — the game server refuses them at the door within a minute.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white">
            <Icons.x size={16} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
              <Icons.check size={24} />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-white">{name.trim() || known?.name || "Player"} is banned</h3>
            <p className="mt-1 font-mono text-sm text-slate-400">Ban ID {done.code}</p>
            <p className="mt-2 max-w-sm text-[12.5px] text-slate-500">
              {permanent ? "Permanent." : `Ends ${endsAt?.toLocaleString("en-GB")}.`} {known?.online ? "They are online — the server drops them now." : ""}
            </p>
            <div className="mt-6 flex gap-2">
              <Link href={`/dashboard/servers/${serverId}/bans?ban=${done.id}`} className="btn-secondary h-9 px-4 text-xs">
                <Icons.external size={13} /> Open the ban
              </Link>
              <button
                type="button"
                onClick={() => {
                  setDone(null);
                  setIdText("");
                  setName("");
                  setReason("");
                  setKnown(null);
                }}
                className="btn-ghost h-9 px-4 text-xs"
              >
                Ban another
              </button>
              <button type="button" onClick={onClose} className="btn-primary h-9 px-4 text-xs">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-[minmax(0,1fr)_300px]">
              {/* ---------------------------------------------------- form */}
              <div className="space-y-5 px-6 py-5">
                <div>
                  <label className="mb-1.5 flex items-center justify-between text-[12px] font-medium text-slate-300">
                    Identifiers
                    <span className="text-[11px] font-normal text-slate-600">licence · Discord · Steam (ID64 works) · IP</span>
                  </label>
                  <textarea
                    ref={idRef}
                    value={idText}
                    onChange={(e) => setIdText(e.target.value)}
                    rows={3}
                    spellCheck={false}
                    placeholder={"license:4f9c…\ndiscord:1263439606020313099"}
                    className="input min-h-[84px] resize-y font-mono text-[12.5px] leading-relaxed"
                  />
                  {parsed.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {parsed.map((p, i) => (
                        <span
                          key={i}
                          title={p.note ?? p.value ?? p.raw}
                          className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11.5px]",
                            !p.usable
                              ? "border-dashed border-rose-400/30 text-rose-300/90"
                              : p.kind === "ip"
                                ? "border-amber-400/25 bg-amber-400/[0.05] text-amber-100"
                                : "border-white/[0.12] bg-white/[0.04] text-slate-100"
                          )}
                        >
                          {p.usable ? <Icons.check size={11} className={p.kind === "ip" ? "text-amber-300" : "text-emerald-300"} /> : <Icons.x size={11} />}
                          <span className="font-semibold uppercase tracking-wide text-[10px] opacity-70">{KIND_LABEL[p.kind]}</span>
                          <span className="font-mono">{p.value ? short(p.value) : short(p.raw)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {parsed.some((p) => p.note && (!p.usable || p.kind === "ip" || p.kind === "steam")) && (
                    <ul className="mt-2 space-y-0.5 text-[11.5px] text-slate-500">
                      {parsed
                        .filter((p) => p.note)
                        .map((p, i) => (
                          <li key={i}>
                            <span className="font-mono text-slate-400">{short(p.raw)}</span> — {p.note}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-slate-300">Reason</label>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why — shown to the player when they try to join" className="input h-10 text-[13px]" />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK_REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setReason(r)}
                        className={cn(
                          "h-7 rounded-full border px-2.5 text-[11.5px] transition",
                          reason === r ? "border-white/60 text-white" : "border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200"
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 flex items-center justify-between text-[12px] font-medium text-slate-300">
                    Name <span className="text-[11px] font-normal text-slate-600">optional · for your records</span>
                  </label>
                  <div className="flex gap-2">
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder={known?.name ?? "Unknown player"} className="input h-10 text-[13px]" />
                    {known && name !== known.name && (
                      <button type="button" onClick={() => setName(known.name)} className="btn-ghost h-10 shrink-0 px-3 text-xs">
                        Use “{known.name.slice(0, 16)}”
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ------------------------------------------------- summary */}
              <div className="space-y-5 border-t border-white/[0.07] bg-white/[0.015] px-6 py-5 md:border-l md:border-t-0">
                <div>
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">Who this is</p>
                  {"error" in identity ? (
                    <p className="text-[12.5px] text-slate-500">Paste at least one licence, Discord or Steam ID.</p>
                  ) : looking ? (
                    <div className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />
                  ) : known ? (
                    <div className="rounded-xl border border-white/[0.08] p-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={known.name} size={34} tone={known.activeBan ? "red" : "neutral"} />
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium text-white">{known.name}</p>
                          <p className="text-[11.5px] text-slate-500">
                            {known.online ? <span className="text-emerald-300">Online now</span> : `Last seen ${timeAgo(known.lastSeenAt)}`} · {Math.round(known.playtimeSec / 3600)} h played
                          </p>
                        </div>
                      </div>
                      {known.activeBan && <p className="mt-2 text-[11.5px] text-rose-300">Already banned: {known.activeBan.reason}</p>}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-white/[0.1] p-3 text-[12px] text-slate-500">Not seen on this server yet — the ban waits for them.</p>
                  )}
                  {usable.length > 0 && (
                    <p className="mt-2 text-[11.5px] text-slate-500">
                      Matches on {usable.map((p) => KIND_LABEL[p.kind]).join(", ")}
                      {usable.some((p) => p.kind === "ip") ? " (IP only with Ban Ip Address on)" : ""}.
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">How long</p>
                  <div className="grid grid-cols-2 rounded-xl border border-white/10 p-1">
                    {[
                      { k: true, label: "Permanent" },
                      { k: false, label: "Temporary" },
                    ].map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => setPermanent(o.k)}
                        className={cn("h-8 rounded-lg text-[12.5px] font-medium transition", permanent === o.k ? "bg-white text-[#0a0a0b]" : "text-slate-400 hover:text-white")}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {!permanent && (
                    <div className="mt-3 space-y-2.5">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={1}
                          value={amount}
                          onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                          className="input h-10 w-24 text-center tabular-nums"
                          aria-label="Duration"
                        />
                        <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} className="input h-10 flex-1 text-[13px]" aria-label="Unit">
                          {DURATION_UNITS.map((u) => (
                            <option key={u.key} value={u.key} className="bg-[#141416]">
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {QUICK_DURATIONS.map((q) => (
                          <button
                            key={q.label}
                            type="button"
                            onClick={() => {
                              const u = [...DURATION_UNITS].reverse().find((x) => q.minutes % x.minutes === 0)!;
                              setUnit(u.key);
                              setAmount(q.minutes / u.minutes);
                            }}
                            className={cn("text-[12px] transition", minutes === q.minutes ? "font-semibold text-white" : "text-slate-500 hover:text-slate-200")}
                          >
                            {q.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-3 rounded-xl border border-white/[0.07] px-3 py-2.5">
                    {permanent ? (
                      <p className="text-[12.5px] text-slate-200">
                        Never expires <span className="text-slate-500">· lift it from Bans</span>
                      </p>
                    ) : (
                      <p className="text-[12.5px] text-slate-200">
                        {humanMinutes(minutes)} <span className="text-slate-500">· ends {endsAt!.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-white/[0.07] px-6 py-4 sm:flex-row sm:items-center">
              <p className={cn("min-w-0 flex-1 text-[12px]", error ? "text-rose-300" : "text-slate-600")}>
                {error ?? ("error" in identity && parsed.length ? identity.error : "Shown in Admin Logs and posted to your ban webhook.")}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn-ghost h-10 px-4 text-xs">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-500 px-5 text-[13px] font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icons.ban size={14} /> {busy ? "Banning…" : permanent ? "Ban permanently" : `Ban for ${humanMinutes(minutes)}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </Portal>
  );
}
