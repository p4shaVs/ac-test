import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { parseJson } from "@/lib/utils";
import { getEvents, clearEvents } from "@/lib/event-log-store";

export const dynamic = "force-dynamic";

// GET: current enabled state + recent events (optionally since an id, for polling).
export const GET = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server } = await requireOwnedServer(ctx.params.id);
  const config = parseJson<Record<string, unknown>>(server.config, {});
  const sinceId = new URL(req.url).searchParams.get("since") ?? undefined;
  return ok({
    enabled: config.eventLogEnabled === true,
    events: getEvents(server.id, sinceId),
  });
});

// PATCH: turn logging on/off (the resource picks it up on its next heartbeat).
const patchSchema = z.object({ enabled: z.boolean(), clear: z.boolean().optional() });
export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server } = await requireOwnedServer(ctx.params.id);
  const body = patchSchema.parse(await req.json());
  const config = parseJson<Record<string, unknown>>(server.config, {});
  config.eventLogEnabled = body.enabled;
  await db.server.update({ where: { id: server.id }, data: { config: JSON.stringify(config) } });
  if (body.clear || !body.enabled) clearEvents(server.id);
  return ok({ enabled: body.enabled });
});
