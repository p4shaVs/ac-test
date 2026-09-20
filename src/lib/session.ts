import { cookies, headers } from "next/headers";
import { randomUUID } from "crypto";
import { db } from "./db";
import { signSession, verifySession } from "./jwt";

export const SESSION_COOKIE = "aeigs_session";

/**
 * The shared public demo account. Its sessions are always read-only, however
 * they were opened: its password ships in the seed, so a visitor could
 * otherwise sign in through the normal login form and get full write access.
 */
export const DEMO_EMAIL = "demo@aeigs.gg";
const SESSION_DAYS = 7;

export interface CurrentUser {
  id: string;
  email: string;
  username: string;
  role: "USER" | "ADMIN";
  avatarUrl: string | null;
}

/** Kullanıcı için yeni oturum oluşturur: DB kaydı + imzalı cookie. */
export async function createSession(userId: string, opts: { demo?: boolean } = {}): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const hdrs = headers();
  await db.session.create({
    data: {
      jti,
      userId,
      userAgent: hdrs.get("user-agent")?.slice(0, 255) ?? null,
      ip: clientIp(hdrs),
      expiresAt,
    },
  });

  const token = await signSession(
    {
      sub: user.id,
      role: user.role === "ADMIN" ? "ADMIN" : "USER",
      username: user.username,
      jti,
      demo: opts.demo === true || user.email === DEMO_EMAIL,
    },
    `${SESSION_DAYS}d`
  );

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Oturumu sonlandırır (DB'de revoke + cookie temizle). */
export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    const claims = await verifySession(token);
    if (claims?.jti) {
      await db.session
        .updateMany({
          where: { jti: claims.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => {});
    }
  }
  cookies().delete(SESSION_COOKIE);
}

/** Geçerli oturumdaki kullanıcıyı döndürür ya da null. DB doğrulaması yapar. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySession(token);
  if (!claims) return null;

  // Oturum DB'de hâlâ geçerli mi? (revoke / süre)
  const session = await db.session.findUnique({ where: { jti: claims.jti } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  const user = await db.user.findUnique({ where: { id: claims.sub } });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    avatarUrl: user.avatarUrl,
  };
}

export function clientIp(hdrs: Headers): string | null {
  const fwd = hdrs.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return hdrs.get("x-real-ip");
}
