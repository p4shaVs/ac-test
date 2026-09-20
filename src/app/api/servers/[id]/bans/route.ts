import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

const schema = z.object({
  action: z.enum(["clearInactive", "unbanAll"]),
});

// Toplu ban işlemleri: kaldırılmışları temizle veya tüm aktif banları kaldır.
export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, user } = await requireOwnedServer(ctx.params.id);
  const { action } = schema.parse(await req.json());

  if (action === "clearInactive") {
    // Kaldırılmış (pasif) ban kayıtlarını sil — geçmiş temizliği.
    const res = await db.ban.deleteMany({ where: { serverId: server.id, active: false } });
    await audit({ userId: user.id, action: "BANS_CLEAR_INACTIVE", targetType: "Server", targetId: server.id, ip: clientIp(headers()) });
    return ok({ deleted: res.count });
  }

  // unbanAll: tüm aktif banları kaldır (oyun içi 60 sn'de tazelenir).
  const res = await db.ban.updateMany({
    where: { serverId: server.id, active: true },
    data: { active: false, unbannedAt: new Date(), unbannedBy: user.username },
  });
  await db.serverLog.create({
    data: { serverId: server.id, level: "WARN", source: "panel", message: `All bans removed (${res.count}) — ${user.username}` },
  });
  await audit({ userId: user.id, action: "BANS_UNBAN_ALL", targetType: "Server", targetId: server.id, ip: clientIp(headers()) });
  return ok({ unbanned: res.count });
});
