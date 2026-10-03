// Runs every check of the Settings-tab work and prints one line per suite.
//
//   npm run test:sim          (or: node tools/sim/run-all.cjs)
//
// Exit code is non-zero when any suite fails. A failing suite prints its last lines.
//
// What each suite proves:
//   * Lua 5.4 compile         every resource file loads under the real compiler (luaparse is lenient)
//   * consistency             panel ↔ Lua keys, defaults, typed reader, secrets never leave the panel
//   * scenario_*              the real resource scripts running in a Lua 5.4 VM with a FiveM stub:
//                             connection gates, bans & evidence, Safe Guard, config/logs/framework, HTTP API, anti-crash, silent aim + damage boost,
//                             secure channel (anti-bypass), Event Shield, client side
//   * panel-checks            input validation (SSRF / injection), what the game server may receive, Discord routing
const { spawnSync } = require("child_process");
const path = require("path");

const here = __dirname;
const root = path.join(here, "..", "..");
const isWin = process.platform === "win32";

const suites = [
  { name: "Lua compiles under Lua 5.4", cmd: process.execPath, args: ["luaload.cjs", "../../fivem-resource"], cwd: here },
  { name: "Lua syntax (luaparse)", cmd: process.execPath, args: ["luacheck.cjs", "../../fivem-resource/coreac"], cwd: here },
  { name: "panel ↔ Lua consistency (check:ac)", cmd: process.execPath, args: ["scripts/check-ac-consistency.js"], cwd: root },
  { name: "scenario: connection gates", cmd: process.execPath, args: ["run.cjs", "scenario_conn.lua"], cwd: here },
  { name: "scenario: bans & evidence", cmd: process.execPath, args: ["run.cjs", "scenario_bans.lua"], cwd: here },
  { name: "scenario: Safe Guard", cmd: process.execPath, args: ["run.cjs", "scenario_safeguard.lua"], cwd: here },
  { name: "scenario: config, logs, framework, prefix", cmd: process.execPath, args: ["run.cjs", "scenario_config.lua"], cwd: here },
  { name: "scenario: game server HTTP API", cmd: process.execPath, args: ["run.cjs", "scenario_httpapi.lua"], cwd: here },
  { name: "scenario: anti-crash", cmd: process.execPath, args: ["run.cjs", "scenario_crash.lua"], cwd: here },
  { name: "scenario: rapid fire + spoofed position reports", cmd: process.execPath, args: ["run.cjs", "scenario_firerate_desync.lua"], cwd: here },
  { name: "scenario: event log (live feed + JSON details)", cmd: process.execPath, args: ["run.cjs", "scenario_eventlog.lua"], cwd: here },
  { name: "scenario: silent aim (2 tiers) + damage boost", cmd: process.execPath, args: ["run.cjs", "scenario_aim_damage.lua"], cwd: here },
  { name: "scenario: secure channel (anti-bypass, server)", cmd: process.execPath, args: ["run.cjs", "scenario_channel.lua"], cwd: here },
  { name: "scenario: Event Shield (floods, traps, executor triggers, install)", cmd: process.execPath, args: ["run.cjs", "scenario_shield.lua"], cwd: here },
  {
    name: "scenario: client side (prefix, NUI video, screenshots)",
    cmd: process.execPath,
    args: ["run.cjs", "scenario_client_settings.lua"],
    cwd: here,
    env: { CLIENT: "1", CLIENT_FILES: "client/admin.lua,client/main.lua" },
  },
  {
    name: "scenario: client aim samples (gamepad / cover flags)",
    cmd: process.execPath,
    args: ["run.cjs", "scenario_client_aim.lua"],
    cwd: here,
    env: { CLIENT: "1", CLIENT_FILES: "client/aimsync.lua" },
  },
  {
    name: "scenario: anti-cheat environment integrity (client)",
    cmd: process.execPath,
    args: ["run.cjs", "scenario_client_integrity.lua"],
    cwd: here,
    env: { CLIENT: "1", CLIENT_FILES: "client/integrity.lua" },
  },
  {
    name: "scenario: secure channel + spoofed control events (client)",
    cmd: process.execPath,
    args: ["run.cjs", "scenario_client_channel.lua"],
    cwd: here,
    env: { CLIENT: "1", CLIENT_FILES: "client/integrity.lua,client/pedModel.lua" },
  },
  {
    name: "scenario: Event Shield include (client)",
    cmd: process.execPath,
    args: ["run.cjs", "scenario_client_shield.lua"],
    cwd: here,
    env: { CLIENT: "1", CLIENT_FILES: "shield/include.lua" },
  },
  { name: "panel checks (validation, secrets, Discord routing)", cmd: isWin ? "npx.cmd" : "npx", args: ["tsx", "tools/sim/panel-checks.ts"], cwd: root, shell: isWin },
];

let failed = 0;
for (const s of suites) {
  const t0 = Date.now();
  const r = spawnSync(s.cmd, s.args, {
    cwd: s.cwd,
    env: { ...process.env, ...(s.env || {}) },
    encoding: "utf8",
    shell: s.shell === true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const ok = r.status === 0;
  const summary = (out.match(/(\d+\/\d+ (?:checks passed|Lua files[^\n]*|Lua files compile[^\n]*))/g) || []).pop() ||
    (out.split("\n").filter((l) => /^OK —/.test(l))[0] || "");
  console.log(`${ok ? "  ok  " : " FAIL "} ${s.name}  (${((Date.now() - t0) / 1000).toFixed(1)}s)${summary ? "  " + summary.trim() : ""}`);
  if (!ok) {
    failed++;
    console.log(out.split("\n").filter((l) => /FAIL|ERROR|✗|!!|problem/.test(l)).slice(-12).join("\n"));
  }
}
console.log(failed ? `\n${failed} suite(s) FAILED` : "\nall suites passed");
process.exit(failed ? 1 : 0);
