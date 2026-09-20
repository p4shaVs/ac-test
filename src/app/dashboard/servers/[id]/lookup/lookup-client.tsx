"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Badge } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { Icons } from "@/components/icons";
import { timeAgo, cn } from "@/lib/utils";

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

export function LookupClient({ serverId }: { serverId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/servers/${serverId}/lookup?q=${encodeURIComponent(q.trim())}`
        );
        const json = await res.json();
        if (json.ok) setResults(json.data.results);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q, serverId]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Player lookup</h2>
        <p className="mt-1 text-sm text-slate-400">
          Look up a player's trust score, ban history and possible alt accounts
        </p>
      </div>

      <div className="relative mx-auto max-w-2xl">
        <Icons.search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          autoFocus
          className="input py-3.5 pl-11 text-base"
          placeholder="Search by player name, licence or identifier…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {loading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            Searching…
          </span>
        )}
      </div>

      {results === null ? (
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
          <InfoCard icon="shield" title="Threat Score" text="Each player is scored on bans, account age and play time." />
          <InfoCard icon="users" title="Alt Hesaplar" text="Find possible alt accounts sharing an IP." />
          <InfoCard icon="ban" title="Ban History" text="See a player's full ban history." />
        </div>
      ) : results.length === 0 ? (
        <p className="py-10 text-center text-slate-500">No matching players.</p>
      ) : (
        <div className="mx-auto max-w-4xl space-y-3">
          {results.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", r.online ? "bg-emerald-400" : "bg-slate-600")} />
                    <h3 className="text-base font-semibold text-white">{r.name}</h3>
                    <TrustBadge score={r.trustScore} />
                    {r.activeBan && <Badge tone="red" dot>Banned</Badge>}
                  </div>
                  <div className="mt-3 grid gap-1.5 text-xs">
                    <IdRow label="Licence" value={r.license} />
                    <IdRow label="Steam" value={r.steam} />
                    <IdRow label="Discord" value={r.discord} />
                    <IdRow label="IP" value={r.ip} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center sm:w-72">
                  <Stat label="Ban" value={r.banCount} tone={r.banCount ? "rose" : "slate"} />
                  <Stat label="Alt accounts" value={r.altAccounts} tone={r.altAccounts ? "amber" : "slate"} />
                  <Stat label="Duration" value={`${Math.round(r.playtimeSec / 3600)}s`} tone="slate" />
                </div>
              </div>
              {r.activeBan && (
                <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
                  Active ban: {r.activeBan.reason} · {timeAgo(r.activeBan.createdAt)}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>First seen: {timeAgo(r.firstSeenAt)}</span>
                <span>Last seen: {timeAgo(r.lastSeenAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoCard({ icon, title, text }: { icon: any; title: string; text: string }) {
  const Icon = (Icons as any)[icon];
  return (
    <Card className="text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-500/10 text-brand-300">
        <Icon size={20} />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{text}</p>
    </Card>
  );
}

function IdRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-slate-500">{label}</span>
      <code className="truncate font-mono text-slate-300">{value}</code>
      <CopyButton value={value} label="" className="h-5 w-5 justify-center px-0" />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone: "rose" | "amber" | "slate" }) {
  const color = tone === "rose" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : "text-slate-200";
  return (
    <div className="rounded-lg border border-white/5 bg-base-900/40 py-2">
      <div className={cn("text-lg font-bold", color)}>{value}</div>
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
    </div>
  );
}

function TrustBadge({ score }: { score: number }) {
  const tone = score >= 70 ? "green" : score >= 40 ? "amber" : "red";
  return <Badge tone={tone as any}>Tehdit {100 - score}</Badge>;
}
