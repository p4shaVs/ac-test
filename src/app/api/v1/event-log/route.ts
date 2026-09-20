import { NextRequest } from "next/server";
import { z } from "zod";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { pushEvents } from "@/lib/event-log-store";

export const dynamic = "force-dynamic";

// The resource streams batched game events here WHILE the owner has the Event
// Log turned on. Stored in an in-memory ring buffer only (live-watch feed).
const schema = z.object({
  events: z
    .array(
      z.object({
        t: z.number().optional(),
        kind: z.enum(["spawn", "remove", "explosion", "damage", "particle", "kill", "other"]).default("other"),
        player: z.string().max(80).default("?"),
        detail: z.string().max(200).default(""),
      })
    )
    .max(200),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`evlog:${server.id}`, 120, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const { events } = schema.parse(await req.json());
  pushEvents(
    server.id,
    events.map((e) => ({ t: e.t ?? Date.now(), kind: e.kind, player: e.player, detail: e.detail }))
  );
  return ok({ stored: events.length });
});
