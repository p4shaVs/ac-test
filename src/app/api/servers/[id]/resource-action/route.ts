import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { ApiError } from "@/lib/api";

const schema = z.object({
  name: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_\-.]+$/, "Invalid resource name"),
  action: z.enum(["start", "stop", "restart"]),
});

// Panelden bir kaynağı başlat/durdur/yeniden başlat → komut kuyruğuna eklenir,
// FiveM kaynağı ExecuteCommand ile uygular.
const cmdFor: Record<string, (n: string) => string> = {
  start: (n) => `ensure ${n}`,
  stop: (n) => `stop ${n}`,
  restart: (n) => `restart ${n}`,
};

export const POST = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { server, user } = await requireOwnedServer(ctx.params.id);
    const rl = rateLimit(`resact:${user.id}`, 30, 60_000);
    if (!rl.success) throw new ApiError(429, "Too fast, please wait");

    const body = schema.parse(await req.json());
    const command = cmdFor[body.action](body.name);

    await db.$transaction([
      db.serverCommand.create({
        data: { serverId: server.id, command, issuedBy: user.username, status: "PENDING" },
      }),
      db.serverLog.create({
        data: {
          serverId: server.id,
          level: "INFO",
          source: "panel",
          message: `Resource ${body.action}: ${body.name} — ${user.username}`,
        },
      }),
    ]);

    // İyimser durum güncellemesi (kaynak sync ile düzeltecek)
    await db.serverResource
      .update({
        where: { serverId_name: { serverId: server.id, name: body.name } },
        data: { state: body.action === "stop" ? "stopped" : "started" },
      })
      .catch(() => {});

    await audit({
      userId: user.id,
      action: "RESOURCE_ACTION",
      targetType: "Server",
      targetId: server.id,
      ip: clientIp(headers()),
      meta: { name: body.name, action: body.action },
    });

    return ok({ queued: true, command });
  }
);
