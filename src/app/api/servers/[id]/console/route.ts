import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireServerAccess } from "@/lib/api-guards";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

const schema = z.object({ command: z.string().trim().min(1).max(500) });

// Console output: the latest server log lines, or only the ones after `since`
// (an ISO time) so the terminal can poll without re-reading everything.
export const GET = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server } = await requireServerAccess(ctx.params.id, "console");
  const sinceRaw = new URL(req.url).searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const logs = await db.serverLog.findMany({
    where: { serverId: server.id, ...(since && !isNaN(since.getTime()) ? { createdAt: { gt: since } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const fresh = await db.server.findUnique({ where: { id: server.id }, select: { status: true } });
  return ok({
    online: fresh?.status === "ONLINE",
    lines: logs.reverse().map((l) => ({
      id: l.id,
      level: l.level,
      source: l.source,
      message: l.message,
      createdAt: l.createdAt.toISOString(),
    })),
  });
});

// Web konsolundan komut gönderir → kuyruğa alınır, FiveM kaynağı çalıştırır.
export const POST = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { server, user } = await requireServerAccess(ctx.params.id, "console");
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
