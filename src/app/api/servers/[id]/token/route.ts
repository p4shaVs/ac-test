import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { generateServerToken } from "@/lib/keys";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

/** Sunucu API token'ını yeniden üretir. Eski token geçersiz olur. */
export const POST = handler(
  async (_req: NextRequest, ctx: { params: { id: string } }) => {
    const { server, user } = await requireOwnedServer(ctx.params.id);
    const { token, hash } = generateServerToken();

    await db.server.update({
      where: { id: server.id },
      data: { apiTokenHash: hash },
    });

    await audit({
      userId: user.id,
      action: "SERVER_TOKEN_REGEN",
      targetType: "Server",
      targetId: server.id,
      ip: clientIp(headers()),
    });

    return ok({ apiToken: token });
  }
);
