import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, requireUser, ApiError } from "@/lib/api";
import { redeemSchema } from "@/lib/validation";
import { isValidKeyFormat } from "@/lib/keys";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const ip = clientIp(headers()) ?? "unknown";

  // Kod tahminini engellemek için sıkı rate limit. Anahtar YALNIZCA kullanıcıya
  // bağlı: X-Forwarded-For istemci tarafından yazılabildiği için IP'yi anahtara
  // katmak, her istekte farklı IP uydurarak limiti sıfırlamaya izin veriyordu.
  const rl = rateLimit(`redeem:${user.id}`, 8, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many attempts, please wait");

  const body = redeemSchema.parse(await req.json());
  if (!isValidKeyFormat(body.key)) {
    throw new ApiError(400, "Invalid key format");
  }

  const license = await db.licenseKey.findUnique({ where: { key: body.key } });
  if (!license) throw new ApiError(404, "Key not found");

  if (license.status === "REVOKED") throw new ApiError(410, "This key has been revoked");
  if (license.status === "SUSPENDED") throw new ApiError(403, "This key is suspended");
  if (license.status === "EXPIRED" || (license.expiresAt && license.expiresAt < new Date())) {
    throw new ApiError(410, "This key has expired");
  }

  if (license.ownerId === user.id) {
    throw new ApiError(409, "This key is already on your account");
  }
  if (license.ownerId) {
    throw new ApiError(409, "This key is already tied to another account");
  }

  // ATOMİK sahiplenme: yalnızca hâlâ sahipsizse güncelle. findUnique ile update
  // arasında başka bir hesap aynı anahtarı kullanırsa ikisi de "başarılı"
  // görüyordu ve son yazan kazanıyordu.
  const claimed = await db.licenseKey.updateMany({
    where: { id: license.id, ownerId: null },
    data: { ownerId: user.id },
  });
  if (claimed.count !== 1) {
    throw new ApiError(409, "This key is already tied to another account");
  }

  await audit({
    userId: user.id,
    action: "REDEEM",
    targetType: "LicenseKey",
    targetId: license.id,
    ip,
  });

  return ok({ licenseKeyId: license.id });
});
