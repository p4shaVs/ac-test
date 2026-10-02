import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireServerAccess } from "@/lib/api-guards";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { liftBan } from "@/lib/ban-ops";

const schema = z.object({ banId: z.string().min(1) });

export const POST = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { server, user } = await requireServerAccess(ctx.params.id, "moderate");
    const body = schema.parse(await req.json());

    const ban = await db.ban.findFirst({
      where: { id: body.banId, serverId: server.id, active: true },
    });
    if (!ban) throw new ApiError(404, "No active ban found");

    // Lifts the ban, its linked ban-evasion bans, queues the UNBAN for FiveM,
    // clears the network-ban contribution and posts the unban webhook.
    const linked = await liftBan(server, ban, user.username, "Unbanned from the web panel");

    await audit({
      userId: user.id,
      action: "UNBAN",
      targetType: "Ban",
      targetId: ban.id,
      ip: clientIp(headers()),
      meta: { player: ban.playerName, code: ban.code, linked },
    });

    return ok({ success: true, linked });
  }
);
