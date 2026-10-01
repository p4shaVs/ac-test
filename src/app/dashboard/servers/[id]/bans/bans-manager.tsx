"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { Icons } from "@/components/icons";
import { Avatar, FilterChips, SearchBox } from "@/components/log-ui";
import { formatDateTime, cn } from "@/lib/utils";
import { BanDetail } from "./ban-detail";
import { AUTO_BANNERS, StatusPill } from "./ban-status";

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
  falsePositive: boolean;
  evasionOf: string | null;
  detectionId: string | null;
  module: string | null;
  notes: number;
}

type Filter = "all" | "active" | "lifted" | "false" | "auto" | "staff";

export function BansManager({ serverId, bans, initialOpen }: { serverId: string; bans: BanRow[]; initialOpen: string | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(initialOpen);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menu]);

  // Keep ?ban=<id> in the address bar so a ban can be linked to a colleague.
  function openBan(id: string | null) {
    setOpen(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("ban", id);
    else url.searchParams.delete("ban");
    window.history.replaceState(null, "", url.toString());
  }

  const counts = useMemo(
    () => ({
      all: bans.length,
      active: bans.filter((b) => b.active).length,
      lifted: bans.filter((b) => !b.active).length,
      false: bans.filter((b) => b.falsePositive).length,
      auto: bans.filter((b) => AUTO_BANNERS.has(b.bannedBy)).length,
      staff: bans.filter((b) => !AUTO_BANNERS.has(b.bannedBy)).length,
      permanent: bans.filter((b) => b.active && b.permanent).length,
      temporary: bans.filter((b) => b.active && !b.permanent).length,
      evasion: bans.filter((b) => b.active && b.evasionOf).length,
    }),
    [bans]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bans.filter((b) => {
      if (filter === "active" && !b.active) return false;
      if (filter === "lifted" && b.active) return false;
      if (filter === "false" && !b.falsePositive) return false;
      if (filter === "auto" && !AUTO_BANNERS.has(b.bannedBy)) return false;
      if (filter === "staff" && AUTO_BANNERS.has(b.bannedBy)) return false;
      if (!q) return true;
      return [b.code, b.playerName, b.license, b.discord, b.steam, b.ip, b.reason, b.module, b.bannedBy].some((v) =>
        (v ?? "").toLowerCase().includes(q)
      );
    });
  }, [bans, query, filter]);

  async function bulk(action: "clearInactive" | "unbanAll") {
    setMenu(false);
    const msg =
      action === "clearInactive"
        ? `Permanently delete ${counts.lifted} lifted ban record(s)? This cannot be undone.`
        : `Lift all ${counts.active} active bans? Players can join again within a minute.`;
    if (!confirm(msg)) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/servers/${serverId}/bans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (bans.length === 0) {
    return <EmptyState icon="ban" title="No bans yet" description="Bans issued from the Players page, in game or by automatic detections appear here." />;
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-4">
        {[
          { label: "Active bans", value: counts.active, sub: `${counts.permanent} permanent · ${counts.temporary} temporary` },
          { label: "By CoreAC", value: counts.auto, sub: "automatic detections" },
          { label: "By staff", value: counts.staff, sub: "panel and in game" },
          { label: "False positives", value: counts.false, sub: "corrected bans" },
        ].map((s) => (
          <div key={s.label} className="bg-[#0e0e10] px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{s.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{s.value}</p>
            <p className="mt-0.5 text-[11.5px] text-slate-500">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "All", count: counts.all },
            { key: "active", label: "Active", count: counts.active, dot: "bg-rose-400" },
            { key: "lifted", label: "Lifted", count: counts.lifted, dot: "bg-slate-500" },
            { key: "false", label: "False positive", count: counts.false, dot: "bg-amber-300" },
            { key: "auto", label: "CoreAC", count: counts.auto },
            { key: "staff", label: "Staff", count: counts.staff },
          ]}
        />
        <div className="flex items-center gap-2">
          <SearchBox value={query} onChange={setQuery} placeholder="Name, ban ID, licence, Discord, reason…" className="w-full xl:w-80" />
          <a href={`/api/servers/${serverId}/bans/export`} className="btn-secondary h-9 shrink-0 px-3 text-xs">
            <Icons.download size={14} /> CSV
          </a>
          <div ref={menuRef} className="relative shrink-0">
            <button type="button" onClick={() => setMenu((m) => !m)} className="btn-secondary h-9 w-9 justify-center p-0" aria-label="More actions">
              <Icons.menu size={15} />
            </button>
            {menu && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 rounded-xl border border-white/10 bg-[#141416] p-1 shadow-pop">
                <button
                  type="button"
                  disabled={busy !== null || counts.lifted === 0}
                  onClick={() => bulk("clearInactive")}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-40"
                >
                  <Icons.trash size={14} className="text-slate-400" /> Delete lifted records
                </button>
                <button
                  type="button"
                  disabled={busy !== null || counts.active === 0}
                  onClick={() => bulk("unbanAll")}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-40"
                >
                  <Icons.undo size={14} /> Lift every active ban
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState icon="search" title="Nothing matches" description="Try another filter or search term." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0e0e10]">
          <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_150px_120px] gap-4 border-b border-white/[0.06] px-5 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 lg:grid">
            <span>Player</span>
            <span>Reason</span>
            <span>Banned by</span>
            <span>Date</span>
            <span className="text-right">Status</span>
          </div>
          <ul>
            {filtered.map((b) => {
              const auto = AUTO_BANNERS.has(b.bannedBy);
              return (
                <li key={b.id} className="border-b border-white/[0.05] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => openBan(b.id)}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3.5 text-left transition hover:bg-white/[0.025] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_150px_120px]",
                      !b.active && "opacity-70"
                    )}
                  >
                    <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-3 lg:col-auto lg:row-auto">
                      <Avatar name={b.playerName} tone={b.active ? "red" : b.falsePositive ? "amber" : "neutral"} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium text-slate-100">{b.playerName}</span>
                        <span className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                          {b.code ? `#${b.code}` : "no ban ID"}
                          {b.notes > 0 && (
                            <span className="flex items-center gap-0.5 font-sans text-slate-500" title={`${b.notes} note(s)`}>
                              <Icons.note size={11} />
                              {b.notes}
                            </span>
                          )}
                        </span>
                      </span>
                    </span>
                    <span className="col-span-2 col-start-1 row-start-2 min-w-0 lg:col-auto lg:row-auto">
                      <span className="block truncate text-[13px] text-slate-300">{b.reason}</span>
                      {b.module && <span className="block truncate text-[11.5px] text-slate-500">{b.module}</span>}
                    </span>
                    <span className="hidden min-w-0 items-center gap-1.5 truncate text-[12.5px] text-slate-400 lg:flex">
                      {auto ? <Icons.shield size={13} className="shrink-0 text-slate-500" /> : <Icons.user size={13} className="shrink-0 text-slate-500" />}
                      <span className="truncate">{auto ? "CoreAC" : b.bannedBy}</span>
                    </span>
                    <span className="hidden text-[12px] tabular-nums text-slate-500 lg:block">{formatDateTime(b.createdAt)}</span>
                    <span className="col-start-2 row-start-1 flex justify-end lg:col-auto lg:row-auto">
                      <StatusPill b={b} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-white/[0.06] px-5 py-2.5 text-[11px] text-slate-500">
            Showing {filtered.length} of {bans.length}
            {bans.length >= 500 ? " (latest 500 — use search or the CSV export for older ones)" : ""}
          </div>
        </div>
      )}

      {open && (
        <BanDetail
          serverId={serverId}
          banId={open}
          onClose={() => openBan(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
