import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// FiveM kaynağı bekleyen konsol komutlarını çeker.
export const GET = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const commands = await db.serverCommand.findMany({
    where: { serverId: server.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, command: true, issuedBy: true, createdAt: true },
  });
  return ok({ commands });
});
