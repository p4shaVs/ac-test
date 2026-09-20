"use client";

import { useState } from "react";
import { Icons, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";
import { ConfigTabs } from "./config-tabs";
import { RulesEditor } from "./rules-editor";
import { ActionsEditor } from "./actions-editor";
import type { ACConfig } from "@/lib/ac-config";
import type { DetectionAction } from "@/lib/detection-actions";

// The Configuration page used to render ONLY the CoreAC protection tabs.
// The server-side guards (silent aim, damage multiplier, explosive bullets,
// vehicle godmode, entity spam, chat flood…) read config.rules, and the
// per-detection punishment lives in config.actions — neither had any UI, so
// half the product was unreachable. All three now live behind one switch.
const SECTIONS: { id: string; label: string; icon: IconName; hint: string }[] = [
  { id: "protections", label: "Protections", icon: "shieldCheck", hint: "What the anti-cheat looks for" },
  { id: "detections", label: "Server Guards", icon: "shield", hint: "Server-side, non-bypassable checks" },
  { id: "actions", label: "Punishments", icon: "bolt", hint: "Log / Kick / Ban per detection" },
];

export function ConfigSections({
  serverId,
  ac,
  rules,
  actions,
}: {
  serverId: string;
  ac: ACConfig;
  rules: Record<string, boolean>;
  actions: Record<string, DetectionAction>;
}) {
  const [section, setSection] = useState(SECTIONS[0].id);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {SECTIONS.map((s) => {
          const Icon = Icons[s.icon];
          const active = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition",
                active
                  ? "border-brand-500/40 bg-brand-500/10"
                  : "border-white/10 bg-base-850/50 hover:bg-white/5"
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                  active ? "bg-brand-gradient text-white shadow-glow" : "bg-white/5 text-slate-400"
                )}
              >
                <Icon size={17} />
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", active ? "text-white" : "text-slate-300")}>
                  {s.label}
                </span>
                <span className="block truncate text-xs text-slate-500">{s.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {section === "protections" && <ConfigTabs serverId={serverId} initialAc={ac} />}
      {section === "detections" && <RulesEditor serverId={serverId} initialRules={rules} />}
      {section === "actions" && <ActionsEditor serverId={serverId} initialActions={actions} />}
    </div>
  );
}
