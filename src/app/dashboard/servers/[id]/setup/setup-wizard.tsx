"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { Icons, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

// A rule-based recommendation wizard — honest, not "AI". It composes a Server
// Guard set from the answers and applies it via PATCH /rules (real config).
const TYPES: { id: string; label: string; icon: IconName; desc: string }[] = [
  { id: "rp", label: "Roleplay", icon: "users", desc: "ESX / QBCore / ox — economy, jobs, characters" },
  { id: "pvp", label: "Combat / PvP", icon: "bolt", desc: "Deathmatch, TDM, hardcore combat" },
  { id: "freeroam", label: "Freeroam", icon: "map", desc: "Racing, drift, open world, casual" },
];
const LEVELS: { id: string; label: string; desc: string }[] = [
  { id: "relaxed", label: "Relaxed", desc: "Only the highest-confidence checks. Fewest false positives." },
  { id: "balanced", label: "Balanced", desc: "Recommended for most servers." },
  { id: "strict", label: "Strict", desc: "Everything on, including noisy heuristics. Watch Events first." },
];

const ALL = [
  "anti_silent_aim", "anti_damage_multiplier", "anti_explosive_bullets", "anti_illegal_weapon",
  "anti_rapid_fire", "anti_wallhack", "anti_melee_reach", "anti_vehicle_godmode", "anti_out_of_bounds",
  "anti_explosion_spam", "anti_armor_regen", "anti_instant_repair", "anti_chat_flood", "anti_event_flood",
  "anti_reconnect_spam", "anti_resource_mismatch",
];

function compose(defaults: Record<string, boolean>, type: string, level: string): Record<string, boolean> {
  const r: Record<string, boolean> = { ...defaults };
  if (level === "strict") for (const k of ALL) r[k] = true;
  if (level === "relaxed") {
    for (const k of ALL) r[k] = false;
    for (const k of ["anti_silent_aim", "anti_damage_multiplier", "anti_illegal_weapon", "anti_vehicle_godmode", "anti_out_of_bounds", "anti_melee_reach"]) r[k] = true;
  }
  // Type nudges
  if (type === "pvp") {
    r.anti_rapid_fire = true; r.anti_wallhack = true; r.anti_explosive_bullets = true;
    r.anti_instant_repair = false; r.anti_armor_regen = false;
  }
  if (type === "rp") {
    r.anti_chat_flood = true; r.anti_reconnect_spam = true; r.anti_event_flood = true;
    if (level !== "strict") r.anti_rapid_fire = false; // RP gunfights are bursty
  }
  if (type === "freeroam") {
    r.anti_vehicle_godmode = true; r.anti_out_of_bounds = true;
  }
  return r;
}

export function SetupWizard({
  serverId,
  defaults,
  labels,
}: {
  serverId: string;
  defaults: Record<string, boolean>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [type, setType] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => (type && level ? compose(defaults, type, level) : null), [type, level, defaults]);
  const enabled = result ? Object.keys(result).filter((k) => result[k]) : [];

  async function apply() {
    if (!result) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/rules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: result }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not apply");
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <PageHeader title="Setup Assistant" description="Answer two questions and we recommend a protection profile tuned to your server, then apply it in one click." />

      <div className="space-y-4">
        <Card>
          <h3 className="mb-1 text-sm font-semibold text-white">1 · What kind of server is this?</h3>
          <p className="mb-4 text-xs text-slate-500">This decides which checks are safe to run hard vs. keep report-only.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {TYPES.map((t) => {
              const Icon = Icons[t.icon];
              return (
                <button key={t.id} onClick={() => setType(t.id)} className={cn("rounded-xl border p-4 text-left transition", type === t.id ? "border-brand-500/50 bg-brand-500/10" : "border-white/10 hover:bg-white/5")}>
                  <Icon size={20} className={type === t.id ? "text-brand-300" : "text-slate-400"} />
                  <p className="mt-2 text-sm font-semibold text-white">{t.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{t.desc}</p>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <h3 className="mb-1 text-sm font-semibold text-white">2 · How strict do you want it?</h3>
          <p className="mb-4 text-xs text-slate-500">You can change any of this afterwards in Configuration.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <button key={l.id} onClick={() => setLevel(l.id)} className={cn("rounded-xl border p-4 text-left transition", level === l.id ? "border-brand-500/50 bg-brand-500/10" : "border-white/10 hover:bg-white/5")}>
                <p className="text-sm font-semibold text-white">{l.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{l.desc}</p>
              </button>
            ))}
          </div>
        </Card>

        {result && (
          <Card>
            <h3 className="mb-1 text-sm font-semibold text-white">Recommended profile</h3>
            <p className="mb-4 text-xs text-slate-500">{enabled.length} server guards will be enabled.</p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {ALL.map((k) => (
                <span key={k} className={cn("rounded-lg border px-2.5 py-1 text-[11px] font-medium", result[k] ? "border-brand-500/40 bg-brand-500/10 text-brand-200" : "border-white/10 text-slate-500")}>
                  {labels[k] ?? k}
                </span>
              ))}
            </div>
            {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
            <button onClick={apply} disabled={applying || done} className="btn-primary w-full">
              {applying ? "Applying…" : done ? "Applied ✓ — fine-tune in Configuration" : "Apply this profile"}
            </button>
          </Card>
        )}
      </div>
    </>
  );
}
