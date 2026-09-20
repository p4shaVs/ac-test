import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, requireAdmin, ApiError } from "@/lib/api";
import { createProductSchema } from "@/lib/validation";
import { sanitizeFeatures } from "@/lib/features";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

export const POST = handler(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const body = createProductSchema.parse(await req.json());

  const existing = await db.product.findUnique({ where: { slug: body.slug } });
  if (existing) throw new ApiError(409, "That slug is already taken");

  const count = await db.product.count();
  const product = await db.product.create({
    data: {
      slug: body.slug,
      name: body.name,
      description: body.description,
      priceCents: body.priceCents,
      currency: body.currency,
      interval: body.interval,
      features: JSON.stringify(sanitizeFeatures(body.features)),
      active: body.active,
      sortOrder: count,
    },
  });

  await audit({
    userId: admin.id,
    action: "PRODUCT_CREATE",
    targetType: "Product",
    targetId: product.id,
    ip: clientIp(headers()),
  });

  return ok({ id: product.id }, 201);
});
