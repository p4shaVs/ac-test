"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, EmptyState } from "@/components/ui";
import { Icons } from "@/components/icons";
import { formatDateTime, relativeDays, cn } from "@/lib/utils";
import { ReplayViewer } from "./replay-viewer";

export interface BanRow {
  id: string;
  code: string | null;
  playerName: string;
  license: string | null;
  discord: string | null;
  steam: string | null;
  ip: string | null;
  reason: string;
  bannedBy: string;
  createdAt: string;
  expiresAt: string | null;
  active: boolean;
  permanent: boolean;
  detectionId: string | null;
}

function CopyChip({ label, value }: { label: string; value: string | null }) {
  const [ok, setOk] = useState(false);
  if (!value) return <span className="text-[11px] text-slate-600">{label}: —</span>;
  const clean = value.replace(/^(discord|license|steam):/, "");
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(clean).then(() => { setOk(true); setTimeout(() => setOk(false), 1000); })}
      title="Copy"
      className="group flex items-center gap-1 font-mono text-[11px] text-slate-400 transition hover:text-slate-200"
    >
      <span className="text-slate-500">{label}:</span>
      <span className="max-w-[160px] truncate">{clean}</span>
      <Icons.copy size={11} className={cn("opacity-0 transition group-hover:opacity-100", ok && "text-emerald-400 opacity-100")} />
    </button>
  );
}

export function BansManager({ serverId, bans }: { serverId: string; bans: BanRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "active" | "inactive">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [replayFor, setReplayFor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bans.filter((b) => {
      if (tab === "active" && !b.active) return false;
      if (tab === "inactive" && b.active) return false;
      if (!q) return true;
      return (
        (b.code ?? "").toLowerCase().includes(q) ||
        b.playerName.toLowerCase().includes(q) ||
        (b.license ?? "").toLowerCase().includes(q) ||
        (b.discord ?? "").toLowerCase().includes(q) ||
        (b.ip ?? "").toLowerCase().includes(q)
      );
    });
  }, [bans, query, tab]);

  const activeCount = bans.filter((b) => b.active).length;
  const inactiveCount = bans.length - activeCount;

  async function unban(banId: string) {
    if (!confirm("Remove this ban?")) return;
    setBusy(banId);
    try {
      const res = await fetch(`/api/servers/${serverId}/unban`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ banId }),
      });
      if (res.ok) router.refresh();
    } finally { setBusy(null); }
  }

  async function bulk(action: "clearInactive" | "unbanAll") {
    const msg = action === "clearInactive"
      ? `Permanently delete ${inactiveCount} removed ban record(s)? This cannot be undone.`
      : `Active ${activeCount} active bans will be removed. Continue?`;
    if (!confirm(msg)) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/servers/${serverId}/bans`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      {/* Araç çubuğu */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-base-900/60 p-1">
          {([["all", `All (${bans.length})`], ["active", `Active (${activeCount})`], ["inactive", `Removed (${inactiveCount})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition", tab === k ? "bg-brand-500/15 text-white ring-1 ring-inset ring-brand-500/40" : "text-slate-400 hover:bg-white/5")}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-2 lg:max-w-xl lg:justify-end">
          <div className="relative flex-1 lg:max-w-xs">
            <Icons.search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input h-9 pl-9 text-sm" placeholder="Ban ID, Discord, licence, name…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <a href={`/api/servers/${serverId}/bans/export`}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-white/20">
            <Icons.download size={14} /> CSV Download
          </a>
          <button onClick={() => bulk("clearInactive")} disabled={busy !== null || inactiveCount === 0}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-white/20 disabled:opacity-40">
            <Icons.trash size={14} /> Purge removed bans
          </button>
          <button onClick={() => bulk("unbanAll")} disabled={busy !== null || activeCount === 0}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-40">
            <Icons.ban size={14} /> Remove all bans
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="ban" title="No matching bans" description="Try a different search or tab." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5 bg-base-850/60">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Ban ID</th>
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium">Identifiers</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    {b.code ? (
                      <button onClick={() => navigator.clipboard?.writeText(b.code!)} title="Copy ban ID"
                        className="rounded-md bg-brand-500/10 px-2 py-1 font-mono text-xs font-semibold text-brand-300 ring-1 ring-inset ring-brand-500/20 hover:bg-brand-500/20">
                        {b.code}
                      </button>
                    ) : <span className="text-xs text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-200">{b.playerName}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <CopyChip label="Discord" value={b.discord} />
                      <CopyChip label="License" value={b.license} />
                    </div>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-slate-300">{b.reason}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(b.createdAt)}</td>
                  <td className="px-4 py-3">
                    {b.active ? (
                      <Badge tone="red" dot>{b.permanent ? "Permanent" : relativeDays(b.expiresAt)}</Badge>
                    ) : (
                      <Badge tone="gray">Removed</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {b.detectionId && (
                        <button onClick={() => setReplayFor(b.detectionId)}
                          title="Replay the moment of the ban (last ~8s)"
                          className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-brand-500/40 hover:text-brand-300">
                          <Icons.eye size={13} /> Watch
                        </button>
                      )}
                      {b.active ? (
                        <button onClick={() => unban(b.id)} disabled={busy === b.id}
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300">
                          {busy === b.id ? "…" : "Remove ban"}
                        </button>
                      ) : (!b.detectionId && <span className="text-xs text-slate-600">—</span>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {replayFor && (
        <ReplayViewer serverId={serverId} detectionId={replayFor} onClose={() => setReplayFor(null)} />
      )}
    </div>
  );
}
