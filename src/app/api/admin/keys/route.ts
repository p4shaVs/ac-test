import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, requireAdmin, ApiError } from "@/lib/api";
import { generateKeySchema } from "@/lib/validation";
import { generateLicenseKey } from "@/lib/keys";
import { sanitizeFeatures } from "@/lib/features";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

/**
 * Admin key generator: seçilen özelliklerle N adet lisans anahtarı üretir.
 * Opsiyonel olarak bir ürüne ve/veya bir kullanıcıya (e-posta) bağlanabilir.
 */
export const POST = handler(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const body = generateKeySchema.parse(await req.json());

  const features = sanitizeFeatures(body.features);

  // Ürün belirtildiyse doğrula ve (özellik verilmediyse) ürün özelliklerini kullan.
  let productId: string | null = null;
  let finalFeatures = features;
  if (body.productId) {
    const product = await db.product.findUnique({ where: { id: body.productId } });
    if (!product) throw new ApiError(404, "Product not found");
    productId = product.id;
    if (finalFeatures.length === 0) {
      finalFeatures = sanitizeFeatures(JSON.parse(product.features || "[]"));
    }
  }

  // Sahip e-postası verildiyse kullanıcıyı bul.
  let ownerId: string | null = null;
  if (body.ownerEmail) {
    const owner = await db.user.findUnique({ where: { email: body.ownerEmail } });
    if (!owner) throw new ApiError(404, "No user found with that email");
    ownerId = owner.id;
  }

  const expiresAt =
    body.expiresInDays != null
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  // Benzersiz anahtarlar üret.
  const created: { id: string; key: string }[] = [];
  for (let i = 0; i < body.quantity; i++) {
    // Çakışma olasılığı çok düşük; yine de birkaç kez dene.
    let key = generateLicenseKey();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await db.licenseKey.findUnique({ where: { key } });
      if (!exists) break;
      key = generateLicenseKey();
    }
    const lk = await db.licenseKey.create({
      data: {
        key,
        productId,
        ownerId,
        status: "UNUSED",
        features: JSON.stringify(finalFeatures),
        maxServers: 1, // her anahtar tek sunucu için
        expiresAt,
        note: body.note,
        createdById: admin.id,
      },
    });
    created.push({ id: lk.id, key: lk.key });
  }

  await audit({
    userId: admin.id,
    action: "KEY_GENERATE",
    ip: clientIp(headers()),
    meta: { quantity: body.quantity, features: finalFeatures, productId, ownerId },
  });

  return ok({ keys: created }, 201);
});
