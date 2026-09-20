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

  // Kod tahminini engellemek için sıkı rate limit.
  const rl = rateLimit(`redeem:${user.id}:${ip}`, 8, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many attempts, please wait");

  const body = redeemSchema.parse(await req.json());
  if (!isValidKeyFormat(body.key)) {
    throw new ApiError(400, "Invalid key format");
  }

  const license = await db.licenseKey.findUnique({ where: { key: body.key } });
  if (!license) throw new ApiError(404, "Key not found");

  if (license.status === "REVOKED") throw new ApiError(410, "This key has been revoked");
  if (license.expiresAt && license.expiresAt < new Date()) {
    throw new ApiError(410, "This key has expired");
  }

  if (license.ownerId && license.ownerId !== user.id) {
    throw new ApiError(409, "This key is already tied to another account");
  }
  if (license.ownerId === user.id) {
    throw new ApiError(409, "This key is already on your account");
  }

  await db.licenseKey.update({
    where: { id: license.id },
    data: { ownerId: user.id },
  });

  await audit({
    userId: user.id,
    action: "REDEEM",
    targetType: "LicenseKey",
    targetId: license.id,
    ip,
  });

  return ok({ licenseKeyId: license.id });
});
