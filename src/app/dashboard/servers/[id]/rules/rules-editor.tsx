"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";
import { RULE_GROUPS, defaultRules } from "@/lib/rules";
import { cn } from "@/lib/utils";

export function RulesEditor({
  serverId,
  initialRules,
}: {
  serverId: string;
  initialRules: Record<string, boolean>;
}) {
  const router = useRouter();
  const [rules, setRules] = useState<Record<string, boolean>>(initialRules);
  const [tab, setTab] = useState(RULE_GROUPS[0].id);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(rules) !== JSON.stringify(initialRules),
    [rules, initialRules]
  );

  const activeCount = useMemo(
    () => Object.values(rules).filter(Boolean).length,
    [rules]
  );

  function toggle(key: string) {
    setRules((r) => ({ ...r, [key]: !r[key] }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/rules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  const group = RULE_GROUPS.find((g) => g.id === tab)!;
  const q = query.toLowerCase();
  const searching = q.length > 0;

  return (
    <div className="space-y-5">
      {/* Üst bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-base-850/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
            <Icons.shieldCheck size={20} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-white">Server guards</h3>
            <p className="text-xs text-slate-500">
              {activeCount} guards enabled · changes reach the server on its next heartbeat
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icons.search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input h-9 w-full pl-9 sm:w-56"
              placeholder="Search guards…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Sekmeler */}
      {!searching && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {RULE_GROUPS.map((g) => {
            const Icon = (Icons as any)[g.icon] ?? Icons.shield;
            const on = g.rules.filter((r) => rules[r.key]).length;
            return (
              <button
                key={g.id}
                onClick={() => setTab(g.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition",
                  tab === g.id
                    ? "border-brand-500/50 bg-brand-500/10 text-white"
                    : "border-white/10 text-slate-400 hover:bg-white/5"
                )}
              >
                <Icon size={16} />
                {g.label}
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px]">{on}/{g.rules.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Kural listesi */}
      <div className="grid gap-3 md:grid-cols-2">
        {(searching
          ? RULE_GROUPS.flatMap((g) => g.rules).filter((r) =>
              r.label.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
            )
          : group.rules
        ).map((r) => (
          <button
            key={r.key}
            onClick={() => toggle(r.key)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-base-850/60 px-4 py-3 text-left transition hover:border-white/10 hover:bg-base-800/60"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200">{r.label}</p>
              <p className="truncate text-xs text-slate-500">{r.description}</p>
            </div>
            <Switch on={!!rules[r.key]} />
          </button>
        ))}
      </div>

      {/* Kaydet çubuğu (dirty ise) */}
      <div
        className={cn(
          "sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-card backdrop-blur-xl transition-all",
          dirty
            ? "border-brand-500/30 bg-base-850/90 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0"
        )}
      >
        <span className="text-sm text-slate-300">
          {saved ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Icons.check size={16} /> Saved
            </span>
          ) : (
            "You have unsaved changes"
          )}
        </span>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setRules(initialRules)}>
            Undo changes
          </button>
          <button className="btn-ghost text-xs" onClick={() => setRules(defaultRules())}>
            Reset to default
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Kaydediliyor…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition",
        on ? "bg-brand-500" : "bg-white/10"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
          on ? "translate-x-6" : "translate-x-1"
        )}
      />
    </span>
  );
}
