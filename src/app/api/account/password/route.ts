import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, requireUser, ApiError } from "@/lib/api";
import { verifyPassword, hashPassword, isStrongPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { clientIp, createSession } from "@/lib/session";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = schema.parse(await req.json());

  if (!isStrongPassword(body.newPassword)) {
    throw new ApiError(422, "New password must be at least 8 characters and contain a letter and a number");
  }

  const dbUser = await db.user.findUnique({ where: { id: user.id } });
  if (!dbUser) throw new ApiError(404, "User not found");

  const valid = await verifyPassword(body.currentPassword, dbUser.passwordHash);
  if (!valid) throw new ApiError(401, "Current password is incorrect");

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword) },
  });

  // Güvenlik: şifre değişince tüm oturumları sonlandır, ardından bu cihaz için
  // yeni bir oturum aç (kullanıcı buradan çıkış yapmasın, diğer cihazlar çıksın).
  await db.session.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await createSession(user.id);

  await audit({
    userId: user.id,
    action: "PASSWORD_CHANGE",
    ip: clientIp(headers()),
  });

  return ok({ success: true });
});
