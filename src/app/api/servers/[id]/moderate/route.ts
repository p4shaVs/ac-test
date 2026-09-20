import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { punishSchema } from "@/lib/validation";
import { generateBanCode } from "@/lib/keys";
import { sendWebhook, type WebhookEvent } from "@/lib/discord";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { recordNetworkBan } from "@/lib/network-bans";

/**
 * Web panelinden oyuncuya ceza uygular (WARN / KICK / BAN).
 * Ceza bir kuyruğa (PunishAction, PENDING) eklenir; FiveM kaynağı bu kuyruğu
 * çekip uygular. BAN aynı zamanda kalıcı bir Ban kaydı oluşturur.
 */
export const POST = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { server, user } = await requireOwnedServer(ctx.params.id);
    const ip = clientIp(headers()) ?? "unknown";

    const rl = rateLimit(`moderate:${user.id}`, 60, 60_000);
    if (!rl.success) throw new ApiError(429, "Too many operations, please slow down");

    const body = punishSchema.parse(await req.json());

    const player = await db.player.findFirst({
      where: { id: body.playerId, serverId: server.id },
    });
    if (!player) throw new ApiError(404, "Player not found");

    const expiresAt =
      body.type === "BAN" && body.durationHours
        ? new Date(Date.now() + body.durationHours * 60 * 60 * 1000)
        : null;

    const banCode = body.type === "BAN" ? generateBanCode() : null;

    await db.$transaction(async (tx) => {
      // Kuyruğa ekle (FiveM tarafından uygulanacak)
      await tx.punishAction.create({
        data: {
          serverId: server.id,
          playerId: player.id,
          type: body.type,
          reason: body.reason,
          issuedBy: user.username,
          playerName: player.name,
          status: "PENDING",
        },
      });

      if (body.type === "BAN") {
        await tx.ban.create({
          data: {
            serverId: server.id,
            playerId: player.id,
            code: banCode,
            license: player.license,
            steam: player.steam,
            discord: player.discord,
            ip: player.ip,
            playerName: player.name,
            reason: body.reason,
            bannedBy: user.username,
            active: true,
            permanent: !expiresAt,
            expiresAt,
          },
        });
        await tx.player.update({
          where: { id: player.id },
          data: { online: false, trustScore: 0 },
        });
      }

      await tx.serverLog.create({
        data: {
          serverId: server.id,
          level: body.type === "BAN" ? "WARN" : "INFO",
          source: "panel",
          message: `${body.type} → ${player.name} (${body.reason}) — ${user.username}`,
        },
      });
    });

    // Permanent bans feed the network reputation (contributing servers only);
    // temporary/cooldown bans do not brand a player network-wide.
    if (body.type === "BAN" && !expiresAt) {
      await recordNetworkBan(server, {
        license: player.license,
        steam: player.steam,
        discord: player.discord,
        playerName: player.name,
        type: "MANUAL",
      });
    }

    await audit({
      userId: user.id,
      action: `MODERATE_${body.type}`,
      targetType: "Player",
      targetId: player.id,
      ip,
      meta: { serverId: server.id, reason: body.reason },
    });

    void sendWebhook(server.config, body.type.toLowerCase() as WebhookEvent, server.name, {
      player: player.name,
      reason: body.reason,
      by: user.username,
      code: banCode ?? undefined,
      identifiers: { license: player.license, discord: player.discord, steam: player.steam, ip: player.ip },
    });

    return ok({ queued: true, banCode });
  }
);
