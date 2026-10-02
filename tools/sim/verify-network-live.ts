// Scratch-DB end-to-end check of the live network push (run with DATABASE_URL
// pointing at an isolated copy — never the real dev.db). Not part of test:sim:
// it needs a database. Usage (env from the verification setup):
//   npx tsx tools/sim/verify-network-live.ts
import { db } from "../../src/lib/db";
import { recordNetworkBan, readNetworkPolicy } from "../../src/lib/network-bans";

let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (!cond) failed++;
  console.log(`${cond ? "  ok  " : "  FAIL"} ${name}${!cond && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ""}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!/verify\.db/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing to run: DATABASE_URL is not the scratch verify.db");

  const demo = await db.server.findFirstOrThrow({ where: { name: "Demo Server" } });
  // Demo owner keeps players out — strong flags only.
  const cfg = JSON.parse(demo.config || "{}");
  cfg.network = { action: "KICK", contribute: true, strongOnly: true };
  await db.server.update({ where: { id: demo.id }, data: { config: JSON.stringify(cfg) } });

  // Two other communities.
  const mkOwner = async (tag: string) => {
    const u = await db.user.upsert({
      where: { email: `net-${tag}@scratch.test` },
      update: {},
      create: { email: `net-${tag}@scratch.test`, username: `net_${tag}`, passwordHash: "x" },
    });
    const s = await db.server.create({ data: { name: `Community ${tag}`, ownerId: u.id, config: "{}" } });
    return s;
  };
  const sB = await mkOwner(`b${Date.now()}`);
  const sC = await mkOwner(`c${Date.now()}`);

  const players = await db.player.findMany({ where: { serverId: demo.id, license: { not: null } }, take: 4, orderBy: { name: "asc" } });
  const [P, Q, R] = players;
  await db.player.updateMany({ where: { id: { in: [P.id, Q.id, R.id] } }, data: { online: true } });
  const t0 = new Date();

  // P: cheat bans on two other communities → strong → kept out mid-game.
  await recordNetworkBan(sB, { license: P.license, playerName: P.name, type: "AIMBOT" });
  await sleep(800);
  check("one community's ban alone does not flag anyone", (await db.detection.count({ where: { serverId: demo.id, playerId: P.id, type: "NETWORK_BAN", createdAt: { gte: t0 } } })) === 0);
  await recordNetworkBan(sC, { license: P.license, playerName: P.name, type: "MANUAL_CHEAT" });
  await sleep(1500);
  const flagP = await db.detection.findFirst({ where: { serverId: demo.id, playerId: P.id, type: "NETWORK_BAN", createdAt: { gte: t0 } } });
  const dP = JSON.parse(flagP?.details ?? "{}");
  check("the second community's ban flags P where P is playing right now", !!flagP && dP.live === true, flagP);
  check("strong flag → kept out (KICK) under 'strong flags only'", flagP?.action === "KICK" && dP.strength === "strong", { action: flagP?.action, strength: dP.strength });
  check("the flag carries the anonymous breakdown", dP.distinctOwners === 2 && Array.isArray(dP.categories) && dP.categories.length === 2, dP);
  const kickP = await db.punishAction.findFirst({ where: { serverId: demo.id, playerId: P.id, type: "KICK", createdAt: { gte: t0 } } });
  check("a kick is queued for the game server", !!kickP && kickP.issuedBy === "AntiCheat" && kickP.reason.startsWith("CoreAC Network: banned on 2 other CoreAC communities"), kickP?.reason);
  check("no community is named anywhere", !(kickP?.reason ?? "").includes("Community ") && !(flagP?.details ?? "").includes("Community "));
  const logP = await db.serverLog.findFirst({ where: { serverId: demo.id, source: "network", createdAt: { gte: t0 } }, orderBy: { createdAt: "desc" } });
  check("a server log line says it happened while playing", !!logP && logP.message.includes("while playing here"), logP?.message);

  // Q: behaviour bans → never shared, nobody told.
  await recordNetworkBan(sB, { license: Q.license, playerName: Q.name, type: "MANUAL_CONDUCT" });
  await recordNetworkBan(sC, { license: Q.license, playerName: Q.name, type: "MANUAL_CONDUCT" });
  await sleep(1200);
  check("behaviour bans are not shared at all", (await db.networkBan.count({ where: { playerName: Q.name, createdAt: { gte: t0 } } })) === 0);
  check("…and Q is not flagged", (await db.detection.count({ where: { serverId: demo.id, playerId: Q.id, type: "NETWORK_BAN", createdAt: { gte: t0 } } })) === 0);

  // R: unclear staff bans → weak → reported, not kept out.
  await recordNetworkBan(sB, { license: R.license, playerName: R.name, type: "MANUAL" });
  await recordNetworkBan(sC, { license: R.license, playerName: R.name, type: "MANUAL" });
  await sleep(1500);
  const flagR = await db.detection.findFirst({ where: { serverId: demo.id, playerId: R.id, type: "NETWORK_BAN", createdAt: { gte: t0 } } });
  check("unclear staff bans make a weak flag → logged, not kept out", flagR?.action === "LOG" && JSON.parse(flagR?.details ?? "{}").strength === "weak", flagR?.action);
  check("…and no kick is queued for R", (await db.punishAction.count({ where: { serverId: demo.id, playerId: R.id, type: "KICK", createdAt: { gte: t0 } } })) === 0);

  // Once per day per player per server.
  const before = await db.detection.count({ where: { serverId: demo.id, playerId: P.id, type: "NETWORK_BAN" } });
  await recordNetworkBan(sB, { license: P.license, playerName: P.name, type: "NOCLIP" });
  await sleep(1200);
  check("a further ban within 24 h does not flag P twice", (await db.detection.count({ where: { serverId: demo.id, playerId: P.id, type: "NETWORK_BAN" } })) === before);

  // Policy OFF → nobody is told.
  cfg.network = { action: "OFF", contribute: true, strongOnly: true };
  await db.server.update({ where: { id: demo.id }, data: { config: JSON.stringify(cfg) } });
  const S = players[3];
  await db.player.update({ where: { id: S.id }, data: { online: true } });
  await recordNetworkBan(sB, { license: S.license, playerName: S.name, type: "AIMBOT" });
  await recordNetworkBan(sC, { license: S.license, playerName: S.name, type: "AIMBOT" });
  await sleep(1200);
  check("a server with the network Off is never told", (await db.detection.count({ where: { serverId: demo.id, playerId: S.id, type: "NETWORK_BAN", createdAt: { gte: t0 } } })) === 0);
  check("policy read back", readNetworkPolicy((await db.server.findUniqueOrThrow({ where: { id: demo.id } })).config).action === "OFF");

  console.log(failed ? `\n${failed} FAILED` : "\nall live-network checks passed");
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
