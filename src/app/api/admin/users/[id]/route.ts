import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, requireAdmin, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

const patchSchema = z.object({
  role: z.enum(["USER", "ADMIN"]).optional(),
  unlock: z.boolean().optional(),
  /** Ends every active session of the user (e.g. after a leaked password). */
  revokeSessions: z.boolean().optional(),
});

export const PATCH = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const admin = await requireAdmin();
    const body = patchSchema.parse(await req.json());

    const target = await db.user.findUnique({ where: { id: ctx.params.id } });
    if (!target) throw new ApiError(404, "User not found");

    // Kendini admin'likten düşürerek kilitlenmeyi engelle.
    if (body.role === "USER" && target.id === admin.id) {
      throw new ApiError(400, "You cannot remove your own admin permissions");
    }
    // Son admini korumak.
    if (body.role === "USER" && target.role === "ADMIN") {
      const adminCount = await db.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) throw new ApiError(400, "At least one admin must remain");
    }

    await db.user.update({
      where: { id: target.id },
      data: {
        role: body.role ?? target.role,
        ...(body.unlock ? { failedLogins: 0, lockedUntil: null } : {}),
      },
    });

    let revoked = 0;
    if (body.revokeSessions) {
      const r = await db.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      revoked = r.count;
    }

    await audit({
      userId: admin.id,
      action: "USER_UPDATE",
      targetType: "User",
      targetId: target.id,
      ip: clientIp(headers()),
      meta: { role: body.role, unlock: body.unlock, revokedSessions: body.revokeSessions ? revoked : undefined },
    });

    return ok({ success: true, revokedSessions: revoked });
  }
);
