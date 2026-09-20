import { getOwnedServer } from "@/lib/guards";
import { parseJson } from "@/lib/utils";
import { defaultRules, RULE_GROUPS } from "@/lib/rules";
import { ConfigLibrary, type Preset } from "./config-library";

export const dynamic = "force-dynamic";

const ALL_KEYS = RULE_GROUPS.flatMap((g) => g.rules.map((r) => r.key));
const set = (keys: string[], on: boolean) => Object.fromEntries(ALL_KEYS.map((k) => [k, on ? keys.includes(k) : !keys.includes(k)]));
const allOn = Object.fromEntries(ALL_KEYS.map((k) => [k, true]));

// Presets are just Server-Guard rule sets applied via PATCH /rules — real config,
// no dead switches. Keys come from rules.ts so they always match the Lua.
export default async function ConfigLibraryPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const current = parseJson<Record<string, unknown>>(server.config, {});
  const active = parseJson<Record<string, boolean>>(JSON.stringify(current.rules ?? {}), {});

  const presets: Preset[] = [
    {
      id: "recommended",
      name: "Recommended",
      icon: "shieldCheck",
      tone: "brand",
      desc: "Balanced defaults — strong protection with the lowest false-positive risk. A safe starting point for most servers.",
      rules: defaultRules(),
    },
    {
      id: "max",
      name: "Maximum Protection",
      icon: "shield",
      tone: "rose",
      desc: "Every server guard on, including the report-only heuristics. Best coverage; review Events for a day before trusting bans.",
      rules: allOn,
    },
    {
      id: "combat",
      name: "Combat / PvP",
      icon: "bolt",
      tone: "amber",
      desc: "All weapon and damage checks on; world and vehicle checks relaxed. For hardcore PvP and deathmatch servers.",
      rules: {
        ...defaultRules(),
        anti_silent_aim: true,
        anti_damage_multiplier: true,
        anti_explosive_bullets: true,
        anti_illegal_weapon: true,
        anti_rapid_fire: true,
        anti_wallhack: true,
        anti_melee_reach: true,
        anti_instant_repair: false,
        anti_armor_regen: false,
      },
    },
    {
      id: "rp",
      name: "Roleplay",
      icon: "users",
      tone: "violet",
      desc: "Tuned for RP frameworks (ESX/QB): health, vehicle and session guards on, combat heuristics report-only to avoid RP false flags.",
      rules: {
        ...defaultRules(),
        anti_vehicle_godmode: true,
        anti_out_of_bounds: true,
        anti_chat_flood: true,
        anti_event_flood: true,
        anti_reconnect_spam: true,
      },
    },
  ];

  return <ConfigLibrary serverId={server.id} presets={presets} active={active} />;
}
