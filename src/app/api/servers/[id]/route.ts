import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { sanitizeNetworkPolicy } from "@/lib/network-bans";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(48).optional(),
  ip: z.string().trim().max(64).nullable().optional(),
  maxSlots: z.number().int().min(1).max(2048).optional(),
  discordWebhook: z.string().trim().url().max(300).nullable().optional(),
  webhookEvents: z.record(z.boolean()).optional(),
  network: z
    .object({
      action: z.enum(["OFF", "LOG", "KICK"]),
      contribute: z.boolean(),
    })
    .optional(),
});

export const PATCH = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { server, user } = await requireOwnedServer(ctx.params.id);
    const body = patchSchema.parse(await req.json());

    // config JSON içinde discordWebhook + webhookEvents + network sakla
    let config = server.config;
    if (
      body.discordWebhook !== undefined ||
      body.webhookEvents !== undefined ||
      body.network !== undefined
    ) {
      const parsed = JSON.parse(server.config || "{}");
      if (body.discordWebhook !== undefined) parsed.discordWebhook = body.discordWebhook;
      if (body.webhookEvents !== undefined) parsed.webhookEvents = body.webhookEvents;
      if (body.network !== undefined) parsed.network = sanitizeNetworkPolicy(body.network);
      config = JSON.stringify(parsed);
    }

    await db.server.update({
      where: { id: server.id },
      data: {
        name: body.name ?? server.name,
        ip: body.ip !== undefined ? body.ip : server.ip,
        maxSlots: body.maxSlots ?? server.maxSlots,
        config,
      },
    });

    await audit({
      userId: user.id,
      action: "SERVER_UPDATE",
      targetType: "Server",
      targetId: server.id,
      ip: clientIp(headers()),
    });

    return ok({ success: true });
  }
);

export const DELETE = handler(
  async (_req: NextRequest, ctx: { params: { id: string } }) => {
    const { server, user } = await requireOwnedServer(ctx.params.id);
    await db.server.delete({ where: { id: server.id } });
    await audit({
      userId: user.id,
      action: "SERVER_DELETE",
      targetType: "Server",
      targetId: server.id,
      ip: clientIp(headers()),
    });
    return ok({ success: true });
  }
);
