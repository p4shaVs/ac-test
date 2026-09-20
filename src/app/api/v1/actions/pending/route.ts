import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// Panelden verilen bekleyen cezaları (WARN/KICK/BAN/UNBAN) kaynağa iletir.
export const GET = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);

  const actions = await db.punishAction.findMany({
    where: { serverId: server.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      player: {
        select: { license: true, steam: true, discord: true, ip: true },
      },
    },
  });

  // BAN aksiyonları için oyuncuya gösterilecek ban kodunu ekle.
  const banPlayerIds = actions.filter((a) => a.type === "BAN" && a.playerId).map((a) => a.playerId!);
  const bans = banPlayerIds.length
    ? await db.ban.findMany({
        where: { serverId: server.id, playerId: { in: banPlayerIds }, active: true },
        orderBy: { createdAt: "desc" },
        select: { playerId: true, code: true, expiresAt: true },
      })
    : [];
  // desc sıralı; her oyuncu için ilk (en yeni) banı tut.
  const banByPlayer = new Map<string, (typeof bans)[number]>();
  for (const b of bans) {
    if (b.playerId && !banByPlayer.has(b.playerId)) banByPlayer.set(b.playerId, b);
  }

  return ok({
    actions: actions.map((a) => {
      const ban = a.playerId ? banByPlayer.get(a.playerId) : undefined;
      return {
        id: a.id,
        type: a.type,
        reason: a.reason,
        issuedBy: a.issuedBy,
        playerName: a.playerName,
        banCode: a.type === "BAN" ? ban?.code ?? null : null,
        expiresAt: a.type === "BAN" ? ban?.expiresAt?.toISOString() ?? null : null,
        identifiers: {
          license: a.player?.license ?? null,
          steam: a.player?.steam ?? null,
          discord: a.player?.discord ?? null,
          ip: a.player?.ip ?? null,
        },
      };
    }),
  });
});
