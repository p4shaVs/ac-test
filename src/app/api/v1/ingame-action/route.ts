import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { generateBanCode } from "@/lib/keys";
import { sendWebhook, type WebhookEvent } from "@/lib/discord";
import { recordNetworkBan } from "@/lib/network-bans";

// Oyun içi yönetici menüsünden yapılan ceza (WARN/KICK/BAN) panele işlenir.
// (Ceza oyunda zaten uygulandı; bu uç sadece kaydeder + webhook gönderir.)
const schema = z.object({
  type: z.enum(["WARN", "KICK", "BAN"]),
  reason: z.string().max(200).default("No reason given"),
  by: z.string().max(80).default("In-Game Admin"),
  license: z.string().max(120).optional(),
  playerName: z.string().max(80),
  durationHours: z.number().int().min(1).max(87600).optional(),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`ingame:${server.id}`, 120, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const body = schema.parse(await req.json());

  const player = body.license
    ? await db.player.findUnique({
        where: { serverId_license: { serverId: server.id, license: body.license } },
      })
    : null;

  const banCode = body.type === "BAN" ? generateBanCode() : null;
  const expiresAt =
    body.type === "BAN" && body.durationHours
      ? new Date(Date.now() + body.durationHours * 3600 * 1000)
      : null;

  await db.punishAction.create({
    data: {
      serverId: server.id,
      playerId: player?.id,
      type: body.type,
      reason: body.reason,
      issuedBy: body.by,
      playerName: body.playerName,
      status: "DELIVERED", // oyunda zaten uygulandı
      deliveredAt: new Date(),
    },
  });

  if (body.type === "BAN") {
    await db.ban.create({
      data: {
        serverId: server.id,
        playerId: player?.id,
        code: banCode,
        license: player?.license ?? body.license,
        steam: player?.steam,
        discord: player?.discord,
        ip: player?.ip,
        playerName: body.playerName,
        reason: body.reason,
        bannedBy: body.by,
        active: true,
        permanent: !expiresAt,
        expiresAt,
      },
    });
    if (player) {
      await db.player.update({ where: { id: player.id }, data: { online: false, trustScore: 0 } });
    }
    // Permanent bans feed the network reputation (contributing servers only).
    if (!expiresAt) {
      await recordNetworkBan(server, {
        license: player?.license ?? body.license,
        steam: player?.steam,
        discord: player?.discord,
        playerName: body.playerName,
        type: "MANUAL",
      });
    }
  }

  await db.serverLog.create({
    data: {
      serverId: server.id,
      level: body.type === "BAN" ? "WARN" : "INFO",
      source: "ingame",
      message: `${body.type} → ${body.playerName} (${body.reason}) — ${body.by}`,
    },
  });

  void sendWebhook(server.config, body.type.toLowerCase() as WebhookEvent, server.name, {
    player: body.playerName,
    reason: body.reason,
    by: body.by,
    code: banCode ?? undefined,
    identifiers: player
      ? { license: player.license, discord: player.discord, steam: player.steam, ip: player.ip }
      : undefined,
  });

  return ok({ recorded: true, banCode });
});
