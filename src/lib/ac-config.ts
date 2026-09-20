// =============================================================================
// CoreAC configuration schema — mirrors CoreAC.Config.* (the keys the FiveM
// modules actually read). Drives the Configuration page UI, the sanitizer, and
// the defaults sent to the resource via heartbeat (stored under server.config.ac).
//
// Structure follows the reference layout: top tabs (Main / Weapons / Entities /
// Explosions / Premium / Beta / Settings), each with grouped cards.
//
// Only keys that correspond to real CoreAC.Config fields are listed here — no
// invented controls. Each field declares the CoreAC section + key so the bridge
// can apply it 1:1 (CoreAC.Config[section][key] = value).
// =============================================================================

export type ACFieldType = "toggle" | "number" | "text" | "list";

export interface ACField {
  section: string; // CoreAC.Config sub-table: Main | Weapons | Entities | Explosions | Premium | Beta | Settings
  key: string;
  label: string;
  type: ACFieldType;
  default: boolean | number | string | string[];
  desc?: string;
}

export interface ACCard {
  title: string;
  desc?: string;
  fields: ACField[];
}

export interface ACTab {
  id: string;
  label: string;
  icon: string; // Icons key
  cards: ACCard[];
}

const T = (section: string, key: string, label: string, def: boolean, desc?: string): ACField => ({
  section, key, label, type: "toggle", default: def, desc,
});
const N = (section: string, key: string, label: string, def: number, desc?: string): ACField => ({
  section, key, label, type: "number", default: def, desc,
});
const S = (section: string, key: string, label: string, def: string, desc?: string): ACField => ({
  section, key, label, type: "text", default: def, desc,
});
const L = (section: string, key: string, label: string, desc?: string): ACField => ({
  section, key, label, type: "list", default: [], desc,
});

export const AC_TABS: ACTab[] = [
  // ------------------------------------------------------------------- MAIN
  {
    id: "main",
    label: "Main",
    icon: "shieldCheck",
    cards: [
      {
        title: "Executor Detections",
        desc: "Cursor-lock signature of cheat executor overlays",
        fields: [
          // NOT: E1 ve E5 bayrakları client/antiExec.lua içinde YORUM satırında
          // (ExecutorFlag("1") / ExecutorFlag("EULEN") çağrılmıyor) — yani hiçbir
          // şey yapmıyorlardı. Ölü buton göstermemek için panelden çıkarıldı.
          // Kalanlar gerçekten tetiklenen bayraklardır.
          T("Main", "E2", "Executor Overlay — Insert / PageDown", true),
          T("Main", "E3", "Executor Overlay — PageUp", true),
          T("Main", "E4", "Executor Overlay — idle cursor lock", true),
          T("Main", "E6", "Executor Overlay — aggressive", true, "Also fires while the mouse is moving. Needs the same 3 confirmations, so it is safe to leave on."),
        ],
      },
      {
        title: "Client Detections",
        desc: "Prevent client-side cheats and exploits",
        fields: [
          T("Main", "AntiTeleport", "Anti Teleport", true, "Legit teleports must call exports['aeigs-anticheat']:markTeleport(src)"),
          T("Main", "AntiNoClip", "Anti NoClip", true),
          T("Main", "AntiSpeedHack", "Anti Speed Hack", true),
          T("Main", "AntiSuperJump", "Anti Super Jump", true),
          T("Main", "AntiLuaMenu", "Anti Lua Cheat Menu", true, "Detects known cheat-menu texture dictionaries"),
          T("Main", "AntiClearTasks", "Anti Clear Ped Tasks", true, "Blocks clearing another player's ped tasks"),
          T("Main", "AntiSpectate", "Anti Spectate", true, "Your own admin spectate is exempt automatically"),
          T("Main", "AntiInvisible", "Anti Invisibility", true),
          T("Main", "AntiNoRagdoll", "Anti No-Ragdoll", true, "Scripts that intentionally disable ragdoll should call exports['aeigs-anticheat']:canRagdoll(false)"),
          T("Main", "AntiFreeCam", "Anti FreeCam", true, "Geometric check only — scripted cameras (character creator, cutscenes) are not flagged"),
          T("Main", "AntiPedModelChange", "Anti Model Change", true, "Multichar and clothing changes are recognised automatically"),
          T("Main", "AntiNightVisions", "Anti Night / Thermal Vision", true),
          T("Main", "AntiInfiniteStamina", "Anti Infinite Stamina", true),
          T("Main", "AntiVoiceExploits", "Anti Voice Range Exploits", true, "Triggers above 50 m — well past what pma-voice/mumble use for shouting"),
          T("Main", "AntiAFKBypass", "Anti AFK Bypass", true, "Flags wander/scenario tasks on your ped — turn off if your server applies AFK animations"),
        ],
      },
      {
        title: "Anti-Cheat Integrity",
        desc: "Stops players from disabling or bypassing the anti-cheat itself",
        fields: [
          T("Main", "AntiResourceInjection", "Anti Resource Injection", true, "Flags a resource started on the player's client that your server never sent — this is how cheat menus load. Stays silent until the server's resource list has replicated and for the first 60 s after load, so it cannot mass-flag everyone on join."),
          T("Main", "AntiResourceStop", "Anti Resource Stop", true, "Flags a player stopping or suspending a resource that is still running on the server. Pauses automatically for 30 s around legitimate resource restarts."),
        ],
      },
      {
        title: "Health Detections",
        desc: "Block health and damage manipulation",
        fields: [
          // KALDIRILDI: AntiInfiniteRefill / AntiArmorRegen / AntiNoFallDamage —
          // bu anahtarları okuyan hiçbir modül kalmadı (ilgili kontroller
          // false-positive ürettiği için daha önce sökülmüştü). Godmode zaten
          // sunucu-otoriter godmode_guard.lua ile kapsanıyor.
          T("Main", "AntiInvincible", "Anti Invincibility", true),
          T("Main", "AntiOverrideHealthStats", "Anti Health Stat Modification", true),
          T("Main", "AntiNoCombatDamages", "Anti Damage Immunity", true),
        ],
      },
    ],
  },
  // ---------------------------------------------------------------- WEAPONS
  {
    id: "weapons",
    label: "Weapons",
    icon: "bolt",
    cards: [
      {
        title: "Weapon Spawn",
        desc: "Unauthorized weapon spawn / whitelist",
        fields: [
          T("Weapons", "AntiWeaponSpawner", "Anti Weapon Spawn", false, "REQUIRES INTEGRATION: every script that hands out a weapon must call exports['aeigs-anticheat']:giveWeapon(hash). Without that it strips and flags every legitimately given weapon. Use the blacklist below instead if you have not wired it up."),
          L("Weapons", "AddonWeapons", "Add-On Weapons", "Custom/addon weapons to treat as legit (e.g. weapon_glock17)"),
          T("Weapons", "AntiGiveWeapons", "Anti Give Weapons", true),
          T("Weapons", "AntiRemoveWeapons", "Anti Remove Weapons", true),
          T("Weapons", "AntiSpoofedBullets", "Anti Spoofed Bullets", true),
          T("Weapons", "AntiKill", "Anti Kill Exploits", true),
          T("Weapons", "EnableWeaponsBlackList", "Enable Weapons Blacklist", true),
          L("Weapons", "BlackListedWeapons", "Blacklisted Weapons", "e.g. weapon_rpg, weapon_grenade"),
        ],
      },
      {
        title: "Weapon Cheats",
        desc: "Aim, damage and ammo manipulation",
        fields: [
          T("Weapons", "AntiAimBot", "Anti Aimbot", true),
          T("Weapons", "AntiWeaponComponentModifier", "Anti Weapon Component Modifier", true),
          T("Weapons", "AntiWeaponDamagesModifier", "Anti Weapon Damage Modifier", true),
          T("Weapons", "AntiAmmoCheating", "Anti Ammo Cheats", true),
          T("Weapons", "AntiInfiniteAmmo", "Anti Infinite Ammo", true),
          T("Weapons", "AntiExplosiveBullets", "Anti Explosive Bullets", true),
          T("Weapons", "AntiSuperPunch", "Anti Super Punch", true),
          T("Weapons", "AntiHitboxModifier", "Anti Hitbox Modifier", true),
          T("Weapons", "AntiNoRecoil", "Anti No Recoil", true),
        ],
      },
      {
        title: "Projectiles",
        desc: "Projectile whitelist and limits",
        fields: [
          T("Weapons", "EnableProjectilesWhiteList", "Enable Projectiles Whitelist", false, "Blocks every projectile that is not listed. Fill the list first — an empty whitelist is ignored on purpose."),
          L("Weapons", "WhiteListedProjectiles", "Whitelisted Projectiles", "e.g. weapon_snowball, weapon_smokegrenade"),
          T("Weapons", "EnableProjectilesLimiter", "Enable Projectiles Limiter", true),
          // Anahtar adı modülün okuduğu isimle BİREBİR olmalı. "ProjectilesLimitIn"
          // yazıldığı sürece modül "ProjectilesLimitIn5Seconds" okuyup tanımsız
          // eşik buluyordu → limiter açıldığında ilk mermide bile tetikleniyordu.
          N("Weapons", "ProjectilesLimitIn5Seconds", "Projectile Spawn Limit (per 5s)", 20),
          T("Weapons", "LogProjectileSpawnsToConsole", "Log Projectile Spawns (Console)", false),
        ],
      },
    ],
  },
  // --------------------------------------------------------------- ENTITIES
  {
    id: "entities",
    label: "Entities",
    icon: "cube",
    cards: [
      {
        title: "Vehicles Detections",
        desc: "Vehicle spawn, blacklist and limits",
        fields: [
          T("Entities", "AntiSpawnIsolatedVehicles", "Anti Isolated Vehicle Spawn", true),
          T("Entities", "EnableVehiclesBlackList", "Enable Vehicle Blacklist", true),
          L("Entities", "BlackListedVehicles", "Blacklisted Vehicles"),
          T("Entities", "EnableVehiclesWhiteList", "Enable Vehicle Whitelist", false, "Blocks every vehicle that is not listed. Fill the list first — an empty whitelist is ignored on purpose."),
          L("Entities", "WhiteListedVehicles", "Whitelisted Vehicles"),
          T("Entities", "EnableVehiclesLimiter", "Enable Vehicle Spawn Limiter", true),
          // Limitler "spam" yakalamak için: hile menüleri saniyede YÜZLERCE entity basar.
          // Düşük tutulursa meşru oynanış tetikler (QBCore interior + mobilya,
          // soygun propları, iş araçları aynı anda onlarca spawn eder).
          N("Entities", "VehiclesLimitIn5Seconds", "Vehicle Spawn Limit (per 5s)", 20, "Per player. Cheat menus spawn hundreds; keep this well above what your garages and job scripts create at once."),
          T("Entities", "AntiThrowVehicles", "Anti Vehicle Throwing", true),
          T("Entities", "AntiDeleteVehicles", "Anti Vehicle Deletion", true),
          // KALDIRILDI: AntiSpeedModifier / AntiHandlingModifier. Modül bunları
          // CoreAC.vehicleTopSpeedModifier / vehicleCheatPowerIncrease /
          // vehicleGravityAmount üzerinden okuyor, ama GTA bu değerler için
          // getter native'i sunmadığından o alanlar sabit kalıyor — kontrol
          // hiçbir koşulda tetiklenemez. Ölü buton olmasın diye çıkarıldı.
          T("Entities", "AntiVehiclePlateChanger", "Anti Vehicle Plate Changer", true),
          T("Entities", "AntiTeleportInVehicle", "Anti Teleport In Vehicle", true),
          T("Entities", "NoCarKill", "No Car Kill", false, "Gameplay change, not a detection: disables all car-ram damage"),
          T("Entities", "LogVehicleSpawnsToConsole", "Log Vehicle Spawns (Console)", false),
        ],
      },
      {
        title: "Peds Detections",
        desc: "Ped spawn, blacklist and limits",
        fields: [
          T("Entities", "DisableNPCPopulation", "Disable NPC Population", false, "Gameplay change, not a detection: stops ambient NPC/traffic spawning"),
          T("Entities", "EnablePedsBlackList", "Enable Ped Blacklist", true),
          L("Entities", "BlackListedPeds", "Blacklisted Peds"),
          T("Entities", "EnablePedsWhiteList", "Enable Ped Whitelist", false, "Blocks every ped that is not listed. Fill the list first — an empty whitelist is ignored on purpose."),
          L("Entities", "WhiteListedPeds", "Whitelisted Peds"),
          T("Entities", "EnablePedsLimiter", "Enable Ped Spawn Limiter", true),
          N("Entities", "PedsLimitIn5Seconds", "Ped Spawn Limit (per 5s)", 30, "Per player."),
          T("Entities", "LogPedSpawnsToConsole", "Log Ped Spawns (Console)", false),
        ],
      },
      {
        title: "Objects Detections",
        desc: "Object spawn, blacklist and limits",
        fields: [
          T("Entities", "EnableObjectsBlackList", "Enable Object Blacklist", true),
          L("Entities", "BlackListedObjects", "Blacklisted Objects"),
          T("Entities", "EnableObjectsWhiteList", "Enable Object Whitelist", false, "Blocks every object that is not listed. Fill the list first — an empty whitelist is ignored on purpose."),
          L("Entities", "WhiteListedObjects", "Whitelisted Objects"),
          T("Entities", "EnableObjectsLimiter", "Enable Object Spawn Limiter", true),
          N("Entities", "ObjectsLimitIn5Seconds", "Object Spawn Limit (per 5s)", 100, "Per player. Housing interiors and furniture can create dozens of objects at once — lowering this can kick players entering a house."),
          T("Entities", "AntiPickupSpawn", "Anti Pickup Spawn", true),
          T("Entities", "LogObjectSpawnsToConsole", "Log Object Spawns (Console)", false),
        ],
      },
    ],
  },
  // -------------------------------------------------------------- EXPLOSIONS
  {
    id: "explosions",
    label: "Explosions",
    icon: "bolt",
    cards: [
      {
        title: "Explosions Detections",
        desc: "Explosion blacklist, limits and invisible blasts",
        fields: [
          T("Explosions", "EnableExplosionsBlackList", "Enable Explosion Blacklist", true),
          L("Explosions", "BlackListedExplosions", "Blacklisted Explosions", "Name or id — e.g. ORBITAL_CANNON, RAILGUN, 59"),
          T("Explosions", "DetectInvisibleExplosions", "Anti Invisible Explosions", true),
          T("Explosions", "DetectInaudibleExplosions", "Anti Inaudible Explosions", true),
          T("Explosions", "EnableExplosionsLimiter", "Enable Explosion Limiter", true),
          N("Explosions", "ExplosionsLimitIn5Seconds", "Explosion Limit (per 5s)", 8),
          T("Explosions", "CancelAllExplosions", "Cancel All Explosions", false, "Gameplay change, not a detection: blocks every explosion on the server"),
          T("Explosions", "CancelAllFires", "Cancel All Fires", false, "Gameplay change, not a detection: blocks every fire on the server"),
          T("Explosions", "LogExplosionSpawnsToConsole", "Log Explosion Spawns (Console)", false),
        ],
      },
      {
        title: "Particles Detections",
        desc: "Particle whitelist and scale limits",
        fields: [
          T("Explosions", "EnableParticlesWhiteList", "Enable Particle Whitelist", false, "Blocks every particle that is not listed. Fill the list first — an empty whitelist is ignored on purpose."),
          L("Explosions", "WhiteListedParticles", "Whitelisted Particles"),
          T("Explosions", "DetectParticlesAttachedToEntity", "Anti Attached Particles", true),
          N("Explosions", "MaxParticleScale", "Particle Scale Limit", 10),
          T("Explosions", "LogParticleSpawnsToConsole", "Log Particle Spawns (Console)", false),
        ],
      },
    ],
  },
  // ---------------------------------------------------------------- PREMIUM
  {
    id: "premium",
    label: "Premium",
    icon: "shield",
    cards: [
      {
        title: "Premium Detections",
        desc: "Advanced protections",
        fields: [
          T("Premium", "AntiBombVehicles", "Anti Bomb Vehicles", true),
          T("Premium", "AntiRagdollExploit", "Anti Ragdoll Exploit", true),
          T("Premium", "AntiRequestControl", "Anti Request Control", true),
        ],
      },
    ],
  },
  // ------------------------------------------------------------------- BETA
  {
    id: "beta",
    label: "Beta",
    icon: "bolt",
    cards: [
      {
        title: "Beta Detections",
        desc: "Experimental — may cause false positives",
        fields: [
          T("Beta", "AntiSilentAim", "Anti Silent Aim", true),
          T("Beta", "AntiAttachVehicles", "Anti Attach Vehicles", false),
          T("Beta", "AntiMagneto", "Anti Magneto", false),
        ],
      },
    ],
  },
  // --------------------------------------------------------------- SETTINGS
  {
    id: "settings",
    label: "Settings",
    icon: "cog",
    cards: [
      {
        title: "Enforcement",
        desc: "How detections are acted on",
        fields: [
          T("Settings", "LogOnly", "Log-Only Mode (never kick/ban)", false, "Detections are still recorded and shown in the panel, but nobody is kicked or banned. Use it when rolling out a risky protection, then turn it back off."),
          T("Settings", "EnableGameplayRecord", "Enable Gameplay Recording", true, "Captures a short screenshot burst at the moment of an auto-ban (requires screencapture or screenshot-basic)"),
        ],
      },
      {
        title: "Backdoor Protection",
        desc: "Blocks malicious resources from reading your credentials",
        fields: [
          T("Settings", "EnableAntiBackdoors", "Enable Anti-Backdoors", true, "Detects resources reading mysql_connection_string / rcon_password or calling known malware hosts"),
          T("Settings", "StopServerWhenDetected", "Stop Server When Backdoor Detected", false, "Hard-stops the server on a detected backdoor call. Leave off unless you accept that a single detection takes your server offline."),
        ],
      },
      {
        title: "Disconnect Logs",
        desc: "Console and Discord output when a player leaves",
        fields: [
          // KALDIRILDI: MaxThreatScore, AntiVPN, AntiXSSInjections,
          // AntiConnectionDupe, RequireDiscord, RequireAlphanumericName,
          // LogOnConnect, EnableBlacklist — hepsini yalnızca
          // server/events/playerConnecting.lua okuyordu ve o modül fxmanifest'te
          // DEVRE DIŞI (bağlanma akışı server/main.lua'da). Ölü buton bırakmamak
          // için panelden çıkarıldılar.
          T("Settings", "LogConnectionsToConsole", "Log Disconnects to Console", true),
          T("Settings", "LogConnectionsToDiscord", "Log Disconnects to Discord", false),
          T("Settings", "LogOnDisconnect", "Enable Disconnect Logs", true),
        ],
      },
    ],
  },
];

// ---- Derived helpers --------------------------------------------------------

const ALL_FIELDS: ACField[] = AC_TABS.flatMap((t) => t.cards.flatMap((c) => c.fields));

export type ACConfig = Record<string, Record<string, boolean | number | string | string[]>>;

/** Default config object nested by section (mirrors CoreAC.Config). */
export function defaultAcConfig(): ACConfig {
  const out: ACConfig = {};
  for (const f of ALL_FIELDS) {
    (out[f.section] ??= {})[f.key] = Array.isArray(f.default) ? [...f.default] : f.default;
  }
  return out;
}

// Known field type per "section.key" for validation.
const FIELD_TYPE = new Map<string, ACFieldType>();
for (const f of ALL_FIELDS) FIELD_TYPE.set(`${f.section}.${f.key}`, f.type);

/** Sanitize incoming config: only known keys, correct types. */
export function sanitizeAcConfig(input: unknown): ACConfig {
  const base = defaultAcConfig();
  if (!input || typeof input !== "object") return base;
  for (const [section, fields] of Object.entries(input as Record<string, unknown>)) {
    if (!fields || typeof fields !== "object") continue;
    for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
      const type = FIELD_TYPE.get(`${section}.${key}`);
      if (!type) continue;
      if (type === "toggle" && typeof value === "boolean") base[section][key] = value;
      else if (type === "number" && typeof value === "number" && Number.isFinite(value)) {
        base[section][key] = Math.max(0, Math.min(100000, Math.floor(value)));
      } else if (type === "text" && typeof value === "string") {
        base[section][key] = value.slice(0, 200);
      } else if (type === "list" && Array.isArray(value)) {
        base[section][key] = value
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean)
          .slice(0, 2000);
      }
    }
  }
  return base;
}
