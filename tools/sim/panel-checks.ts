// Panel-side checks for the Configuration → Settings work (no test framework in
// the project, so this is a plain script):
//
//   npx tsx tools/sim/panel-checks.ts
//
// Exits non-zero when any check fails. Covers: input validation (SSRF / injection),
// what the game server is allowed to receive, Discord channel routing.

import {
  sanitizeAcConfig,
  defaultAcConfig,
  acForResource,
  acWithoutSecrets,
  isDiscordWebhook,
} from "../../src/lib/ac-config";
import { readAcSettings, punishmentsOn } from "../../src/lib/ac-settings";
import { webhookTargets, sendWebhook } from "../../src/lib/discord";
import {
  DETECTION_TYPES,
  capByConfidence,
  isExplicitChoice,
  resolveAction,
  sanitizeActions,
  sanitizeExplicit,
  type DetectionAction,
} from "../../src/lib/detection-actions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let failed = 0;
let total = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  total++;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failed++;
    console.log(`  FAIL ${name}${detail !== undefined ? "  → " + JSON.stringify(detail) : ""}`);
  }
}
const S = (patch: Record<string, unknown>) => sanitizeAcConfig({ Settings: patch }).Settings;
const cfg = (patch: Record<string, unknown>) => JSON.stringify({ ac: { Settings: patch } });

const HOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
const HOOK2 = "https://discord.com/api/webhooks/223456789012345678/zbcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
const HOOK3 = "https://discord.com/api/webhooks/323456789012345678/qbcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";

console.log("\n== webhook URLs (the panel POSTs to these → must only ever be Discord) ==");
check("real webhook accepted", isDiscordWebhook(HOOK));
check("discordapp.com + canary host accepted", isDiscordWebhook(HOOK.replace("discord.com", "canary.discordapp.com")));
for (const bad of [
  "http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz",
  "https://evil.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz",
  "https://discord.com.evil.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz",
  "https://discord.com@evil.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz",
  "https://127.0.0.1/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz",
  "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz/../../admin",
  "https://discord.com/api/webhooks/abc/abcdefghijklmnopqrstuvwxyz",
]) check(`rejects ${bad.slice(0, 52)}…`, !isDiscordWebhook(bad));
check("sanitizer drops a non-Discord webhook", S({ BanWebhook: "https://evil.com/x" }).BanWebhook === "");
check("sanitizer keeps a valid webhook", S({ BanWebhook: HOOK }).BanWebhook === HOOK);

console.log("\n== ban video URL (played full-screen in players' NUI) ==");
check("https mp4 accepted", S({ BanVideoUrl: "https://cdn.example.com/ban.mp4" }).BanVideoUrl === "https://cdn.example.com/ban.mp4");
for (const bad of ["javascript:alert(1)", "http://cdn.example.com/a.mp4", "https://u:p@cdn.example.com/a.mp4", "https://cdn.example.com/a b.mp4", "https://x/a.mp4", 'https://a.com/"onerror=1', "data:text/html,<script>1</script>"])
  check(`rejects ${bad.slice(0, 40)}`, S({ BanVideoUrl: bad }).BanVideoUrl === "");

console.log("\n== messages / text ==");
check("zero-width + bidi characters stripped", S({ BanMessage: "Ban\u200Bned\u202E by us" }).BanMessage === "Banned by us", S({ BanMessage: "Ban\u200Bned\u202E by us" }).BanMessage);
check("empty message falls back to the default", S({ BanMessage: "   " }).BanMessage === defaultAcConfig().Settings.BanMessage);
check("message capped at its maxLen", (S({ BanMessage: "x".repeat(500) }).BanMessage as string).length === 140);
check("framework name: valid kept", S({ QbCoreResourceName: "my-core_2" }).QbCoreResourceName === "my-core_2");
check("framework name: invalid → default", S({ QbCoreResourceName: "a b;rm -rf" }).QbCoreResourceName === "qb-core");
check("api key: invalid chars → cleared", S({ VpnApiKey: "abc def" }).VpnApiKey === "");
check("api key: valid kept", S({ VpnApiKey: "111111-222222-333333-444444" }).VpnApiKey === "111111-222222-333333-444444");

console.log("\n== command prefix (registered as a server command → must not shadow built-ins) ==");
check("lower-cased", S({ CommandPrefix: "MyAc" }).CommandPrefix === "myac");
for (const r of ["quit", "restart", "ensure", "cac", "exec", "a b", "1ac", ""]) check(`'${r}' → default`, S({ CommandPrefix: r }).CommandPrefix === "ac", S({ CommandPrefix: r }).CommandPrefix);

console.log("\n== numbers ==");
check("BanDuration clamps to 0..3650", S({ BanDuration: -5 }).BanDuration === 0 && S({ BanDuration: 99999 }).BanDuration === 3650 && S({ BanDuration: 30.9 }).BanDuration === 30);
check("MinReputationScore / MaxThreatScore clamp to 0..100", S({ MinReputationScore: 500 }).MinReputationScore === 100 && S({ MaxThreatScore: 101 }).MaxThreatScore === 100);
check("non-numbers ignored", S({ BanDuration: "30" }).BanDuration === 0);

console.log("\n== lists ==");
check("SafeEvents keeps real event names", JSON.stringify(S({ SafeEvents: ["QBCore:Server:OnPlayerLoaded", "esx:playerLoaded"] }).SafeEvents) === JSON.stringify(["QBCore:Server:OnPlayerLoaded", "esx:playerLoaded"]));
check("SafeEvents drops junk + duplicates", JSON.stringify(S({ SafeEvents: ["ok:event", "ok:event", "bad event", "<script>", 5, ""] }).SafeEvents) === JSON.stringify(["ok:event"]), S({ SafeEvents: ["ok:event", "ok:event", "bad event", "<script>", 5, ""] }).SafeEvents);
check("resource list accepts a source path and '@'", JSON.stringify(S({ AntiResourceInjectionSafeList: ["ox_lib", "@ox_lib/imports/print/client.lua"] }).AntiResourceInjectionSafeList) === JSON.stringify(["ox_lib", "ox_lib/imports/print/client.lua"]), S({ AntiResourceInjectionSafeList: ["ox_lib", "@ox_lib/imports/print/client.lua"] }).AntiResourceInjectionSafeList);
check("resource list rejects traversal / junk", (S({ IgnoredScripts: ["../etc/passwd", "a b", "x;y", "good_res"] }).IgnoredScripts as string[]).join() === "good_res", S({ IgnoredScripts: ["../etc/passwd", "a b", "x;y", "good_res"] }).IgnoredScripts);
check("IP list canonicalises IPv4 and rejects garbage", JSON.stringify(S({ HttpApiAllowedIps: ["203.000.113.007", "10.0.0.0/8", "::1", "999.1.1.1", "1.2.3.4/33", "evil.com"] }).HttpApiAllowedIps) === JSON.stringify(["203.0.113.7", "10.0.0.0/8", "::1"]), S({ HttpApiAllowedIps: ["203.000.113.007", "10.0.0.0/8", "::1", "999.1.1.1", "1.2.3.4/33", "evil.com"] }).HttpApiAllowedIps);
check("list capped (500 for typed lists)", (S({ SafeEvents: Array.from({ length: 900 }, (_, i) => `e:${i}`) }).SafeEvents as string[]).length === 500);
check("old untyped lists still accept model names / hashes", (sanitizeAcConfig({ Weapons: { BlackListedWeapons: ["weapon_rpg", "  weapon_grenade  "] } }).Weapons.BlackListedWeapons as string[]).join() === "weapon_rpg,weapon_grenade");

console.log("\n== what the GAME SERVER may receive (heartbeat) ==");
const full = sanitizeAcConfig({ Settings: { BanWebhook: HOOK, AdminLogsWebhook: HOOK2, VpnApiKey: "key-123", BanMessage: "hi" } });
const forRes = acForResource(full);
check("webhook URLs removed from the resource copy", !("BanWebhook" in forRes.Settings) && !("AdminLogsWebhook" in forRes.Settings) && !JSON.stringify(forRes).includes("discord.com"));
check("non-secret settings still delivered", forRes.Settings.BanMessage === "hi" && "AntiVPN" in forRes.Settings);
check("VPN key IS delivered (server needs it) …", forRes.Settings.VpnApiKey === "key-123");
const exported = acWithoutSecrets(full);
check("… but never appears in an Export", !("VpnApiKey" in exported.Settings) && !("BanWebhook" in exported.Settings));
check("default config contains no secrets", !JSON.stringify(defaultAcConfig()).includes("discord.com"));

console.log("\n== enforcement switches ==");
check("default: punishments on", punishmentsOn(readAcSettings("{}")));
check("Log-Only → off", !punishmentsOn(readAcSettings(cfg({ LogOnly: true }))));
check("Enable Bans off → off", !punishmentsOn(readAcSettings(cfg({ EnableBans: false }))));

console.log("\n== Discord routing ==");
const t = (config: string, event: Parameters<typeof webhookTargets>[1], f: Parameters<typeof webhookTargets>[2] = {}) => webhookTargets(config, event, f);
const channels = cfg({ BanWebhook: HOOK, WarnWebhook: HOOK2, KickWebhook: HOOK3 });
check("ban → Ban channel", t(channels, "ban").join() === HOOK);
check("auto-ban → Ban channel", t(channels, "autoban", { action: "BAN" }).join() === HOOK);
check("detection that kicked → Kick channel", t(channels, "detection", { action: "KICK" }).join() === HOOK3);
check("detection only logged → Warn channel", t(channels, "detection", { action: "LOG" }).join() === HOOK2);
check("manual warn → Warn channel", t(channels, "warn").join() === HOOK2);
check("silent aim warn with no own channel → Warn", t(channels, "detection", { action: "LOG", detectionType: "SILENT_AIM" }).join() === HOOK2);
const withSilent = cfg({ BanWebhook: HOOK, WarnWebhook: HOOK2, SilentAimWebhook: HOOK3 });
check("silent aim warn with own channel → that channel", t(withSilent, "detection", { action: "LOG", detectionType: "SILENT_AIM" }).join() === HOOK3);
check("silent aim BAN still goes to Ban channel", t(withSilent, "detection", { action: "BAN", detectionType: "SILENT_AIM" }).join() === HOOK);
check("other warns unaffected by the silent-aim channel", t(withSilent, "detection", { action: "LOG", detectionType: "NOCLIP" }).join() === HOOK2);
check("connect with no Connect webhook → nowhere", t(channels, "connect").length === 0);
check("connect with webhook → Connect channel", t(cfg({ ConnectWebhook: HOOK }), "connect").join() === HOOK);
check("Log Connections To Discord off → no connect/disconnect posts", t(cfg({ ConnectWebhook: HOOK, DisconnectWebhook: HOOK2, LogConnectionsToDiscord: false }), "connect").length === 0 && t(cfg({ ConnectWebhook: HOOK, DisconnectWebhook: HOOK2, LogConnectionsToDiscord: false }), "disconnect").length === 0);
check("Log On Connect off → no join posts", t(cfg({ ConnectWebhook: HOOK, LogOnConnect: false }), "connect").length === 0);
check("Log On Disconnect off → no leave posts but joins continue", t(cfg({ ConnectWebhook: HOOK, DisconnectWebhook: HOOK2, LogOnDisconnect: false }), "disconnect").length === 0 && t(cfg({ ConnectWebhook: HOOK, DisconnectWebhook: HOOK2, LogOnDisconnect: false }), "connect").length === 1);
const unban = cfg({ BanWebhook: HOOK, AdminLogsWebhook: HOOK2 });
check("unban → Ban channel + Admin Logs", t(unban, "unban").sort().join() === [HOOK, HOOK2].sort().join());
check("Log Unbans To Discord off → nothing", t(cfg({ BanWebhook: HOOK, AdminLogsWebhook: HOOK2, LogUnbansToDiscord: false }), "unban").length === 0);
check("admin action → Admin Logs only", t(unban, "admin").join() === HOOK2);
check("admin action with no Admin Logs webhook → nowhere", t(channels, "admin").length === 0);
check("Enable Discord Logs off silences every channel", t(cfg({ BanWebhook: HOOK, EnableDiscordLogs: false }), "ban").length === 0);
const legacy = JSON.stringify({ discordWebhook: HOOK3, webhookEvents: { ban: true, kick: true, detection: true, autoban: true } });
check("legacy single webhook still carries its enabled events", t(legacy, "ban").join() === HOOK3 && t(legacy, "detection", { action: "LOG" }).join() === HOOK3);
check("legacy webhook does not get events it has off", t(legacy, "warn").length === 0);
check("a dedicated channel wins over the legacy webhook", t(JSON.stringify({ discordWebhook: HOOK3, webhookEvents: { ban: true }, ac: { Settings: { BanWebhook: HOOK } } }), "ban").join() === HOOK);
check("legacy webhook never receives Admin Logs", t(JSON.stringify({ discordWebhook: HOOK3, webhookEvents: { admin: true } }), "admin").length === 0);
check("same URL on two channels is posted once", t(cfg({ BanWebhook: HOOK, AdminLogsWebhook: HOOK }), "unban").length === 1);

console.log("\n== punishments: the action you pick is the action that runs ==");
{
  const ACTIONS: DetectionAction[] = ["LOG", "KICK", "BAN"];
  const ORIGINS = ["server", "client"] as const;
  let wrong = 0;
  let cases = 0;
  for (const d of DETECTION_TYPES) {
    for (const a of ACTIONS) {
      for (const origin of ORIGINS) {
        // 1. clicked in the editor (recorded in actionsExplicit): exactly what was picked
        cases++;
        if (resolveAction({ [d.type]: a }, d.type, origin, new Set([d.type])) !== a) wrong++;
        // 2. a value that differs from the shipped default is a choice even without the marker (older saves)
        if (a !== d.defaultAction) {
          cases++;
          if (resolveAction({ [d.type]: a }, d.type, origin) !== a) wrong++;
        }
      }
    }
  }
  check(`every detection x every action x both origins is applied exactly as picked (${cases} cases)`, wrong === 0, wrong);

  // Untouched defaults keep the safe behaviour of a fresh install.
  let drift = 0;
  for (const d of DETECTION_TYPES) {
    for (const origin of ORIGINS) {
      if (resolveAction({}, d.type, origin) !== capByConfidence(d.defaultAction, d.type, origin)) drift++;
      if (resolveAction({ [d.type]: d.defaultAction }, d.type, origin) !== capByConfidence(d.defaultAction, d.type, origin)) drift++;
    }
  }
  check("untouched defaults still go through the confidence cap (fresh installs stay safe)", drift === 0, drift);
  check("default Silent Aim: seen by the server -> Ban, reported by the player's own game -> Kick",
    resolveAction({}, "SILENT_AIM", "server") === "BAN" && resolveAction({}, "SILENT_AIM", "client") === "KICK");
  check("owner clicks Ban on Silent Aim -> Ban for the client-reported one too",
    resolveAction({ SILENT_AIM: "BAN" }, "SILENT_AIM", "client", new Set(["SILENT_AIM"])) === "BAN");
  check("a heuristic check set to Ban by the owner really bans (no hidden cap)",
    resolveAction({ RAPID_FIRE: "BAN" }, "RAPID_FIRE", "server", new Set(["RAPID_FIRE"])) === "BAN");
  check("a heuristic check set to Kick by the owner really kicks", resolveAction({ WALLBANG: "KICK" }, "WALLBANG", "client") === "KICK");
  check("unknown detection types can still only be logged", resolveAction({ NOT_A_TYPE: "BAN" }, "NOT_A_TYPE", "server", new Set(["NOT_A_TYPE"])) === "LOG");
  check("isExplicitChoice: the default value without a click is not a choice", !isExplicitChoice({ SILENT_AIM: "BAN" }, "SILENT_AIM"));
  check("isExplicitChoice: the default value WITH a click is a choice", isExplicitChoice({ SILENT_AIM: "BAN" }, "SILENT_AIM", new Set(["SILENT_AIM"])));
  check("isExplicitChoice: a changed value is a choice", isExplicitChoice({ SILENT_AIM: "LOG" }, "SILENT_AIM"));
  check("sanitizeExplicit keeps known types only", JSON.stringify(sanitizeExplicit(["SILENT_AIM", "NOPE", 5, "SILENT_AIM", null])) === JSON.stringify(["SILENT_AIM"]));
  check("sanitizeExplicit tolerates garbage", sanitizeExplicit("x").length === 0 && sanitizeExplicit(undefined).length === 0);
  check("sanitizeActions still drops unknown types and invalid actions", (() => {
    const m = sanitizeActions({ SILENT_AIM: "NUKE", NOPE: "BAN", GODMODE: "KICK" });
    return m.SILENT_AIM === "BAN" && m.GODMODE === "KICK" && !("NOPE" in m);
  })());
}

(async () => {
  console.log("\n== Discord posts (what an unban line says, and which routes post it) ==");
  // sendWebhook talks to Discord with fetch(): capture the posts instead of sending them.
  const posted: { url: string; body: { allowed_mentions?: { parse?: string[] }; embeds?: { title?: string; description?: string; fields?: { name: string; value: string }[] }[] } }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    posted.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    const hooks = cfg({ BanWebhook: HOOK, AdminLogsWebhook: HOOK2 });

    await sendWebhook(hooks, "unban", "My Server", { reason: "All active bans were removed (12)", by: "admin" });
    const sweep = posted[0]?.body.embeds?.[0];
    check("Unban All → one line to Ban + one to Admin Logs", posted.length === 2 && posted.map((p) => p.url).sort().join() === [HOOK, HOOK2].sort().join(), posted.length);
    check("…titled 'Ban lifted'", sweep?.title === "Ban lifted", sweep?.title);
    check("…worded for a sweep, not for 'a player'", !!sweep?.description?.startsWith("Bans were lifted by **admin**.") && sweep.description.includes("All active bans were removed (12)") && !sweep.description.includes("A player"), sweep?.description);

    posted.length = 0;
    await sendWebhook(hooks, "unban", "My Server", { player: "Mehmet", by: "admin", code: "AC-ABC123", reason: "Unbanned from the web panel" });
    const single = posted[0]?.body.embeds?.[0];
    check("single unban names the player and who lifted it", !!single?.description?.startsWith("**Mehmet** was unbanned by **admin**."), single?.description);
    check("…and shows the Ban ID", !!single?.fields?.some((f) => f.name === "Ban ID" && f.value.includes("AC-ABC123")));

    posted.length = 0;
    await sendWebhook(hooks, "unban", "My Server", { reason: "sweep", by: "@everyone **bold** `x`" });
    check("markup in the staff name is stripped and mentions stay disabled", !!posted[0]?.body.embeds?.[0]?.description?.includes("by **@everyone bold x**") && posted[0].body.allowed_mentions?.parse?.length === 0, posted[0]?.body.embeds?.[0]?.description);

    posted.length = 0;
    await sendWebhook(cfg({ BanWebhook: HOOK, AdminLogsWebhook: HOOK2, LogUnbansToDiscord: false }), "unban", "My Server", { player: "Mehmet", by: "admin" });
    check("Log Unbans To Discord off → nothing is posted", posted.length === 0, posted.length);
  } finally {
    globalThis.fetch = realFetch;
  }

  // Every route that lifts a ban by hand must post the line, or the switch would only cover part of them.
  for (const f of ["src/app/api/servers/[id]/unban/route.ts", "src/app/api/servers/[id]/bans/route.ts", "src/app/api/v1/ingame/unban/route.ts"]) {
    const src = readFileSync(resolve(process.cwd(), f), "utf8");
    check(`${f} posts the unban webhook`, /sendWebhook\(\s*server\.config,\s*"unban"/.test(src));
  }

  console.log(`\n${total - failed}/${total} checks passed${failed ? `  —  ${failed} FAILED` : ""}`);
  process.exit(failed ? 1 : 0);
})();
