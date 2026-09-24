import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { parseJson } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Kaynak, oyun içi yönetici menüsü için yetkili listesini + izinlerini çeker.
export const GET = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const _rl = rateLimit(`adm:${server.id}`, 30, 60_000);
  if (!_rl.success) throw new ApiError(429, "Rate limit");
  const admins = await db.serverAdmin.findMany({
    where: { serverId: server.id },
    take: 500,
  });
  return ok({
    admins: admins.map((a) => ({
      identifier: a.identifier,
      name: a.displayName ?? a.identifier,
      role: a.role,
      permissions: parseJson<string[]>(a.permissions, []),
    })),
  });
});
