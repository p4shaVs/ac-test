"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";
import { Icons } from "@/components/icons";
import {
  Ago,
  Avatar,
  DetailEmpty,
  DetailShell,
  Field,
  FilterChips,
  IdentChip,
  JsonBlock,
  ListItem,
  ListShell,
  SearchBox,
  SplitView,
} from "@/components/log-ui";
import type { PunishRow } from "@/lib/punish-log";
import { formatDateTime, cn } from "@/lib/utils";

type Filter = "all" | "auto" | "staff" | "pending";

export function PunishmentLog({ rows, kind }: { rows: PunishRow[]; kind: "KICK" | "WARN" }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const noun = kind === "KICK" ? "kick" : "warning";

  const counts = useMemo(
    () => ({
      all: rows.length,
      auto: rows.filter((r) => r.auto).length,
      staff: rows.filter((r) => !r.auto).length,
      pending: rows.filter((r) => r.status === "PENDING").length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "auto" && !r.auto) return false;
      if (filter === "staff" && r.auto) return false;
      if (filter === "pending" && r.status !== "PENDING") return false;
      if (!q) return true;
      return [r.playerName, r.reason, r.issuedBy, r.identifiers?.license, r.identifiers?.discord, r.detection?.type].some((v) =>
        (v ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  const selected = filtered.find((r) => r.id === sel) ?? null;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={kind === "KICK" ? "kick" : "warn"}
        title={kind === "KICK" ? "No kicks yet" : "No warnings yet"}
        description={`Every ${noun} — by CoreAC or by your staff — is listed here with its reason and evidence.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "All", count: counts.all },
            { key: "auto", label: "CoreAC", count: counts.auto },
            { key: "staff", label: "Staff", count: counts.staff },
            { key: "pending", label: "Not delivered", count: counts.pending, dot: "bg-amber-300" },
          ]}
        />
        <SearchBox value={query} onChange={setQuery} placeholder="Player, reason, staff, licence…" className="w-full lg:w-80" />
      </div>

      <SplitView
        hasSelection={!!selected}
        onBack={() => setSel(null)}
        list={
          <ListShell footer={`${filtered.length} of ${rows.length} ${noun}s`}>
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-slate-500">Nothing matches.</p>
            ) : (
              filtered.map((r) => (
                <ListItem key={r.id} active={r.id === sel} onClick={() => setSel(r.id)}>
                  <Avatar name={r.playerName} tone="neutral" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium text-slate-100">{r.playerName}</span>
                      {r.auto && <Icons.shield size={12} className="shrink-0 text-slate-500" />}
                    </span>
                    <span className="block truncate text-[12px] text-slate-400">{r.reason}</span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] text-slate-500">
                    <Ago at={r.createdAt} />
                    {r.status === "PENDING" && <span className="mt-0.5 block text-amber-300/80">pending</span>}
                  </span>
                </ListItem>
              ))
            )}
          </ListShell>
        }
        detail={
          selected ? (
            <DetailShell>
              <div className="flex items-start gap-3.5 border-b border-white/[0.06] px-5 py-4">
                <Avatar name={selected.playerName} size={44} tone="neutral" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold text-white">{selected.playerName}</p>
                  <p className="mt-0.5 text-[12px] text-slate-500">{formatDateTime(selected.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium", selected.auto ? "border-white/10 text-slate-300" : "border-white/10 text-slate-300")}>
                    {selected.auto ? <Icons.shield size={11} /> : <Icons.user size={11} />}
                    {selected.auto ? "CoreAC" : "Staff"}
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium",
                      selected.status === "DELIVERED" ? "border-emerald-400/20 text-emerald-200" : selected.status === "FAILED" ? "border-rose-400/20 text-rose-200" : "border-amber-400/20 text-amber-200"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", selected.status === "DELIVERED" ? "bg-emerald-400" : selected.status === "FAILED" ? "bg-rose-400" : "bg-amber-300")} />
                    {selected.status === "DELIVERED" ? "Delivered" : selected.status === "FAILED" ? "Failed" : "Waiting for the server"}
                  </span>
                </div>
              </div>

              <div className="space-y-5 px-5 py-5">
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Reason">{selected.reason}</Field>
                  </div>
                  <Field label="Issued by">{selected.auto ? "CoreAC (automatic)" : selected.issuedBy}</Field>
                  <Field label="Delivered">{selected.deliveredAt ? formatDateTime(selected.deliveredAt) : "—"}</Field>
                </div>

                {selected.detection && (
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icons.scan size={14} className="text-slate-400" />
                      <span className="text-[13.5px] font-medium text-white">{selected.detection.label}</span>
                      <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10.5px] text-slate-400">{selected.detection.type}</span>
                      <span className="ml-auto text-[11px] text-slate-500">{selected.detection.severity}</span>
                    </div>
                    {selected.detection.evidence.length > 0 && (
                      <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
                        {selected.detection.evidence.map((e, i) => (
                          <Field key={i} label={e.label}>
                            {e.value}
                          </Field>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selected.identifiers && (
                  <div className="flex flex-wrap gap-2">
                    <IdentChip label="License" value={selected.identifiers.license} />
                    <IdentChip label="Discord" value={selected.identifiers.discord} />
                    <IdentChip label="Steam" value={selected.identifiers.steam} />
                  </div>
                )}

                <JsonBlock
                  value={{
                    id: selected.id,
                    type: selected.type,
                    player: selected.playerName,
                    playerId: selected.playerId,
                    reason: selected.reason,
                    issuedBy: selected.issuedBy,
                    status: selected.status,
                    createdAt: selected.createdAt,
                    deliveredAt: selected.deliveredAt,
                    identifiers: selected.identifiers,
                    detection: selected.detection ? { ...selected.detection, evidence: undefined } : null,
                  }}
                />
              </div>
            </DetailShell>
          ) : (
            <DetailEmpty icon={kind === "KICK" ? "kick" : "warn"} text={`Select a ${noun} to see its reason, evidence and full record.`} />
          )
        }
      />
    </div>
  );
}
