import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

const schema = z.object({ command: z.string().trim().min(1).max(500) });

// Web konsolundan komut gönderir → kuyruğa alınır, FiveM kaynağı çalıştırır.
export const POST = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { server, user } = await requireOwnedServer(ctx.params.id);
    const rl = rateLimit(`console:${user.id}`, 30, 60_000);
    if (!rl.success) throw new ApiError(429, "Too fast, please wait");

    const body = schema.parse(await req.json());

    const cmd = await db.serverCommand.create({
      data: {
        serverId: server.id,
        command: body.command,
        issuedBy: user.username,
        status: "PENDING",
      },
    });
    await db.serverLog.create({
      data: {
        serverId: server.id,
        level: "INFO",
        source: "console",
        message: `> ${body.command} (${user.username})`,
      },
    });

    await audit({
      userId: user.id,
      action: "CONSOLE_COMMAND",
      targetType: "Server",
      targetId: server.id,
      ip: clientIp(headers()),
      meta: { command: body.command },
    });

    return ok({ id: cmd.id, queued: true });
  }
);
