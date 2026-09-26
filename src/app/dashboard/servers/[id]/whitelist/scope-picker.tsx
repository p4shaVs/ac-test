"use client";

import { useMemo, useState } from "react";
import { DETECTION_CATEGORIES, DETECTION_TYPES, detectionLabel } from "@/lib/detection-actions";
import { cn } from "@/lib/utils";

// Scope of a trust-whitelist entry: [] = every protection. Otherwise a list of
// "cat:<category>" and/or detection types (see src/lib/bypass.ts).

export function scopeSummary(scope: string[]): string[] {
  if (!scope.length) return ["Everything"];
  return scope.map((s) =>
    s.startsWith("cat:") ? DETECTION_CATEGORIES.find((c) => c.id === s.slice(4))?.label ?? s : detectionLabel(s)
  );
}

export function ScopePicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [mode, setMode] = useState<"all" | "some">(value.length ? "some" : "all");
  const [q, setQ] = useState("");
  const set = useMemo(() => new Set(value), [value]);

  const toggle = (key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  };

  const needle = q.trim().toLowerCase();
  const types = DETECTION_TYPES.filter((d) => !needle || d.label.toLowerCase().includes(needle) || d.type.toLowerCase().includes(needle));

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-base-950/40 p-1">
        {(["all", "some"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); if (m === "all") onChange([]); }}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-semibold transition",
              mode === m ? "bg-brand-500/20 text-white ring-1 ring-inset ring-brand-500/40" : "text-slate-400 hover:text-slate-200"
            )}
          >
            {m === "all" ? "Every protection" : "Selected protections"}
          </button>
        ))}
      </div>

      {mode === "all" ? (
        <p className="mt-2 text-xs text-slate-500">
          Never kicked or banned by any detection. Detections are still logged. Good for owners and trusted staff.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Whole groups</p>
            <div className="flex flex-wrap gap-1.5">
              {DETECTION_CATEGORIES.map((c) => {
                const key = `cat:${c.id}`;
                const on = set.has(key);
                const n = DETECTION_TYPES.filter((d) => d.category === c.id).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition",
                      on ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {c.label}
                    <span className="font-mono text-[10px] text-slate-500">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Single detections</p>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter…"
                className="w-32 rounded-md border border-white/10 bg-base-950/40 px-2 py-1 text-xs text-slate-200 outline-none focus:border-brand-500/50"
              />
            </div>
            <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-lg border border-white/5 bg-base-950/30 p-1">
              {types.map((d) => {
                const viaCat = set.has(`cat:${d.category}`);
                const on = viaCat || set.has(d.type);
                return (
                  <label
                    key={d.type}
                    className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-white/[0.03]", viaCat && "cursor-default opacity-60")}
                  >
                    <input type="checkbox" className="accent-emerald-500" checked={on} disabled={viaCat} onChange={() => toggle(d.type)} />
                    <span className="flex-1 truncate text-slate-300">{d.label}</span>
                    {viaCat && <span className="text-[10px] text-slate-500">via group</span>}
                  </label>
                );
              })}
            </div>
          </div>
          {!value.length && <p className="text-xs text-amber-300">Pick at least one protection, or choose “Every protection”.</p>}
        </div>
      )}
    </div>
  );
}
