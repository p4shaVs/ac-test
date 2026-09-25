import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { ApiError } from "@/lib/api";
import { parseJson } from "@/lib/utils";
import { sanitizeRules } from "@/lib/rules";
import { sanitizeActions } from "@/lib/detection-actions";
import { sanitizeAcConfig } from "@/lib/ac-config";

// FiveM kaynağı bu ucu düzenli aralıklarla çağırarak sunucuyu "çevrimiçi" tutar.
const schema = z.object({
  acVersion: z.string().max(20).optional(),
  maxSlots: z.number().int().min(1).max(2048).optional(),
  onlineCount: z.number().int().min(0).optional(),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);

  const rl = rateLimit(`hb:${server.id}`, 120, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const body = schema.parse(await req.json().catch(() => ({})));

  await db.server.update({
    where: { id: server.id },
    data: {
      status: "ONLINE",
      lastSeenAt: new Date(),
      acVersion: body.acVersion ?? server.acVersion,
      maxSlots: body.maxSlots ?? server.maxSlots,
    },
  });

  // Kaynağın kullanacağı yapılandırma.
  //
  // KRİTİK: burada HAM config dönülüyordu. Hiç ayar kaydetmemiş yeni bir
  // sunucuda `config.rules` tanımsız olduğu için kaynak tarafındaki
  // CAC.getRules() boş tablo döndürüyor, dolayısıyla protection.lua /
  // vehicle_guard.lua / session_guard.lua içindeki HER ruleOn(...) false
  // oluyordu: silent aim, damage multiplier, explosive bullets, vehicle
  // godmode, entity spam, chat flood, reconnect spam korumalarının tamamı
  // kutudan KAPALI geliyordu. Artık üç bölüm de varsayılanlarla doldurulup
  // gönderiliyor — müşteri hiçbir şey yapmadan korumalı başlıyor.
  const stored = parseJson<Record<string, unknown>>(server.config, {});
  const config = {
    ...stored,
    rules: sanitizeRules(stored.rules),
    actions: sanitizeActions(stored.actions),
    ac: sanitizeAcConfig(stored.ac),
  };

  return ok({
    serverId: server.id,
    config,
    // Bekleyen aksiyon sayısını da bildirelim (kaynak isterse hemen çeker).
    pendingActions: await db.punishAction.count({
      where: { serverId: server.id, status: "PENDING" },
    }),
  });
});
