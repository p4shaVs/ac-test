import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { generateBanCode } from "@/lib/keys";
import { sendWebhook } from "@/lib/discord";
import { recordNetworkBan } from "@/lib/network-bans";
import { identityFrom, parseIdentifiers, MAX_BAN_MINUTES } from "@/lib/identifiers";

const schema = z.object({
  name: z.string().trim().max(64).optional().default(""),
  reason: z.string().trim().min(2).max(200),
  identifiers: z.string().max(4000),
  /** null = permanent */
  durationMinutes: z.number().int().min(1).max(MAX_BAN_MINUTES).nullable(),
});

// Bans someone who is not on the server right now (or never was): the ban is
// stored with the identifiers given and the game server picks it up on its next
// ban-list refresh (≤ 60 s), so they are refused at the door.
export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, user } = await requireOwnedServer(ctx.params.id);
  const rl = rateLimit(`offline-ban:${user.id}`, 30, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many bans in a minute, slow down");

  const body = schema.parse(await req.json());
  const parsed = identityFrom(parseIdentifiers(body.identifiers));
  if ("error" in parsed) throw new ApiError(422, parsed.error);
  const id = parsed.identity;

  const or: Prisma.BanWhereInput[] = [];
  if (id.license) or.push({ license: id.license });
  if (id.steam) or.push({ steam: id.steam });
  if (id.discord) or.push({ discord: id.discord });
  if (or.length) {
    const existing = await db.ban.findFirst({ where: { serverId: server.id, active: true, OR: or }, select: { code: true, playerName: true } });
    if (existing) {
      throw new ApiError(409, `Already banned — ${existing.playerName}${existing.code ? ` (Ban ID ${existing.code})` : ""}.`);
    }
  }

  // Someone the server has already seen? Link the ban to them (history, trust,
  // hardware tokens for ban-evasion matching).
  const player = or.length
    ? await db.player.findFirst({
        where: {
          serverId: server.id,
          OR: [
            ...(id.license ? [{ license: id.license }] : []),
            ...(id.steam ? [{ steam: id.steam }] : []),
            ...(id.discord ? [{ discord: id.discord }] : []),
          ],
        },
        orderBy: { lastSeenAt: "desc" },
      })
    : null;

  const name = body.name || player?.name || "Unknown player";
  const expiresAt = body.durationMinutes ? new Date(Date.now() + body.durationMinutes * 60_000) : null;
  const code = generateBanCode();

  const ban = await db.$transaction(async (tx) => {
    const created = await tx.ban.create({
      data: {
        serverId: server.id,
        playerId: player?.id ?? null,
        code,
        license: id.license,
        steam: id.steam,
        discord: id.discord,
        ip: id.ip,
        tokens: player?.tokens ?? "[]",
        deviceId: player?.deviceId ?? null,
        playerName: name,
        reason: body.reason,
        bannedBy: user.username,
        active: true,
        permanent: !expiresAt,
        expiresAt,
      },
    });
    if (player) {
      await tx.player.update({ where: { id: player.id }, data: { trustScore: 0 } });
      // Online after all? The game server drops them now instead of at their next join.
      if (player.online) {
        await tx.punishAction.create({
          data: {
            serverId: server.id,
            playerId: player.id,
            type: "BAN",
            reason: body.reason,
            issuedBy: user.username,
            playerName: player.name,
            status: "PENDING",
          },
        });
      }
    }
    await tx.serverLog.create({
      data: {
        serverId: server.id,
        level: "WARN",
        source: "panel",
        message: `OFFLINE BAN → ${name} (${body.reason}) — ${user.username}`,
      },
    });
    return created;
  });

  if (!expiresAt) {
    await recordNetworkBan(server, { license: id.license, steam: id.steam, discord: id.discord, playerName: name, type: "MANUAL" });
  }

  await audit({
    userId: user.id,
    action: "OFFLINE_BAN",
    targetType: "Ban",
    targetId: ban.id,
    ip: clientIp(headers()),
    meta: { serverId: server.id, code, linkedPlayer: player?.id ?? null },
  });

  void sendWebhook(server.config, "ban", server.name, {
    player: name,
    reason: body.reason,
    by: user.username,
    code,
    identifiers: { license: id.license, discord: id.discord, steam: id.steam, ip: id.ip },
  });

  return ok({ id: ban.id, code, linkedPlayer: player ? { id: player.id, name: player.name, online: player.online } : null });
});
