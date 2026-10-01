import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { sendWebhook } from "@/lib/discord";

// FiveM kaynağı sunucu olaylarını (giriş/çıkış/chat/sistem) log olarak gönderir.
//
// Bir log satırı isteğe bağlı `meta` taşıyabilir: yapılandırılmış bir olay
// (connect / disconnect / admin). Panel bunları Discord'a (Configuration →
// Settings → Logs & Webhooks kanallarına) kendisi gönderir — webhook adresleri
// oyun sunucusuna hiç verilmez. Oyuncu adları/kimlikleri oyuncudan gelir;
// Discord gömmesi işaretleri ve mention'ları zaten etkisiz kılar (discord.ts).
const str = (n: number) => z.string().max(n);

const meta = z.object({
  event: z.enum(["connect", "disconnect", "admin"]),
  player: str(80).optional(), // bağlanan/ayrılan oyuncu, ya da admin işleminin hedefi
  admin: str(80).optional(), // admin işlemini yapan
  action: str(40).optional(), // admin işlemi (revive, tp, freeze…) ya da araç adı
  reason: str(200).optional(), // ayrılma sebebi / ek bilgi
  ids: z
    .object({
      license: str(120).optional(),
      discord: str(60).optional(),
      steam: str(60).optional(),
      ip: str(64).optional(), // yalnızca "Show Ip Address" açıkken gönderilir
    })
    .optional(),
});

const schema = z.object({
  logs: z
    .array(
      z.object({
        level: z.enum(["INFO", "WARN", "ERROR", "DETECTION"]).default("INFO"),
        source: z.string().max(40).default("server"),
        message: z.string().max(500),
        // Bozuk bir meta yalnızca kendi Discord gönderimini düşürür; log satırını ve aynı
        // istekteki diğer satırları reddettirmez.
        meta: meta.optional().catch(undefined),
      })
    )
    .max(100),
});

// Bir istekte en fazla bu kadar Discord gönderimi (join/leave taşkınına karşı).
const MAX_POSTS_PER_REQUEST = 12;

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`logs:${server.id}`, 120, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const body = schema.parse(await req.json());
  if (body.logs.length) {
    await db.serverLog.createMany({
      data: body.logs.map((l) => ({
        serverId: server.id,
        level: l.level,
        source: l.source,
        message: l.message,
      })),
    });
  }

  let posted = 0;
  for (const l of body.logs) {
    const m = l.meta;
    if (!m || posted >= MAX_POSTS_PER_REQUEST) continue;
    posted++;

    if (m.event === "admin") {
      void sendWebhook(server.config, "admin", server.name, {
        player: m.player,
        by: m.admin,
        reason: m.reason,
        extra: m.action ? { Action: m.action } : undefined,
      });
    } else {
      void sendWebhook(server.config, m.event, server.name, {
        player: m.player,
        reason: m.reason,
        identifiers: m.ids
          ? { license: m.ids.license, discord: m.ids.discord, steam: m.ids.steam, ip: m.ids.ip }
          : undefined,
      });
    }
  }

  return ok({ received: body.logs.length });
});
