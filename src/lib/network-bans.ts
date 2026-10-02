// =============================================================================
// CoreAC Network — the shared ban network.
//
// A ban issued on one customer's server becomes a *signal* for the others.
// This is the product's main differentiator — but it is built to be
// privacy-first, poison-resistant and false-positive-proof:
//
//   * PRIVACY  — only keyed-HMAC hashes of license/steam/discord are stored
//                (never raw identifiers, never IP). Another customer's server
//                is never named to anyone: the network answers with counts and
//                detection categories only.
//   * POISONING — a player is only "flagged" once DISTINCT owners have banned
//                them (NETWORK_MIN_OWNERS). One owner banning across their own
//                servers counts once, so a single malicious/mistaken customer
//                cannot brand innocents network-wide.
//   * FAIRNESS — the network is about CHEATING. A staff ban whose reason is
//                about behaviour (toxicity, RDM, griefing…) is never shared;
//                a staff ban with an unclear reason is shared but only makes a
//                "weak" flag. Bans older than NETWORK_WINDOW_DAYS stop counting.
//   * NO FALSE BANS — the network never bans. It returns a signal; the local
//                server's own policy (config.network) decides LOG or KICK, and
//                by default only a "strong" flag — at least two communities
//                with automatic detections or cheat bans — can block. A locally
//                corrected ban (unban) clears the contribution.
//   * LIVE     — when a ban makes a player flagged, every OTHER community where
//                that player is online right now is told at once (pushToOnline),
//                instead of waiting for their next connect.
// =============================================================================

import { createHmac } from "crypto";
import { db } from "./db";
import { env } from "./env";
import { parseJson } from "./utils";
import { sendWebhook } from "./discord";
import { detectionLabel, severityForType } from "./detection-actions";

export type NetworkAction = "OFF" | "LOG" | "KICK";

export interface NetworkPolicy {
  /** What a connecting flagged player triggers on THIS server. */
  action: NetworkAction;
  /** Whether this server's bans feed the shared network. */
  contribute: boolean;
  /** Block (KICK) only strong flags — weak ones are logged. */
  strongOnly: boolean;
}

// Ships LOG-only: the network surfaces flags but never blocks by default, so
// enabling it can never cause a false ban. Operators raise it to KICK per server.
export const DEFAULT_NETWORK_POLICY: NetworkPolicy = { action: "LOG", contribute: true, strongOnly: true };

// Distinct customers (owners) that must have banned an identifier before it is
// treated as a real network signal. Anti-poisoning floor — see file header.
export const NETWORK_MIN_OWNERS = 2;

/** Bans older than this keep their history but no longer count toward a flag. */
export const NETWORK_WINDOW_DAYS = 365;

/**
 * Connection gate (Configuration → Settings → Connection & Identity): a player's
 * network reputation is 100 minus this many points for every OTHER server owner
 * that banned them. 35 → two owners = 30, so "Min Reputation Score 50" keeps out
 * exactly what the network flag already considers flagged, while one owner's ban
 * alone (65) never blocks anyone.
 */
export const REPUTATION_PENALTY_PER_OWNER = 35;

/** Reputation score (0-100) for a player banned by `owners` other server owners. */
export function reputationScore(owners: number): number {
  return Math.max(0, 100 - REPUTATION_PENALTY_PER_OWNER * Math.max(0, owners));
}

export function readNetworkPolicy(config: string | null | undefined): NetworkPolicy {
  const parsed = parseJson<Record<string, unknown>>(config ?? "{}", {});
  return sanitizeNetworkPolicy(parsed.network);
}

/** Clamp arbitrary input to a valid policy (missing fields → defaults). */
export function sanitizeNetworkPolicy(input: unknown): NetworkPolicy {
  const n = (input ?? {}) as Record<string, unknown>;
  const action: NetworkAction =
    n.action === "KICK" || n.action === "OFF" || n.action === "LOG" ? n.action : DEFAULT_NETWORK_POLICY.action;
  const contribute = typeof n.contribute === "boolean" ? n.contribute : DEFAULT_NETWORK_POLICY.contribute;
  const strongOnly = typeof n.strongOnly === "boolean" ? n.strongOnly : DEFAULT_NETWORK_POLICY.strongOnly;
  return { action, contribute, strongOnly };
}

// ---------------------------------------------------------------------------
// What kind of ban is shared
// ---------------------------------------------------------------------------

// Staff ban reasons are free text (any language). Cheat words win over
// behaviour words: "toxic and aimbot" is a cheat ban.
const CHEAT_REASON =
  /(cheat|hack|hile|aim ?bot|silent ?aim|trigger ?bot|\besp\b|wall ?hack|god ?mode|no ?clip|teleport|speed ?hack|executor|inject|lua ?menu|mod ?menu|cheat ?menu|exploit|spoof|dupe|duplicat|evasion|rapid ?fire|modded|money ?drop|crash|bypass|ban ?kaç|eulen|redengine|skript)/i;
const CONDUCT_REASON =
  /(toxic|insult|harass|racis|grief|\brdm\b|\bvdm\b|fail ?rp|metagam|powergam|troll|\bspam|küfür|kufur|hakaret|ırkçı|irkci|taciz|\bnlr\b|combat ?log|disrespect|rule ?break|kural|saygısız|saygisiz)/i;

export type NetworkBanKind = "MANUAL_CHEAT" | "MANUAL_CONDUCT" | "MANUAL";

/** Network type for a staff ban, from its reason. */
export function networkTypeForManual(reason: string | null | undefined): NetworkBanKind {
  const r = reason ?? "";
  if (CHEAT_REASON.test(r)) return "MANUAL_CHEAT";
  if (CONDUCT_REASON.test(r)) return "MANUAL_CONDUCT";
  return "MANUAL";
}

/** An automatic CoreAC detection (any type that is not a staff ban). */
function isAutomatic(type: string): boolean {
  return !type.startsWith("MANUAL");
}

/** Automatic detections and staff bans for cheating are evidence; unclear staff bans are not. */
function isEvidence(type: string): boolean {
  return isAutomatic(type) || type === "MANUAL_CHEAT";
}

/** Human label for a network type. */
export function networkTypeLabel(type: string): string {
  if (type === "MANUAL_CHEAT") return "Staff ban — cheating";
  if (type === "MANUAL_CONDUCT") return "Staff ban — behaviour";
  if (type === "MANUAL") return "Staff ban";
  return detectionLabel(type);
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Reputation
// ---------------------------------------------------------------------------

export type FlagStrength = "none" | "weak" | "strong";

export interface NetworkReputation {
  /** ≥ NETWORK_MIN_OWNERS distinct other owners banned them inside the window. */
  flagged: boolean;
  /** strong = enough of those owners have evidence (automatic detection / cheat ban). */
  strength: FlagStrength;
  distinctOwners: number;
  evidenceOwners: number;
  totalBans: number;
  automatic: number;
  manual: number;
  /** Most common type inside the window (raw type, see networkTypeLabel). */
  topType: string | null;
  /** Types inside the window, most common first. */
  categories: { type: string; label: string; count: number }[];
  firstBanAt: string | null;
  lastBanAt: string | null;
  /** Bans outside the window — history only, they no longer count. */
  olderBans: number;
}

const EMPTY: NetworkReputation = {
  flagged: false,
  strength: "none",
  distinctOwners: 0,
  evidenceOwners: 0,
  totalBans: 0,
  automatic: 0,
  manual: 0,
  topType: null,
  categories: [],
  firstBanAt: null,
  lastBanAt: null,
  olderBans: 0,
};

type Row = { ownerId: string; type: string; createdAt: Date };

/** Pure: reputation from a player's network rows (other owners only). */
export function summarise(rows: Row[], now = Date.now()): NetworkReputation {
  const cutoff = now - NETWORK_WINDOW_DAYS * 86_400_000;
  const live = rows.filter((r) => r.createdAt.getTime() >= cutoff && r.type !== "MANUAL_CONDUCT");
  const older = rows.length - live.length;
  if (!live.length) return { ...EMPTY, olderBans: older };

  const owners = new Set(live.map((r) => r.ownerId));
  const evidenceOwners = new Set(live.filter((r) => isEvidence(r.type)).map((r) => r.ownerId));
  const counts = new Map<string, number>();
  for (const r of live) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  const categories = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, label: networkTypeLabel(type), count }));
  const times = live.map((r) => r.createdAt.getTime()).sort((a, b) => a - b);
  const flagged = owners.size >= NETWORK_MIN_OWNERS;
  return {
    flagged,
    strength: !flagged ? "none" : evidenceOwners.size >= NETWORK_MIN_OWNERS ? "strong" : "weak",
    distinctOwners: owners.size,
    evidenceOwners: evidenceOwners.size,
    totalBans: live.length,
    automatic: live.filter((r) => isAutomatic(r.type)).length,
    manual: live.filter((r) => !isAutomatic(r.type)).length,
    topType: categories[0]?.type ?? null,
    categories,
    firstBanAt: new Date(times[0]).toISOString(),
    lastBanAt: new Date(times[times.length - 1]).toISOString(),
    olderBans: older,
  };
}

/**
 * Query the network for one player. Excludes the querying owner's own bans
 * (their own history never flags their own player) and counts DISTINCT owners
 * against the anti-poison threshold.
 */
export async function queryNetworkReputation(excludeOwnerId: string, ids: Idents): Promise<NetworkReputation> {
  const or = orFilter(hashIdents(ids));
  if (!or.length) return { ...EMPTY };
  const rows = await db.networkBan.findMany({
    where: { active: true, ownerId: { not: excludeOwnerId }, OR: or },
    select: { ownerId: true, type: true, createdAt: true },
    take: 2000,
  });
  return summarise(rows);
}

/** Reputation for many players at once (one query) — Network page "online now". */
export async function queryNetworkReputations(
  excludeOwnerId: string,
  players: (Idents & { id: string })[]
): Promise<Map<string, NetworkReputation>> {
  const hashed = players.map((p) => ({ id: p.id, ...hashIdents(p) }));
  const lic = hashed.map((h) => h.licenseHash).filter(Boolean) as string[];
  const steam = hashed.map((h) => h.steamHash).filter(Boolean) as string[];
  const disc = hashed.map((h) => h.discordHash).filter(Boolean) as string[];
  const out = new Map<string, NetworkReputation>();
  if (!lic.length && !steam.length && !disc.length) return out;
  const rows = await db.networkBan.findMany({
    where: {
      active: true,
      ownerId: { not: excludeOwnerId },
      OR: [
        ...(lic.length ? [{ licenseHash: { in: lic } }] : []),
        ...(steam.length ? [{ steamHash: { in: steam } }] : []),
        ...(disc.length ? [{ discordHash: { in: disc } }] : []),
      ],
    },
    select: { ownerId: true, type: true, createdAt: true, licenseHash: true, steamHash: true, discordHash: true },
    take: 5000,
  });
  for (const h of hashed) {
    const mine = rows.filter(
      (r) =>
        (h.licenseHash && r.licenseHash === h.licenseHash) ||
        (h.steamHash && r.steamHash === h.steamHash) ||
        (h.discordHash && r.discordHash === h.discordHash)
    );
    if (mine.length) out.set(h.id, summarise(mine));
  }
  return out;
}

/** What a flag does on a server with this policy. */
export function decideNetworkAction(policy: NetworkPolicy, rep: NetworkReputation): "LOG" | "KICK" {
  if (policy.action !== "KICK") return "LOG";
  if (policy.strongOnly && rep.strength !== "strong") return "LOG";
  return "KICK";
}

/** One line for logs, webhooks and the kick message — never names another server. */
export function describeFlag(rep: NetworkReputation): string {
  const top = rep.categories.slice(0, 3).map((c) => `${c.label}${c.count > 1 ? ` ×${c.count}` : ""}`).join(", ");
  return `banned on ${rep.distinctOwners} other CoreAC communit${rep.distinctOwners === 1 ? "y" : "ies"}${top ? ` (${top})` : ""}`;
}

// ---------------------------------------------------------------------------
// Contributing
// ---------------------------------------------------------------------------

/**
 * Mirror a freshly-created PERMANENT ban into the network — only if this owner
 * contributes. Callers should skip temporary/cooldown bans (a 1-hour ban should
 * not brand someone network-wide). Behaviour bans are never shared. Afterwards
 * every other community where the player is online now is told (no await on
 * the caller's critical path beyond the insert).
 */
export async function recordNetworkBan(
  server: { id: string; ownerId: string; config: string },
  ban: Idents & { playerName: string; type?: string }
): Promise<void> {
  if (!readNetworkPolicy(server.config).contribute) return;
  const type = ban.type ?? "MANUAL";
  if (type === "MANUAL_CONDUCT") return;
  const h = hashIdents(ban);
  if (!h.licenseHash && !h.steamHash && !h.discordHash) return; // nothing to match on
  await db.networkBan.create({
    data: {
      ownerId: server.ownerId,
      serverId: server.id,
      licenseHash: h.licenseHash,
      steamHash: h.steamHash,
      discordHash: h.discordHash,
      type,
      playerName: ban.playerName,
    },
  });
  void pushToOnline(server.ownerId, ban).catch((err) => console.error("[NETWORK_PUSH]", err));
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

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

/**
 * Leaves the visible record of a flag on one server: a NETWORK_BAN detection
 * (with the anonymous breakdown), a server log line, the Discord webhook and —
 * when the action is KICK during a session (`live`) — a queued kick.
 */
export async function recordNetworkFlag(
  server: { id: string; name: string; config: string },
  player: { id: string } | null,
  playerName: string,
  rep: NetworkReputation,
  action: "LOG" | "KICK",
  live: boolean
): Promise<void> {
  const what = describeFlag(rep);
  await db.detection.create({
    data: {
      serverId: server.id,
      playerId: player?.id,
      type: "NETWORK_BAN",
      severity: severityForType("NETWORK_BAN"),
      playerName,
      details: JSON.stringify({
        distinctOwners: rep.distinctOwners,
        evidenceOwners: rep.evidenceOwners,
        strength: rep.strength,
        totalBans: rep.totalBans,
        automatic: rep.automatic,
        manual: rep.manual,
        topReason: rep.topType,
        categories: rep.categories,
        firstBanAt: rep.firstBanAt,
        lastBanAt: rep.lastBanAt,
        live,
        note: `Banned across ${rep.distinctOwners} network server owner(s).`,
      }),
      action,
    },
  });
  await db.serverLog.create({
    data: {
      serverId: server.id,
      level: "DETECTION",
      source: "network",
      message: `NETWORK_BAN → ${playerName} (${what}${live ? ", while playing here" : ""})${action === "KICK" ? " — removed" : ""}`,
    },
  });
  // At connect the resource itself refuses entry; mid-session the kick is queued.
  if (action === "KICK" && live && player) {
    await db.punishAction.create({
      data: {
        serverId: server.id,
        playerId: player.id,
        type: "KICK",
        reason: `CoreAC Network: ${what}`,
        issuedBy: "AntiCheat",
        playerName,
        status: "PENDING",
      },
    });
  }
  void sendWebhook(server.config, "detection", server.name, {
    player: playerName,
    reason: `Network reputation — ${what}${live ? " (while playing here)" : ""}${action === "KICK" ? " — removed" : ""}`,
  });
}

/**
 * Live push: a new ban may have just made this player flagged. Tell every OTHER
 * owner's server where the player is online right now (their policy decides
 * LOG or KICK). At most one flag per player per server per 24 hours.
 */
export async function pushToOnline(originOwnerId: string, ids: Idents): Promise<number> {
  const or: { license?: string; steam?: string; discord?: string }[] = [];
  if (ids.license) or.push({ license: ids.license });
  if (ids.steam) or.push({ steam: ids.steam });
  if (ids.discord) or.push({ discord: ids.discord });
  if (!or.length) return 0;
  const online = await db.player.findMany({
    where: { online: true, server: { ownerId: { not: originOwnerId } }, OR: or },
    select: {
      id: true, name: true, license: true, steam: true, discord: true, serverId: true, online: true,
      server: { select: { id: true, name: true, ownerId: true, config: true } },
    },
    take: 50,
  });
  let told = 0;
  const since = new Date(Date.now() - 24 * 3600_000);
  for (const p of online) {
    const policy = readNetworkPolicy(p.server.config);
    if (policy.action === "OFF") continue;
    const rep = await queryNetworkReputation(p.server.ownerId, p);
    if (!rep.flagged) continue;
    const recent = await db.detection.findFirst({
      where: { serverId: p.serverId, playerId: p.id, type: "NETWORK_BAN", createdAt: { gte: since } },
      select: { id: true },
    });
    if (recent) continue;
    await recordNetworkFlag(p.server, p, p.name, rep, decideNetworkAction(policy, rep), true);
    told++;
  }
  return told;
}
