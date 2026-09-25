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

const files = luaFiles(RESOURCE);
const lua = files.map((f) => ({ file: path.relative(ROOT, f), src: fs.readFileSync(f, "utf8") }));
const allLua = lua.map((f) => f.src).join("\n");

const problems = [];
const notes = [];

// ------------------------------------------------- 1. Config key agreement
const acConfigSrc = fs.readFileSync(path.join(ROOT, "src", "lib", "ac-config.ts"), "utf8");

// Panel fields: T("Main", "AntiNoClip", ...) / N(...) / S(...) / L(...)
const panelKeys = new Set();
for (const m of acConfigSrc.matchAll(/\b[TNSL]\(\s*"([A-Za-z]+)"\s*,\s*"([A-Za-z0-9_]+)"/g)) {
  panelKeys.add(`${m[1]}.${m[2]}`);
}

// Keys the panel owns end-to-end: the resource never reads them because the
// behaviour lives in the web API. Log-Only is enforced in
// src/app/api/v1/detections/route.ts before any punishment is issued.
const PANEL_ONLY = new Set(["Settings.LogOnly"]);

// Module reads. Two shapes exist:
//   CoreAC.Config.Main.AntiNoClip        — the normal path
//   Configuration.Settings.EnableAnti…   — server/anti-backdoors.lua reads the
//                                          same table straight off GlobalState
const readKeys = new Map(); // "Section.Key" -> Set<file>
for (const { file, src } of lua) {
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

// Keys the resource hard-codes in bridge/shared.lua defaults are fine to be
// absent from the panel (they are simply not customer-facing).
const sharedDefaults = fs.readFileSync(path.join(RESOURCE, "bridge", "shared.lua"), "utf8");

for (const key of panelKeys) {
  if (PANEL_ONLY.has(key)) continue;
  if (!readKeys.has(key)) {
    problems.push(
      `DEAD TOGGLE  ${key} is offered in the Configuration page but no Lua module ever reads it.`
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
for (const { file, src } of lua) {
  if (file.includes("client/detections/") || file.includes("client\\detections\\")) continue;
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
