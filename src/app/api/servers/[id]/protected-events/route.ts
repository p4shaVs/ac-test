import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { parseJson } from "@/lib/utils";
import { sanitizeProtectedEvents } from "@/lib/events-config";

// Saves the customer's protected client-event list under server.config
// .protectedEvents. The resource pulls it via heartbeat and registers a
// honeypot handler for each (client/events.lua).
const schema = z.object({ events: z.array(z.string().max(120)).max(200) });

export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, user } = await requireOwnedServer(ctx.params.id);
  const body = schema.parse(await req.json());

  const config = parseJson<Record<string, unknown>>(server.config, {});
  const events = sanitizeProtectedEvents(body.events);
  config.protectedEvents = events;

  await db.server.update({ where: { id: server.id }, data: { config: JSON.stringify(config) } });
  await db.serverLog.create({
    data: { serverId: server.id, level: "INFO", source: "panel", message: `Protected events updated (${events.length}) — ${user.username}` },
  });
  await audit({
    userId: user.id,
    action: "PROTECTED_EVENTS_UPDATE",
    targetType: "Server",
    targetId: server.id,
    ip: clientIp(headers()),
    meta: { count: events.length },
  });

  return ok({ success: true, events });
});
