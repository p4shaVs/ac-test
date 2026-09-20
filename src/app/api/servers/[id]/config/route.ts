import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { sanitizeAcConfig } from "@/lib/ac-config";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { parseJson } from "@/lib/utils";

// Saves the full CoreAC configuration under server.config.ac. The FiveM resource
// pulls it via heartbeat and applies it to CoreAC.Config (see bridge/server.lua).
const schema = z.object({ ac: z.record(z.record(z.any())) });

export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, user } = await requireOwnedServer(ctx.params.id);
  const body = schema.parse(await req.json());

  const config = parseJson<Record<string, unknown>>(server.config, {});
  config.ac = sanitizeAcConfig(body.ac);

  await db.server.update({
    where: { id: server.id },
    data: { config: JSON.stringify(config) },
  });

  await db.serverLog.create({
    data: {
      serverId: server.id,
      level: "INFO",
      source: "panel",
      message: `Configuration updated — ${user.username}`,
    },
  });

  await audit({
    userId: user.id,
    action: "CONFIG_UPDATE",
    targetType: "Server",
    targetId: server.id,
    ip: clientIp(headers()),
  });

  return ok({ success: true });
});
