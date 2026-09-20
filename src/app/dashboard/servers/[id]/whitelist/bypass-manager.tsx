"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface BypassRow {
  id: string;
  kind: string;
  value: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

const KINDS = [
  { key: "discord", label: "Discord ID", ph: "123456789012345678" },
  { key: "license", label: "License", ph: "abc123def456…" },
  { key: "steam", label: "Steam", ph: "steam:1100001…" },
  { key: "ip", label: "IP", ph: "1.2.3.4" },
] as const;

const kindTone: Record<string, "green" | "amber" | "red" | "blue" | "violet"> = {
  discord: "violet",
  license: "blue",
  steam: "green",
  ip: "amber",
};

export function BypassManager({ serverId, rows }: { serverId: string; rows: BypassRow[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("discord");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (value.trim().length < 2) {
      setError("Enter a valid value.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/whitelist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value: value.trim(), note: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Eklenemedi");
      setValue("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/servers/${serverId}/whitelist`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  const active = KINDS.find((k) => k.key === kind)!;

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* Ekleme formu */}
      <Card className="h-fit">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Icons.shieldCheck size={16} className="text-emerald-400" /> Add bypass
        </h3>
        <label className="label">Identifier type</label>
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => setKind(k.key)}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-xs font-medium transition",
                kind === k.key
                  ? "border-brand-500/50 bg-brand-500/10 text-white"
                  : "border-white/10 text-slate-400 hover:bg-white/5"
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <label className="label">{active.label}</label>
        <input
          className="input mb-3"
          placeholder={active.ph}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <label className="label">Note (optional)</label>
        <input
          className="input mb-3"
          placeholder="e.g. Server owner"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="mb-2 text-sm text-rose-400">{error}</p>}
        <button className="btn-primary w-full" onClick={add} disabled={loading}>
          <Icons.plus size={16} /> {loading ? "Adding…" : "Add bypass"}
        </button>
      </Card>

      {/* Liste */}
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-base-850/60">
        {rows.length === 0 ? (
          <EmptyState icon="shieldCheck" title="The bypass list is empty" description="Add the players you want to exempt, by Discord ID or licence." />
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3 font-medium">Added by</th>
                <th className="px-4 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Badge tone={kindTone[r.kind] ?? "blue"}>{r.kind}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">
                    {r.value.replace(/^(discord|license|steam):/, "")}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.note ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{r.createdBy ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remove(r.id)}
                      title="Remove"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
                    >
                      <Icons.trash size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
