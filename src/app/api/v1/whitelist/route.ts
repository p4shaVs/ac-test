import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// Kaynak, bypass (koruma muafiyeti) listesini çeker. Bu kimliklere sahip
// oyuncular oyun içi korumalardan ve otomatik bandan muaf tutulur.
export const GET = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rows = await db.whitelist.findMany({
    where: { serverId: server.id },
    select: { kind: true, value: true },
    take: 5000,
  });
  return ok({ whitelist: rows });
});
