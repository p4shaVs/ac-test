import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";

// FiveM kaynağı sunucudaki resource listesini bildirir → panelde görünür.
const schema = z.object({
  resources: z
    .array(z.object({ name: z.string().max(100), state: z.enum(["started", "stopped"]) }))
    .max(2000),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`res:${server.id}`, 30, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const body = schema.parse(await req.json());
  const names = body.resources.map((r) => r.name);

  await db.$transaction([
    // Bildirilenleri upsert et
    ...body.resources.map((r) =>
      db.serverResource.upsert({
        where: { serverId_name: { serverId: server.id, name: r.name } },
        create: { serverId: server.id, name: r.name, state: r.state },
        update: { state: r.state },
      })
    ),
    // Artık bulunmayanları temizle
    db.serverResource.deleteMany({
      where: { serverId: server.id, name: names.length ? { notIn: names } : undefined },
    }),
  ]);

  return ok({ synced: names.length });
});
