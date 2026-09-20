import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// Kaynak, kara liste (yasaklı araç/ped/nesne/silah) kayıtlarını çeker.
export const GET = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rows = await db.blacklist.findMany({
    where: { serverId: server.id, enabled: true },
    select: { kind: true, model: true, action: true },
    take: 5000,
  });
  return ok({ blacklist: rows });
});
