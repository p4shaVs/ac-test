import { randomBytes, createHmac, randomUUID } from "crypto";
import { env } from "./env";

// Karışıklık yaratan karakterler (0/O, 1/I) çıkarıldı.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PREFIX = "AEIGS";

function randomBlock(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** AEIGS-XXXX-XXXX-XXXX-XXXX biçiminde kriptografik rastgele lisans üretir. */
export function generateLicenseKey(): string {
  return `${PREFIX}-${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}`;
}

const KEY_REGEX = /^AEIGS-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
export function isValidKeyFormat(key: string): boolean {
  return KEY_REGEX.test(key);
}

/**
 * Sunucu API token'ı üretir. Ham token yalnızca bir kez döndürülür; DB'de
 * yalnızca HMAC hash saklanır (sızıntı durumunda token'lar kullanılamaz).
 */
export function generateServerToken(): { token: string; hash: string } {
  const token = `aeigs_srv_${randomUUID().replace(/-/g, "")}${randomBlock(8)}`;
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHmac("sha256", env.LICENSE_HMAC_SECRET).update(token).digest("hex");
}

/** Oyuncuya gösterilecek kısa ban kodu (örn. AC-7K3QP9). */
export function generateBanCode(): string {
  return `AC-${randomBlock(6)}`;
}
