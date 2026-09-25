import { randomBytes, createHmac, randomUUID } from "crypto";
import { env } from "./env";

// Karışıklık yaratan karakterler (0/O, 1/I) çıkarıldı.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PREFIX = "COREAC";

function randomBlock(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** COREAC-XXXX-XXXX-XXXX-XXXX biçiminde kriptografik rastgele lisans üretir. */
export function generateLicenseKey(): string {
  return `${PREFIX}-${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}`;
}

// Ürün yeniden adlandırılmadan önce satılan "AEIGS-" önekli anahtarlar geçerli
// kalır; yeni anahtarlar yalnızca COREAC- ile üretilir.
const KEY_REGEX = /^(COREAC|AEIGS)-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
export function isValidKeyFormat(key: string): boolean {
  return KEY_REGEX.test(key);
}

// Sunucu API token önekleri. Kurulu sunucuların server.cfg'sindeki eski
// "aeigs_srv_" token'lar çalışmaya devam eder (DB'de yalnızca HMAC hash var,
// önek doğrulamayı etkilemez); yenileri "coreac_srv_" ile üretilir.
export const SERVER_TOKEN_PREFIX = "coreac_srv_";
const LEGACY_SERVER_TOKEN_PREFIX = "aeigs_srv_";

/** Bir değer sunucu API token'ı biçiminde mi (yeni ya da eski önek)? */
export function looksLikeServerToken(token: string): boolean {
  return token.startsWith(SERVER_TOKEN_PREFIX) || token.startsWith(LEGACY_SERVER_TOKEN_PREFIX);
}

/**
 * Sunucu API token'ı üretir. Ham token yalnızca bir kez döndürülür; DB'de
 * yalnızca HMAC hash saklanır (sızıntı durumunda token'lar kullanılamaz).
 */
export function generateServerToken(): { token: string; hash: string } {
  const token = `${SERVER_TOKEN_PREFIX}${randomUUID().replace(/-/g, "")}${randomBlock(8)}`;
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHmac("sha256", env.LICENSE_HMAC_SECRET).update(token).digest("hex");
}

/** Oyuncuya gösterilecek kısa ban kodu (örn. AC-7K3QP9). */
export function generateBanCode(): string {
  return `AC-${randomBlock(6)}`;
}
