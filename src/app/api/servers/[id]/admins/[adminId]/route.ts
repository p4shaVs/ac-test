import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { ADMIN_PERMISSIONS } from "@/lib/admin-perms";

const patchSchema = z.object({
  permissions: z.array(z.enum(ADMIN_PERMISSIONS)).max(ADMIN_PERMISSIONS.length),
});

// Change an existing admin's in-game permissions. Without this, granting a
// permission added later (e.g. "unban", "logs") meant deleting and re-adding
// the admin. The resource picks the change up on its next admin refresh
// (Config.AdminInterval, 60 s by default).
export const PATCH = handler(
  async (req: NextRequest, ctx: { params: { id: string; adminId: string } }) => {
    const { server, user } = await requireOwnedServer(ctx.params.id);
    const admin = await db.serverAdmin.findFirst({
      where: { id: ctx.params.adminId, serverId: server.id },
    });
    if (!admin) throw new ApiError(404, "Admin not found");

    const body = patchSchema.parse(await req.json());
    const permissions = Array.from(new Set(body.permissions));

    await db.serverAdmin.update({
      where: { id: admin.id },
      data: { permissions: JSON.stringify(permissions) },
    });
    await audit({
      userId: user.id,
      action: "SERVER_ADMIN_UPDATE",
      targetType: "Server",
      targetId: server.id,
      ip: clientIp(headers()),
      meta: { adminId: admin.id, permissions },
    });
    return ok({ success: true, permissions });
  }
);

export const DELETE = handler(
  async (_req: NextRequest, ctx: { params: { id: string; adminId: string } }) => {
    const { server, user } = await requireOwnedServer(ctx.params.id);
    const admin = await db.serverAdmin.findFirst({
      where: { id: ctx.params.adminId, serverId: server.id },
    });
    if (!admin) throw new ApiError(404, "Admin not found");

    await db.serverAdmin.delete({ where: { id: admin.id } });
    await audit({
      userId: user.id,
      action: "SERVER_ADMIN_REMOVE",
      targetType: "Server",
      targetId: server.id,
      ip: clientIp(headers()),
    });
    return ok({ success: true });
  }
);
