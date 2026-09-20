import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/password";
import { createSession, clientIp } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const POST = handler(async (req: NextRequest) => {
  const ip = clientIp(headers()) ?? "unknown";
  const rl = rateLimit(`register:${ip}`, 5, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many attempts, please wait");

  const body = registerSchema.parse(await req.json());

  // İlk kullanıcı otomatik ADMIN olsun (kurulum kolaylığı).
  const userCount = await db.user.count();
  const role = userCount === 0 ? "ADMIN" : "USER";

  const existing = await db.user.findFirst({
    where: {
      OR: [{ email: body.email }, { username: body.username }],
    },
    select: { email: true, username: true },
  });
  if (existing) {
    const field = existing.email === body.email ? "Email" : "Username";
    throw new ApiError(409, `${field} is already taken`, "DUPLICATE");
  }

  const user = await db.user.create({
    data: {
      email: body.email,
      username: body.username,
      passwordHash: await hashPassword(body.password),
      role,
    },
  });

  await createSession(user.id);
  await audit({ userId: user.id, action: "REGISTER", ip });

  return ok({ id: user.id, role: user.role }, 201);
});
