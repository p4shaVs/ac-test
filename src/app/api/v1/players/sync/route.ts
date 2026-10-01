import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { warmAvatars } from "@/lib/discord-avatar";

// Kaynak, aktif oyuncu listesini periyodik gönderir. Oyuncuları upsert eder,
// gönderilenler online kabul edilir, gerisi offline yapılır.
const playerSchema = z.object({
  name: z.string().max(80),
  license: z.string().max(120).optional(),
  steam: z.string().max(120).optional(),
  discord: z.string().max(120).optional(),
  ip: z.string().max(64).optional(),
  // Cihaz izi (ban kaçırma engeli)
  tokens: z.array(z.string().max(128)).max(16).optional(),
  deviceId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
});
const schema = z.object({
  players: z.array(playerSchema).max(2048),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`sync:${server.id}`, 120, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const body = schema.parse(await req.json());
  const now = new Date();
  const onlineLicenses: string[] = [];

  // Warm Discord avatars in the background so panel pages render them instantly.
  warmAvatars(body.players.map((p) => p.discord));

  for (const p of body.players) {
    if (!p.license) continue; // license birincil kimlik
    onlineLicenses.push(p.license);
    await db.player.upsert({
      where: { serverId_license: { serverId: server.id, license: p.license } },
      create: {
        serverId: server.id,
        name: p.name,
        license: p.license,
        steam: p.steam,
        discord: p.discord,
        ip: p.ip,
        tokens: JSON.stringify(p.tokens ?? []),
        deviceId: p.deviceId,
        online: true,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        name: p.name,
        steam: p.steam ?? undefined,
        discord: p.discord ?? undefined,
        ip: p.ip ?? undefined,
        tokens: p.tokens?.length ? JSON.stringify(p.tokens) : undefined,
        deviceId: p.deviceId ?? undefined,
        online: true,
        lastSeenAt: now,
      },
    });
  }

  // Listede olmayanları offline yap.
  await db.player.updateMany({
    where: {
      serverId: server.id,
      online: true,
      license: onlineLicenses.length ? { notIn: onlineLicenses } : undefined,
    },
    data: { online: false },
  });

  await db.server.update({
    where: { id: server.id },
    data: { status: "ONLINE", lastSeenAt: now },
  });

  return ok({ synced: onlineLicenses.length });
});
