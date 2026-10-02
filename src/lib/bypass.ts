import { db } from "./db";
import { DETECTION_CATEGORIES, DETECTION_TYPES } from "./detection-actions";

export interface Identifiers {
  license?: string | null;
  discord?: string | null;
  steam?: string | null;
  ip?: string | null;
}

// A whitelist entry's scope: [] = exempt from everything (the original
// behaviour, so existing entries keep working). Otherwise a list of
// "cat:<category>" and/or detection types the player is exempt from.
const CATEGORY_IDS = new Set<string>(DETECTION_CATEGORIES.map((c) => c.id));
const TYPE_CATEGORY = new Map(DETECTION_TYPES.map((d) => [d.type, d.category]));

/** Keeps only known categories/types; duplicates and junk are dropped. */
export function sanitizeScope(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const v of input) {
    if (typeof v !== "string") continue;
    if (v.startsWith("cat:") ? CATEGORY_IDS.has(v.slice(4)) : TYPE_CATEGORY.has(v)) out.add(v);
    if (out.size >= 150) break;
  }
  return [...out];
}

export function parseScope(json: string | null | undefined): string[] {
  try {
    return sanitizeScope(JSON.parse(json || "[]"));
  } catch {
    return [];
  }
}

/** Does this scope exempt the player from `type`? */
export function scopeCovers(scope: string[], type: string): boolean {
  if (!scope.length) return true;
  if (scope.includes(type)) return true;
  const cat = TYPE_CATEGORY.get(type);
  return !!cat && scope.includes(`cat:${cat}`);
}

/**
 * True when one of the player's identifiers is on this server's trust
 * whitelist AND that entry covers the detection `type` (entries without a
 * scope cover everything). Without `type`, only full-scope entries count.
 */
export async function isWhitelisted(serverId: string, ids: Identifiers, type?: string): Promise<boolean> {
  const pairs: { kind: string; value: string }[] = [];
  if (ids.license) pairs.push({ kind: "license", value: ids.license });
  if (ids.discord) pairs.push({ kind: "discord", value: ids.discord });
  if (ids.steam) pairs.push({ kind: "steam", value: ids.steam });
  if (ids.ip) pairs.push({ kind: "ip", value: ids.ip });
  if (!pairs.length) return false;

  const hits = await db.whitelist.findMany({
    where: { serverId, OR: pairs },
    select: { scope: true },
  });
  return hits.some((h) => {
    const scope = parseScope(h.scope);
    return type ? scopeCovers(scope, type) : scope.length === 0;
  });
}
