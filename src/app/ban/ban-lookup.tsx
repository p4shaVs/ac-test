"use client";

import { useState } from "react";
import { Card, Badge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { formatDateTime, relativeDays } from "@/lib/utils";

interface Result {
  code: string;
  playerName: string;
  reason: string;
  bannedBy: string;
  server: string;
  active: boolean;
  permanent: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export function BanLookup() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/ban-lookup?code=${encodeURIComponent(code.trim().toUpperCase())}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Not found");
      setResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="flex gap-2">
        <input
          className="input py-3 text-center font-mono uppercase tracking-widest"
          placeholder="AC-XXXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={12}
          required
        />
        <button type="submit" disabled={loading} className="btn-primary px-6">
          {loading ? "…" : "Sorgula"}
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <Icons.warn size={16} /> {error}
        </div>
      )}

      {result && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500/10 text-rose-300">
                <Icons.ban size={20} />
              </span>
              <div>
                <p className="font-semibold text-white">{result.playerName}</p>
                <p className="text-xs text-slate-500">{result.server}</p>
              </div>
            </div>
            {result.active ? (
              <Badge tone="red" dot>{result.permanent ? "Permanent ban" : relativeDays(result.expiresAt)}</Badge>
            ) : (
              <Badge tone="gray">Removed</Badge>
            )}
          </div>
          <div className="rounded-xl border border-white/5 bg-base-900/50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Reason</p>
            <p className="mt-1 text-slate-200">{result.reason}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Issued by</p>
              <p className="mt-0.5 text-slate-300">{result.bannedBy}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Date</p>
              <p className="mt-0.5 text-slate-300">{formatDateTime(result.createdAt)}</p>
            </div>
          </div>
          <p className="text-center font-mono text-xs text-slate-600">{result.code}</p>
        </Card>
      )}
    </div>
  );
}
