import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { sanitizeActions } from "@/lib/detection-actions";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { parseJson } from "@/lib/utils";

const schema = z.object({ actions: z.record(z.string()) });

// Her tespit tipi için LOG/KICK/BAN aksiyonunu server.config.actions altına
// kaydeder. FiveM'den gelen tespitler bu haritaya göre işlenir (v1/detections).
export const PATCH = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { server, user } = await requireOwnedServer(ctx.params.id);
    const body = schema.parse(await req.json());

    const config = parseJson<Record<string, unknown>>(server.config, {});
    config.actions = sanitizeActions(body.actions);

    await db.server.update({
      where: { id: server.id },
      data: { config: JSON.stringify(config) },
    });

    await db.serverLog.create({
      data: {
        serverId: server.id,
        level: "INFO",
        source: "panel",
        message: `Detection punishments updated — ${user.username}`,
      },
    });

    await audit({
      userId: user.id,
      action: "ACTIONS_UPDATE",
      targetType: "Server",
      targetId: server.id,
      ip: clientIp(headers()),
    });

    return ok({ success: true });
  }
);
