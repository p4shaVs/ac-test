import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, requireAdmin, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

const schema = z.object({ refund: z.literal(true) });

/**
 * Refund an order: marks it REFUNDED and revokes the licence key it created,
 * so every server using that key stops authenticating on its next call.
 */
export const PATCH = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const admin = await requireAdmin();
    schema.parse(await req.json());

    const order = await db.order.findUnique({ where: { id: ctx.params.id } });
    if (!order) throw new ApiError(404, "Order not found");
    if (order.status === "REFUNDED") throw new ApiError(409, "This order was already refunded");

    await db.$transaction([
      db.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } }),
      ...(order.licenseKeyId
        ? [db.licenseKey.update({ where: { id: order.licenseKeyId }, data: { status: "REVOKED" } })]
        : []),
    ]);

    await audit({
      userId: admin.id,
      action: "ORDER_REFUND",
      targetType: "Order",
      targetId: order.id,
      ip: clientIp(headers()),
      meta: { keyId: order.licenseKeyId },
    });

    return ok({ success: true });
  }
);
