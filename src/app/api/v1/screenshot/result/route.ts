import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";

// The resource reports the outcome of a screenshot request.
//
// SECURITY: the URL in this call originates from the *player's* game client
// (screenshot-basic runs there and the resource only relays it). For an
// auto-ban, that player is the cheater who was just caught. Two rules follow:
//
//  1. Only a request that is still PENDING can be completed here. When the
//     image was uploaded to our own /screenshot/upload endpoint, that endpoint
//     already stored the real URL and marked the request DONE — a later
//     "result" from the client must not be able to replace genuine evidence
//     with an innocent-looking image.
//  2. Only http(s) URLs are accepted. zod's .url() alone would happily store
//     `javascript:…`, which executes when an admin clicks the evidence link.
const httpUrl = z
  .string()
  .max(1000)
  .refine((v) => {
    try {
      const p = new URL(v).protocol;
      return p === "https:" || p === "http:";
    } catch {
      return false;
    }
  }, "URL must be http or https");

const schema = z.object({
  id: z.string().max(64),
  url: httpUrl.optional(),
  failed: z.boolean().optional(),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const _rl = rateLimit(`ssres:${server.id}`, 60, 60_000);
  if (!_rl.success) throw new ApiError(429, "Rate limit");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(422, "Invalid screenshot result");
  const body = parsed.data;

  const reqRow = await db.screenshotRequest.findFirst({
    where: { id: body.id, serverId: server.id },
    select: { id: true, status: true },
  });
  if (!reqRow) throw new ApiError(404, "Request not found");

  // Already completed (normally by the direct upload) — keep what we have.
  if (reqRow.status !== "PENDING") return ok({ received: true, ignored: true });

  await db.screenshotRequest.update({
    where: { id: reqRow.id },
    data: {
      status: body.failed || !body.url ? "FAILED" : "DONE",
      url: body.url ?? null,
      completedAt: new Date(),
    },
  });

  return ok({ received: true });
});
