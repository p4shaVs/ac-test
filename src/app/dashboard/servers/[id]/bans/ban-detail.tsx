"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icons, type IconName } from "@/components/icons";
import { Avatar, CopyButton, Field, IdentChip, JsonBlock, Tabs } from "@/components/log-ui";
import { formatDateTime, relativeDays, safeMediaUrl, timeAgo, cn } from "@/lib/utils";
import type { BanHistoryEntry, BanNote } from "@/lib/ban-ops";
import { AUTO_BANNERS, StatusPill } from "./ban-status";
import { ReplayViewer } from "./replay-viewer";
import { Portal } from "@/components/portal";

interface Shot {
  id: string;
  url: string | null;
  seq: number;
  completedAt: string | null;
}

interface BanDetailData {
  ban: {
    id: string;
    code: string | null;
    playerId: string | null;
    playerName: string;
    reason: string;
    bannedBy: string;
    active: boolean;
    permanent: boolean;
    falsePositive: boolean;
    createdAt: string;
    expiresAt: string | null;
    unbannedAt: string | null;
    unbannedBy: string | null;
    evasionOf: string | null;
    identifiers: {
      license: string | null;
      steam: string | null;
      discord: string | null;
      ip: string | null;
      deviceId: string | null;
      tokens: number;
    };
  };
  detection: {
    id: string;
    type: string;
    label: string;
    severity: string;
    action: string | null;
    createdAt: string;
    details: Record<string, unknown> | null;
    evidence: { label: string; value: string }[];
    replayFrames: number;
    screenshots: Shot[];
  } | null;
  linked: {
    parent: { id: string; code: string | null; playerName: string; active: boolean; createdAt: string } | null;
    children: { id: string; code: string | null; playerName: string; active: boolean; createdAt: string }[];
  };
  player: {
    id: string;
    name: string;
    online: boolean;
    trustScore: number;
    playtimeSec: number;
    firstSeenAt: string;
    lastSeenAt: string;
  } | null;
  notes: BanNote[];
  history: BanHistoryEntry[];
}

type Tab = "details" | "history" | "notes" | "json";

const HISTORY_STYLE: Record<BanHistoryEntry["kind"], { icon: IconName; cls: string }> = {
  ban: { icon: "ban", cls: "text-rose-300 bg-rose-400/10 ring-rose-400/20" },
  evasion: { icon: "link", cls: "text-rose-300 bg-rose-400/10 ring-rose-400/20" },
  other_ban: { icon: "ban", cls: "text-slate-300 bg-white/[0.05] ring-white/10" },
  unban: { icon: "undo", cls: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/20" },
  false_positive: { icon: "check", cls: "text-amber-200 bg-amber-400/10 ring-amber-400/20" },
  detection: { icon: "scan", cls: "text-slate-200 bg-white/[0.05] ring-white/10" },
  kick: { icon: "kick", cls: "text-amber-300 bg-amber-400/10 ring-amber-400/20" },
  warn: { icon: "warn", cls: "text-amber-300 bg-amber-400/10 ring-amber-400/20" },
  note: { icon: "note", cls: "text-slate-300 bg-white/[0.05] ring-white/10" },
};

function hours(sec: number) {
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(sec < 36000 ? 1 : 0)} h`;
}

export function BanDetail({
  serverId,
  banId,
  onClose,
  onChanged,
}: {
  serverId: string;
  banId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<BanDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState<string | null>(null);
  const [replay, setReplay] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/bans/${banId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not load this ban");
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this ban");
    }
  }, [serverId, banId]);

  useEffect(() => {
    setData(null);
    setTab("details");
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (shot) setShot(null);
      else if (!replay) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, replay, shot]);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/bans/${banId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Request failed");
      await load();
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function unban() {
    if (!data || !confirm(`Lift the ban on ${data.ban.playerName}?`)) return;
    setBusy("unban");
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/unban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not lift the ban");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not lift the ban");
    } finally {
      setBusy(null);
    }
  }

  async function fixFalseBan() {
    if (!data) return;
    const msg = data.ban.active
      ? `Correct this ban as a false positive?\n\nThe ban is lifted (with any ban-evasion bans linked to it), ${data.ban.playerName}'s trust score goes back to 100 and your network-ban report is withdrawn.`
      : `Record this lifted ban as a false positive? ${data.ban.playerName}'s trust score goes back to 100.`;
    if (!confirm(msg)) return;
    await post({ action: "fixFalseBan" }, "fix");
  }

  const b = data?.ban;
  const d = data?.detection;
  const auto = b ? AUTO_BANNERS.has(b.bannedBy) : false;
  const shots = (d?.screenshots ?? []).map((s) => ({ ...s, safe: safeMediaUrl(s.url) })).filter((s) => s.safe);

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-3 py-6 sm:py-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="animate-rise relative flex w-full max-w-[860px] flex-col rounded-2xl border border-white/10 bg-[#0c0c0e] shadow-pop" role="dialog" aria-modal="true" aria-label="Ban details">
        {/* Header */}
        <div className="flex items-start gap-4 px-6 pb-4 pt-5">
          <Avatar name={b?.playerName ?? "…"} size={48} tone={b ? (b.active ? "red" : b.falsePositive ? "amber" : "neutral") : "neutral"} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-white">{b?.playerName ?? "Loading…"}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[12px] text-slate-500">
              {b?.code ? <span>#{b.code}</span> : b ? <span>no ban ID</span> : null}
              {b && <span className="text-slate-700">·</span>}
              {b && <span className="font-sans">{formatDateTime(b.createdAt)}</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white">
            <Icons.x size={16} />
          </button>
        </div>

        {b && (
          <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
            <StatusPill b={b} />
            <Link
              href={`/dashboard/servers/${serverId}/lookup?q=${encodeURIComponent((b.identifiers.license ?? b.identifiers.discord ?? b.playerName).replace(/^(license|discord):/, ""))}`}
              className="inline-flex h-6 items-center gap-1.5 rounded-full border border-white/10 px-2.5 text-[11px] font-medium text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              <Icons.search size={11} /> Lookup
            </Link>
            {d && d.replayFrames > 0 && (
              <button type="button" onClick={() => setReplay(true)} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-white/10 px-2.5 text-[11px] font-medium text-slate-300 transition hover:border-white/25 hover:text-white">
                <Icons.play size={11} /> Watch replay
              </button>
            )}
            {b.evasionOf && (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-white/10 px-2.5 text-[11px] text-slate-400">
                <Icons.link size={11} /> Evasion of #{b.evasionOf}
              </span>
            )}
            {!b.falsePositive && (
              <button type="button" onClick={fixFalseBan} disabled={busy !== null} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-amber-400/25 px-2.5 text-[11px] font-medium text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-50">
                <Icons.wand size={11} /> Fix false ban
              </button>
            )}
            {b.active && (
              <button type="button" onClick={unban} disabled={busy !== null} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-emerald-400/25 px-2.5 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-400/10 disabled:opacity-50">
                <Icons.undo size={11} /> {busy === "unban" ? "Lifting…" : "Unban"}
              </button>
            )}
          </div>
        )}

        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "details", label: "Details" },
            { key: "history", label: "History", count: data?.history.length },
            { key: "notes", label: "Notes", count: data?.notes.length },
            { key: "json", label: "JSON" },
          ]}
        />

        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3.5 py-2.5 text-[12.5px] text-rose-200">
            <Icons.alert size={14} /> {error}
          </div>
        )}

        <div className="min-h-[300px] px-6 py-5">
          {!data && !error && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
              ))}
            </div>
          )}

          {data && b && tab === "details" && (
            <div className="space-y-6">
              {/* Evidence */}
              <section>
                <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Evidence</h3>
                {d ? (
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-white">{d.label}</span>
                      <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10.5px] text-slate-400">{d.type}</span>
                      <span className={cn("rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold", d.severity === "CRITICAL" || d.severity === "HIGH" ? "bg-rose-400/10 text-rose-200" : "bg-white/[0.06] text-slate-300")}>
                        {d.severity}
                      </span>
                      <span className="ml-auto text-[11.5px] text-slate-500">{formatDateTime(d.createdAt)}</span>
                    </div>
                    {d.evidence.length > 0 ? (
                      <div className="mt-3.5 grid gap-x-6 gap-y-3 sm:grid-cols-3">
                        {d.evidence.map((e, i) => (
                          <Field key={i} label={e.label}>
                            {e.value}
                          </Field>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-[12.5px] text-slate-500">No measured values were attached to this detection.</p>
                    )}
                    {shots.length > 0 && (
                      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {shots.map((s) => (
                          <button key={s.id} type="button" onClick={() => setShot(s.safe!)} className="group relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.safe} alt={`Screenshot ${s.seq + 1}`} className="h-full w-full object-cover transition group-hover:scale-105" referrerPolicy="no-referrer" />
                            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 font-mono text-[10px] text-slate-200">{s.seq + 1}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-white/[0.08] px-4 py-3.5 text-[12.5px] text-slate-500">
                    {b.evasionOf
                      ? `Banned automatically for joining with the hardware of banned account #${b.evasionOf}.`
                      : auto
                        ? "This ban has no detection record attached (it may predate evidence capture)."
                        : `Issued manually by ${b.bannedBy} — the reason below is the evidence.`}
                  </p>
                )}
              </section>

              {/* Record */}
              <section>
                <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Record</h3>
                <div className="grid gap-x-6 gap-y-4 rounded-xl border border-white/[0.07] p-4 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <Field label="Reason">{b.reason}</Field>
                  </div>
                  <Field label="Ban ID" mono>
                    {b.code ?? "—"}
                  </Field>
                  <Field label="Module">{d?.label ?? (b.evasionOf ? "Ban evasion" : auto ? "CoreAC" : "Manual")}</Field>
                  <Field label="Date">{formatDateTime(b.createdAt)}</Field>
                  <Field label="Duration">{b.permanent ? "Permanent" : b.expiresAt ? `Until ${formatDateTime(b.expiresAt)}` : "—"}</Field>
                  <Field label="Remaining">{!b.active ? "—" : b.permanent ? "Never expires" : relativeDays(b.expiresAt)}</Field>
                  <Field label="Lifted">{b.unbannedAt ? `${formatDateTime(b.unbannedAt)} · ${b.unbannedBy ?? "—"}` : "—"}</Field>
                </div>
              </section>

              {/* Banned by + player */}
              <section className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Banned by</h3>
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-3.5">
                    <Avatar name={auto ? "CoreAC" : b.bannedBy} icon={auto ? "shield" : undefined} />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium text-slate-100">{auto ? "CoreAC" : b.bannedBy}</p>
                      <p className="text-[11.5px] text-slate-500">{auto ? "Automatic — detection engine" : "Staff member"}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Player</h3>
                  {data.player ? (
                    <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/[0.07] p-3.5">
                      <Field label="Trust">
                        <span className={cn(data.player.trustScore < 50 ? "text-rose-300" : data.player.trustScore < 80 ? "text-amber-200" : "text-slate-100")}>{data.player.trustScore}</span>
                      </Field>
                      <Field label="Playtime">{hours(data.player.playtimeSec)}</Field>
                      <Field label="Last seen">{data.player.online ? "Online now" : timeAgo(data.player.lastSeenAt)}</Field>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-white/[0.08] p-3.5 text-[12.5px] text-slate-500">No player profile is linked to this ban.</p>
                  )}
                </div>
              </section>

              {/* Identifiers */}
              <section>
                <h3 className="mb-2.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Identifiers
                  <span className="font-normal normal-case tracking-normal text-slate-600">click to copy</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  <IdentChip label="License" value={b.identifiers.license} />
                  <IdentChip label="Discord" value={b.identifiers.discord} />
                  <IdentChip label="Steam" value={b.identifiers.steam} />
                  <IdentChip label="IP" value={b.identifiers.ip} masked />
                  <IdentChip label="Device" value={b.identifiers.deviceId} />
                  <span className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11.5px]">
                    <span className="font-semibold uppercase tracking-wide text-slate-500">HW tokens</span>
                    <span className="font-mono text-slate-200">{b.identifiers.tokens}</span>
                  </span>
                </div>
              </section>

              {(data.linked.parent || data.linked.children.length > 0) && (
                <section>
                  <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Linked bans</h3>
                  <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07]">
                    {[...(data.linked.parent ? [{ ...data.linked.parent, rel: "Original ban" }] : []), ...data.linked.children.map((c) => ({ ...c, rel: "Evasion ban" }))].map((l) => (
                      <li key={l.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[12.5px]">
                        <span className="w-24 shrink-0 text-slate-500">{l.rel}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-200">{l.playerName}</span>
                        <span className="font-mono text-slate-500">#{l.code ?? "—"}</span>
                        <span className={cn("text-[11px]", l.active ? "text-rose-300" : "text-slate-500")}>{l.active ? "active" : "lifted"}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {data && tab === "history" && (
            <ol className="relative space-y-1">
              {data.history.length === 0 && <p className="text-[13px] text-slate-500">No history.</p>}
              {data.history.map((h, i) => {
                const st = HISTORY_STYLE[h.kind];
                const Icon = Icons[st.icon];
                return (
                  <li key={i} className="relative flex gap-3.5 pb-4">
                    {i < data.history.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-white/[0.07]" />}
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset", st.cls)}>
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-[13px] font-medium text-slate-100">{h.title}</p>
                        <p className="text-[11px] tabular-nums text-slate-500">{formatDateTime(h.at)}</p>
                      </div>
                      {h.detail && <p className="mt-0.5 break-words text-[12.5px] text-slate-400">{h.detail}</p>}
                      {h.by && <p className="mt-0.5 text-[11px] text-slate-600">by {AUTO_BANNERS.has(h.by) ? "CoreAC" : h.by}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {data && tab === "notes" && (
            <div className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!draft.trim()) return;
                  if (await post({ action: "note", text: draft.trim() }, "note")) setDraft("");
                }}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Add a note for your staff — appeal outcome, context, evidence links…"
                  className="w-full resize-none bg-transparent text-[13px] text-slate-100 placeholder:text-slate-600 focus:outline-none"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-600">{draft.length}/1000 · visible to everyone with access to this server</span>
                  <button type="submit" disabled={!draft.trim() || busy !== null} className="btn-primary h-8 px-3 text-xs">
                    {busy === "note" ? "Saving…" : "Add note"}
                  </button>
                </div>
              </form>
              {data.notes.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-slate-500">No notes yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {[...data.notes].reverse().map((n) => (
                    <li key={n.id} className="group rounded-xl border border-white/[0.07] p-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={n.by} size={26} />
                        <span className="text-[12.5px] font-medium text-slate-200">{n.by}</span>
                        <span className="text-[11px] text-slate-500">{formatDateTime(n.at)}</span>
                        <button
                          type="button"
                          onClick={() => confirm("Delete this note?") && post({ action: "deleteNote", noteId: n.id }, "del")}
                          className="ml-auto text-slate-600 opacity-0 transition hover:text-rose-300 group-hover:opacity-100"
                          aria-label="Delete note"
                        >
                          <Icons.trash size={13} />
                        </button>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-300">{n.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {data && tab === "json" && (
            <div className="space-y-3">
              <JsonBlock title="Ban record" value={data.ban} maxHeight={320} />
              {data.detection && <JsonBlock title="Detection" value={{ ...data.detection, evidence: undefined }} maxHeight={360} />}
            </div>
          )}
        </div>

        {/* Footer: false-positive switch + actions */}
        {b && (
          <div className="flex flex-col gap-3 border-t border-white/[0.07] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => post({ action: "falsePositive", value: !b.falsePositive }, "flag")}
              className="flex items-center gap-3 text-left disabled:opacity-60"
              aria-pressed={b.falsePositive}
            >
              <span className={cn("switch", b.falsePositive ? "switch-on" : "switch-off")}>
                <span className={cn("switch-knob", b.falsePositive ? "translate-x-[18px] bg-[#0a0a0b]" : "translate-x-[3px] bg-slate-400")} />
              </span>
              <span>
                <span className="block text-[13px] font-medium text-slate-100">This ban is a false positive</span>
                <span className="block text-[11.5px] text-slate-500">Marks the record only — “Fix false ban” also lifts it.</span>
              </span>
            </button>
            <div className="flex items-center gap-2">
              {b.code && <CopyButton text={b.code} label="Copy ban ID" className="h-9 px-3" />}
              {!b.falsePositive && (
                <button type="button" onClick={fixFalseBan} disabled={busy !== null} className="btn-secondary h-9 px-3 text-xs">
                  <Icons.wand size={13} /> {busy === "fix" ? "Fixing…" : "Fix false ban"}
                </button>
              )}
              {b.active && (
                <button type="button" onClick={unban} disabled={busy !== null} className="btn-primary h-9 px-4 text-xs">
                  <Icons.undo size={13} /> {busy === "unban" ? "Lifting…" : "Unban"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {replay && d && <ReplayViewer serverId={serverId} detectionId={d.id} onClose={() => setReplay(false)} />}

      {shot && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-6" onMouseDown={() => setShot(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="Screenshot" className="max-h-full max-w-full rounded-xl border border-white/10" referrerPolicy="no-referrer" />
        </div>
      )}
    </div>
    </Portal>
  );
}
