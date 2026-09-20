import { NextRequest } from "next/server";
import { z } from "zod";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { getCachedAvatar, warmAvatar } from "@/lib/discord-avatar";

export const dynamic = "force-dynamic";

// Discord avatar URLs for a batch of players (the in-game menu roster). Sends
// back only ones already resolved; unresolved ones are warmed for next time.
// Keyed by the raw discord identifier the resource sent, so it can merge back.
const schema = z.object({
  discords: z.array(z.string().max(120)).max(2048),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`avatars:${server.id}`, 120, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const { discords } = schema.parse(await req.json());
  const out: Record<string, string> = {};
  for (const d of discords) {
    if (!d) continue;
    const url = getCachedAvatar(d);
    if (url) out[d] = url;
    else void warmAvatar(d);
  }
  return ok({ avatars: out });
});
