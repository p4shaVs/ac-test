import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";

// Kaynak, çevrimiçi oyuncuların canlı konum/can/kalkan/aktivite verisini gönderir.
// İnteraktif harita ve izleme bu veriyi kullanır.
const posSchema = z.object({
  license: z.string().max(120),
  x: z.number(),
  y: z.number(),
  z: z.number().optional(),
  heading: z.number().optional(),
  health: z.number().int().optional(),
  armor: z.number().int().optional(),
  activity: z.string().max(24).optional(),
  ping: z.number().int().optional(),
});
const schema = z.object({ players: z.array(posSchema).max(2048) });

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`pos:${server.id}`, 240, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const body = schema.parse(await req.json());

  // Toplu güncelleme — sadece mevcut (kayıtlı) oyuncuların canlı alanları yazılır.
  await Promise.all(
    body.players.map((p) =>
      db.player.updateMany({
        where: { serverId: server.id, license: p.license },
        data: {
          posX: p.x,
          posY: p.y,
          posZ: p.z ?? null,
          heading: p.heading ?? null,
          health: p.health ?? null,
          armor: p.armor ?? null,
          activity: p.activity ?? null,
          ping: p.ping ?? null,
          lastSeenAt: new Date(),
        },
      })
    )
  );

  return ok({ updated: body.players.length });
});
