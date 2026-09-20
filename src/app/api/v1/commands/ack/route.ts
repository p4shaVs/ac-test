import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";

const schema = z.object({
  commandIds: z.array(z.string()).max(100),
  output: z.string().max(2000).optional(),
});

// FiveM kaynağı çalıştırdığı komutları onaylar (opsiyonel çıktı ile).
export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const body = schema.parse(await req.json());

  const result = await db.serverCommand.updateMany({
    where: { serverId: server.id, id: { in: body.commandIds }, status: "PENDING" },
    data: { status: "DELIVERED", deliveredAt: new Date(), output: body.output },
  });

  return ok({ acknowledged: result.count });
});
