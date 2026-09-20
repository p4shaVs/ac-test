import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/password";
import { createSession, clientIp } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const POST = handler(async (req: NextRequest) => {
  const ip = clientIp(headers()) ?? "unknown";
  // IP başına brute-force koruması.
  const rl = rateLimit(`login:${ip}`, 10, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many attempts, please wait");

  const body = loginSchema.parse(await req.json());
  const id = body.emailOrUsername.toLowerCase();

  const user = await db.user.findFirst({
    where: { OR: [{ email: id }, { username: body.emailOrUsername }] },
  });

  // Kullanıcı yoksa da aynı jenerik hatayı ver (enumeration engeli).
  if (!user) {
    await audit({ action: "LOGIN_FAIL", ip, meta: { id } });
    throw new ApiError(401, "Email/username or password is incorrect");
  }

  // Hesap kilitli mi?
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(
      423,
      "Too many failed sign-ins. The account is temporarily locked."
    );
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed,
        lockedUntil:
          failed >= MAX_FAILED
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
            : null,
      },
    });
    await audit({ userId: user.id, action: "LOGIN_FAIL", ip });
    throw new ApiError(401, "Email/username or password is incorrect");
  }

  // Başarılı: sayaçları sıfırla, oturum aç.
  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id);
  await audit({ userId: user.id, action: "LOGIN", ip });

  return ok({ id: user.id, role: user.role });
});
