import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/session";

// Genel (herkese açık) ban sorgulama — oyuncu ban kodunu girip sebebini görür.
export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const ip = clientIp(headers()) ?? "unknown";
  const rl = rateLimit(`banlookup:${ip}`, 20, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many attempts, please wait");

  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) throw new ApiError(400, "Ban code is required");

  const ban = await db.ban.findUnique({
    where: { code },
    include: { server: { select: { name: true } } },
  });
  if (!ban) throw new ApiError(404, "No ban found for that code");

  // Yalnızca hassas olmayan bilgiler.
  return ok({
    code: ban.code,
    playerName: ban.playerName,
    reason: ban.reason,
    bannedBy: ban.bannedBy,
    server: ban.server.name,
    active: ban.active,
    permanent: ban.permanent,
    createdAt: ban.createdAt.toISOString(),
    expiresAt: ban.expiresAt ? ban.expiresAt.toISOString() : null,
  });
});
