"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PageHeader, Badge } from "@/components/ui";
import { Icons, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface Preset {
  id: string;
  name: string;
  icon: IconName;
  tone: "brand" | "rose" | "amber" | "violet";
  desc: string;
  rules: Record<string, boolean>;
}

const TONE: Record<string, string> = {
  brand: "text-brand-300 bg-brand-500/10 ring-brand-500/25",
  rose: "text-rose-300 bg-rose-500/10 ring-rose-500/25",
  amber: "text-amber-300 bg-amber-500/10 ring-amber-500/25",
  violet: "text-purple-300 bg-purple-500/10 ring-purple-500/25",
};

export function ConfigLibrary({
  serverId,
  presets,
  active,
}: {
  serverId: string;
  presets: Preset[];
  active: Record<string, boolean>;
}) {
  const router = useRouter();
  const [applying, setApplying] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function matches(preset: Preset) {
    return Object.entries(preset.rules).every(([k, v]) => (active[k] ?? false) === v);
  }

  async function apply(preset: Preset) {
    if (!confirm(`Apply the "${preset.name}" preset? This replaces your current Server Guard settings.`)) return;
    setApplying(preset.id);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/rules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: preset.rules }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not apply preset");
      setDone(preset.id);
      setTimeout(() => setDone(null), 2500);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setApplying(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Config Library"
        description="One-click protection presets. Applying a preset replaces your Server Guards — you can still fine-tune afterwards in Configuration."
      />
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {presets.map((p) => {
          const Icon = Icons[p.icon];
          const on = Object.values(p.rules).filter(Boolean).length;
          const total = Object.keys(p.rules).length;
          const active_ = matches(p);
          return (
            <Card key={p.id} className="flex flex-col">
              <div className="mb-3 flex items-start gap-3">
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset", TONE[p.tone])}>
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-white">{p.name}</h3>
                    {active_ && <Badge tone="green" dot>Active</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{on}/{total} guards enabled</p>
                </div>
              </div>
              <p className="mb-4 flex-1 text-sm text-slate-400">{p.desc}</p>
              <button
                onClick={() => apply(p)}
                disabled={applying !== null || active_}
                className={cn(
                  "w-full rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-50",
                  active_
                    ? "border border-white/10 text-slate-400"
                    : "bg-brand-gradient text-white hover:brightness-110"
                )}
              >
                {applying === p.id ? "Applying…" : done === p.id ? "Applied ✓" : active_ ? "Currently active" : "Apply preset"}
              </button>
            </Card>
          );
        })}
      </div>
    </>
  );
}
