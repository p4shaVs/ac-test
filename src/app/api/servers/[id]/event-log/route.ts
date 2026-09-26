import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { parseJson } from "@/lib/utils";
import { getEvents, clearEvents, type LiveEvent } from "@/lib/event-log-store";
import { sanitizeProtectedEvents } from "@/lib/events-config";
import { modelNameForHash } from "@/lib/model-catalog";

export const dynamic = "force-dynamic";

// The resource sends model/weapon/fx hashes as "#<unsigned hash>" (the server
// has no model names). Resolve the ones the catalog knows so the feed reads
// "vehicle adder" instead of "vehicle #3078201489".
function resolveHashes(e: LiveEvent): LiveEvent {
  if (!e.detail.includes("#")) return e;
  return { ...e, detail: e.detail.replace(/#(\d{4,10})\b/g, (m, h) => {
    const name = modelNameForHash(h);
    return name === h ? m : name.replace(/^weapon_/, "");
  }) };
}

// GET: current state, watched events and recent events (optionally since an id).
export const GET = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server } = await requireOwnedServer(ctx.params.id);
  const config = parseJson<Record<string, unknown>>(server.config, {});
  const sinceId = new URL(req.url).searchParams.get("since") ?? undefined;
  return ok({
    enabled: config.eventLogEnabled === true,
    watchEvents: sanitizeProtectedEvents(config.watchEvents),
    events: getEvents(server.id, sinceId).map(resolveHashes),
  });
});

// PATCH: turn logging on/off and/or replace the watched-event list. The
// resource normally picks config up on its next heartbeat (~20 s); an
// "ac reload" console command is queued so it applies within ~5 s.
const patchSchema = z.object({
  enabled: z.boolean().optional(),
  clear: z.boolean().optional(),
  watchEvents: z.array(z.string()).max(200).optional(),
});
export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, user } = await requireOwnedServer(ctx.params.id);
  const body = patchSchema.parse(await req.json());
  const config = parseJson<Record<string, unknown>>(server.config, {});
  let changed = false;
  if (typeof body.enabled === "boolean" && config.eventLogEnabled !== body.enabled) {
    config.eventLogEnabled = body.enabled;
    changed = true;
  }
  if (body.watchEvents) {
    config.watchEvents = sanitizeProtectedEvents(body.watchEvents);
    changed = true;
  }
  if (changed) {
    await db.$transaction([
      db.server.update({ where: { id: server.id }, data: { config: JSON.stringify(config) } }),
      db.serverCommand.create({ data: { serverId: server.id, command: "ac reload", issuedBy: `${user.username} (Event Log)` } }),
    ]);
  }
  if (body.clear || config.eventLogEnabled !== true) clearEvents(server.id);
  return ok({ enabled: config.eventLogEnabled === true, watchEvents: sanitizeProtectedEvents(config.watchEvents) });
});
