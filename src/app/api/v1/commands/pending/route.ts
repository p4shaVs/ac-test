import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// FiveM kaynağı bekleyen konsol komutlarını çeker.
export const GET = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const _rl = rateLimit(`cpoll:${server.id}`, 90, 60_000);
  if (!_rl.success) throw new ApiError(429, "Rate limit");
  const commands = await db.serverCommand.findMany({
    where: { serverId: server.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, command: true, issuedBy: true, createdAt: true },
  });
  return ok({ commands });
});
