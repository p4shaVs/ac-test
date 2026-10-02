import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, requireAdmin, ApiError } from "@/lib/api";
import { recordSaleSchema } from "@/lib/validation";
import { generateLicenseKey } from "@/lib/keys";
import { sanitizeFeatures } from "@/lib/features";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { parseJson } from "@/lib/utils";
import { findUserByRef, expiryForInterval } from "@/lib/users";

/**
 * Record a sale closed on Discord: a PAID order plus a licence key that is
 * already on the customer's account (they see it under My Licences straight
 * away — no code to copy between chats). Admin-only; this is the only place
 * besides the key generator where keys are created.
 */
export const POST = handler(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const body = recordSaleSchema.parse(await req.json());

  const customer = await findUserByRef(body.customer);
  if (!customer) {
    throw new ApiError(404, "No account with that email or username — ask the customer to register first.");
  }
  const product = await db.product.findUnique({ where: { id: body.productId } });
  if (!product) throw new ApiError(404, "Product not found");

  const features = sanitizeFeatures(parseJson<string[]>(product.features, []));
  const amountCents = body.amountCents ?? product.priceCents;

  const result = await db.$transaction(async (tx) => {
    let key = generateLicenseKey();
    for (let i = 0; i < 5 && (await tx.licenseKey.findUnique({ where: { key } })); i++) {
      key = generateLicenseKey();
    }
    const license = await tx.licenseKey.create({
      data: {
        key,
        productId: product.id,
        ownerId: customer.id,
        status: "UNUSED",
        features: JSON.stringify(features),
        maxServers: body.maxServers,
        expiresAt: expiryForInterval(product.interval),
        note: `Sale: ${product.name}${body.reference ? ` — ${body.reference}` : ""}`,
        createdById: admin.id,
      },
    });
    const order = await tx.order.create({
      data: {
        userId: customer.id,
        productId: product.id,
        status: "PAID",
        amountCents,
        currency: product.currency,
        provider: "DISCORD",
        externalRef: body.reference || null,
        licenseKeyId: license.id,
        paidAt: new Date(),
      },
    });
    return { license, order };
  });

  await audit({
    userId: admin.id,
    action: "SALE_RECORD",
    targetType: "Order",
    targetId: result.order.id,
    ip: clientIp(headers()),
    meta: { customer: customer.id, productId: product.id, amountCents, keyId: result.license.id },
  });

  return ok(
    { orderId: result.order.id, key: result.license.key, customer: customer.username },
    201
  );
});
