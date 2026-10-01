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

/**
 * How a text / list field is validated (server-side, in sanitizeAcConfig) and
 * rendered. Everything a customer types ends up in Lua, a Discord request or a
 * player's screen, so each kind has a strict allow-rule instead of "any string".
 */
export type ACKind =
  | "message" // sentence shown to players (connection card, ban screen)
  | "webhook" // Discord webhook URL — a secret, panel-only
  | "url" // https:// link
  | "secret" // API key — masked in the UI
  | "path" // folder on the game server
  | "resource" // resource name (list items may also be "resource/path/file.lua")
  | "event" // net event name
  | "command" // chat command prefix
  | "ip"; // IPv4 / IPv6 address or IPv4 CIDR

export interface ACField {
  section: string; // CoreAC.Config sub-table: Main | Weapons | Entities | Explosions | Premium | Beta | Settings
  key: string;
  label: string;
  type: ACFieldType;
  default: boolean | number | string | string[];
  desc?: string;
  /** Sub-setting of the toggle with this key (same section): indented, greyed out while the parent is off. */
  parent?: string;
  kind?: ACKind;
  /** Number bounds (default 0..100000). */
  min?: number;
  max?: number;
  /** Text length cap; for lists the cap on each item. */
  maxLen?: number;
  /**
   * Never sent to the game server. Discord webhooks are posted by the panel, so
   * the resource has no use for the URLs — and anything the resource holds can be
   * read by a server-side backdoor.
   */
  panelOnly?: boolean;
}

export interface ACCard {
  title: string;
  desc?: string;
  fields: ACField[];
  /** Full-width card: label and help text on the left, control on the right (long settings forms). */
  wide?: boolean;
}

export interface ACTab {
  id: string;
  label: string;
  icon: string; // Icons key
  cards: ACCard[];
}

type Opts = Partial<Pick<ACField, "parent" | "kind" | "min" | "max" | "maxLen" | "panelOnly">>;

const T = (section: string, key: string, label: string, def: boolean, desc?: string, o: Opts = {}): ACField => ({
  section, key, label, type: "toggle", default: def, desc, ...o,
});
const N = (section: string, key: string, label: string, def: number, desc?: string, o: Opts = {}): ACField => ({
  section, key, label, type: "number", default: def, desc, ...o,
});
const S = (section: string, key: string, label: string, def: string, desc?: string, o: Opts = {}): ACField => ({
  section, key, label, type: "text", default: def, desc, ...o,
});
const L = (section: string, key: string, label: string, desc?: string, o: Opts = {}): ACField => ({
  section, key, label, type: "list", default: [], desc, ...o,
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
          T("Main", "E2", "Cheat Menu (Overlay) — Insert / PageDown", true),
          T("Main", "E3", "Cheat Menu (Overlay) — PageUp", true),
          T("Main", "E4", "Cheat Menu (Overlay) — idle cursor lock", true),
          T("Main", "E6", "Cheat Menu (Overlay) — aggressive", true, "Also fires while the mouse is moving. Needs the same 3 confirmations, so it is safe to leave on."),
        ],
      },
      {
        title: "Client Detections",
        desc: "Prevent client-side cheats and exploits",
        fields: [
          T("Main", "AntiTeleport", "Anti Teleport", true, "Teleports behind a screen fade (QBCore/ESX houses, apartments, elevators, hospital, prison, spawn) and txAdmin / qb-adminmenu / QBCore /tp teleports are recognised automatically. Other scripts that move players should call TriggerEvent('coreac:markTeleport', src) on the server or TriggerEvent('coreac:markTeleport') on the client first. Teleport detections are logged by default."),
          T("Main", "AntiNoClip", "Anti NoClip", true),
          T("Main", "AntiSpeedHack", "Anti Speed Hack", true),
          T("Main", "AntiSuperJump", "Anti Super Jump", true),
          T("Main", "AntiLuaMenu", "Anti Lua Cheat Menu", true, "Detects known cheat-menu texture dictionaries"),
          T("Main", "AntiClearTasks", "Anti Clear Ped Tasks", true, "Blocks clearing another player's ped tasks"),
          T("Main", "AntiSpectate", "Anti Spectate", true, "Your own admin spectate is exempt automatically"),
          T("Main", "AntiInvisible", "Anti Invisibility", true),
          T("Main", "AntiNoRagdoll", "Anti No-Ragdoll", true, "Scripts that intentionally disable ragdoll should call exports['<CoreAC folder>']:canRagdoll(false)"),
          T("Main", "AntiFreeCam", "Anti FreeCam", true, "Flags a script camera held 80 m+ from the player for ~6 s while they have full control and no menu/UI open (character creators, cutscenes and garages don't qualify). If you run a drone/remote-camera script, set FreeCam to Log in Actions."),
          T("Main", "AntiPedModelChange", "Anti Model Change", true, "Multichar and clothing changes are recognised automatically"),
          T("Main", "AntiNightVisions", "Anti Night / Thermal Vision", true),
          T("Main", "AntiInfiniteStamina", "Anti Infinite Stamina", true),
          T("Main", "AntiVoiceExploits", "Anti Voice / Sound Exploits", true, "Voice range held above 100 m (megaphone scripts use ~30-50 m), and interact-sound abuse checked on the server: sounds pushed to everyone, to a huge radius, above full volume or spammed."),
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
          T("Weapons", "AntiWeaponSpawner", "Anti Weapon Spawn", false, "REQUIRES INTEGRATION: every script that hands out a weapon must call exports['<CoreAC folder>']:giveWeapon(hash). Without that it strips and flags every legitimately given weapon. Use the blacklist below instead if you have not wired it up."),
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
          T("Entities", "AntiThrowVehicles", "Anti Vehicle Throwing", true, "Server-side: a driverless vehicle flying faster than 250 km/h is deleted on the spot (protects the victim). The owner is only flagged when they created that vehicle and it happens twice within 30 s."),
          T("Entities", "AntiDeleteVehicles", "Anti Vehicle Deletion", true),
          // Değerler FiveM'in GetVehicleTopSpeedModifier / GetVehicleCheatPowerIncrease /
          // GetVehicleGravityAmount getter'larından okunur (bridge/client.lua).
          T("Entities", "AntiSpeedModifier", "Anti Vehicle Speed / Power Modifier", true, "Log only. Flags a vehicle whose top-speed or engine-power multiplier stays far past anything tuning or nitro scripts set (checked over ~9 s, so nitro bursts never count). Blatant speed hacks are caught server-side by the Vehicle Speed Hack guard."),
          T("Entities", "AntiHandlingModifier", "Anti Vehicle Gravity / Handling Modifier", true, "Log only. Flags modified vehicle gravity — the 'stick to the road' and 'flying car' menu options."),
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
          T("Settings", "StaffBypass", "Never punish server staff", true, "Admins verified by the server (txAdmin, QBCore/ESX admin, ACE 'command', in-game admins added here) are never auto-kicked or banned — their admin tools (noclip, godmode, teleport) look exactly like cheats. Detections are still logged and marked 'staff'. Turn this off to test the anti-cheat with your own admin account."),
        ],
      },
      // ---- Safe Guard ---------------------------------------------------------
      // Every list here is enforced on the SERVER side (the intake filter in
      // server/main.lua, entityCreating, entity_guard) — none of it is sent to the
      // players' game clients, so a cheater cannot read what is exempt.
      {
        title: "Safe Guard",
        desc: "Exemptions that stop your own scripts from being flagged. Kept on the server — never sent to players.",
        wide: true,
        fields: [
          L("Settings", "SafeEvents", "Safe Events", "Events the trap system will never arm — neither from your Protected Events list nor from the built-in trap list. Add an event that one of your own scripts triggers and that got players kicked (e.g. QBCore:Server:OnPlayerLoaded).", { kind: "event", maxLen: 120 }),
          L("Settings", "SafeScripts", "Safe Scripts", "Resources you fully trust. Vehicles, peds and objects they spawn skip every spawn check (blacklist, whitelist, limiter, ownership), they are never flagged by the resource-injection check, their anti-backdoor hook calls are never reported, and a teleport or revive they hand to CoreAC through markTeleport / markRevive gets a 15-second grace instead of 8.", { kind: "resource", maxLen: 160 }),
          L("Settings", "IgnoredScripts", "Ignored Scripts", "Resources CoreAC leaves completely alone: nothing attributed to them is reported — spawns, start/stop, backdoor-hook calls. Use it for your own scripts only; a listed resource is invisible to the anti-cheat.", { kind: "resource", maxLen: 160 }),
          L("Settings", "AntiResourceInjectionSafeList", "Anti Resource Injection Safe List", "Resources the resource-injection check will never flag. Add a resource name (e.g. ox_lib). A full source path such as ox_lib/imports/print/client.lua is reduced to its resource name.", { kind: "resource", maxLen: 160 }),
        ],
      },
      // ---- Connection & Identity ---------------------------------------------
      // Checked while the player waits on the connection card (server/main.lua,
      // playerConnecting). Staff and Trust-whitelisted players skip every check
      // here; bans are checked first and always apply.
      {
        title: "Connection & Identity",
        desc: "Who may connect. Checked on the connection card before the player loads in. Server staff and Trust-whitelisted players skip these checks; bans always apply.",
        wide: true,
        fields: [
          T("Settings", "AntiVPN", "Anti VPN", false, "Rejects players connecting through a VPN or proxy. Looks the player's IP up at proxycheck.io (answers are cached for 24 hours) and needs your server to expose real IPs (sv_endpointPrivacy off). If the lookup fails the player is let in, unless 'Block Joins When Verification Fails' is on."),
          S("Settings", "VpnMessage", "Vpn Message", "VPN usage is not allowed on this server.", "Shown on the connection card.", { kind: "message", parent: "AntiVPN", maxLen: 120 }),
          S("Settings", "VpnApiKey", "Vpn Api Key", "", "Optional proxycheck.io API key — a free key raises the daily lookup limit. Stored for your game server only; never shown to players.", { kind: "secret", parent: "AntiVPN", maxLen: 100 }),
          T("Settings", "AntiConnectionDupe", "Anti Connection Dupe", true, "Rejects a second connection from an account that is already in. A session that stopped responding more than 15 seconds ago is dropped instead, so a player who crashed can rejoin straight away."),
          S("Settings", "DupeMessage", "Dupe Message", "Multiple connections detected from your account.", "Shown on the connection card.", { kind: "message", parent: "AntiConnectionDupe", maxLen: 120 }),
          T("Settings", "RequireSteam", "Require Steam", false, "Requires a linked Steam account to connect. Blocks players without one."),
          S("Settings", "SteamRequiredMessage", "Steam Required Message", "A linked Steam account is required to join this server.", "Shown on the connection card.", { kind: "message", parent: "RequireSteam", maxLen: 120 }),
          T("Settings", "RequireDiscord", "Require Discord", false, "Requires a linked Discord account to connect."),
          S("Settings", "DiscordRequiredMessage", "Discord Required Message", "Discord account linking is required to join this server.", "Shown on the connection card.", { kind: "message", parent: "RequireDiscord", maxLen: 120 }),
          T("Settings", "RequireAlphanumericName", "Require Alphanumeric Name", false, "Rejects names with symbols, emoji and invisible characters. Letters from any language (Turkish characters included), digits, spaces and _ - . ' are allowed; everything else — including < and > (so markup in a name is refused too), brackets and zero-width characters — is not."),
          S("Settings", "NameMessage", "Name Message", "Your username contains prohibited characters.", "Shown on the connection card.", { kind: "message", parent: "RequireAlphanumericName", maxLen: 120 }),
          T("Settings", "ReputationGateEnforce", "Reputation Gate Enforce", false, "Network reputation gate. OFF = shadow mode: players who would be refused are only logged. ON = players below the minimum score are actually blocked. The score starts at 100 and drops 35 points for every other server owner that banned the player."),
          N("Settings", "MinReputationScore", "Min Reputation Score", 0, "Lowest network reputation (0-100) allowed to join; 0 turns the gate off. 50 keeps out players banned by two or more other server owners. Above 65 a single owner's ban is enough to block someone.", { parent: "ReputationGateEnforce", min: 0, max: 100 }),
          S("Settings", "ReputationMessage", "Reputation Message", "Your account did not pass this server's trust check.", "Shown on the connection card.", { kind: "message", parent: "ReputationGateEnforce", maxLen: 120 }),
          N("Settings", "MaxThreatScore", "Max Threat Score", 0, "Blocks a player whose threat level on this server reaches this value (0-100; 0 = off). Every automatic kick by the anti-cheat in the last 24 hours counts 40 points (kicks by staff do not count, and banned players are stopped by their ban anyway), so 40 blocks a player after one kick and 80 after two — it keeps out a cheater who was just kicked and rejoins.", { min: 0, max: 100 }),
          S("Settings", "ThreatMessage", "Threat Message", "You are a potential threat to the server.", "Shown on the connection card when a player is blocked for exceeding Max Threat Score.", { kind: "message", maxLen: 120 }),
          T("Settings", "BlockIfVerifyFails", "Block Joins When Verification Fails", false, "If CoreAC cannot reach the panel — or the VPN lookup fails — while a check that needs it is on (VPN, Reputation Gate, Max Threat), refuse the player instead of letting them in unchecked. Leave off unless you prefer a locked door to an unchecked one."),
          S("Settings", "VerifyUnavailableMessage", "Verify Unavailable Message", "CoreAC could not verify your account right now. Please try again in a moment.", "Shown on the connection card when verification could not complete and joins are being blocked.", { kind: "message", parent: "BlockIfVerifyFails", maxLen: 120 }),
        ],
      },
      // ---- Bans & Evidence ----------------------------------------------------
      {
        title: "Bans & Evidence",
        desc: "How automatic bans look and what proof is kept.",
        wide: true,
        fields: [
          T("Settings", "EnableBans", "Enable Bans", true, "Master switch for punishment. With it off, detections are only recorded — nobody is kicked or banned automatically. Bans you issue by hand still work."),
          T("Settings", "BanIpAddress", "Ban Ip Address", false, "Also blocks the IP address the banned player used. Off by default: players who share a network (family, café, mobile carrier) share an IP and would be locked out together with the banned player. Local addresses are never matched."),
          N("Settings", "BanDuration", "Ban Duration", 0, "How many days an automatic ban lasts. 0 means permanent. Bans you issue by hand choose their own length.", { min: 0, max: 3650 }),
          S("Settings", "BanMessage", "Ban Message", "You have been banned by CoreAC for cheating.", "Text a banned player sees on the connection card and when they are dropped.", { kind: "message", maxLen: 140 }),
          T("Settings", "EnableScreenShots", "Enable Screen Shots", true, "Takes one screenshot of the player at the moment of a detection that kicks or bans them, or that is strong evidence on its own (at most one a minute per player). At an automatic ban Gameplay Record, when on, takes a series instead of this single frame. Needs screenshot-basic or screencapture on the server and a public panel address."),
          T("Settings", "EnableGameplayRecord", "Enable Gameplay Record", true, "At an automatic ban, captures a short sequence of screenshots (not a video — FiveM cannot record one) instead of a single frame, so you can see what the player was doing. It works on its own, even with Enable Screen Shots off, and only at bans."),
          T("Settings", "OptimizeRecordMode", "Optimize Record Mode", true, "Fewer, lighter frames (3 instead of 5, lower JPEG quality): quicker to capture and smaller to store. Recommended on busy servers.", { parent: "EnableGameplayRecord" }),
          S("Settings", "BanVideoUrl", "Ban Video URL", "", "Full-screen video shown to the player for up to 15 seconds right before a ban drops them. Must be a direct https:// link to an .mp4 or .webm file.", { kind: "url", maxLen: 400 }),
        ],
      },
      // ---- Logs & Webhooks ----------------------------------------------------
      // The panel posts to Discord itself (src/lib/discord.ts). These URLs are
      // panelOnly: they are stripped from the heartbeat, so the game server — and
      // any backdoor on it — never holds them.
      {
        title: "Logs & Webhooks",
        desc: "Discord channels and console output. Webhook URLs stay in the panel and are never sent to your game server.",
        wide: true,
        fields: [
          T("Settings", "EnableDiscordLogs", "Enable Discord Logs", true, "Master switch for every Discord webhook below (and the one on the Settings page)."),
          S("Settings", "BanWebhook", "Ban Webhook", "", "Discord channel for bans, automatic and manual.", { kind: "webhook", panelOnly: true, maxLen: 300 }),
          S("Settings", "WarnWebhook", "Warn Webhook", "", "Discord channel for warns — detections recorded without any punishment, and manual warnings.", { kind: "webhook", panelOnly: true, maxLen: 300 }),
          S("Settings", "KickWebhook", "Kick Webhook", "", "Discord channel for kicks.", { kind: "webhook", panelOnly: true, maxLen: 300 }),
          S("Settings", "ConnectWebhook", "Connect Webhook", "", "Discord channel for player joins. Leave it empty and join logs are not sent anywhere.", { kind: "webhook", panelOnly: true, maxLen: 300 }),
          S("Settings", "DisconnectWebhook", "Disconnect Webhook", "", "Discord channel for player leaves. Leave it empty and leave logs are not sent anywhere.", { kind: "webhook", panelOnly: true, maxLen: 300 }),
          S("Settings", "SilentAimWebhook", "Silent Aim Webhook", "", "Separate Discord channel for silent-aim warns. Leave it empty and they go to the Warn webhook instead.", { kind: "webhook", panelOnly: true, maxLen: 300 }),
          S("Settings", "AdminLogsWebhook", "Admin Logs Webhook", "", "Discord channel for staff actions: bypass grants, admin-tool exemptions (txAdmin / qb-admin), in-game admin menu commands and unbans. Leave it empty and none of them are posted.", { kind: "webhook", panelOnly: true, maxLen: 300 }),
          T("Settings", "LogOnConnect", "Log On Connect", true, "Logs a line every time a player joins — in the panel logs, the server console and Discord (the last two are controlled below)."),
          T("Settings", "LogConnectionsToDiscord", "Log Connections To Discord", true, "Sends joins and leaves to the Connect and Disconnect webhooks.", { parent: "LogOnConnect" }),
          T("Settings", "LogOnDisconnect", "Log On Disconnect", true, "Logs a line every time a player leaves."),
          T("Settings", "LogConnectionsToConsole", "Log Connections To Console", true, "Prints joins and leaves in the server console."),
          T("Settings", "LogPunishmentsToConsole", "Log Punishments To Console", true, "Prints bans, kicks and warns in the server console. Turn it off to keep the console clean; Discord and the panel still get everything."),
          T("Settings", "ShowIpAddress", "Show Ip Address", false, "Includes player IP addresses in Discord and console logs."),
          T("Settings", "LogUnbansToDiscord", "Log Unbans To Discord", true, "Posts a line every time a ban is lifted by hand — from the web panel (Unban All is one line), the in-game menu, the console or the HTTP API. It goes to the Ban webhook, and to Admin Logs when that is set. Bans that simply run out are not posted."),
        ],
      },
      // ---- Framework & API ----------------------------------------------------
      {
        title: "Framework & API",
        desc: "Names CoreAC needs to recognise your framework and staff, and the game server's HTTP API.",
        wide: true,
        fields: [
          S("Settings", "EsxResourceName", "Esx Resource Name", "es_extended", "Resource name of your ESX core. Only change this if your server renamed it.", { kind: "resource", maxLen: 64 }),
          S("Settings", "QbCoreResourceName", "Qb Core Resource Name", "qb-core", "Resource name of your QBCore core. Only change this if your server renamed it.", { kind: "resource", maxLen: 64 }),
          S("Settings", "QbxCoreResourceName", "Qbx Core Resource Name", "qbx_core", "Resource name of your Qbox core. Only change this if your server renamed it.", { kind: "resource", maxLen: 64 }),
          S("Settings", "TxAdminPath", "Tx Admin Path", "", "Folder of your txAdmin data — the one that contains admins.json (for example C:/txData/default). Admins listed there count as server staff the moment they connect. Leave empty if you do not use txAdmin.", { kind: "path", maxLen: 260 }),
          S("Settings", "CommandPrefix", "Command Prefix", "ac", "Prefix of the admin commands in chat and the console (for example 'ac reload'). Lower-case letters, digits and _ only.", { kind: "command", maxLen: 16 }),
          T("Settings", "HttpApiAllowWrite", "HTTP API — Allow Write Endpoints", false, "Lets the game server's HTTP API accept write requests (unban, request a screenshot, reload the config) and return player IP addresses. OFF by default: anyone holding your server token could otherwise lift bans or request screenshots. Write requests also need at least one Allowed IP."),
          L("Settings", "HttpApiAllowedIps", "HTTP API — Allowed IPs", "Only these addresses may call the HTTP API (IPv4, IPv6 or an IPv4 range like 203.0.113.0/24). Required for write requests; while empty, read requests are accepted from anywhere that has the token.", { kind: "ip", parent: "HttpApiAllowWrite", maxLen: 50 }),
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

// ---- Validation ---------------------------------------------------------------
//
// Whatever a customer types here ends up in Lua, in a request the panel makes to
// Discord, or on a player's screen — so every kind has a strict allow-rule and a
// value that fails it falls back to the default instead of being stored.

const FIELD = new Map<string, ACField>();
for (const f of ALL_FIELDS) FIELD.set(`${f.section}.${f.key}`, f);

// Control characters and invisible / bidirectional formatting (zero-width
// spaces, RTL overrides…) have no place in any setting.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
const clean = (s: string) => s.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();

/**
 * Only a real Discord webhook is accepted. The panel POSTs to these URLs, so
 * anything looser would let a customer point the panel at an internal address
 * (SSRF). The host is pinned to discord.com / discordapp.com.
 */
export const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:(?:canary|ptb)\.)?(?:discord|discordapp)\.com\/api\/(?:v\d{1,2}\/)?webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,120}(?:\?thread_id=\d{5,25})?$/;

export function isDiscordWebhook(url: unknown): url is string {
  return typeof url === "string" && DISCORD_WEBHOOK_RE.test(url);
}

const RESOURCE_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
// "ox_lib" or a source path like "ox_lib/imports/print/client.lua" (optional "@").
const RESOURCE_ITEM_RE = /^@?[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/(?!\.{1,2}(?:\/|$))[A-Za-z0-9_.-]+)*$/;
const EVENT_RE = /^[A-Za-z0-9_.:@/-]{1,120}$/;
const COMMAND_RE = /^[a-z][a-z0-9_]{0,15}$/;
// Names a chat/console prefix must never take: they would shadow server commands.
const RESERVED_PREFIX = new Set([
  "quit", "exit", "restart", "start", "stop", "ensure", "refresh", "say", "exec", "set", "setr", "sets",
  "status", "kick", "ban", "clientkick", "add_ace", "add_principal", "remove_ace", "remove_principal",
  "help", "test", "cac", "txadmin", "tx", "endpoint_add_tcp", "endpoint_add_udp",
]);

/** An https:// URL without credentials, whitespace or quote characters — or "". */
function httpsUrl(raw: string, max: number): string {
  const s = raw.trim();
  if (!s || s.length > max || /[\s<>"'`\\]/.test(s)) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return "";
    return s;
  } catch {
    return "";
  }
}

/** Canonical IPv4 (with optional /prefix) or IPv6 address; null when invalid. */
function normalizeIp(s: string): string | null {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(s);
  if (v4) {
    const octets = [v4[1], v4[2], v4[3], v4[4]].map(Number);
    if (octets.some((o) => o > 255)) return null;
    if (v4[5] !== undefined && Number(v4[5]) > 32) return null;
    return octets.join(".") + (v4[5] !== undefined ? `/${Number(v4[5])}` : "");
  }
  if (/^[0-9a-fA-F:]{2,45}$/.test(s) && s.includes(":") && !s.includes(":::")) return s.toLowerCase();
  return null;
}

function sanitizeText(f: ACField, raw: string): string | undefined {
  const max = f.maxLen ?? 200;
  switch (f.kind) {
    case "webhook": {
      const s = raw.trim();
      return isDiscordWebhook(s) ? s : "";
    }
    case "url":
      return httpsUrl(raw, max);
    case "secret": {
      const s = raw.trim();
      return /^[A-Za-z0-9._-]{1,100}$/.test(s) ? s : "";
    }
    case "path":
      return clean(raw).slice(0, max);
    case "resource": {
      const s = raw.trim();
      return RESOURCE_RE.test(s) ? s : undefined; // invalid → keep the default
    }
    case "command": {
      const s = raw.trim().toLowerCase();
      return COMMAND_RE.test(s) && !RESERVED_PREFIX.has(s) ? s : undefined;
    }
    case "message": {
      const s = clean(raw).slice(0, max);
      return s || undefined; // an empty message is meaningless → keep the default
    }
    default:
      return clean(raw).slice(0, max);
  }
}

function listItem(kind: ACKind | undefined, s: string): string | null {
  switch (kind) {
    case "resource": {
      const item = s.replace(/^@/, "");
      return RESOURCE_ITEM_RE.test(item) ? item : null;
    }
    case "event":
      return EVENT_RE.test(s) ? s : null;
    case "ip":
      return normalizeIp(s);
    default:
      return s;
  }
}

function sanitizeList(f: ACField, raw: unknown[]): string[] {
  const max = f.maxLen ?? 160;
  const cap = f.kind ? 500 : 2000;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const s = clean(v);
    if (!s || s.length > max) continue;
    const item = listItem(f.kind, s);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

/** undefined = the value is not acceptable, keep the default. */
function sanitizeField(f: ACField, value: unknown): boolean | number | string | string[] | undefined {
  switch (f.type) {
    case "toggle":
      return typeof value === "boolean" ? value : undefined;
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
      return Math.max(f.min ?? 0, Math.min(f.max ?? 100000, Math.floor(value)));
    }
    case "text":
      return typeof value === "string" ? sanitizeText(f, value) : undefined;
    case "list":
      return Array.isArray(value) ? sanitizeList(f, value) : undefined;
  }
}

/** Sanitize incoming config: only known keys, correct types, values that pass their kind's rule. */
export function sanitizeAcConfig(input: unknown): ACConfig {
  const base = defaultAcConfig();
  if (!input || typeof input !== "object") return base;
  for (const [section, fields] of Object.entries(input as Record<string, unknown>)) {
    if (!fields || typeof fields !== "object") continue;
    for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
      const field = FIELD.get(`${section}.${key}`);
      if (!field) continue;
      const accepted = sanitizeField(field, value);
      if (accepted !== undefined) base[section][key] = accepted;
    }
  }
  return base;
}

/**
 * Why a typed value would be rejected (null = fine). Same rules as
 * sanitizeAcConfig, so the page can warn before saving instead of the server
 * silently dropping the input.
 */
export function fieldProblem(f: ACField, value: unknown): string | null {
  if (f.type !== "text" || typeof value !== "string" || value.trim() === "") return null;
  const v = value.trim();
  switch (f.kind) {
    case "webhook":
      return isDiscordWebhook(v) ? null : "Not a Discord webhook URL (https://discord.com/api/webhooks/…)";
    case "url":
      return httpsUrl(v, f.maxLen ?? 200) ? null : "Must be a direct https:// link";
    case "secret":
      return /^[A-Za-z0-9._-]{1,100}$/.test(v) ? null : "Only letters, digits, . _ and -";
    case "resource":
      return RESOURCE_RE.test(v) ? null : "Not a valid resource name";
    case "command":
      return COMMAND_RE.test(v.toLowerCase()) && !RESERVED_PREFIX.has(v.toLowerCase())
        ? null
        : "Lower-case letters, digits and _ only — and not a reserved server command";
    default:
      return null;
  }
}

/** Why one list entry would be rejected (null = fine). */
export function listItemProblem(f: ACField, item: string): string | null {
  const s = clean(item);
  if (!s) return "Empty";
  if (s.length > (f.maxLen ?? 160)) return "Too long";
  if (listItem(f.kind, s)) return null;
  return f.kind === "ip" ? "Not an IP address" : f.kind === "event" ? "Not a valid event name" : "Not a valid resource name";
}

// ---- Who may see what ---------------------------------------------------------

const PANEL_ONLY = new Set(ALL_FIELDS.filter((f) => f.panelOnly).map((f) => `${f.section}.${f.key}`));
const SECRET = new Set(
  ALL_FIELDS.filter((f) => f.panelOnly || f.kind === "secret").map((f) => `${f.section}.${f.key}`)
);

/**
 * The config as the GAME SERVER receives it (heartbeat): panel-only fields —
 * the Discord webhook URLs — are removed. The panel posts to Discord itself, so
 * the resource never needs them, and whatever the resource holds can be read by
 * a backdoor running next to it.
 */
export function acForResource(ac: ACConfig): ACConfig {
  const out: ACConfig = {};
  for (const [section, fields] of Object.entries(ac)) {
    const kept: ACConfig[string] = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!PANEL_ONLY.has(`${section}.${key}`)) kept[key] = value;
    }
    out[section] = kept;
  }
  return out;
}

/** Copy of the config safe to hand out (Export button, support tickets): webhook URLs and API keys removed. */
export function acWithoutSecrets(ac: ACConfig): ACConfig {
  const out: ACConfig = {};
  for (const [section, fields] of Object.entries(ac)) {
    const kept: ACConfig[string] = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!SECRET.has(`${section}.${key}`)) kept[key] = value;
    }
    out[section] = kept;
  }
  return out;
}

/** True for fields holding a secret (webhook URL, API key) — the UI masks them. */
export function isSecretField(f: Pick<ACField, "kind" | "panelOnly">): boolean {
  return f.panelOnly === true || f.kind === "secret";
}
