import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";

// The resource opens a screenshot request on behalf of an in-game admin
// (/ac ss <id>). The resulting image lands in the panel exactly like one
// requested from the web — same upload endpoint, same owner-only storage.
const schema = z.object({
  license: z.string().max(120),
  playerName: z.string().max(80),
  requestedBy: z.string().max(80).default("In-Game Admin"),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  if (!rateLimit(`ssreq:${server.id}`, 30, 60_000).success) {
    throw new ApiError(429, "Too many requests");
  }

  const body = schema.parse(await req.json());
  const row = await db.screenshotRequest.create({
    data: {
      serverId: server.id,
      playerLicense: body.license,
      playerName: body.playerName,
      requestedBy: body.requestedBy,
    },
    select: { id: true },
  });

  return ok({ id: row.id });
});
