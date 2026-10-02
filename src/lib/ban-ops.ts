import type { Ban, Server } from "@prisma/client";
import { db } from "./db";
import { revokeNetworkBan } from "./network-bans";
import { sendWebhook } from "./discord";

// Shared by the Unban button and "Fix false ban" on the ban detail page.

export interface BanNote {
  id: string;
  by: string;
  at: string;
  text: string;
}

export interface BanHistoryEntry {
  at: string;
  kind: "ban" | "unban" | "false_positive" | "evasion" | "detection" | "kick" | "warn" | "note" | "other_ban";
  title: string;
  detail?: string;
  by?: string;
}

export const NOTE_MAX_LEN = 1000;
export const NOTES_MAX = 50;

/** Notes are stored as a JSON array on Ban.notes; anything malformed is dropped. */
export function parseBanNotes(raw: string | null | undefined): BanNote[] {
  let arr: unknown;
  try {
    arr = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(
      (n): n is BanNote =>
        !!n &&
        typeof n === "object" &&
        typeof (n as BanNote).id === "string" &&
        typeof (n as BanNote).by === "string" &&
        typeof (n as BanNote).at === "string" &&
        typeof (n as BanNote).text === "string"
    )
    .slice(-NOTES_MAX);
}

/**
 * Lifts an active ban: marks it inactive, lifts the ban-evasion bans linked to
 * it (a wrong ban must not keep the player's other accounts banned), queues the
 * UNBAN for the game server, clears this owner's network-ban contribution and
 * posts the unban webhook. Returns the number of linked evasion bans lifted.
 */
export async function liftBan(
  server: Pick<Server, "id" | "name" | "config" | "ownerId">,
  ban: Pick<Ban, "id" | "code" | "playerId" | "playerName" | "license" | "steam" | "discord">,
  by: string,
  reason: string,
  extra: { falsePositive?: boolean } = {}
): Promise<number> {
  const now = new Date();
  let linked = 0;
  await db.$transaction(async (tx) => {
    await tx.ban.update({
      where: { id: ban.id },
      data: {
        active: false,
        unbannedAt: now,
        unbannedBy: by,
        ...(extra.falsePositive ? { falsePositive: true } : {}),
      },
    });
    if (ban.code) {
      const res = await tx.ban.updateMany({
        where: { serverId: server.id, active: true, evasionOf: ban.code },
        data: {
          active: false,
          unbannedAt: now,
          unbannedBy: by,
          ...(extra.falsePositive ? { falsePositive: true } : {}),
        },
      });
      linked = res.count;
    }
    // A wrong ban should not leave the player marked as untrustworthy either.
    if (extra.falsePositive && ban.playerId) {
      await tx.player.updateMany({
        where: { id: ban.playerId, serverId: server.id, trustScore: { lt: 100 } },
        data: { trustScore: 100 },
      });
    }
    await tx.punishAction.create({
      data: {
        serverId: server.id,
        playerId: ban.playerId,
        type: "UNBAN",
        reason,
        issuedBy: by,
        playerName: ban.playerName,
        status: "PENDING",
      },
    });
    await tx.serverLog.create({
      data: {
        serverId: server.id,
        level: "INFO",
        source: "panel",
        message: `${extra.falsePositive ? "FALSE BAN FIXED" : "UNBAN"} → ${ban.playerName}${linked ? ` (+${linked} linked)` : ""} — ${by}`,
      },
    });
  });

  await revokeNetworkBan(server, { license: ban.license, steam: ban.steam, discord: ban.discord });

  void sendWebhook(server.config, "unban", server.name, {
    player: ban.playerName,
    reason,
    by,
    code: ban.code ?? undefined,
  });

  return linked;
}
