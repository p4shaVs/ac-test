// Server-authoritative guards (Configuration → "Server Guards" tab).
//
// These toggles drive the checks that run entirely on the SERVER, reading
// Aeigs.getRules() in the FiveM resource (protection.lua, vehicle_guard.lua,
// session_guard.lua, live.lua). They are separate from the "Protections" tab,
// which configures the CoreAC client modules via CoreAC.Config.* (ac-config.ts).
//
// EVERY key here is read by an ACTIVE Lua file. Keys that were only read by the
// disabled client/detections/ folder, or by nothing at all, were removed —
// their real toggles live on the Protections tab. `npm run check:ac` enforces
// that this list and the Lua reads stay in sync, so a dead toggle fails the build.

export interface RuleDef {
  key: string;
  label: string;
  description: string;
  default: boolean;
}
export interface RuleGroup {
  id: string;
  label: string;
  icon: string; // Icons key
  description: string;
  rules: RuleDef[];
}

export const RULE_GROUPS: RuleGroup[] = [
  {
    id: "combat",
    label: "Combat",
    icon: "bolt",
    description: "Server-side weapon and damage checks",
    rules: [
      { key: "anti_silent_aim", label: "Anti Silent Aim", description: "Compares the shooter's real aim vector against the victim on the server — a hit while not aiming at the target is impossible.", default: true },
      { key: "anti_damage_multiplier", label: "Anti Damage Multiplier", description: "Flags single hits above a sane weapon-damage ceiling.", default: true },
      { key: "anti_explosive_bullets", label: "Anti Explosive Bullets", description: "Detects bullet-type explosions fired in quick succession.", default: true },
      { key: "anti_illegal_weapon", label: "Anti Illegal Weapon Damage", description: "Flags weapon damage far beyond any real weapon.", default: true },
      { key: "anti_rapid_fire", label: "Anti Rapid Fire", description: "Report-only. Notes fire rates no real weapon can reach; never bans on its own.", default: true },
      { key: "anti_melee_reach", label: "Anti Melee Reach", description: "Flags a melee weapon (fists, bat, knife…) hitting a player from an impossible distance — the classic reach/grab exploit. Real melee range is ~2 m; only triggers past 10 m, twice in a row. Firearms are never checked (they have long legit range), so normal play can't trip it; kicks at most.", default: true },
      { key: "anti_wallhack", label: "Anti Wallbang / ESP", description: "Report-only. Notes hits with no line of sight to the victim; noisy, never bans on its own.", default: true },
    ],
  },
  {
    id: "world",
    label: "Vehicles & World",
    icon: "cube",
    description: "Server checks on vehicles, health and position",
    rules: [
      { key: "anti_vehicle_godmode", label: "Anti Vehicle Godmode", description: "Detects a vehicle that takes real damage but never loses body health. Blames the driver.", default: true },
      { key: "anti_out_of_bounds", label: "Anti Out of Bounds", description: "Flags teleporting far outside the world bounds (under the map / into objects).", default: true },
      { key: "anti_explosion_spam", label: "Anti Explosion Spam", description: "Report-only. Notes players creating explosions unusually fast.", default: true },
      { key: "anti_armor_regen", label: "Anti Armor Regeneration", description: "Report-only. Notes armour rising sharply without a pickup, outside revives.", default: false },
      { key: "anti_instant_repair", label: "Anti Instant Repair", description: "Report-only. Notes a wrecked vehicle jumping to full health; legit mechanics do this too.", default: false },
    ],
  },
  {
    id: "session",
    label: "Session",
    icon: "users",
    description: "Connection and chat abuse",
    rules: [
      { key: "anti_chat_flood", label: "Anti Chat Flood", description: "Blocks chat spam (only if a resource fires the chatMessage event).", default: true },
      { key: "anti_event_flood", label: "Anti Event Flood", description: "Flags a player spamming the anti-cheat's own control events far past any legitimate rate (crash / exploit tools). Ignores per-shot, position and join events, so normal play never trips it; kicks at most, never bans.", default: true },
      { key: "anti_reconnect_spam", label: "Anti Reconnect Spam", description: "Report-only. Flags the same identifier reconnecting many times in two minutes.", default: true },
      { key: "anti_resource_mismatch", label: "Anti Resource Mismatch", description: "Warns when a resource outside your allowlist starts. Requires Config.AllowedResources to be set in config.lua, otherwise it does nothing.", default: false },
    ],
  },
];

/** All rule defaults, keyed. */
export function defaultRules(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const g of RULE_GROUPS) for (const r of g.rules) out[r.key] = r.default;
  return out;
}

const ALL_KEYS = new Set(RULE_GROUPS.flatMap((g) => g.rules.map((r) => r.key)));

/** Keep only known keys with boolean values. */
export function sanitizeRules(input: unknown): Record<string, boolean> {
  const base = defaultRules();
  if (input && typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (ALL_KEYS.has(k) && typeof v === "boolean") base[k] = v;
    }
  }
  return base;
}
