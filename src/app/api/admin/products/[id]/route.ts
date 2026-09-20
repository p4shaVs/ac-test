import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, requireAdmin, ApiError } from "@/lib/api";
import { sanitizeFeatures, FEATURE_KEYS } from "@/lib/features";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  description: z.string().trim().min(2).max(500).optional(),
  priceCents: z.number().int().min(0).max(1_000_000).optional(),
  currency: z.string().trim().length(3).optional(),
  interval: z.enum(["MONTHLY", "YEARLY", "LIFETIME"]).optional(),
  features: z.array(z.enum(FEATURE_KEYS as [string, ...string[]])).optional(),
  active: z.boolean().optional(),
});

export const PATCH = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const admin = await requireAdmin();
    const body = patchSchema.parse(await req.json());
    const product = await db.product.findUnique({ where: { id: ctx.params.id } });
    if (!product) throw new ApiError(404, "Product not found");

    await db.product.update({
      where: { id: product.id },
      data: {
        name: body.name ?? product.name,
        description: body.description ?? product.description,
        priceCents: body.priceCents ?? product.priceCents,
        currency: body.currency ?? product.currency,
        interval: body.interval ?? product.interval,
        features: body.features ? JSON.stringify(sanitizeFeatures(body.features)) : product.features,
        active: body.active ?? product.active,
      },
    });

    await audit({
      userId: admin.id,
      action: "PRODUCT_UPDATE",
      targetType: "Product",
      targetId: product.id,
      ip: clientIp(headers()),
    });

    return ok({ success: true });
  }
);

export const DELETE = handler(
  async (_req: NextRequest, ctx: { params: { id: string } }) => {
    const admin = await requireAdmin();
    const product = await db.product.findUnique({
      where: { id: ctx.params.id },
      include: { _count: { select: { orders: true, licenseKeys: true } } },
    });
    if (!product) throw new ApiError(404, "Product not found");
    if (product._count.orders > 0 || product._count.licenseKeys > 0) {
      // Sipariş/anahtar bağlıysa silme, pasifleştir.
      await db.product.update({ where: { id: product.id }, data: { active: false } });
    } else {
      await db.product.delete({ where: { id: product.id } });
    }
    await audit({
      userId: admin.id,
      action: "PRODUCT_DELETE",
      targetType: "Product",
      targetId: product.id,
      ip: clientIp(headers()),
    });
    return ok({ success: true });
  }
);
