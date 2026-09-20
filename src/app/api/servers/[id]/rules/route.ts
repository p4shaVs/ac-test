import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { sanitizeRules } from "@/lib/rules";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { parseJson } from "@/lib/utils";

const schema = z.object({ rules: z.record(z.boolean()) });

// Güvenlik kurallarını server.config.rules altına kaydeder.
export const PATCH = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { server, user } = await requireOwnedServer(ctx.params.id);
    const body = schema.parse(await req.json());

    const config = parseJson<Record<string, unknown>>(server.config, {});
    config.rules = sanitizeRules(body.rules);

    await db.server.update({
      where: { id: server.id },
      data: { config: JSON.stringify(config) },
    });

    await db.serverLog.create({
      data: {
        serverId: server.id,
        level: "INFO",
        source: "panel",
        message: `Server guards updated — ${user.username}`,
      },
    });

    await audit({
      userId: user.id,
      action: "RULES_UPDATE",
      targetType: "Server",
      targetId: server.id,
      ip: clientIp(headers()),
    });

    return ok({ success: true });
  }
);
