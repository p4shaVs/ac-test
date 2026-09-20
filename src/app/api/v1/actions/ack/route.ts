import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";

// Kaynak, uyguladığı aksiyonları buradan onaylar (DELIVERED).
const schema = z.object({
  actionIds: z.array(z.string()).max(200),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const body = schema.parse(await req.json());

  const result = await db.punishAction.updateMany({
    where: {
      serverId: server.id,
      id: { in: body.actionIds },
      status: "PENDING",
    },
    data: { status: "DELIVERED", deliveredAt: new Date() },
  });

  return ok({ acknowledged: result.count });
});
