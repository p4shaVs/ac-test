// =============================================================================
// Network reputation (global ban network).
//
// A ban issued on one customer's server becomes a *signal* for the others.
// This is the product's main differentiator — but it is built to be
// privacy-first, poison-resistant and false-positive-proof:
//
//   * PRIVACY  — only keyed-HMAC hashes of license/steam/discord are stored
//                (never raw identifiers, never IP). Even a DB leak cannot be
//                brute-forced back to real accounts.
//   * POISONING — a player is only "flagged" once DISTINCT owners have banned
//                them (NETWORK_MIN_OWNERS). One owner banning across their own
//                servers counts once, so a single malicious/mistaken customer
//                cannot brand innocents network-wide.
//   * NO FALSE BANS — the network never bans. It returns a signal; the local
//                server's own policy (config.network.action) decides LOG or
//                KICK. Default is LOG. A locally-corrected ban (unban) clears
//                the contribution so the victim is not flagged forever.
// =============================================================================

import { createHmac } from "crypto";
import { db } from "./db";
import { env } from "./env";
import { parseJson } from "./utils";

export type NetworkAction = "OFF" | "LOG" | "KICK";

export interface NetworkPolicy {
  /** What a connecting flagged player triggers on THIS server. */
  action: NetworkAction;
  /** Whether this server's bans feed the shared network. */
  contribute: boolean;
}

// Ships LOG-only: the network surfaces flags but never blocks by default, so
// enabling it can never cause a false ban. Operators raise it to KICK per server.
export const DEFAULT_NETWORK_POLICY: NetworkPolicy = { action: "LOG", contribute: true };

// Distinct customers (owners) that must have banned an identifier before it is
// treated as a real network signal. Anti-poisoning floor — see file header.
export const NETWORK_MIN_OWNERS = 2;

export function readNetworkPolicy(config: string | null | undefined): NetworkPolicy {
  const parsed = parseJson<Record<string, unknown>>(config ?? "{}", {});
  const n = (parsed.network ?? {}) as Record<string, unknown>;
  const action: NetworkAction =
    n.action === "KICK" || n.action === "OFF" || n.action === "LOG"
      ? n.action
      : DEFAULT_NETWORK_POLICY.action;
  const contribute = typeof n.contribute === "boolean" ? n.contribute : DEFAULT_NETWORK_POLICY.contribute;
  return { action, contribute };
}

/** Clamp arbitrary input to a valid policy (for the settings PATCH). */
export function sanitizeNetworkPolicy(input: unknown): NetworkPolicy {
  const n = (input ?? {}) as Record<string, unknown>;
  const action: NetworkAction =
    n.action === "KICK" || n.action === "OFF" || n.action === "LOG"
      ? n.action
      : DEFAULT_NETWORK_POLICY.action;
  const contribute = typeof n.contribute === "boolean" ? n.contribute : DEFAULT_NETWORK_POLICY.contribute;
  return { action, contribute };
}

// Keyed HMAC (same secret as server tokens): stable within this deployment and
// not reversible via a rainbow table. The "netban:" prefix domain-separates it
// from any other HMAC use of the secret.
function hashIdent(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  return createHmac("sha256", env.LICENSE_HMAC_SECRET).update("netban:" + v).digest("hex");
}

export interface Idents {
  license?: string | null;
  steam?: string | null;
  discord?: string | null;
}

export function hashIdents(ids: Idents) {
  return {
    licenseHash: hashIdent(ids.license),
    steamHash: hashIdent(ids.steam),
    discordHash: hashIdent(ids.discord),
  };
}

type HashWhere = { licenseHash?: string; steamHash?: string; discordHash?: string };

function orFilter(h: { licenseHash: string | null; steamHash: string | null; discordHash: string | null }): HashWhere[] {
  const out: HashWhere[] = [];
  if (h.licenseHash) out.push({ licenseHash: h.licenseHash });
  if (h.steamHash) out.push({ steamHash: h.steamHash });
  if (h.discordHash) out.push({ discordHash: h.discordHash });
  return out;
}

/**
 * Mirror a freshly-created PERMANENT ban into the network — only if this owner
 * contributes. Callers should skip temporary/cooldown bans (a 1-hour ban should
 * not brand someone network-wide).
 */
export async function recordNetworkBan(
  server: { id: string; ownerId: string; config: string },
  ban: Idents & { playerName: string; type?: string }
): Promise<void> {
  if (!readNetworkPolicy(server.config).contribute) return;
  const h = hashIdents(ban);
  if (!h.licenseHash && !h.steamHash && !h.discordHash) return; // nothing to match on
  await db.networkBan.create({
    data: {
      ownerId: server.ownerId,
      serverId: server.id,
      licenseHash: h.licenseHash,
      steamHash: h.steamHash,
      discordHash: h.discordHash,
      type: ban.type ?? "MANUAL",
      playerName: ban.playerName,
    },
  });
}

/**
 * A local unban corrects a mistake — deactivate this owner's matching
 * contributions so a false ban does not leave the player flagged network-wide.
 */
export async function revokeNetworkBan(server: { ownerId: string }, ids: Idents): Promise<void> {
  const or = orFilter(hashIdents(ids));
  if (!or.length) return;
  await db.networkBan.updateMany({
    where: { ownerId: server.ownerId, active: true, OR: or },
    data: { active: false },
  });
}

export interface NetworkReputation {
  flagged: boolean;
  distinctOwners: number;
  totalBans: number;
  topType: string | null;
}

/**
 * Query the network for a connecting player. Excludes the querying owner's own
 * bans (their own history never flags their own player) and counts DISTINCT
 * owners against the anti-poison threshold.
 */
export async function queryNetworkReputation(excludeOwnerId: string, ids: Idents): Promise<NetworkReputation> {
  const or = orFilter(hashIdents(ids));
  if (!or.length) return { flagged: false, distinctOwners: 0, totalBans: 0, topType: null };

  const rows = await db.networkBan.findMany({
    where: { active: true, ownerId: { not: excludeOwnerId }, OR: or },
    select: { ownerId: true, type: true },
    take: 2000,
  });

  const owners = new Set(rows.map((r) => r.ownerId));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  let topType: string | null = null;
  let topN = 0;
  for (const [t, n] of counts) {
    if (n > topN) {
      topN = n;
      topType = t;
    }
  }

  return {
    flagged: owners.size >= NETWORK_MIN_OWNERS,
    distinctOwners: owners.size,
    totalBans: rows.length,
    topType,
  };
}
