import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { ADMIN_PERMISSIONS, ROLE_DEFAULTS } from "@/lib/admin-perms";

// Permissions + role defaults live in src/lib/admin-perms.ts (shared with the
// Admins page). The resource re-checks every one of them server-side.

const schema = z.object({
  identifier: z.string().trim().min(2).max(120),
  displayName: z.string().trim().max(60).optional(),
  role: z.enum(["OWNER", "ADMIN", "MODERATOR"]).default("MODERATOR"),
  permissions: z.array(z.enum(ADMIN_PERMISSIONS)).optional(),
});

export const POST = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { server, user } = await requireOwnedServer(ctx.params.id);
    const body = schema.parse(await req.json());

    const exists = await db.serverAdmin.findFirst({
      where: { serverId: server.id, identifier: body.identifier },
    });
    if (exists) throw new ApiError(409, "That identifier is already an admin");

    const perms = body.permissions?.length ? body.permissions : ROLE_DEFAULTS[body.role];
    const admin = await db.serverAdmin.create({
      data: {
        serverId: server.id,
        identifier: body.identifier,
        displayName: body.displayName,
        role: body.role,
        permissions: JSON.stringify(perms),
      },
    });

    await audit({
      userId: user.id,
      action: "SERVER_ADMIN_ADD",
      targetType: "Server",
      targetId: server.id,
      ip: clientIp(headers()),
      meta: { identifier: body.identifier, role: body.role },
    });

    return ok({ id: admin.id }, 201);
  }
);
