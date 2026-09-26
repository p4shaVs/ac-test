import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { parseScope } from "@/lib/bypass";

export const dynamic = "force-dynamic";

// Kaynak, bypass (koruma muafiyeti) listesini çeker. Bu kimliklere sahip
// oyuncular oyun içi korumalardan ve otomatik bandan muaf tutulur.
export const GET = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const _rl = rateLimit(`wl:${server.id}`, 30, 60_000);
  if (!_rl.success) throw new ApiError(429, "Rate limit");
  const rows = await db.whitelist.findMany({
    where: { serverId: server.id },
    select: { kind: true, value: true, scope: true },
    take: 5000,
  });
  // full = exempt from everything. Scoped entries are NOT skipped in-game: the
  // checks still run and the panel decides per detection type.
  return ok({ whitelist: rows.map((r) => ({ kind: r.kind, value: r.value, full: parseScope(r.scope).length === 0 })) });
});
