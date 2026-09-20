import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";

// Oyuncu sorgulama: isim/identifier ile arar; tehdit puanı, ban geçmişi,
// alt hesap (aynı IP) ve oynama süresini döndürür.
export const GET = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { server } = await requireOwnedServer(ctx.params.id);
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2) return ok({ results: [] });

    const players = await db.player.findMany({
      where: {
        serverId: server.id,
        OR: [
          { name: { contains: q } },
          { license: { contains: q } },
          { steam: { contains: q } },
          { discord: { contains: q } },
          { ip: { contains: q } },
        ],
      },
      take: 20,
      orderBy: { lastSeenAt: "desc" },
    });

    const results = await Promise.all(
      players.map(async (p) => {
        const [banCount, activeBan, alts] = await Promise.all([
          db.ban.count({ where: { serverId: server.id, playerId: p.id } }),
          db.ban.findFirst({
            where: { serverId: server.id, playerId: p.id, active: true },
            select: { reason: true, createdAt: true },
          }),
          // Alt hesap: aynı IP, farklı lisans
          p.ip
            ? db.player.count({
                where: { serverId: server.id, ip: p.ip, id: { not: p.id } },
              })
            : Promise.resolve(0),
        ]);
        return {
          id: p.id,
          name: p.name,
          license: p.license,
          steam: p.steam,
          discord: p.discord,
          ip: p.ip,
          online: p.online,
          trustScore: p.trustScore,
          playtimeSec: p.playtimeSec,
          firstSeenAt: p.firstSeenAt.toISOString(),
          lastSeenAt: p.lastSeenAt.toISOString(),
          banCount,
          activeBan: activeBan
            ? { reason: activeBan.reason, createdAt: activeBan.createdAt.toISOString() }
            : null,
          altAccounts: alts,
        };
      })
    );

    return ok({ results });
  }
);
