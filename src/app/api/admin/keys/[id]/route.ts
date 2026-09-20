import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, requireAdmin, ApiError } from "@/lib/api";
import { updateKeySchema } from "@/lib/validation";
import { sanitizeFeatures } from "@/lib/features";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

export const PATCH = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const admin = await requireAdmin();
    const body = updateKeySchema.parse(await req.json());

    const key = await db.licenseKey.findUnique({ where: { id: ctx.params.id } });
    if (!key) throw new ApiError(404, "Key not found");

    await db.licenseKey.update({
      where: { id: key.id },
      data: {
        status: body.status ?? key.status,
        features: body.features ? JSON.stringify(sanitizeFeatures(body.features)) : key.features,
        note: body.note ?? key.note,
      },
    });

    await audit({
      userId: admin.id,
      action: "KEY_UPDATE",
      targetType: "LicenseKey",
      targetId: key.id,
      ip: clientIp(headers()),
      meta: { status: body.status },
    });

    return ok({ success: true });
  }
);

export const DELETE = handler(
  async (_req: NextRequest, ctx: { params: { id: string } }) => {
    const admin = await requireAdmin();
    const key = await db.licenseKey.findUnique({
      where: { id: ctx.params.id },
      include: { servers: true },
    });
    if (!key) throw new ApiError(404, "Key not found");
    if (key.servers.length > 0) {
      throw new ApiError(409, "Servers are still attached to this key. Remove them first.");
    }
    await db.licenseKey.delete({ where: { id: key.id } });
    await audit({
      userId: admin.id,
      action: "KEY_DELETE",
      targetType: "LicenseKey",
      targetId: key.id,
      ip: clientIp(headers()),
    });
    return ok({ success: true });
  }
);
