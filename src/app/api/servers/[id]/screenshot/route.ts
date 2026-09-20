import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { rateLimit } from "@/lib/ratelimit";

// Panelden bir oyuncunun ekran görüntüsü istenir; kaynak polling ile alır.
const schema = z.object({ playerId: z.string() });

export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, user } = await requireOwnedServer(ctx.params.id);
  const rl = rateLimit(`ss:${user.id}`, 30, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many requests");

  const { playerId } = schema.parse(await req.json());
  const player = await db.player.findFirst({ where: { id: playerId, serverId: server.id } });
  if (!player) throw new ApiError(404, "Player not found");
  if (!player.license) throw new ApiError(400, "Player has no licence identifier");

  const row = await db.screenshotRequest.create({
    data: {
      serverId: server.id,
      playerLicense: player.license,
      playerName: player.name,
      requestedBy: user.username,
    },
  });
  return ok({ id: row.id });
});

// Bir oyuncunun en son tamamlanmış ekran görüntüsünü döndürür (polling için).
export const GET = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server } = await requireOwnedServer(ctx.params.id);
  const playerId = new URL(req.url).searchParams.get("playerId");
  if (!playerId) throw new ApiError(400, "playerId is required");
  const player = await db.player.findFirst({ where: { id: playerId, serverId: server.id } });
  if (!player?.license) throw new ApiError(404, "Player not found");

  const latest = await db.screenshotRequest.findFirst({
    where: { serverId: server.id, playerLicense: player.license },
    orderBy: { createdAt: "desc" },
  });
  return ok({
    status: latest?.status ?? null,
    url: latest?.url ?? null,
    at: latest?.completedAt?.toISOString() ?? null,
  });
});
