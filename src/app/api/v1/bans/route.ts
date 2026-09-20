import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// Kaynak, oyuncu girişinde kontrol için aktif ban listesini çeker.
export const GET = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const now = new Date();

  // Süresi dolan geçici banları pasifleştir.
  await db.ban.updateMany({
    where: {
      serverId: server.id,
      active: true,
      permanent: false,
      expiresAt: { lt: now },
    },
    data: { active: false },
  });

  const bans = await db.ban.findMany({
    where: { serverId: server.id, active: true },
    select: {
      id: true,
      code: true,
      license: true,
      steam: true,
      discord: true,
      ip: true,
      reason: true,
      permanent: true,
      expiresAt: true,
    },
    take: 5000,
  });

  return ok({ bans });
});
