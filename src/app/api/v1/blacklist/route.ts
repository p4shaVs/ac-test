import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Kaynak, kara liste (yasaklı araç/ped/nesne/silah) kayıtlarını çeker.
export const GET = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`bl:${server.id}`, 30, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  // Only kinds the resource enforces (entityCreating / weapon events). Any
  // legacy 'explosion' rows are excluded so nothing dead reaches the server.
  const rows = await db.blacklist.findMany({
    where: {
      serverId: server.id,
      enabled: true,
      kind: { in: ["vehicle", "ped", "object", "weapon"] },
    },
    select: { kind: true, model: true, label: true, action: true },
    take: 5000,
  });
  return ok({ blacklist: rows });
});
