import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// Kaynak, panelden istenen bekleyen ekran görüntüsü isteklerini çeker.
export const GET = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rows = await db.screenshotRequest.findMany({
    where: { serverId: server.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true, playerLicense: true, playerName: true },
  });
  return ok({ requests: rows });
});
