import { db } from "./db";

export interface Identifiers {
  license?: string | null;
  discord?: string | null;
  steam?: string | null;
  ip?: string | null;
}

/**
 * Oyuncunun herhangi bir kimliği bu sunucunun bypass (whitelist) listesindeyse
 * true döner. Bypass'lı oyuncular otomatik ban/işaretlemeden muaftır.
 */
export async function isWhitelisted(serverId: string, ids: Identifiers): Promise<boolean> {
  const pairs: { kind: string; value: string }[] = [];
  if (ids.license) pairs.push({ kind: "license", value: ids.license });
  if (ids.discord) pairs.push({ kind: "discord", value: ids.discord });
  if (ids.steam) pairs.push({ kind: "steam", value: ids.steam });
  if (ids.ip) pairs.push({ kind: "ip", value: ids.ip });
  if (!pairs.length) return false;

  const hit = await db.whitelist.findFirst({
    where: { serverId, OR: pairs },
    select: { id: true },
  });
  return !!hit;
}
