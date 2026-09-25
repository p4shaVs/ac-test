import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { sendWebhook } from "@/lib/discord";
import { revokeNetworkBan } from "@/lib/network-bans";

export const dynamic = "force-dynamic";

// Lift a ban from the in-game admin menu (by internal id) or from the server
// console (`ac unban AC-7K3QP9`, by the Ban ID the player was shown). The
// resource has already verified the admin holds the "unban" permission, or the
// call came from the console (server/live.lua, server/commands.lua). Scoped to
// this server's own bans — an id or code from another server returns 404.
const schema = z
  .object({
    banId: z.string().min(5).max(40).optional(),
    code: z.string().trim().toUpperCase().regex(/^AC-[A-Z2-9]{6}$/).optional(),
    by: z.string().max(80).default("In-Game Admin"),
  })
  .refine((b) => b.banId || b.code, { message: "banId or code is required" });

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`ingame-unban:${server.id}`, 30, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const { banId, code, by } = schema.parse(await req.json());

  const ban = await db.ban.findFirst({
    where: { serverId: server.id, active: true, ...(banId ? { id: banId } : { code }) },
  });
  if (!ban) throw new ApiError(404, "No active ban found");

  await db.$transaction([
    db.ban.update({
      where: { id: ban.id },
      data: { active: false, unbannedAt: new Date(), unbannedBy: by },
    }),
    // The resource refreshes its ban list itself right after this call, so the
    // queue entry is recorded as already delivered.
    db.punishAction.create({
      data: {
        serverId: server.id,
        playerId: ban.playerId,
        type: "UNBAN",
        reason: "Unbanned in-game",
        issuedBy: by,
        playerName: ban.playerName,
        status: "DELIVERED",
        deliveredAt: new Date(),
      },
    }),
    db.serverLog.create({
      data: {
        serverId: server.id,
        level: "INFO",
        source: "ingame",
        message: `UNBAN → ${ban.playerName} — ${by}`,
      },
    }),
  ]);

  // A corrected ban must not leave the player flagged network-wide.
  await revokeNetworkBan(server, { license: ban.license, steam: ban.steam, discord: ban.discord });

  void sendWebhook(server.config, "unban", server.name, {
    player: ban.playerName,
    reason: "Unbanned in-game",
    by,
    code: ban.code ?? undefined,
  });

  return ok({ success: true, playerName: ban.playerName });
});
