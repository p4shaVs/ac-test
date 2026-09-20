import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

// Oturum JWT'leri. jose kullanıyoruz çünkü hem Node hem Edge runtime'da çalışır
// (middleware Edge'de çalışır).
const secret = new TextEncoder().encode(env.AUTH_SECRET);
const ISSUER = "aeigs-anticheat";
const AUDIENCE = "aeigs-web";

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
    .sign(secret);
}

export async function verifySession(
  token: string
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
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
