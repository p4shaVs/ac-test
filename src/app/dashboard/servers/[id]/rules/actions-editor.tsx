"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";
import {
  DETECTION_TYPES,
  DETECTION_CATEGORIES,
  bestConfidence,
  capByConfidence,
  defaultActions,
  recommendedMax,
  type DetectionAction,
  type DetectionConfidence,
} from "@/lib/detection-actions";
import { cn } from "@/lib/utils";

const ACTION_META: Record<DetectionAction, { label: string; tone: string }> = {
  LOG: { label: "Log", tone: "text-slate-300 border-white/10 bg-white/5" },
  KICK: { label: "Kick", tone: "text-amber-300 border-amber-500/30 bg-amber-500/10" },
  BAN: { label: "Ban", tone: "text-rose-300 border-rose-500/30 bg-rose-500/10" },
};

// How much the check itself can be trusted. This only drives the hint next to each row:
// every action can be picked for every detection and the one you pick is the one that runs.
const CONFIDENCE_META: Record<DetectionConfidence, { label: string; tone: string; note: string }> = {
  confirmed: {
    label: "Confirmed",
    tone: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
    note: "Server-authoritative or physically impossible. Safe to ban on.",
  },
  strong: {
    label: "Strong",
    tone: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
    note: "A specific client-side signal. Kick is the safe choice; a ban is possible but a rare false positive would cost a legitimate player their account.",
  },
  heuristic: {
    label: "Heuristic",
    tone: "bg-slate-500/10 text-slate-300 ring-white/15",
    note: "A noisy signal that is mainly useful for review. Log is the safe choice; Kick or Ban will hit legitimate players now and then.",
  },
};

const RANK: Record<DetectionAction, number> = { LOG: 0, KICK: 1, BAN: 2 };

export function ActionsEditor({
  serverId,
  initialActions,
  initialExplicit,
  pause,
  autoBanLicensed,
}: {
  serverId: string;
  initialActions: Record<string, DetectionAction>;
  initialExplicit: string[];
  pause: "log_only" | "bans_off" | null;
  autoBanLicensed: boolean;
}) {
  const router = useRouter();
  const [actions, setActions] = useState(initialActions);
  const [explicit, setExplicit] = useState<Set<string>>(new Set(initialExplicit));
  const [tab, setTab] = useState<(typeof DETECTION_CATEGORIES)[number]["id"]>(DETECTION_CATEGORIES[0].id);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(
    () =>
      JSON.stringify(actions) !== JSON.stringify(initialActions) ||
      JSON.stringify([...explicit].sort()) !== JSON.stringify([...initialExplicit].sort()),
    [actions, initialActions, explicit, initialExplicit]
  );

  function setFor(type: string, action: DetectionAction) {
    setActions((a) => ({ ...a, [type]: action }));
    setExplicit((e) => new Set(e).add(type));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions, explicit: [...explicit] }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError("Could not save — try again.");
      }
    } catch {
      setError("Could not save — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  const items = DETECTION_TYPES.filter((d) => d.category === tab);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/5 bg-base-850/60 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
            <Icons.bolt size={20} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-white">Detection Punishments</h3>
            <p className="text-xs text-slate-500">
              Pick what happens for each cheat type — record it (Log), remove the player (Kick) or ban them. The action you pick is
              the one that runs, for every report of that type. The badge next to a name says how far the check can be trusted and
              what we recommend; choosing above it means a legitimate player who trips the check gets punished.
            </p>
          </div>
        </div>
      </div>

      {pause && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <span className="font-semibold">Punishments are paused.</span>{" "}
          {pause === "log_only"
            ? "Log-Only Mode is on (Protections → Settings → Enforcement), so every detection below is only recorded."
            : "Enable Bans is off (Protections → Settings → Bans & Evidence), so every detection below is only recorded."}{" "}
          Bans and kicks you issue by hand still work.
        </div>
      )}
      {!autoBanLicensed && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <span className="font-semibold">Your licence does not include Auto Ban.</span> Anything set to Ban is applied as a Kick.
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {DETECTION_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setTab(c.id)}
            className={cn(
              "shrink-0 rounded-xl border px-3.5 py-2 text-sm font-medium transition",
              tab === c.id
                ? "border-brand-500/50 bg-brand-500/10 text-white"
                : "border-white/10 text-slate-400 hover:bg-white/5"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((d) => {
          const current = actions[d.type] ?? d.defaultAction;
          const best = bestConfidence(d);
          const conf = CONFIDENCE_META[best];
          const rec = recommendedMax(d);
          const above = RANK[current] > RANK[rec];
          const touched = explicit.has(d.type) || current !== d.defaultAction;
          // Untouched types keep their safe default: a player's own game can only reach Kick
          // for a check the server cannot verify itself. Picking Ban yourself removes that limit.
          const clientCapped = !touched && capByConfidence(d.defaultAction, d.type, "client") !== d.defaultAction;
          return (
            <div key={d.type} className="rounded-xl border border-white/5 bg-base-850/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200">
                    {d.label}
                    {touched && <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 align-middle text-[10px] font-medium text-slate-400">Custom</span>}
                  </p>
                  <span
                    title={conf.note}
                    className={cn("mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset", conf.tone)}
                  >
                    {conf.label} · recommended up to {ACTION_META[rec].label}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-base-900/60 p-1">
                  {(["LOG", "KICK", "BAN"] as DetectionAction[]).map((a) => (
                    <button
                      key={a}
                      onClick={() => setFor(d.type, a)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-semibold transition",
                        current === a ? ACTION_META[a].tone : "border-transparent text-slate-500 hover:text-slate-300"
                      )}
                    >
                      {ACTION_META[a].label}
                    </button>
                  ))}
                </div>
              </div>
              {above && (
                <p className="mt-2 text-[11px] text-amber-300/90">
                  Above the recommended level — a legitimate player who trips this check will be {current === "BAN" ? "banned" : "kicked"}.
                </p>
              )}
              {clientCapped && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Default: what the server itself sees is banned, the same check reported by the player&apos;s own game is only a Kick.
                  Click {ACTION_META[d.defaultAction].label} to apply it to every report.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

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
          <button
            className="btn-secondary"
            onClick={() => {
              setActions(initialActions);
              setExplicit(new Set(initialExplicit));
            }}
          >
            Cancel Changes
          </button>
          <button
            className="btn-ghost text-xs"
            onClick={() => {
              setActions(defaultActions());
              setExplicit(new Set());
            }}
          >
            Reset to Default
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
