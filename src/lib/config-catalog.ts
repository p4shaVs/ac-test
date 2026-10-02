// =============================================================================
// Configuration catalog — the single Configuration page groups EVERYTHING by what
// it protects against: each row is one protection with
//   * its on/off switch      → a CoreAC.Config field (config.ac) or a server guard (config.rules)
//   * the punishment          → one or more detection types (config.actions)
//   * its extra parameters    → other CoreAC.Config fields (limits, lists)
//
// The mapping below follows the Lua modules (which file reads which switch and
// reports which type). `buildCatalog()` adds every detection type that has no switch
// of its own as an "always on" row, so nothing the panel can punish is unreachable;
// tools/sim/panel-checks.ts proves every switch, guard and type appears exactly where
// it should.
// =============================================================================

import type { IconName } from "@/components/icons";
import { AC_TABS, type ACField } from "./ac-config";
import { RULE_GROUPS } from "./rules";
import { DETECTION_TYPES, detectionLabel } from "./detection-actions";

export type ToggleRef = { kind: "ac"; section: string; key: string } | { kind: "rule"; key: string };

export interface CatalogItem {
  id: string;
  label: string;
  desc: string;
  /** The row's switch; none = always running. */
  toggle?: ToggleRef;
  /** Detection types this row's punishment applies to. */
  types: string[];
  /** Extra CoreAC.Config fields ("Section.Key") edited in the row's drawer. */
  params: string[];
  /** Gameplay switch / console logging — not a detection, shown without a punishment. */
  utility?: boolean;
}

export interface CatalogCategory {
  id: string;
  label: string;
  icon: IconName;
  desc: string;
  items: CatalogItem[];
}

const ALL_AC_FIELDS: ACField[] = AC_TABS.flatMap((t) => t.cards.flatMap((c) => c.fields));
const AC_BY_ID = new Map(ALL_AC_FIELDS.map((f) => [`${f.section}.${f.key}`, f]));
const RULE_BY_KEY = new Map(RULE_GROUPS.flatMap((g) => g.rules).map((r) => [r.key, r]));

export function acField(id: string): ACField | undefined {
  return AC_BY_ID.get(id);
}

/** A row driven by a CoreAC.Config switch; label/description default to the field's own. */
function ac(id: string, types: string[] = [], params: string[] = [], o: { label?: string; desc?: string; utility?: boolean } = {}): CatalogItem {
  const f = AC_BY_ID.get(id);
  if (!f) throw new Error(`config-catalog: unknown CoreAC.Config field ${id}`);
  return {
    id: `ac:${id}`,
    label: o.label ?? f.label.replace(/^Anti /, ""),
    desc: o.desc ?? f.desc ?? "",
    toggle: { kind: "ac", section: f.section, key: f.key },
    types,
    params,
    utility: o.utility,
  };
}

/** A row driven by a server guard (config.rules). */
function rule(key: string, types: string[] = [], o: { label?: string; desc?: string; params?: string[] } = {}): CatalogItem {
  const r = RULE_BY_KEY.get(key);
  if (!r) throw new Error(`config-catalog: unknown server guard ${key}`);
  return {
    id: `rule:${key}`,
    label: o.label ?? r.label.replace(/^Anti /, ""),
    desc: o.desc ?? r.description,
    toggle: { kind: "rule", key },
    types,
    params: o.params ?? [],
  };
}

/** A row with no switch (the check always runs); only parameters and punishment. */
function always(id: string, label: string, desc: string, types: string[], params: string[] = []): CatalogItem {
  return { id: `always:${id}`, label, desc, types, params };
}

const CATEGORIES: CatalogCategory[] = [
  {
    id: "injection",
    label: "Injection & Executors",
    icon: "plug",
    desc: "Cheat menus, injected resources and attempts to switch the anti-cheat off",
    items: [
      ac("Main.E2", ["OVERLAY"], [], { label: "Executor Overlay — Insert / PageDown" }),
      ac("Main.E3", ["OVERLAY"], [], { label: "Executor Overlay — PageUp" }),
      ac("Main.E4", ["OVERLAY"], [], { label: "Executor Overlay — Idle Cursor Lock" }),
      ac("Main.E6", ["OVERLAY"], [], { label: "Executor Overlay — Aggressive" }),
      ac("Main.AntiLuaMenu", ["LUA_MENU", "BYPASS_ATTEMPT"]),
      ac("Main.AntiResourceInjection", ["RESOURCE_INJECT"]),
      ac("Main.AntiResourceStop", ["AC_TAMPER"], [], {
        label: "Anti-Cheat Stop / Tamper",
        desc: "Flags a player who stops or suspends a resource that still runs on the server. The server also notices when the anti-cheat on a player's game goes quiet or answers its challenge wrongly, and the anti-cheat checks its own code every 15 seconds for functions an executor swapped out.",
      }),
      ac("Settings.EnableAntiBackdoors", ["BACKDOOR"], ["Settings.StopServerWhenDetected"], { label: "Backdoor Protection" }),
    ],
  },
  {
    id: "crash",
    label: "Anti-Crash",
    icon: "shield",
    desc: "Stops a cheater from crashing other players — blocked before it reaches them",
    items: [
      rule("anti_crash_models", ["CRASH_ATTEMPT"]),
      rule("anti_crash_attach", ["CRASH_ATTEMPT", "ENTITY_FLOOD"]),
      rule("anti_crash_flood", ["ENTITY_FLOOD", "CRASH_ATTEMPT"]),
      rule("anti_crash_events", ["CRASH_ATTEMPT", "EVENT_EXPLOIT"]),
      rule("anti_event_flood", ["EVENT_EXPLOIT"]),
    ],
  },
  {
    id: "movement",
    label: "Movement",
    icon: "activity",
    desc: "Teleport, noclip, speed and jump cheats",
    items: [
      ac("Main.AntiTeleport", ["TELEPORT"]),
      ac("Main.AntiNoClip", ["NOCLIP"]),
      ac("Main.AntiSpeedHack", ["SPEED_HACK"]),
      ac("Main.AntiSuperJump", ["SUPER_JUMP"]),
      rule("anti_out_of_bounds", ["OUT_OF_BOUNDS"]),
    ],
  },
  {
    id: "weapons",
    label: "Weapons & Aim",
    icon: "crosshair",
    desc: "Aim assistance, bullets, ammo and weapon spawning",
    items: [
      rule("anti_silent_aim", ["SILENT_AIM", "SILENT_AIM_SUBTLE"]),
      ac("Weapons.AntiAimBot", ["AIMBOT"]),
      ac("Weapons.AntiSpoofedBullets", ["SPOOFED_BULLETS"]),
      ac("Weapons.AntiNoRecoil", ["NO_RECOIL"]),
      ac("Weapons.AntiHitboxModifier", ["HITBOX_MODIFIER"]),
      ac("Weapons.AntiExplosiveBullets", ["EXPLOSIVE_BULLETS", "STUNNING_BULLETS"], [], { label: "Explosive / Stun Bullets (client)" }),
      ac("Weapons.AntiAmmoCheating", ["AMMO_CHEAT"]),
      ac("Weapons.AntiInfiniteAmmo", ["INFINITE_AMMO", "NO_RELOAD"]),
      ac("Weapons.AntiWeaponComponentModifier", ["WEAPON_COMPONENT"]),
      ac("Weapons.AntiWeaponSpawner", ["WEAPON_SPAWN", "WEAPON_SPOOF"], ["Weapons.AddonWeapons"]),
      ac("Weapons.EnableWeaponsBlackList", ["BLACKLIST_WEAPON"], ["Weapons.BlackListedWeapons"], { label: "Weapon Blacklist" }),
      ac("Weapons.AntiGiveWeapons", ["GIVE_WEAPON"]),
      ac("Weapons.AntiRemoveWeapons", ["REMOVE_WEAPON"]),
      ac("Weapons.AntiSuperPunch", ["SUPER_PUNCH"]),
      rule("anti_melee_reach", ["REACH"]),
      rule("anti_rapid_fire", ["RAPID_FIRE"]),
      rule("anti_wallhack", ["WALLBANG"]),
      rule("anti_headshot_rate", ["HEADSHOT_RATE"]),
      ac("Weapons.AntiKill", ["KILL_EXPLOIT"]),
      ac("Beta.AntiSilentAim", [], [], {
        label: "Silent Aim — Client Telemetry (beta)",
        desc: "Experimental client-side measurement. The server-side Silent Aim guard above is the one that decides and punishes.",
      }),
    ],
  },
  {
    id: "damage",
    label: "Damage",
    icon: "bolt",
    desc: "Damage boosts, one-shots and impossible damage",
    items: [
      rule("anti_damage_multiplier", ["DAMAGE_MULTIPLIER", "DAMAGE_PEER_MISMATCH", "ONE_SHOT_KILL"], { label: "Damage Boost" }),
      ac("Weapons.AntiWeaponDamagesModifier", ["DAMAGE_MULTIPLIER"], [], { label: "Damage Modifier (client)" }),
      rule("anti_illegal_weapon", ["ILLEGAL_WEAPON"]),
      rule("anti_explosive_bullets", ["EXPLOSIVE_BULLETS"], { label: "Explosive Bullets (server)" }),
    ],
  },
  {
    id: "health",
    label: "Health & Armor",
    icon: "heart",
    desc: "Godmode, armour and ragdoll manipulation",
    items: [
      always("godmode-server", "Godmode (server-verified)", "The server watches a player who keeps getting hit without losing health while they fight back. Always on — admins with staff bypass and downed players are recognised.", ["GODMODE"]),
      ac("Main.AntiInvincible", ["GODMODE"]),
      ac("Main.AntiOverrideHealthStats", ["ARMOR_HACK"]),
      ac("Main.AntiNoCombatDamages", ["GODMODE"]),
      rule("anti_armor_regen", ["ARMOR_REGEN"]),
      ac("Main.AntiNoRagdoll", ["NO_RAGDOLL"]),
      ac("Main.AntiInfiniteStamina", ["INFINITE_STAMINA"]),
      ac("Premium.AntiRagdollExploit", []),
    ],
  },
  {
    id: "visual",
    label: "Visual & Camera",
    icon: "eye",
    desc: "Spectate, freecam, invisibility and similar",
    items: [
      ac("Main.AntiSpectate", ["SPECTATE"]),
      ac("Main.AntiFreeCam", ["FREECAM", "FREECAM_SUSPECTED"]),
      ac("Main.AntiInvisible", ["INVISIBLE"]),
      ac("Main.AntiPedModelChange", ["MODEL_CHANGE"]),
      ac("Main.AntiNightVisions", ["NIGHT_VISION"]),
      ac("Main.AntiVoiceExploits", ["VOICE_EXPLOIT", "SOUND_EXPLOIT"]),
      ac("Main.AntiAFKBypass", ["AFK_BYPASS"]),
      ac("Main.AntiClearTasks", ["CLEAR_TASKS"]),
    ],
  },
  {
    id: "vehicles",
    label: "Vehicles",
    icon: "car",
    desc: "Vehicle speed, godmode, spawning and trolling",
    items: [
      rule("anti_vehicle_speed", ["VEHICLE_SPEED_HACK"]),
      rule("anti_vehicle_godmode", ["VEHICLE_GODMODE"]),
      rule("anti_instant_repair", ["INSTANT_REPAIR"]),
      ac("Entities.AntiSpeedModifier", ["VEHICLE_SPEED"]),
      ac("Entities.AntiHandlingModifier", ["VEHICLE_HANDLING"]),
      ac("Entities.AntiThrowVehicles", ["THROW_VEHICLE"]),
      ac("Entities.AntiSpawnIsolatedVehicles", ["ISOLATED_VEHICLE"]),
      ac("Entities.EnableVehiclesBlackList", ["BLACKLIST_VEHICLE"], ["Entities.BlackListedVehicles"], { label: "Vehicle Blacklist" }),
      ac("Entities.EnableVehiclesWhiteList", ["VEHICLE_WHITELIST"], ["Entities.WhiteListedVehicles"], { label: "Vehicle Whitelist" }),
      ac("Entities.EnableVehiclesLimiter", ["VEHICLE_LIMIT"], ["Entities.VehiclesLimitIn5Seconds"], { label: "Vehicle Spawn Limiter" }),
      ac("Entities.AntiVehiclePlateChanger", ["PLATE_CHANGER"]),
      ac("Entities.AntiTeleportInVehicle", ["VEHICLE_HIJACK"]),
      ac("Beta.AntiAttachVehicles", ["ATTACH_VEHICLE"], [], { label: "Attach Vehicles (beta)" }),
      ac("Entities.AntiDeleteVehicles", []),
      ac("Premium.AntiBombVehicles", []),
      ac("Beta.AntiMagneto", [], [], { label: "Magneto (beta)" }),
      ac("Entities.NoCarKill", [], [], { utility: true }),
      ac("Entities.LogVehicleSpawnsToConsole", [], [], { utility: true }),
    ],
  },
  {
    id: "entities",
    label: "Peds & Objects",
    icon: "cube",
    desc: "Spawned peds, props and pickups",
    items: [
      ac("Entities.EnablePedsBlackList", ["BLACKLIST_PED"], ["Entities.BlackListedPeds"], { label: "Ped Blacklist" }),
      ac("Entities.EnablePedsWhiteList", ["PED_WHITELIST"], ["Entities.WhiteListedPeds"], { label: "Ped Whitelist" }),
      ac("Entities.EnablePedsLimiter", ["PED_LIMIT"], ["Entities.PedsLimitIn5Seconds"], { label: "Ped Spawn Limiter" }),
      ac("Entities.EnableObjectsBlackList", ["BLACKLIST_OBJECT"], ["Entities.BlackListedObjects"], { label: "Object Blacklist" }),
      ac("Entities.EnableObjectsWhiteList", ["OBJECT_WHITELIST"], ["Entities.WhiteListedObjects"], { label: "Object Whitelist" }),
      ac("Entities.EnableObjectsLimiter", ["OBJECT_LIMIT"], ["Entities.ObjectsLimitIn5Seconds"], { label: "Object Spawn Limiter" }),
      ac("Entities.AntiPickupSpawn", ["PICKUP_SPAWN"]),
      ac("Premium.AntiRequestControl", ["REQUEST_CONTROL"]),
      ac("Entities.DisableNPCPopulation", [], [], { utility: true }),
      ac("Entities.LogPedSpawnsToConsole", [], [], { utility: true }),
      ac("Entities.LogObjectSpawnsToConsole", [], [], { utility: true }),
    ],
  },
  {
    id: "explosions",
    label: "Explosions & Particles",
    icon: "flame",
    desc: "Explosions, particle effects and projectiles",
    items: [
      ac("Explosions.EnableExplosionsBlackList", ["BLACKLIST_EXPLOSION"], ["Explosions.BlackListedExplosions"], { label: "Explosion Blacklist" }),
      ac("Explosions.DetectInvisibleExplosions", ["INVISIBLE_EXPLOSION"]),
      ac("Explosions.DetectInaudibleExplosions", ["INAUDIBLE_EXPLOSION"]),
      ac("Explosions.EnableExplosionsLimiter", ["EXPLOSION_LIMIT", "EXPLOSION_SPAWN"], ["Explosions.ExplosionsLimitIn5Seconds"], { label: "Explosion Limiter" }),
      rule("anti_explosion_spam", ["EXPLOSION"]),
      ac("Explosions.EnableParticlesWhiteList", ["PARTICLE_WHITELIST"], ["Explosions.WhiteListedParticles"], { label: "Particle Whitelist" }),
      ac("Explosions.DetectParticlesAttachedToEntity", ["PARTICLE_ATTACHED"]),
      always("particle-scale", "Particle Scale Limit", "Particle effects bigger than the limit are cancelled — the classic screen-filling troll.", ["PARTICLE_SCALE"], ["Explosions.MaxParticleScale"]),
      ac("Weapons.EnableProjectilesWhiteList", ["PROJECTILE_WHITELIST"], ["Weapons.WhiteListedProjectiles"], { label: "Projectile Whitelist" }),
      ac("Weapons.EnableProjectilesLimiter", ["PROJECTILE_LIMIT"], ["Weapons.ProjectilesLimitIn5Seconds"], { label: "Projectile Limiter" }),
      ac("Explosions.CancelAllExplosions", [], [], { utility: true }),
      ac("Explosions.CancelAllFires", [], [], { utility: true }),
      ac("Explosions.LogExplosionSpawnsToConsole", [], [], { utility: true }),
      ac("Explosions.LogParticleSpawnsToConsole", [], [], { utility: true }),
      ac("Weapons.LogProjectileSpawnsToConsole", [], [], { utility: true }),
    ],
  },
  {
    id: "session",
    label: "Session & Network",
    icon: "users",
    desc: "Chat spam, reconnects, ban evasion and the cross-server network",
    items: [
      rule("anti_ban_evasion", []),
      rule("anti_chat_flood", ["CHAT_FLOOD"]),
      rule("anti_reconnect_spam", ["RECONNECT_SPAM"]),
      rule("anti_resource_mismatch", []),
    ],
  },
];

/** Registry category → page category for detection types that have no switch of their own. */
const REGISTRY_HOME: Record<string, string> = {
  movement: "movement",
  combat: "weapons",
  survival: "health",
  visual: "visual",
  entity: "entities",
  explosion: "explosions",
  integrity: "injection",
  other: "session",
};

/** The full page: curated rows + an "always on" row for every type not covered yet. */
export function buildCatalog(): CatalogCategory[] {
  const cats = CATEGORIES.map((c) => ({ ...c, items: [...c.items] }));
  const covered = new Set(cats.flatMap((c) => c.items.flatMap((i) => i.types)));
  for (const d of DETECTION_TYPES) {
    if (covered.has(d.type)) continue;
    const home = cats.find((c) => c.id === (REGISTRY_HOME[d.category] ?? "session"))!;
    home.items.push(
      always(
        `type:${d.type}`,
        detectionLabel(d.type),
        "This check is always running. Choose what happens when it fires.",
        [d.type]
      )
    );
    covered.add(d.type);
  }
  return cats;
}

/** Every CoreAC.Config field the catalog shows (as a switch or a parameter). */
export function catalogAcFields(cats: CatalogCategory[] = buildCatalog()): Set<string> {
  const out = new Set<string>();
  for (const c of cats) {
    for (const i of c.items) {
      if (i.toggle?.kind === "ac") out.add(`${i.toggle.section}.${i.toggle.key}`);
      for (const p of i.params) out.add(p);
    }
  }
  return out;
}

/** Every server guard the catalog shows. */
export function catalogRules(cats: CatalogCategory[] = buildCatalog()): Set<string> {
  const out = new Set<string>();
  for (const c of cats) for (const i of c.items) if (i.toggle?.kind === "rule") out.add(i.toggle.key);
  return out;
}
