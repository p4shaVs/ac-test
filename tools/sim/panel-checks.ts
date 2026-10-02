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
import { AC_TABS } from "../../src/lib/ac-config";
import { RULE_GROUPS } from "../../src/lib/rules";
import { buildCatalog, catalogAcFields, catalogRules } from "../../src/lib/config-catalog";
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

console.log("\n== configuration page: every switch, guard and detection is on it ==");
{
  const cats = buildCatalog();
  const shownAc = catalogAcFields(cats);
  const missingAc: string[] = [];
  for (const t of AC_TABS) {
    for (const c of t.cards) {
      for (const fl of c.fields) {
        const id = fl.section + "." + fl.key;
        // The Settings tab is rendered as its own cards (except Backdoor Protection, which is a protection row).
        const asSetting = t.id === "settings" && c.title !== "Backdoor Protection";
        if (!asSetting && !shownAc.has(id)) missingAc.push(id);
      }
    }
  }
  check("every protection switch and parameter has a row on the page", missingAc.length === 0, missingAc);
  const shownRules = catalogRules(cats);
  const missingRules = RULE_GROUPS.flatMap((g) => g.rules.map((r) => r.key)).filter((k) => !shownRules.has(k));
  check("every server guard has a row", missingRules.length === 0, missingRules);
  const covered = new Set(cats.flatMap((c) => c.items.flatMap((i) => i.types)));
  const missingTypes = DETECTION_TYPES.map((d) => d.type).filter((t) => !covered.has(t));
  check("every detection type can be given a punishment on the page", missingTypes.length === 0, missingTypes);
  const known = new Set(DETECTION_TYPES.map((d) => d.type));
  const unknown = cats.flatMap((c) => c.items.flatMap((i) => i.types)).filter((t) => !known.has(t));
  check("no row points at a detection type the registry does not know", unknown.length === 0, unknown);
  const ids = cats.flatMap((c) => c.items.map((i) => i.id));
  check("row ids are unique", new Set(ids).size === ids.length);
  const utilWithTypes = cats.flatMap((c) => c.items).filter((i) => i.utility && i.types.length);
  check("server options (gameplay / console logging) carry no punishment", utilWithTypes.length === 0);
}

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
  // The panel's Unban and "Fix false ban" go through liftBan() in src/lib/ban-ops.ts.
  const liftSrc = readFileSync(resolve(process.cwd(), "src/lib/ban-ops.ts"), "utf8");
  check("liftBan() posts the unban webhook", /sendWebhook\(\s*server\.config,\s*"unban"/.test(liftSrc));
  check("liftBan() lifts the linked evasion bans and withdraws the network report", /evasionOf: ban\.code/.test(liftSrc) && /revokeNetworkBan\(/.test(liftSrc));
  for (const f of ["src/app/api/servers/[id]/unban/route.ts", "src/app/api/servers/[id]/bans/[banId]/route.ts"]) {
    const src = readFileSync(resolve(process.cwd(), f), "utf8");
    check(`${f} lifts bans through liftBan()`, /liftBan\(\s*server,/.test(src));
  }
  for (const f of ["src/app/api/servers/[id]/bans/route.ts", "src/app/api/v1/ingame/unban/route.ts"]) {
    const src = readFileSync(resolve(process.cwd(), f), "utf8");
    check(`${f} posts the unban webhook`, /sendWebhook\(\s*server\.config,\s*"unban"/.test(src));
  }

  // Ban notes are stored as JSON on the ban; anything malformed must be dropped, not crash the page.
  {
    const { parseBanNotes, NOTES_MAX } = await import("../../src/lib/ban-ops");
    check("ban notes: malformed JSON → empty list", parseBanNotes("{nope").length === 0 && parseBanNotes(null).length === 0);
    check(
      "ban notes: entries missing fields are dropped",
      parseBanNotes(JSON.stringify([{ id: "a", by: "x", at: "2026-01-01", text: "ok" }, { id: 1, text: "bad" }, "str"])).length === 1
    );
    const many = Array.from({ length: NOTES_MAX + 10 }, (_, i) => ({ id: String(i), by: "x", at: "t", text: "n" }));
    check("ban notes: capped at NOTES_MAX", parseBanNotes(JSON.stringify(many)).length === NOTES_MAX);
  }

  console.log("\n== offline ban: identifiers staff paste ==");
  {
    const { parseIdentifiers, identityFrom, steam64ToHex } = await import("../../src/lib/identifiers");
    const lic = "0123456789abcdef0123456789abcdef01234567";
    const p = parseIdentifiers(`license:${lic.toUpperCase()}, 1263439606020313099\n76561198000000000 85.10.20.30:30120 license2:abc fivem:12 nonsense`);
    const by = (k: string) => p.find((x) => x.kind === k);
    check("licence is normalised to lower case with its prefix", by("license")?.value === `license:${lic}`);
    check("a bare 17–20 digit number is a Discord ID", by("discord")?.value === "discord:1263439606020313099");
    check("a SteamID64 becomes the FiveM steam: hex id", by("steam")?.value === "steam:1100001025e4c00" && steam64ToHex("76561197960265728") === "110000100000000");
    check("an endpoint copied from a log loses its port", by("ip")?.value === "85.10.20.30");
    check("license2 / fivem / junk are listed but never used", p.filter((x) => !x.usable).map((x) => x.kind).sort().join(",") === "fivem,license2,unknown");
    check("IPv6 is not mistaken for a prefixed id", parseIdentifiers("2001:db8::1")[0]?.kind === "ip");
    const id = identityFrom(p);
    check("the ban stores licence, Steam, Discord and IP", "identity" in id && !!id.identity.license && !!id.identity.steam && !!id.identity.discord && id.identity.ip === "85.10.20.30");
    const two = identityFrom(parseIdentifiers(`discord:1263439606020313099 discord:1263439606020313100`));
    check("two Discord IDs are refused (two accounts = two bans)", "error" in two);
    check("only unusable ids → refused", "error" in identityFrom(parseIdentifiers("license2:abc fivem:1")));
  }

  console.log("\n== CoreAC network: fairness, strength, window ==");
  {
    const { networkTypeForManual, summarise, decideNetworkAction, sanitizeNetworkPolicy, describeFlag, NETWORK_WINDOW_DAYS } =
      await import("../../src/lib/network-bans");
    check("staff ban for aimbot → shared as a cheat ban", networkTypeForManual("Aimbot use") === "MANUAL_CHEAT");
    check("Turkish cheat reason → cheat ban", networkTypeForManual("hile menüsü (executor)") === "MANUAL_CHEAT");
    check("toxicity / RDM / küfür → behaviour ban (never shared)",
      ["Toxic in OOC", "RDM", "küfür etti", "Fail RP"].every((r) => networkTypeForManual(r) === "MANUAL_CONDUCT"));
    check("cheat words win over behaviour words", networkTypeForManual("toxic and using godmode") === "MANUAL_CHEAT");
    check("unclear reason → plain staff ban", networkTypeForManual("Banned") === "MANUAL" && networkTypeForManual("") === "MANUAL");

    const now = Date.now();
    const at = (daysAgo: number) => new Date(now - daysAgo * 86_400_000);
    const strong = summarise([
      { ownerId: "a", type: "AIMBOT", createdAt: at(3) },
      { ownerId: "b", type: "MANUAL_CHEAT", createdAt: at(10) },
      { ownerId: "b", type: "GODMODE", createdAt: at(11) },
    ], now);
    check("two owners with detections/cheat bans → strong flag", strong.flagged && strong.strength === "strong" && strong.distinctOwners === 2);
    check("breakdown: categories, automatic vs staff, first/last ban",
      strong.categories.length === 3 && strong.automatic === 2 && strong.manual === 1 && !!strong.firstBanAt && !!strong.lastBanAt);
    const weak = summarise([
      { ownerId: "a", type: "AIMBOT", createdAt: at(3) },
      { ownerId: "b", type: "MANUAL", createdAt: at(4) },
    ], now);
    check("one owner only has an unclear staff ban → weak flag", weak.flagged && weak.strength === "weak");
    const single = summarise([{ ownerId: "a", type: "AIMBOT", createdAt: at(1) }, { ownerId: "a", type: "NOCLIP", createdAt: at(2) }], now);
    check("one owner alone never flags (anti-poisoning)", !single.flagged && single.strength === "none" && single.distinctOwners === 1);
    const conduct = summarise([
      { ownerId: "a", type: "MANUAL_CONDUCT", createdAt: at(1) },
      { ownerId: "b", type: "MANUAL_CONDUCT", createdAt: at(1) },
    ], now);
    check("behaviour bans never count (even old data)", !conduct.flagged && conduct.distinctOwners === 0);
    const old = summarise([
      { ownerId: "a", type: "AIMBOT", createdAt: at(NETWORK_WINDOW_DAYS + 5) },
      { ownerId: "b", type: "AIMBOT", createdAt: at(NETWORK_WINDOW_DAYS + 9) },
    ], now);
    check(`bans older than ${NETWORK_WINDOW_DAYS} days stop counting but stay in history`, !old.flagged && old.olderBans === 2);

    const kick = { action: "KICK" as const, contribute: true, strongOnly: true };
    check("Keep out + strong only: strong → KICK, weak → LOG", decideNetworkAction(kick, strong) === "KICK" && decideNetworkAction(kick, weak) === "LOG");
    check("Keep out without strong only: weak → KICK", decideNetworkAction({ ...kick, strongOnly: false }, weak) === "KICK");
    check("Log only never kicks", decideNetworkAction({ ...kick, action: "LOG" }, strong) === "LOG");
    check("policy defaults: strong flags only, sharing on", sanitizeNetworkPolicy({}).strongOnly === true && sanitizeNetworkPolicy({}).contribute === true);
    check("a settings save without strongOnly keeps the stored value",
      sanitizeNetworkPolicy({ ...sanitizeNetworkPolicy({ strongOnly: false }), action: "LOG", contribute: true }).strongOnly === false);
    check("the flag text names counts and cheat types, never a server", describeFlag(strong).startsWith("banned on 2 other CoreAC communities ("));
  }

  console.log("\n== Windows installer ==");
  {
    const { normaliseKey, publicApiBase } = await import("../../src/lib/install-key");
    check("licence keys are trimmed and upper-cased", normaliseKey("  coreac-ab12-cd34 ") === "COREAC-AB12-CD34");
    const h = (o: Record<string, string>) => new Headers(o);
    check("APP_URL wins when it is a real address", publicApiBase("https://panel.example.com/", h({ host: "1.2.3.4:3000" })) === "https://panel.example.com");
    check("localhost APP_URL falls back to the address the installer used", publicApiBase("http://localhost:3000", h({ host: "203.0.113.5:3000" })) === "http://203.0.113.5:3000");
    check("…and to the proxy's https host", publicApiBase("http://localhost:3000", h({ host: "127.0.0.1:3000", "x-forwarded-host": "panel.example.com", "x-forwarded-proto": "https" })) === "https://panel.example.com");
    check("local request keeps the local address", publicApiBase("http://localhost:3000", h({ host: "localhost:3000" })) === "http://localhost:3000");

    // The exe and the .bat must recognise each other's server.cfg block, or one would add a second copy.
    const bat = readFileSync(resolve(process.cwd(), "src/lib/installer-script.ts"), "utf8");
    const cs = readFileSync(resolve(process.cwd(), "installer-win/src/InstallEngine.cs"), "utf8");
    const marker = (src: string, re: RegExp) => (re.exec(src) ?? [])[1];
    check(
      "exe and .bat write the same managed-block markers",
      marker(bat, /\$Begin = '([^']+)'/) === marker(cs, /Begin = "([^"]+)"/) && marker(bat, /\$End\s+= '([^']+)'/) === marker(cs, /End = "([^"]+)"/)
    );
    check("exe writes coreac_api / coreac_token / add_ace / ensure", ["set coreac_api", "set coreac_token", "add_ace resource.", '"ensure "'].every((s) => cs.includes(s)));

    // The committed exe must be the build of the committed source (npm run build:installer).
    const version = marker(readFileSync(resolve(process.cwd(), "installer-win/src/Program.cs"), "utf8"), /const string Version = "([^"]+)"/);
    const exe = readFileSync(resolve(process.cwd(), "installer-win/CoreAC-Setup.exe"));
    check("installer-win/CoreAC-Setup.exe is a Windows executable", exe[0] === 0x4d && exe[1] === 0x5a);
    check(`the committed exe is version ${version} (rebuild with npm run build:installer)`, !!version && exe.includes(Buffer.from(`CoreAC Setup ${version}`, "utf16le")));
  }

  console.log("\n== panel team: roles, ranks and who may hand out what ==");
  {
    const T = await import("../../src/lib/team");
    const ops = await import("../../src/lib/team-ops");
    const who = (role: import("../../src/lib/team").Role, perms?: import("../../src/lib/team").Permission[]) => ({
      role,
      perms: T.permissionsOf(role, perms ?? (role === "OWNER" ? [] : T.ROLES[role].perms)),
    });
    const owner = who("OWNER");
    const admin = who("ADMIN");
    const adminNoConsole = who("ADMIN", ["moderate", "config", "admins", "settings", "team"]);
    const mod = who("MODERATOR");
    const modTeam = who("MODERATOR", ["moderate", "team"]);
    const viewer = who("VIEWER");

    check("presets: Admin has every permission, Moderator moderates, Viewer only looks",
      T.ROLES.ADMIN.perms.length === T.ALL_PERMISSIONS.length && T.ROLES.MODERATOR.perms.join() === "moderate" && T.ROLES.VIEWER.perms.length === 0);
    check("stored permissions are cleaned (unknown and duplicates dropped)", T.sanitizePermissions(["team", "root", "moderate", "team", 5]).join() === "moderate,team");
    check("broken JSON in the database means no permissions", T.parsePermissions("{nope").length === 0);
    check("owner can manage an Admin", T.canManage(owner, { role: "ADMIN" }));
    check("an Admin cannot manage another Admin", !T.canManage(admin, { role: "ADMIN" }));
    check("an Admin can manage Moderators and Viewers", T.canManage(admin, { role: "MODERATOR" }) && T.canManage(admin, { role: "VIEWER" }));
    check("nobody manages the owner", !T.canManage(owner, { role: "OWNER" }) && !T.canManage(admin, { role: "OWNER" }));
    check("a Moderator without the team permission manages nobody", !T.canManage(mod, { role: "VIEWER" }) && T.assignableRoles(mod).length === 0);
    check("a Moderator with the team permission can only bring in Viewers", T.assignableRoles(modTeam).join() === "VIEWER");
    check("assignable roles: owner gets all three, Admin gets Moderator/Viewer",
      T.assignableRoles(owner).join() === "ADMIN,MODERATOR,VIEWER" && T.assignableRoles(admin).join() === "MODERATOR,VIEWER");
    check("you cannot hand out a permission you do not hold", !T.canManage(adminNoConsole, { role: "MODERATOR" }, ["moderate", "console"]));
    check("…but everything you hold is fine", T.canManage(adminNoConsole, { role: "MODERATOR" }, ["moderate", "config"]));
    check("changing perms: an Admin without console cannot strip the console the owner gave",
      !T.permissionChangeAllowed(adminNoConsole, ["moderate", "console"], ["moderate"]));
    check("…nor grant it", !T.permissionChangeAllowed(adminNoConsole, ["moderate"], ["moderate", "console"]));
    check("…but may change the rest while it stays", T.permissionChangeAllowed(adminNoConsole, ["moderate", "console"], ["console", "config"]));
    check("a Viewer has no rights at all, the owner has every one", viewer.perms.size === 0 && owner.perms.size === T.ALL_PERMISSIONS.length);

    check("menu: a Viewer cannot open configuration, console, admins, settings or live monitor",
      ["rules", "events", "blacklist", "whitelist", "config-library", "setup", "console", "resources", "admins", "settings", "monitoring"].every((p) => !T.canOpenPage(p, [], false)));
    check("menu: a Viewer still sees overview, bans, detections, logs, lookup and the team",
      ["", "bans", "detections", "logs", "admin-logs", "lookup", "network", "team", "players", "map"].every((p) => T.canOpenPage(p, [], false)));
    check("menu: a Moderator opens the live monitor but not the console", T.canOpenPage("monitoring", ["moderate"], false) && !T.canOpenPage("console", ["moderate"], false));
    check("menu: the owner opens everything", Object.keys(T.PAGE_PERMISSION).every((p) => T.canOpenPage(p, [], true)));

    // Invite tokens: 256-bit, only the hash is stored, and states are exact.
    const a = ops.newInviteToken();
    const b = ops.newInviteToken();
    check("invite tokens are 43 url-safe characters and unique", ops.isInviteTokenShape(a.token) && a.token !== b.token);
    check("only the SHA-256 of the token is stored", a.hash === ops.hashInviteToken(a.token) && a.hash.length === 64 && !a.hash.includes(a.token));
    check("anything not shaped like a token is rejected before a query", !ops.isInviteTokenShape("../../etc") && !ops.isInviteTokenShape(a.token + "x"));
    const base = { acceptedAt: null, revokedAt: null, declinedAt: null, expiresAt: new Date(Date.now() + 60_000) };
    check("invite states: pending / accepted / revoked / declined / expired",
      ops.inviteState(base) === "pending" &&
        ops.inviteState({ ...base, acceptedAt: new Date() }) === "accepted" &&
        ops.inviteState({ ...base, revokedAt: new Date() }) === "revoked" &&
        ops.inviteState({ ...base, declinedAt: new Date() }) === "declined" &&
        ops.inviteState({ ...base, expiresAt: new Date(Date.now() - 1) }) === "expired");
    check("e-mails are masked on the invite page", ops.maskEmail("hamza@example.com") === "ha***@example.com");

    // Every /api/servers/[id] handler goes through the access guard with the right permission.
    const { readdirSync } = await import("node:fs");
    const { join, sep } = await import("node:path");
    const root = resolve(process.cwd(), "src/app/api/servers/[id]");
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name === "route.ts" ? [join(d, e.name)] : []));
    const EXPECTED: Record<string, string> = {
      "actions/route.ts": "PATCH:config",
      "admins/route.ts": "POST:admins",
      "admins/[adminId]/route.ts": "PATCH:admins DELETE:admins",
      "bans/export/route.ts": "GET:moderate",
      "bans/offline/route.ts": "POST:moderate",
      "bans/route.ts": "POST:config",
      "bans/[banId]/route.ts": "GET:view POST:moderate",
      "blacklist/preset/route.ts": "POST:config DELETE:config",
      "blacklist/route.ts": "POST:config PATCH:config DELETE:config",
      "config/route.ts": "PATCH:config",
      "console/route.ts": "GET:console POST:console",
      "detections/[detectionId]/route.ts": "GET:view",
      "event-log/route.ts": "GET:view PATCH:config",
      "installer/route.ts": "GET:owner",
      "lookup/route.ts": "GET:view",
      "lookup/[playerId]/route.ts": "GET:view",
      "moderate/route.ts": "POST:moderate",
      "network/route.ts": "POST:view",
      "protected-events/route.ts": "PATCH:config",
      "resource-action/route.ts": "POST:console",
      "resource-zip/route.ts": "GET:owner",
      "route.ts": "PATCH:settings DELETE:owner",
      "rules/route.ts": "PATCH:config",
      "screenshot/route.ts": "POST:moderate GET:view",
      "shots/[rid]/route.ts": "GET:view",
      "team/route.ts": "GET:view POST:view",
      "token/route.ts": "POST:owner",
      "unban/route.ts": "POST:moderate",
      "whitelist/route.ts": "POST:config PATCH:config DELETE:config",
    };
    const seen = new Set<string>();
    for (const f of walk(root)) {
      const rel = f.slice(root.length + 1).split(sep).join("/");
      seen.add(rel);
      const src = readFileSync(f, "utf8");
      const parts = src.split(/export (?:const|async function) (GET|POST|PATCH|PUT|DELETE)\b/);
      const got: string[] = [];
      for (let i = 1; i < parts.length; i += 2) {
        const g = [...parts[i + 1].matchAll(/require(?:ServerAccess\([^,)]+(?:,\s*"([a-z]+)")?\)|OwnedServer\()/g)].map((x) =>
          x[0].includes("Owned") ? "owner" : x[1] || "view"
        );
        got.push(`${parts[i]}:${g[0] ?? "NONE"}`);
      }
      check(`guard ${rel} = ${got.join(" ")}`, EXPECTED[rel] === got.join(" "), EXPECTED[rel] ?? "not in the table — add it");
    }
    check("every expected server route still exists", Object.keys(EXPECTED).every((k) => seen.has(k)));
    const net = readFileSync(join(root, "network/route.ts"), "utf8");
    check("network: everything but a look-up needs Configuration", /body\.action !== "check" && !access\.perms\.has\("config"\)/.test(net));
    const team = readFileSync(join(root, "team/route.ts"), "utf8");
    check("team: managing people needs the team permission", /if \(!access\.perms\.has\("team"\)\)/.test(team));
    const srv = readFileSync(join(root, "route.ts"), "utf8");
    check("server settings: the network policy needs Configuration", /body\.network !== undefined && !access\.perms\.has\("config"\)/.test(srv));
  }

  console.log(`\n${total - failed}/${total} checks passed${failed ? `  —  ${failed} FAILED` : ""}`);
  process.exit(failed ? 1 : 0);
})();
