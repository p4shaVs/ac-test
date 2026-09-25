// =============================================================================
// Detection registry — the single source of truth for what the anti-cheat can
// report, what it is called in the panel, and how hard it may punish.
//
// Every type here must match a value produced by CoreAC.Detections (see
// fivem-resource/coreac/bridge/shared.lua). A type that is NOT in this
// registry is treated as unknown and can only ever be logged — never enforced.
//
// CONFIDENCE is the safety mechanism that lets us ship with enforcement ON:
//   confirmed  — server-authoritative or physically impossible. May BAN.
//   strong     — a specific, low-noise client signal. May KICK at most.
//   heuristic  — soft//noisy signal, useful for review. LOG only, never punishes.
// The customer picks LOG/KICK/BAN per type in Configuration → Actions, but the
// choice is capped by confidence. Setting "BAN" on a heuristic type therefore
// cannot produce a false ban — it stays a log line.
// =============================================================================

export type DetectionAction = "LOG" | "KICK" | "BAN";
export type DetectionConfidence = "confirmed" | "strong" | "heuristic";

export interface DetectionTypeDef {
  type: string;
  label: string;
  category: string;
  confidence: DetectionConfidence;
  defaultAction: DetectionAction;
  /**
   * Confidence when the SERVER itself produced the evidence (origin=server).
   * Used where the server measures something the client cannot fake — e.g.
   * NoClip: the player's own position/velocity stream showing seconds of
   * movement physics cannot explain. Client reports of the same type keep
   * `confidence` (and client "confirmed" is still capped to strong).
   */
  serverConfidence?: DetectionConfidence;
}

export const DETECTION_CATEGORIES = [
  { id: "movement", label: "Movement" },
  { id: "combat", label: "Weapon / Combat" },
  { id: "survival", label: "Health & Armor" },
  { id: "visual", label: "Visual / Camera" },
  { id: "entity", label: "Entity / Spawn" },
  { id: "explosion", label: "Explosions / Particles" },
  { id: "integrity", label: "Client Integrity" },
  { id: "other", label: "Other" },
] as const;

const D = (
  type: string,
  label: string,
  category: string,
  confidence: DetectionConfidence,
  defaultAction: DetectionAction,
  serverConfidence?: DetectionConfidence
): DetectionTypeDef => ({ type, label, category, confidence, defaultAction, serverConfidence });

export const DETECTION_TYPES: DetectionTypeDef[] = [
  // ------------------------------------------------------------- Movement
  // Client NoClip reports cap at KICK. The server's own check (server/live.lua:
  // 4+ seconds of on-foot movement the synced velocity cannot explain, riders
  // and falls excluded) is physics evidence and may ban.
  D("NOCLIP", "NoClip", "movement", "strong", "BAN", "confirmed"),
  // Every garage/house/job script that moves a player looks like a teleport
  // until it calls coreac:markTeleport. Kicking by default punished honest
  // players on servers that had not wired that up yet, so it starts as LOG;
  // owners raise it to KICK in Actions once their scripts are integrated.
  D("TELEPORT", "Teleport", "movement", "strong", "LOG"),
  D("SUPER_JUMP", "Super Jump", "movement", "strong", "KICK"),
  D("FLYHACK", "Fly Hack", "movement", "strong", "KICK"),
  D("SPEED_HACK", "Speed Hack (on foot)", "movement", "strong", "KICK"),
  D("VEHICLE_NOCLIP", "NoClip (vehicle)", "movement", "strong", "KICK"),
  // Measured on the SERVER from the vehicle's own velocity, held for 3 s
  // above a per-type ceiling no real vehicle reaches (server/live.lua).
  D("VEHICLE_SPEED_HACK", "Vehicle Speed Hack (server-verified)", "movement", "strong", "KICK"),
  D("VEHICLE_SPEED", "Vehicle Speed Modifier", "movement", "heuristic", "LOG"),
  D("VEHICLE_HANDLING", "Vehicle Handling Modifier", "movement", "heuristic", "LOG"),
  D("VEHICLE_HIJACK", "Instant Vehicle Entry", "movement", "heuristic", "LOG"),

  // --------------------------------------------------------------- Combat
  D("SILENT_AIM", "Silent Aim / Magic Bullet", "combat", "confirmed", "BAN"),
  D("DAMAGE_MULTIPLIER", "Damage Multiplier", "combat", "confirmed", "BAN"),
  D("EXPLOSIVE_BULLETS", "Explosive Bullets", "combat", "confirmed", "BAN"),
  D("SPOOFED_BULLETS", "Spoofed Bullets", "combat", "confirmed", "BAN"),
  D("KILL_EXPLOIT", "Kill Exploit", "combat", "confirmed", "BAN"),
  D("AIMBOT", "Aimbot", "combat", "strong", "KICK"),
  D("INFINITE_AMMO", "Infinite Ammo", "combat", "strong", "KICK"),
  D("AMMO_CHEAT", "Ammo Cheat", "combat", "strong", "KICK"),
  D("ILLEGAL_WEAPON", "Illegal Weapon Damage", "combat", "strong", "KICK"),
  D("STUNNING_BULLETS", "Stunning Bullets", "combat", "strong", "KICK"),
  D("WEAPON_SPOOF", "Weapon Spoof", "combat", "strong", "KICK"),
  D("WEAPON_COMPONENT", "Weapon Component Modifier", "combat", "strong", "KICK"),
  D("WEAPON_SPAWN", "Unauthorized Weapon Spawn", "combat", "strong", "KICK"),
  D("HITBOX_MODIFIER", "Hitbox Modifier", "combat", "strong", "KICK"),
  D("SUPER_PUNCH", "Super Punch", "combat", "strong", "KICK"),
  D("REACH", "Melee Reach / Impossible Hit Distance", "combat", "strong", "KICK"),
  D("NO_RECOIL", "No Recoil", "combat", "strong", "KICK"),
  D("GIVE_ALL_WEAPONS", "Give All Weapons", "combat", "strong", "KICK"),
  D("NO_RELOAD", "No Reload", "combat", "heuristic", "LOG"),
  D("RAPID_FIRE", "Rapid Fire", "combat", "heuristic", "LOG"),
  D("WALLBANG", "Wallbang / ESP indicator", "combat", "heuristic", "LOG"),
  D("GIVE_WEAPON", "Weapon Given (event)", "combat", "heuristic", "LOG"),
  D("REMOVE_WEAPON", "Weapon Removed (event)", "combat", "heuristic", "LOG"),

  // -------------------------------------------------------- Health & Armor
  D("GODMODE", "Godmode / Invincibility", "survival", "confirmed", "BAN"),
  D("ARMOR_HACK", "Armor Hack", "survival", "strong", "KICK"),
  D("VEHICLE_GODMODE", "Vehicle Godmode", "survival", "strong", "KICK"),
  D("OUT_OF_BOUNDS", "Out of Bounds / Invalid Position", "survival", "strong", "KICK"),
  D("ARMOR_REGEN", "Armor Regen (no pickup)", "survival", "heuristic", "LOG"),
  D("NO_FALL_DAMAGE", "Fall Damage Immunity", "survival", "heuristic", "LOG"),
  D("INSTANT_REPAIR", "Instant Vehicle Repair", "survival", "heuristic", "LOG"),
  D("NO_RAGDOLL", "No Ragdoll", "survival", "heuristic", "LOG"),
  D("INFINITE_STAMINA", "Infinite Stamina", "survival", "heuristic", "LOG"),

  // ------------------------------------------------------- Visual / Camera
  D("INVISIBLE", "Invisibility", "visual", "strong", "KICK"),
  D("SPECTATE", "Unauthorized Spectate", "visual", "strong", "KICK"),
  // Script camera held far from the player with full control and no UI open
  // (client/freecam.lua "Script Cam"). The older geometric checks report
  // FREECAM_SUSPECTED instead and never punish.
  D("FREECAM", "FreeCam", "visual", "strong", "KICK"),
  D("FREECAM_SUSPECTED", "FreeCam (weak signal)", "visual", "heuristic", "LOG"),
  D("MODEL_CHANGE", "Ped Model Change", "visual", "heuristic", "LOG"),
  D("PROP_DISGUISE", "Prop Disguise", "visual", "heuristic", "LOG"),
  D("NIGHT_VISION", "Night / Thermal Vision", "visual", "heuristic", "LOG"),
  // Voice range held above 100 m — no voice system or megaphone script uses that.
  D("VOICE_EXPLOIT", "Voice Range Exploit", "visual", "strong", "KICK"),

  // -------------------------------------------------------- Entity / Spawn
  D("BLACKLIST_VEHICLE", "Blacklisted Vehicle", "entity", "confirmed", "BAN"),
  D("BLACKLIST_PED", "Blacklisted Ped", "entity", "confirmed", "BAN"),
  D("BLACKLIST_WEAPON", "Blacklisted Weapon", "entity", "confirmed", "BAN"),
  D("BLACKLIST_OBJECT", "Blacklisted Object", "entity", "confirmed", "KICK"),
  D("VEHICLE_WHITELIST", "Vehicle Not Whitelisted", "entity", "confirmed", "KICK"),
  D("PED_WHITELIST", "Ped Not Whitelisted", "entity", "confirmed", "KICK"),
  D("OBJECT_WHITELIST", "Object Not Whitelisted", "entity", "confirmed", "KICK"),
  D("PROJECTILE_WHITELIST", "Projectile Not Whitelisted", "entity", "confirmed", "KICK"),
  D("ILLEGAL_VEHICLE", "Illegal Vehicle Spawn", "entity", "strong", "KICK"),
  D("ILLEGAL_PED", "Illegal Ped Spawn", "entity", "strong", "KICK"),
  D("THROW_VEHICLE", "Vehicle Throwing", "entity", "strong", "KICK"),
  D("VEHICLE_LIMIT", "Vehicle Spawn Limit", "entity", "strong", "KICK"),
  D("PED_LIMIT", "Ped Spawn Limit", "entity", "strong", "KICK"),
  D("OBJECT_LIMIT", "Object Spawn Limit", "entity", "strong", "KICK"),
  D("PROJECTILE_LIMIT", "Projectile Spawn Limit", "entity", "strong", "KICK"),
  D("ILLEGAL_OBJECT", "Illegal Object Spawn", "entity", "heuristic", "LOG"),
  D("ISOLATED_VEHICLE", "Isolated Vehicle Spawn", "entity", "heuristic", "LOG"),
  D("ATTACH_VEHICLE", "Vehicle Attach", "entity", "heuristic", "LOG"),
  D("REQUEST_CONTROL", "Entity Control Request", "entity", "heuristic", "LOG"),
  D("PLATE_CHANGER", "Vehicle Plate Changer", "entity", "heuristic", "LOG"),
  D("PICKUP_SPAWN", "Pickup Spawn", "entity", "heuristic", "LOG"),

  // ------------------------------------------------- Explosions / Particles
  D("BLACKLIST_EXPLOSION", "Blacklisted Explosion", "explosion", "confirmed", "BAN"),
  D("INVISIBLE_EXPLOSION", "Invisible Explosion", "explosion", "confirmed", "BAN"),
  D("INAUDIBLE_EXPLOSION", "Inaudible Explosion", "explosion", "confirmed", "BAN"),
  D("EXPLOSION_SPAWN", "Forged Explosion", "explosion", "strong", "KICK"),
  D("EXPLOSION_LIMIT", "Explosion Limit", "explosion", "strong", "KICK"),
  D("PARTICLE_WHITELIST", "Particle Not Whitelisted", "explosion", "strong", "KICK"),
  D("PARTICLE_SCALE", "Particle Scale Limit", "explosion", "strong", "KICK"),
  D("EXPLOSION", "Explosion Spam", "explosion", "heuristic", "LOG"),
  D("PARTICLE_SPAWN", "Particle Spawn", "explosion", "heuristic", "LOG"),
  D("PARTICLE_ATTACHED", "Particle Attached to Entity", "explosion", "heuristic", "LOG"),

  // ------------------------------------------------------ Client Integrity
  D("BYPASS_ATTEMPT", "Anti-Cheat Bypass Attempt", "integrity", "confirmed", "BAN"),
  // The disconnect reason carried the cheat client's own crash signature.
  D("KEKHACK_CLIENT", "Kekhack Cheat Client", "integrity", "confirmed", "BAN"),
  D("RED_ENGINE_CLIENT", "Red Engine Cheat Client", "integrity", "confirmed", "BAN"),
  D("BACKDOOR", "Backdoor / Malicious Resource", "integrity", "confirmed", "BAN"),
  // Honeypot events only known cheat menus ever fire (client/events.lua).
  // Defaults to KICK so a name collision with a legitimate resource cannot
  // ban anyone; raise it to BAN once you have verified your resource list.
  D("CHEAT_EVENT_HONEYPOT", "Cheat Menu Event (honeypot)", "integrity", "confirmed", "KICK"),
  D("CRASH_ATTEMPT", "Server Crash Attempt", "integrity", "confirmed", "BAN"),
  D("AC_TAMPER", "Anti-Cheat Disabled / Tampered", "integrity", "confirmed", "KICK"),
  D("OVERLAY", "Executor Overlay", "integrity", "strong", "KICK"),
  D("LUA_MENU", "Lua Cheat Menu", "integrity", "strong", "KICK"),
  D("RESOURCE_INJECT", "Resource Injection", "integrity", "strong", "KICK"),
  D("SPOOFER", "Identifier Spoofer", "integrity", "strong", "KICK"),
  D("EVENT_EXPLOIT", "Event Exploit", "integrity", "strong", "KICK"),

  // ---------------------------------------------------------------- Other
  // Cross-server reputation: this player is banned on other servers in the
  // network. A SIGNAL, not proof — kept heuristic so it can never ban even if
  // routed through the normal pipeline; the /v1/network/check endpoint decides
  // LOG vs KICK from the server's own network policy (config.network.action).
  D("NETWORK_BAN", "Network Reputation Match", "other", "heuristic", "LOG"),
  D("CHAT_FLOOD", "Chat Flood", "other", "strong", "KICK"),
  // interact-sound abuse seen by the server: sounds pushed to the whole server,
  // to a huge radius, or spammed (the "megaphone / earrape" troll).
  D("SOUND_EXPLOIT", "Sound / Megaphone Abuse", "other", "strong", "KICK"),
  D("RECONNECT_SPAM", "Reconnect Spam", "other", "heuristic", "LOG"),
  D("CHEAT_MENU_SUSPECTED", "Cheat Menu Suspected (weak signal)", "other", "heuristic", "LOG"),
  D("AFK_BYPASS", "AFK Bypass", "other", "heuristic", "LOG"),
  D("CLEAR_TASKS", "Clear Ped Tasks", "other", "heuristic", "LOG"),
  D("INPUT_BOX", "Input Box Abuse", "other", "heuristic", "LOG"),
];

const BY_TYPE = new Map(DETECTION_TYPES.map((d) => [d.type, d]));
const ALL_TYPES = new Set(BY_TYPE.keys());

/** Human label for a detection type (falls back to the raw type). */
export function detectionLabel(type: string): string {
  return BY_TYPE.get(type)?.label ?? type;
}

/** Confidence tier; unknown types are treated as heuristic (log-only). */
export function detectionConfidence(type: string): DetectionConfidence {
  return BY_TYPE.get(type)?.confidence ?? "heuristic";
}

/**
 * Severity shown in the panel. Derived from the type's confidence so the
 * whole UI is consistent regardless of what the resource reported — a module
 * that hardcodes "HIGH" can no longer inflate (or deflate) a detection.
 */
export function severityForType(type: string, reported?: string): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const def = BY_TYPE.get(type);
  if (!def) return reported === "CRITICAL" || reported === "HIGH" ? "MEDIUM" : "LOW";
  if (def.confidence === "confirmed") return "CRITICAL";
  if (def.confidence === "strong") return "HIGH";
  return "MEDIUM";
}

/** Default action per type. */
export function defaultActions(): Record<string, DetectionAction> {
  const out: Record<string, DetectionAction> = {};
  for (const d of DETECTION_TYPES) out[d.type] = d.defaultAction;
  return out;
}

/** Sanitize incoming values: known types and valid actions only. */
export function sanitizeActions(input: unknown): Record<string, DetectionAction> {
  const base = defaultActions();
  const valid = new Set(["LOG", "KICK", "BAN"]);
  if (input && typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (ALL_TYPES.has(k) && typeof v === "string" && valid.has(v)) {
        base[k] = v as DetectionAction;
      }
    }
  }
  return base;
}

/** Where a detection was produced. */
export type DetectionOrigin = "server" | "client";

/**
 * A report that came from the player's own game client can never be treated as
 * proof: a cheat client owns that process and can suppress, delay or forge it.
 * So client-origin reports are capped at "strong" (kick) no matter how solid
 * the check looks. Only the server's own observations — health that did not
 * drop, an aim vector that does not point at the victim, a blacklisted model
 * reaching entityCreating — can justify a ban.
 */
function effectiveConfidence(type: string, origin: DetectionOrigin): DetectionConfidence {
  const def = BY_TYPE.get(type);
  if (origin === "server" && def?.serverConfidence) return def.serverConfidence;
  const c = detectionConfidence(type);
  if (origin === "client" && c === "confirmed") return "strong";
  return c;
}

/** Highest confidence this type can reach from any origin (for the Actions UI). */
export function bestConfidence(def: DetectionTypeDef): DetectionConfidence {
  const rank: Record<DetectionConfidence, number> = { heuristic: 0, strong: 1, confirmed: 2 };
  const s = def.serverConfidence;
  return s && rank[s] > rank[def.confidence] ? s : def.confidence;
}

/**
 * SAFETY BELT. Caps the chosen action by how trustworthy the detection is:
 *   confirmed → BAN allowed
 *   strong    → KICK at most
 *   heuristic → LOG only
 * Unknown types are heuristic, so a detection the panel does not know about
 * can never punish anyone. This is what makes shipping with enforcement
 * enabled safe: raising a noisy check to "BAN" simply has no teeth.
 */
export function capByConfidence(
  action: DetectionAction,
  type: string,
  origin: DetectionOrigin = "server"
): DetectionAction {
  const c = effectiveConfidence(type, origin);
  if (c === "confirmed") return action;
  if (c === "strong") return action === "BAN" ? "KICK" : action;
  return "LOG";
}

/** Final action for a detection: customer setting → type default → confidence cap. */
export function resolveAction(
  actions: Record<string, DetectionAction>,
  type: string,
  origin: DetectionOrigin = "server"
): DetectionAction {
  const chosen = actions[type] ?? BY_TYPE.get(type)?.defaultAction ?? "LOG";
  return capByConfidence(chosen, type, origin);
}
