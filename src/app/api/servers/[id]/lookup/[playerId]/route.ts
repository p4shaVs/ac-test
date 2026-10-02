import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { parseJson } from "@/lib/utils";
import { detectionLabel } from "@/lib/detection-actions";
import { queryNetworkReputation } from "@/lib/network-bans";

type Ctx = { params: { id: string; playerId: string } };

function isPrivateIp(ip: string | null): boolean {
  if (!ip) return true;
  if (ip.includes(":")) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip);
  const [a, b] = ip.split(".").map(Number);
  if (Number.isNaN(a)) return true;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

// A player's dossier for the Lookup page. "Across your servers" only ever means
// the servers THIS owner has — other customers' servers are never named; the
// network part is the anonymous reputation count the connection gate uses.
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { server, user } = await requireOwnedServer(ctx.params.id);
  const player = await db.player.findFirst({ where: { id: ctx.params.playerId, serverId: server.id } });
  if (!player) throw new ApiError(404, "Player not found");

  const idOr: Prisma.PlayerWhereInput[] = [];
  if (player.license) idOr.push({ license: player.license });
  if (player.discord) idOr.push({ discord: player.discord });
  if (player.steam) idOr.push({ steam: player.steam });
  const banOr: Prisma.BanWhereInput[] = [{ playerId: player.id }];
  if (player.license) banOr.push({ license: player.license });
  if (player.discord) banOr.push({ discord: player.discord });
  if (player.steam) banOr.push({ steam: player.steam });

  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [ownerServers, sameIdentity, bans, actions, detections, detByType, candidates, network, last30] = await Promise.all([
    db.server.findMany({ where: { ownerId: user.id }, select: { id: true, name: true } }),
    idOr.length
      ? db.player.findMany({
          where: { server: { ownerId: user.id }, OR: idOr },
          select: { id: true, serverId: true, name: true, playtimeSec: true, firstSeenAt: true, lastSeenAt: true, online: true },
          take: 50,
        })
      : Promise.resolve([]),
    db.ban.findMany({
      where: { server: { ownerId: user.id }, OR: banOr },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true, serverId: true, code: true, reason: true, active: true, permanent: true, expiresAt: true,
        createdAt: true, bannedBy: true, falsePositive: true, playerName: true, evasionOf: true,
      },
    }),
    db.punishAction.findMany({
      where: { serverId: server.id, playerId: player.id, type: { in: ["KICK", "WARN"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, type: true, reason: true, issuedBy: true, createdAt: true },
    }),
    db.detection.findMany({
      where: { serverId: server.id, playerId: player.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, type: true, severity: true, action: true, createdAt: true, playerName: true },
    }),
    db.detection.groupBy({
      by: ["type"],
      where: { serverId: server.id, playerId: player.id },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    // Linked-account candidates on this server: shared IP, device marker or hardware tokens.
    db.player.findMany({
      where: {
        serverId: server.id,
        id: { not: player.id },
        OR: [
          ...(player.ip && !isPrivateIp(player.ip) ? [{ ip: player.ip }] : []),
          ...(player.deviceId ? [{ deviceId: player.deviceId }] : []),
          { tokens: { not: "[]" } },
        ],
      },
      select: { id: true, name: true, ip: true, deviceId: true, tokens: true, online: true, lastSeenAt: true, bans: { where: { active: true }, select: { id: true }, take: 1 } },
      take: 3000,
    }),
    queryNetworkReputation(user.id, { license: player.license, steam: player.steam, discord: player.discord }),
    db.detection.count({ where: { serverId: server.id, playerId: player.id, createdAt: { gte: since30 } } }),
  ]);

  const serverName = new Map(ownerServers.map((s) => [s.id, s.name]));

  // One row per server (the newest player row if a server has several).
  const perServer = new Map<string, (typeof sameIdentity)[number]>();
  for (const p of [player, ...sameIdentity]) {
    const prev = perServer.get(p.serverId);
    if (!prev || prev.lastSeenAt < p.lastSeenAt) perServer.set(p.serverId, p);
  }
  const servers = [...perServer.values()]
    .map((p) => ({
      serverId: p.serverId,
      serverName: serverName.get(p.serverId) ?? "Server",
      current: p.serverId === server.id,
      playtimeSec: p.playtimeSec,
      nameUsed: p.name,
      firstSeenAt: p.firstSeenAt.toISOString(),
      lastSeenAt: p.lastSeenAt.toISOString(),
      online: p.online,
      banned: bans.some((b) => b.active && b.serverId === p.serverId),
    }))
    .sort((a, b) => b.playtimeSec - a.playtimeSec);

  // Every name this identity has been seen with.
  const names = new Map<string, { name: string; where: string; at: string }>();
  const addName = (name: string, where: string, at: Date) => {
    const k = name.trim();
    if (!k) return;
    const prev = names.get(k.toLowerCase());
    if (!prev || prev.at < at.toISOString()) names.set(k.toLowerCase(), { name: k, where, at: at.toISOString() });
  };
  for (const p of [player, ...sameIdentity]) addName(p.name, serverName.get(p.serverId) ?? "Server", p.lastSeenAt);
  for (const b of bans) addName(b.playerName, serverName.get(b.serverId) ?? "Server", b.createdAt);
  for (const d of detections) addName(d.playerName, serverName.get(server.id) ?? "Server", d.createdAt);

  const myTokens = new Set(parseJson<string[]>(player.tokens, []));
  const linked = candidates
    .map((c) => {
      const via: string[] = [];
      if (player.ip && !isPrivateIp(player.ip) && c.ip === player.ip) via.push("IP");
      if (player.deviceId && c.deviceId === player.deviceId) via.push("Device");
      const shared = myTokens.size ? parseJson<string[]>(c.tokens, []).filter((t) => myTokens.has(t)).length : 0;
      if (shared >= Math.min(2, myTokens.size)) via.push(`${shared} hardware token${shared === 1 ? "" : "s"}`);
      return { id: c.id, name: c.name, via, online: c.online, banned: c.bans.length > 0, lastSeenAt: c.lastSeenAt.toISOString() };
    })
    .filter((c) => c.via.length > 0)
    .sort((a, b) => b.via.length - a.via.length)
    .slice(0, 12);

  return ok({
    player: {
      id: player.id,
      name: player.name,
      online: player.online,
      trustScore: player.trustScore,
      playtimeSec: player.playtimeSec,
      firstSeenAt: player.firstSeenAt.toISOString(),
      lastSeenAt: player.lastSeenAt.toISOString(),
      license: player.license,
      steam: player.steam,
      discord: player.discord,
      ip: player.ip,
      deviceId: player.deviceId,
      tokens: myTokens.size,
      ping: player.ping,
      activity: player.activity,
    },
    servers,
    totalPlaytimeSec: servers.reduce((s, x) => s + x.playtimeSec, 0),
    names: [...names.values()].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 15),
    bans: bans.map((b) => ({
      id: b.id,
      serverId: b.serverId,
      serverName: serverName.get(b.serverId) ?? "Server",
      current: b.serverId === server.id,
      code: b.code,
      reason: b.reason,
      active: b.active,
      permanent: b.permanent,
      falsePositive: b.falsePositive,
      evasionOf: b.evasionOf,
      expiresAt: b.expiresAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
      bannedBy: b.bannedBy,
    })),
    actions: actions.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    detections: {
      total: detByType.reduce((s, d) => s + d._count._all, 0),
      last30,
      byType: detByType
        .map((d) => ({ type: d.type, label: detectionLabel(d.type), count: d._count._all, last: d._max.createdAt?.toISOString() ?? null }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      recent: detections.slice(0, 6).map((d) => ({
        id: d.id,
        label: detectionLabel(d.type),
        severity: d.severity,
        action: d.action ?? "LOG",
        createdAt: d.createdAt.toISOString(),
      })),
    },
    linked,
    network,
  });
});
