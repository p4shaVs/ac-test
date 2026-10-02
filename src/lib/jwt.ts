import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

// Oturum JWT'leri. jose kullanıyoruz çünkü hem Node hem Edge runtime'da çalışır
// (middleware Edge'de çalışır).
//
// ÖNEMLİ: Sır (secret) TEMBEL (lazy) okunur. `env.AUTH_SECRET`'i modül import
// anında okursak, Next.js build sırasında "Collecting page data" aşamasında
// (env henüz enjekte edilmemişken) env doğrulaması patlar ve build çöker.
// Bunun yerine sırrı ilk imzalama/doğrulama anında çözüp önbelleğe alıyoruz.
let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!cachedSecret) {
    cachedSecret = new TextEncoder().encode(env.AUTH_SECRET);
  }
  return cachedSecret;
}
const ISSUER = "coreac";
const AUDIENCE = "coreac-web";

export interface SessionClaims {
  sub: string; // user id
  role: "USER" | "ADMIN";
  username: string;
  jti: string; // session id (revoke için)
  /** Public demo session: the panel is browsable but every write is refused. */
  demo?: boolean;
}

export async function signSession(
  claims: SessionClaims,
  expiresIn = "7d"
): Promise<string> {
  return new SignJWT({ role: claims.role, username: claims.username, demo: claims.demo === true })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setJti(claims.jti)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function verifySession(
  token: string
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.sub || !payload.jti) return null;
    return {
      sub: payload.sub,
      jti: payload.jti as string,
      role: (payload.role as "USER" | "ADMIN") ?? "USER",
      username: (payload.username as string) ?? "",
      demo: payload.demo === true,
    };
  } catch {
    return null;
  }
}
