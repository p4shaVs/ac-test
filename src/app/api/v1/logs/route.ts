import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";

// FiveM kaynağı sunucu olaylarını (giriş/çıkış/chat/sistem) log olarak gönderir.
const schema = z.object({
  logs: z
    .array(
      z.object({
        level: z.enum(["INFO", "WARN", "ERROR", "DETECTION"]).default("INFO"),
        source: z.string().max(40).default("server"),
        message: z.string().max(500),
      })
    )
    .max(100),
});

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
  return ok({ received: body.logs.length });
});
