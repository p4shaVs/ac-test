#!/usr/bin/env node
/**
 * Cross-checks the FiveM resource against the web panel.
 *
 * This whole class of bug is invisible to both tsc and the Lua runtime: a key
 * the panel sends and a key the module reads only have to differ by one word
 * for a protection to silently do nothing — or, worse, to read an undefined
 * threshold and fire on every player. That is exactly how
 * "ExplosionsLimitIn" vs "ExplosionsLimitIn5Seconds" cancelled every explosion
 * on the server. Run this after touching either side.
 *
 *   node scripts/check-ac-consistency.js
 *
 * Exits non-zero when something is out of sync.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RESOURCE = path.join(ROOT, "fivem-resource", "coreac");

// ---------------------------------------------------------------- helpers
function luaFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) luaFiles(p, out);
    else if (e.name.endsWith(".lua")) out.push(p);
  }
  return out;
}

// Lua comments never count as a read.
const stripLuaComments = (s) => s.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--[^\n]*/g, "");

const files = luaFiles(RESOURCE);
const lua = files.map((f) => ({ file: path.relative(ROOT, f), src: fs.readFileSync(f, "utf8") }));
const allLua = lua.map((f) => f.src).join("\n");

// Only files fxmanifest.lua really LOADS count as "reading" a key. A module that is
// commented out of the manifest (client/detections/*, server/events/playerConnecting.lua)
// reads keys all day without ever running — that is exactly how dead toggles hid
// behind this check before.
const manifest = fs.readFileSync(path.join(RESOURCE, "fxmanifest.lua"), "utf8");
function manifestBlock(name) {
  const start = manifest.indexOf(`${name} {`);
  return start < 0 ? "" : manifest.slice(start, manifest.indexOf("\n}", start));
}
const listed = (name) => new Set([...manifestBlock(name).matchAll(/^\s*'([^']+\.lua)'/gm)].map((m) => m[1]));
const serverListed = listed("server_scripts");
const clientListed = listed("client_scripts");
const relOf = (file) => file.replace(/^fivem-resource[\\/]coreac[\\/]/, "").replace(/\\/g, "/");
const activeLua = lua.filter((f) => serverListed.has(relOf(f.file)) || clientListed.has(relOf(f.file)));
const activeServerLua = lua.filter((f) => serverListed.has(relOf(f.file)));
const activeClientLua = lua.filter((f) => clientListed.has(relOf(f.file)));

const problems = [];
const notes = [];

// ------------------------------------------------- 1. Config key agreement
const acConfigSrc = fs.readFileSync(path.join(ROOT, "src", "lib", "ac-config.ts"), "utf8");

// Panel fields: T("Main", "AntiNoClip", ...) / N(...) / S(...) / L(...)
const panelKeys = new Set();
for (const m of acConfigSrc.matchAll(/\b[TNSL]\(\s*"([A-Za-z]+)"\s*,\s*"([A-Za-z0-9_]+)"/g)) {
  panelKeys.add(`${m[1]}.${m[2]}`);
}

// Keys the PANEL owns end-to-end: the resource never reads them because the behaviour
// lives in the web API / Discord layer (Log-Only and Enable Bans are enforced in
// src/app/api/v1/detections/route.ts before any punishment is issued; screenshot counts
// are decided there too; Discord webhooks are posted by src/lib/discord.ts). Each one is
// verified below to be REFERENCED by panel code — otherwise it is a dead toggle all the same.
const PANEL_ONLY = new Set([
  "Settings.LogOnly",
  "Settings.EnableBans",
  "Settings.BanDuration",
  "Settings.EnableScreenShots",
  "Settings.EnableGameplayRecord",
  "Settings.OptimizeRecordMode",
  "Settings.EnableDiscordLogs",
  "Settings.BanWebhook",
  "Settings.WarnWebhook",
  "Settings.KickWebhook",
  "Settings.ConnectWebhook",
  "Settings.DisconnectWebhook",
  "Settings.SilentAimWebhook",
  "Settings.AdminLogsWebhook",
  "Settings.LogUnbansToDiscord",
]);

// Module reads. Two shapes exist:
//   CoreAC.Config.Main.AntiNoClip        — the normal path
//   Configuration.Settings.EnableAnti…   — server/anti-backdoors.lua reads the
//                                          same table straight off GlobalState
const readKeys = new Map(); // "Section.Key" -> Set<file>
for (const { file, src } of activeLua) {
  const patterns = [
    /CoreAC\.Config\.([A-Za-z]+)\.([A-Za-z0-9_]+)/g,
    /\bConfiguration\.([A-Za-z]+)\.([A-Za-z0-9_]+)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      const key = `${m[1]}.${m[2]}`;
      if (!readKeys.has(key)) readKeys.set(key, new Set());
      readKeys.get(key).add(file);
    }
  }
}

// Settings are also read through short aliases (`local function S() return CoreAC.Config.Settings end`,
// `settings` callback parameters, a cached local). For the Settings section, a property access on
// the exact key name inside an ACTIVE file counts as a read (a typo in the key still fails).
for (const key of panelKeys) {
  const [section, name] = key.split(".");
  if (section !== "Settings") continue;
  const prop = new RegExp(`\\.${name}\\b`);
  const quoted = new RegExp(`['"]${name}['"]`); // table-driven reads: FW_KEY = { qb = 'QbCoreResourceName' }
  for (const { file, src } of activeLua) {
    const code = stripLuaComments(src);
    if (prop.test(code) || quoted.test(code)) {
      if (!readKeys.has(key)) readKeys.set(key, new Set());
      readKeys.get(key).add(file);
    }
  }
}

// Keys the resource hard-codes in bridge/shared.lua defaults are fine to be
// absent from the panel (they are simply not customer-facing).
const sharedDefaults = fs.readFileSync(path.join(RESOURCE, "bridge", "shared.lua"), "utf8");

for (const key of panelKeys) {
  if (PANEL_ONLY.has(key)) continue;
  if (!readKeys.has(key)) {
    problems.push(
      `DEAD TOGGLE  ${key} is offered in the Configuration page but no ACTIVE Lua module (one fxmanifest.lua loads) ever reads it.`
    );
  }
}

for (const [key, where] of readKeys) {
  if (panelKeys.has(key)) continue;
  const [, name] = key.split(".");
  // A read that resolves through the shared.lua defaults table is intentional.
  const hasDefault = new RegExp(`\\b${name}\\s*=`).test(sharedDefaults);
  const line = `${key} is read by ${[...where].join(", ")} but is not exposed in the panel`;
  if (hasDefault) notes.push(`not customer-facing   ${line} (fixed default in bridge/shared.lua)`);
  else notes.push(`falls back to metatable  ${line}`);
}

// ------------------------------------------- 2. Detection type agreement
const detActionsSrc = fs.readFileSync(path.join(ROOT, "src", "lib", "detection-actions.ts"), "utf8");
const registryTypes = new Set();
for (const m of detActionsSrc.matchAll(/\bD\(\s*"([A-Z0-9_]+)"/g)) registryTypes.add(m[1]);

// CoreAC.Detections table in bridge/shared.lua: KEY = 'VALUE'
const detectionTable = new Map();
const tableMatch = sharedDefaults.match(/CoreAC\.Detections\s*=\s*\{([\s\S]*?)\n\}/);
if (tableMatch) {
  for (const m of tableMatch[1].matchAll(/([A-Z0-9_]+)\s*=\s*'([A-Z0-9_]+)'/g)) {
    detectionTable.set(m[1], m[2]);
  }
}
// Legacy plain-string names normalised in shared.lua
for (const m of sharedDefaults.matchAll(/\['[^']+'\]\s*=\s*'([A-Z0-9_]+)'/g)) {
  registryTypes.has(m[1]) || problems.push(`UNKNOWN TYPE  legacy mapping produces "${m[1]}" which the panel registry does not define.`);
}

// Every CoreAC.Detections.X used by a module must exist in the table…
for (const { file, src } of lua) {
  for (const m of src.matchAll(/CoreAC\.Detections\.([A-Z0-9_]+)/g)) {
    if (!detectionTable.has(m[1])) {
      problems.push(
        `UNMAPPED     ${file} uses CoreAC.Detections.${m[1]} which is not in the table — it would be sent to the panel verbatim.`
      );
    }
  }
}
// …and every value in the table must exist in the panel registry.
for (const [key, value] of detectionTable) {
  if (!registryTypes.has(value)) {
    problems.push(
      `UNKNOWN TYPE  CoreAC.Detections.${key} maps to "${value}" which is not defined in src/lib/detection-actions.ts (it could never punish).`
    );
  }
}

// -------------------------------------------- 2b. Server-guard rule agreement
// The "Server Guards" tab (src/lib/rules.ts) drives CAC.getRules() reads in
// the resource. A rule key that no ACTIVE Lua file reads is a dead toggle; a
// rule read by active Lua but missing from the panel is an orphaned check.
// The disabled client/detections/ folder is NOT active, so reads that live
// only there do not count as "read".
const rulesSrc = fs.readFileSync(path.join(ROOT, "src", "lib", "rules.ts"), "utf8");
const panelRuleKeys = new Set();
for (const m of rulesSrc.matchAll(/key:\s*"([a-z_]+)"/g)) panelRuleKeys.add(m[1]);

const ruleReads = new Map(); // key -> Set<file>
for (const { file, src } of activeLua) {
  for (const re of [/ruleOn\(\s*'([a-z_]+)'/g, /getRules\(\)\s*\[\s*'([a-z_]+)'\s*\]/g, /CAC\.rule\(\s*'([a-z_]+)'/g]) {
    for (const m of src.matchAll(re)) {
      if (!ruleReads.has(m[1])) ruleReads.set(m[1], new Set());
      ruleReads.get(m[1]).add(file);
    }
  }
}

for (const key of panelRuleKeys) {
  if (!ruleReads.has(key)) {
    problems.push(
      `DEAD RULE    "${key}" is offered on the Server Guards tab but no active Lua file reads it (CAC.getRules).`
    );
  }
}
for (const [key, where] of ruleReads) {
  if (!panelRuleKeys.has(key)) {
    problems.push(
      `MISSING RULE  ${[...where].join(", ")} reads rule "${key}" but it is not offered on the Server Guards tab.`
    );
  }
}

// ------------------------------------------------ 2c. Settings tab guarantees
// Everything below guards the Settings tab (Safe Guard, Connection & Identity, Bans &
// Evidence, Logs & Webhooks, Framework & API): its values reach the game server, the players
// and Discord, so drift here is a security bug, not just a dead button.
// Panel side: every Settings field with its default and flags, read from ac-config.ts.
const panelSettings = new Map(); // "Key" -> { type, def, panelOnly }
for (const line of acConfigSrc.split("\n")) {
  const m = /^\s*([TNSL])\(\s*"Settings"\s*,\s*"([A-Za-z0-9_]+)"\s*,\s*"(?:[^"\\]|\\.)*"\s*(?:,\s*(true|false|-?\d+|"(?:[^"\\]|\\.)*"))?/.exec(line);
  if (!m) continue;
  const [, type, key, rawDef] = m;
  let def;
  if (type === "L") def = [];
  else if (rawDef === "true") def = true;
  else if (rawDef === "false") def = false;
  else if (/^-?\d+$/.test(rawDef || "")) def = Number(rawDef);
  else def = (rawDef || '""').slice(1, -1).replace(/\\(.)/g, "$1");
  panelSettings.set(key, { type, def, panelOnly: /panelOnly:\s*true/.test(line) });
}

// (a) Defaults: until the first heartbeat arrives the resource runs on the Settings block of
// bridge/shared.lua, so a mismatch means "on in the panel, off for the first minute".
const settingsStart = sharedDefaults.indexOf("Settings = {");
let depth = 0;
let settingsEnd = settingsStart;
for (let i = sharedDefaults.indexOf("{", settingsStart); i < sharedDefaults.length; i++) {
  if (sharedDefaults[i] === "{") depth++;
  else if (sharedDefaults[i] === "}" && --depth === 0) { settingsEnd = i; break; }
}
const luaSettings = new Map();
for (const line of sharedDefaults.slice(settingsStart, settingsEnd).split("\n")) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(true|false|-?\d+(?:\.\d+)?|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\{\s*\})/.exec(line);
  if (!m) continue;
  const raw = m[2];
  let v;
  if (raw === "true") v = true;
  else if (raw === "false") v = false;
  else if (/^-?\d/.test(raw)) v = Number(raw);
  else if (raw.startsWith("{")) v = [];
  else v = raw.slice(1, -1).replace(/\\(.)/g, "$1");
  luaSettings.set(m[1], v);
}
for (const [key, field] of panelSettings) {
  if (field.panelOnly || PANEL_ONLY.has(`Settings.${key}`)) continue; // the resource never sees these
  if (!luaSettings.has(key)) {
    problems.push(`NO LUA DEFAULT  Settings.${key} has no default in bridge/shared.lua — before the first heartbeat it reads as false/0.`);
    continue;
  }
  const a = JSON.stringify(field.def);
  const b = JSON.stringify(luaSettings.get(key));
  if (a !== b) problems.push(`DEFAULT DRIFT  Settings.${key}: panel default ${a} but bridge/shared.lua starts with ${b}.`);
}

// (b) src/lib/ac-settings.ts (typed reader) lists exactly the Settings keys of the panel.
const settingsTs = fs.readFileSync(path.join(ROOT, "src", "lib", "ac-settings.ts"), "utf8");
const ifaceBody = (/export interface AcSettings \{([\s\S]*?)\n\}/.exec(settingsTs) || [, ""])[1];
const ifaceKeys = new Set([...ifaceBody.matchAll(/^\s+([A-Za-z0-9_]+):/gm)].map((m) => m[1]));
for (const key of panelSettings.keys()) {
  if (!ifaceKeys.has(key)) problems.push(`TYPED READER  Settings.${key} is in ac-config.ts but missing from the AcSettings interface (src/lib/ac-settings.ts).`);
}
for (const key of ifaceKeys) {
  if (!panelSettings.has(key)) problems.push(`TYPED READER  AcSettings.${key} does not exist in ac-config.ts (a typo reads undefined).`);
}

// (c) Panel-consumed keys must be referenced by panel code (outside the schema + the typed reader).
function tsFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) tsFiles(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const panelCode = tsFiles(path.join(ROOT, "src"))
  .filter((f) => !/src[\\/]lib[\\/](ac-config|ac-settings)\.ts$/.test(f))
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");
for (const k of PANEL_ONLY) {
  const name = k.split(".")[1];
  if (!new RegExp(`\\.${name}\\b`).test(panelCode)) {
    problems.push(`DEAD PANEL TOGGLE  ${k} is marked panel-only but no panel code (src/) reads it — it does nothing.`);
  }
}

// (d) Fields flagged panelOnly are stripped from the heartbeat, so the resource must not read them.
for (const [key, field] of panelSettings) {
  if (!field.panelOnly) continue;
  const re = new RegExp(`\\.${key}\\b`);
  for (const { file, src } of activeLua) {
    if (re.test(stripLuaComments(src))) {
      problems.push(`PANEL-ONLY READ  ${file} reads Settings.${key}, but the heartbeat never sends panel-only fields (Discord webhooks stay in the panel).`);
    }
  }
}
const heartbeatSrc = fs.readFileSync(path.join(ROOT, "src", "app", "api", "v1", "heartbeat", "route.ts"), "utf8");
if (!/acForResource\(/.test(heartbeatSrc)) {
  problems.push("SECRET LEAK  src/app/api/v1/heartbeat/route.ts does not pass the config through acForResource() — webhook URLs would reach the game server.");
}
if (/\.\.\.stored\b/.test(heartbeatSrc) && !/discordWebhook/.test(heartbeatSrc)) {
  problems.push("SECRET LEAK  the heartbeat spreads the stored config without removing the legacy discordWebhook.");
}

// (e) The Settings section is never broadcast to players, so client-only Lua must not read it.
const clientOnly = lua.filter((f) => clientListed.has(relOf(f.file)) && !serverListed.has(relOf(f.file)));
for (const { file, src } of clientOnly) {
  if (/\bSettings\b/.test(stripLuaComments(src))) {
    problems.push(`CLIENT READS SETTINGS  ${file} reads the Settings section, which bridge/server.lua deliberately does not send to players.`);
  }
}
if (!/CoreAC\.PublicSettings\(/.test(fs.readFileSync(path.join(RESOURCE, "bridge", "server.lua"), "utf8"))) {
  problems.push("SECRET LEAK  bridge/server.lua no longer filters Settings through CoreAC.PublicSettings() before replicating GlobalState.");
}

notes.push(`Settings tab: ${panelSettings.size} fields checked (defaults, typed reader, panel-only, client isolation)`);

// ------------------------------------------------------------- 3. Report
if (notes.length) {
  console.log("Notes (not errors):");
  for (const n of notes.sort()) console.log("  · " + n);
  console.log("");
}

if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems.sort()) console.log("  ✗ " + p);
  process.exit(1);
}

console.log(
  `OK — ${panelKeys.size} panel config keys, ${panelRuleKeys.size} server-guard rules, ` +
    `${detectionTable.size} detection mappings and ${registryTypes.size} registry types are consistent.`
);
