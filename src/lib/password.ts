import bcrypt from "bcryptjs";

// Şifre politikası: en az 8 karakter, harf + rakam. Referans panellerdeki
// gibi güvenliği ön planda tutuyoruz.
const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Şifre gücü kontrolü — kayıt/parola değiştirmede kullanılır. */
export function isStrongPassword(pw: string): boolean {
  return (
    pw.length >= 8 &&
    /[A-Za-z]/.test(pw) &&
    /[0-9]/.test(pw)
  );
}
