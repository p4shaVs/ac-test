"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { Icons } from "@/components/icons";
import { Ago, Avatar, DetailEmpty, DetailShell, Field, FilterChips, JsonBlock, ListItem, ListShell, SearchBox, SplitView } from "@/components/log-ui";
import { evidenceEntries } from "@/lib/evidence";
import { formatDateTime, safeMediaUrl, cn } from "@/lib/utils";
import { ReplayViewer } from "../bans/replay-viewer";
import { Portal } from "@/components/portal";

export interface DetectionRow {
  id: string;
  type: string;
  label: string;
  category: string;
  severity: string;
  action: "LOG" | "KICK" | "BAN";
  playerName: string;
  playerId: string | null;
  summary: string;
  createdAt: string;
  ban: { id: string; code: string | null; active: boolean } | null;
  screenshots: number;
}

interface DetectionDetail {
  id: string;
  type: string;
  severity: string;
  playerName: string;
  action: string | null;
  createdAt: string;
  details: Record<string, unknown>;
  replay: { t: number }[];
  screenshots: { id: string; url: string | null; seq: number; completedAt: string | null }[];
}

const ACTION_STYLE = {
  BAN: { label: "Ban", pill: "border-rose-400/25 bg-rose-400/[0.08] text-rose-200", dot: "bg-rose-400", tone: "red" as const },
  KICK: { label: "Kick", pill: "border-amber-400/25 bg-amber-400/[0.08] text-amber-200", dot: "bg-amber-400", tone: "amber" as const },
  LOG: { label: "Log", pill: "border-white/10 bg-white/[0.03] text-slate-300", dot: "bg-slate-400", tone: "neutral" as const },
};

const SEVERITY_CLS: Record<string, string> = {
  CRITICAL: "text-rose-300",
  HIGH: "text-amber-300",
  MEDIUM: "text-slate-200",
  LOW: "text-slate-500",
};

function replaySeconds(frames: { t: number }[]): number {
  if (frames.length < 2) return 0;
  const span = Math.abs((frames[frames.length - 1].t ?? 0) - (frames[0].t ?? 0));
  // Frame times are milliseconds on the game clock.
  return Math.max(1, Math.round(span / 1000));
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="relative flex h-9 items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-lg border border-white/10 bg-white/[0.03] pl-3 pr-8 text-[12.5px] text-slate-200 outline-none transition hover:border-white/20 focus:border-white/30"
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

export function DetectionsView({
  serverId,
  rows,
  categories,
}: {
  serverId: string;
  rows: DetectionRow[];
  categories: { id: string; label: string }[];
}) {
  const [action, setAction] = useState<"all" | "BAN" | "KICK" | "LOG">("all");
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetectionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [replay, setReplay] = useState(false);
  const [shot, setShot] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: rows.length,
      BAN: rows.filter((r) => r.action === "BAN").length,
      KICK: rows.filter((r) => r.action === "KICK").length,
      LOG: rows.filter((r) => r.action === "LOG").length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (action !== "all" && r.action !== action) return false;
      if (category !== "all" && r.category !== category) return false;
      if (severity !== "all" && r.severity !== severity) return false;
      if (!q) return true;
      return [r.playerName, r.label, r.type, r.summary, r.ban?.code].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [rows, action, category, severity, query]);

  const selected = rows.find((r) => r.id === sel) ?? null;

  useEffect(() => {
    if (!sel) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    fetch(`/api/servers/${serverId}/detections/${sel}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setDetail(json?.data ?? null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sel, serverId]);

  if (rows.length === 0) {
    return <EmptyState icon="shieldCheck" title="No detections yet" description="When CoreAC catches something it shows up here with the evidence, the action it took and the replay." />;
  }

  const evidence = detail ? evidenceEntries(detail.details, 12) : [];
  const shots = (detail?.screenshots ?? []).map((s) => ({ ...s, safe: safeMediaUrl(s.url) })).filter((s) => s.safe);
  const usedCats = new Set(rows.map((r) => r.category));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <FilterChips
          value={action}
          onChange={setAction}
          options={[
            { key: "all", label: "All", count: counts.all },
            { key: "BAN", label: "Banned", count: counts.BAN, dot: "bg-rose-400" },
            { key: "KICK", label: "Kicked", count: counts.KICK, dot: "bg-amber-400" },
            { key: "LOG", label: "Logged", count: counts.LOG, dot: "bg-slate-400" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
          <Select
            value={category}
            onChange={setCategory}
            options={[{ value: "all", label: "All categories" }, ...categories.filter((c) => usedCats.has(c.id)).map((c) => ({ value: c.id, label: c.label }))]}
          />
          <Select
            value={severity}
            onChange={setSeverity}
            options={[
              { value: "all", label: "Any severity" },
              { value: "CRITICAL", label: "Critical" },
              { value: "HIGH", label: "High" },
              { value: "MEDIUM", label: "Medium" },
              { value: "LOW", label: "Low" },
            ]}
          />
          <SearchBox value={query} onChange={setQuery} placeholder="Player, detection, ban ID…" className="w-full sm:w-64" />
        </div>
      </div>

      <SplitView
        hasSelection={!!selected}
        onBack={() => setSel(null)}
        list={
          <ListShell footer={`${filtered.length} of ${rows.length} detections${rows.length >= 400 ? " (latest 400)" : ""}`}>
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-slate-500">Nothing matches.</p>
            ) : (
              filtered.map((r) => {
                const a = ACTION_STYLE[r.action] ?? ACTION_STYLE.LOG;
                return (
                  <ListItem key={r.id} active={r.id === sel} onClick={() => setSel(r.id)}>
                    <Avatar name={r.playerName} tone={a.tone} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-slate-100">{r.playerName}</span>
                        {r.screenshots > 0 && <Icons.eye size={12} className="shrink-0 text-slate-500" />}
                      </span>
                      <span className="block truncate text-[12px] text-slate-400">{r.label}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10.5px] font-semibold", a.pill)}>{a.label}</span>
                      <span className="text-[11px] text-slate-500">
                        <Ago at={r.createdAt} />
                      </span>
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
              <div className="flex items-start gap-3.5 border-b border-white/[0.06] px-5 py-4">
                <Avatar name={selected.playerName} size={44} tone={(ACTION_STYLE[selected.action] ?? ACTION_STYLE.LOG).tone} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold text-white">{selected.label}</p>
                  <p className="mt-0.5 truncate text-[12px] text-slate-500">
                    {selected.playerName} · {formatDateTime(selected.createdAt)}
                  </p>
                </div>
                <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold", (ACTION_STYLE[selected.action] ?? ACTION_STYLE.LOG).pill)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", (ACTION_STYLE[selected.action] ?? ACTION_STYLE.LOG).dot)} />
                  {(ACTION_STYLE[selected.action] ?? ACTION_STYLE.LOG).label}
                </span>
              </div>

              <div className="space-y-5 px-5 py-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  <Field label="Type" mono>
                    {selected.type}
                  </Field>
                  <Field label="Severity">
                    <span className={SEVERITY_CLS[selected.severity] ?? "text-slate-200"}>{selected.severity}</span>
                  </Field>
                  <Field label="Category">{categories.find((c) => c.id === selected.category)?.label ?? "Other"}</Field>
                  <Field label="Ban">
                    {selected.ban ? (
                      <Link href={`/dashboard/servers/${serverId}/bans?ban=${selected.ban.id}`} className="inline-flex items-center gap-1 text-white underline decoration-white/20 underline-offset-4 hover:decoration-white">
                        #{selected.ban.code ?? "open"} <Icons.external size={11} />
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Field>
                </div>

                <div>
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">Evidence</p>
                  {loading && <div className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />}
                  {!loading && evidence.length === 0 && <p className="text-[12.5px] text-slate-500">No measured values were attached.</p>}
                  {!loading && evidence.length > 0 && (
                    <div className="grid gap-x-6 gap-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:grid-cols-3">
                      {evidence.map((e, i) => (
                        <Field key={i} label={e.label}>
                          {e.value}
                        </Field>
                      ))}
                    </div>
                  )}
                </div>

                {(shots.length > 0 || (detail && detail.replay.length > 0)) && (
                  <div className="space-y-3">
                    {shots.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {shots.map((s) => (
                          <button key={s.id} type="button" onClick={() => setShot(s.safe!)} className="group relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.safe} alt={`Screenshot ${s.seq + 1}`} className="h-full w-full object-cover transition group-hover:scale-105" referrerPolicy="no-referrer" />
                          </button>
                        ))}
                      </div>
                    )}
                    {detail && detail.replay.length > 0 && (
                      <button type="button" onClick={() => setReplay(true)} className="btn-secondary h-9 px-3 text-xs">
                        <Icons.play size={13} /> Watch the replay ({replaySeconds(detail.replay)} s)
                      </button>
                    )}
                  </div>
                )}

                {detail && (
                  <JsonBlock
                    title="Full details"
                    value={{
                      id: detail.id,
                      type: detail.type,
                      severity: detail.severity,
                      action: detail.action ?? "LOG",
                      player: detail.playerName,
                      playerId: selected.playerId,
                      createdAt: detail.createdAt,
                      ban: selected.ban,
                      screenshots: detail.screenshots.length,
                      replayFrames: detail.replay.length,
                      details: detail.details,
                    }}
                  />
                )}
              </div>
            </DetailShell>
          ) : (
            <DetailEmpty icon="shieldCheck" text="Select a detection to see the evidence, screenshots, replay and the full record." />
          )
        }
      />

      {replay && selected && <ReplayViewer serverId={serverId} detectionId={selected.id} onClose={() => setReplay(false)} />}
      {shot && (
        <Portal>
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-6" onMouseDown={() => setShot(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="Screenshot" className="max-h-full max-w-full rounded-xl border border-white/10" referrerPolicy="no-referrer" />
        </div>
        </Portal>
      )}
    </div>
  );
}
