import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, requireUser, ApiError } from "@/lib/api";
import { generateLicenseKey } from "@/lib/keys";
import { sanitizeFeatures } from "@/lib/features";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { parseJson } from "@/lib/utils";
import { clientIp } from "@/lib/session";
import { headers } from "next/headers";

const schema = z.object({ productId: z.string().min(1) });

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();

  const ip = clientIp(headers()) ?? "unknown";
  const rl = rateLimit(`checkout:${user.id}:${ip}`, 10, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many requests, please wait");

  const body = schema.parse(await req.json());

  const product = await db.product.findFirst({
    where: { id: body.productId, active: true },
  });
  if (!product) throw new ApiError(404, "Product not found");

  const features = sanitizeFeatures(parseJson<string[]>(product.features, []));

  // Süre hesabı
  let expiresAt: Date | null = null;
  if (product.interval === "MONTHLY") {
    expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  } else if (product.interval === "YEARLY") {
    expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  } // LIFETIME → null

  // Demo/manuel ödeme: sipariş + lisans anahtarı tek transaction'da.
  const result = await db.$transaction(async (tx) => {
    const license = await tx.licenseKey.create({
      data: {
        key: generateLicenseKey(),
        productId: product.id,
        ownerId: user.id,
        status: "UNUSED",
        features: JSON.stringify(features),
        maxServers: 1,
        expiresAt,
        note: `Purchase: ${product.name}`,
      },
    });

    const order = await tx.order.create({
      data: {
        userId: user.id,
        productId: product.id,
        status: "PAID", // gerçek ödeme entegrasyonuna kadar manuel onay
        amountCents: product.priceCents,
        currency: product.currency,
        provider: "MANUAL",
        licenseKeyId: license.id,
        paidAt: new Date(),
      },
    });

    return { license, order };
  });

  await audit({
    userId: user.id,
    action: "CHECKOUT",
    targetType: "Order",
    targetId: result.order.id,
    ip,
    meta: { productId: product.id, keyId: result.license.id },
  });

  return ok({ licenseKey: result.license.key, orderId: result.order.id }, 201);
});
