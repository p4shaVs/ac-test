import { db } from "./db";

/**
 * Finds a user by email or username — what an admin types when a customer on
 * Discord says "my panel name is …". Emails are stored lower-case; usernames
 * are compared exactly.
 */
export async function findUserByRef(ref: string) {
  const v = ref.trim();
  if (!v) return null;
  return db.user.findFirst({
    where: { OR: [{ email: v.toLowerCase() }, { username: v }] },
    select: { id: true, email: true, username: true },
  });
}

/** Expiry for a product interval, counted from `from` (null = lifetime). */
export function expiryForInterval(interval: string, from = new Date()): Date | null {
  const day = 24 * 60 * 60 * 1000;
  if (interval === "MONTHLY") return new Date(from.getTime() + 30 * day);
  if (interval === "YEARLY") return new Date(from.getTime() + 365 * day);
  return null; // LIFETIME
}
