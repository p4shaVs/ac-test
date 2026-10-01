import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { parseJson } from "@/lib/utils";
import { detectionLabel } from "@/lib/detection-actions";
import { evidenceEntries } from "@/lib/evidence";
import { liftBan, parseBanNotes, NOTE_MAX_LEN, NOTES_MAX, type BanNote, type BanHistoryEntry } from "@/lib/ban-ops";

type Ctx = { params: { id: string; banId: string } };

async function loadBan(serverId: string, banId: string) {
  const ban = await db.ban.findFirst({ where: { id: banId, serverId } });
  if (!ban) throw new ApiError(404, "Ban not found");
  return ban;
}

// Everything the ban detail window shows: the record, the detection that caused
// it (evidence, screenshots, replay), linked evasion bans, the player's history
// on this server and the staff notes.
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { server } = await requireOwnedServer(ctx.params.id);
  const ban = await loadBan(server.id, ctx.params.banId);

  const identity: Prisma.BanWhereInput[] = [];
  if (ban.playerId) identity.push({ playerId: ban.playerId });
  if (ban.license) identity.push({ license: ban.license });
  if (ban.discord) identity.push({ discord: ban.discord });
  if (ban.steam) identity.push({ steam: ban.steam });

  const [detection, screenshots, parent, children, otherBans, actions, detections, player] = await Promise.all([
    ban.detectionId ? db.detection.findFirst({ where: { id: ban.detectionId, serverId: server.id } }) : null,
    ban.detectionId
      ? db.screenshotRequest.findMany({
          where: { detectionId: ban.detectionId, serverId: server.id, status: "DONE" },
          orderBy: { seq: "asc" },
          select: { id: true, url: true, seq: true, completedAt: true },
        })
      : [],
    ban.evasionOf
      ? db.ban.findFirst({
          where: { serverId: server.id, code: ban.evasionOf },
          select: { id: true, code: true, playerName: true, active: true, createdAt: true },
        })
      : null,
    ban.code
      ? db.ban.findMany({
          where: { serverId: server.id, evasionOf: ban.code },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, code: true, playerName: true, active: true, createdAt: true },
        })
      : [],
    identity.length
      ? db.ban.findMany({
          where: { serverId: server.id, id: { not: ban.id }, OR: identity },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : [],
    ban.playerId
      ? db.punishAction.findMany({
          where: { serverId: server.id, playerId: ban.playerId, type: { in: ["KICK", "WARN"] } },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : [],
    ban.playerId
      ? db.detection.findMany({
          where: { serverId: server.id, playerId: ban.playerId },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, type: true, severity: true, action: true, createdAt: true, details: true },
        })
      : [],
    ban.playerId
      ? db.player.findFirst({
          where: { id: ban.playerId, serverId: server.id },
          select: { id: true, name: true, online: true, trustScore: true, playtimeSec: true, firstSeenAt: true, lastSeenAt: true },
        })
      : null,
  ]);

  const notes = parseBanNotes(ban.notes);
  const tokens = parseJson<unknown[]>(ban.tokens, []);
  const details = detection ? parseJson<Record<string, unknown>>(detection.details, {}) : null;
  const replayFrames = detection ? parseJson<unknown[]>(detection.replay, []).length : 0;

  const history: BanHistoryEntry[] = [];
  history.push({
    at: ban.createdAt.toISOString(),
    kind: ban.evasionOf ? "evasion" : "ban",
    title: ban.evasionOf ? `Banned for ban evasion (${ban.evasionOf})` : ban.permanent ? "Banned permanently" : "Banned (temporary)",
    detail: ban.reason,
    by: ban.bannedBy,
  });
  if (ban.unbannedAt) {
    history.push({
      at: ban.unbannedAt.toISOString(),
      kind: ban.falsePositive ? "false_positive" : "unban",
      title: ban.falsePositive ? "Lifted as a false positive" : "Unbanned",
      by: ban.unbannedBy ?? undefined,
    });
  }
  for (const c of children) {
    history.push({
      at: c.createdAt.toISOString(),
      kind: "evasion",
      title: `Linked evasion ban ${c.code ?? ""}`.trim(),
      detail: `${c.playerName}${c.active ? "" : " · lifted"}`,
    });
  }
  for (const n of notes) history.push({ at: n.at, kind: "note", title: "Note added", detail: n.text, by: n.by });
  for (const b of otherBans) {
    history.push({
      at: b.createdAt.toISOString(),
      kind: "other_ban",
      title: `Other ban ${b.code ?? ""}`.trim() + (b.active ? " · active" : b.falsePositive ? " · false positive" : " · lifted"),
      detail: b.reason,
      by: b.bannedBy,
    });
  }
  for (const a of actions) {
    history.push({
      at: a.createdAt.toISOString(),
      kind: a.type === "KICK" ? "kick" : "warn",
      title: a.type === "KICK" ? "Kicked" : "Warned",
      detail: a.reason,
      by: a.issuedBy,
    });
  }
  for (const d of detections) {
    if (detection && d.id === detection.id) continue;
    history.push({
      at: d.createdAt.toISOString(),
      kind: "detection",
      title: detectionLabel(d.type),
      detail: [d.severity, d.action ?? "LOG", evidenceEntries(d.details, 2).map((e) => `${e.label} ${e.value}`).join(" · ")]
        .filter(Boolean)
        .join(" · "),
    });
  }
  if (detection) {
    history.push({
      at: detection.createdAt.toISOString(),
      kind: "detection",
      title: `${detectionLabel(detection.type)} — triggered this ban`,
      detail: `${detection.severity} · ${detection.action ?? "LOG"}`,
    });
  }
  history.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return ok({
    ban: {
      id: ban.id,
      code: ban.code,
      playerId: ban.playerId,
      playerName: ban.playerName,
      reason: ban.reason,
      bannedBy: ban.bannedBy,
      active: ban.active,
      permanent: ban.permanent,
      falsePositive: ban.falsePositive,
      createdAt: ban.createdAt.toISOString(),
      expiresAt: ban.expiresAt?.toISOString() ?? null,
      unbannedAt: ban.unbannedAt?.toISOString() ?? null,
      unbannedBy: ban.unbannedBy,
      evasionOf: ban.evasionOf,
      identifiers: {
        license: ban.license,
        steam: ban.steam,
        discord: ban.discord,
        ip: ban.ip,
        deviceId: ban.deviceId,
        tokens: tokens.length,
      },
    },
    detection: detection
      ? {
          id: detection.id,
          type: detection.type,
          label: detectionLabel(detection.type),
          severity: detection.severity,
          action: detection.action,
          createdAt: detection.createdAt.toISOString(),
          details,
          evidence: evidenceEntries(details, 12),
          replayFrames,
          screenshots: screenshots.map((s) => ({ ...s, completedAt: s.completedAt?.toISOString() ?? null })),
        }
      : null,
    linked: { parent, children },
    player,
    notes,
    history: history.slice(0, 80),
  });
});

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("note"), text: z.string().trim().min(1).max(NOTE_MAX_LEN) }),
  z.object({ action: z.literal("deleteNote"), noteId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("falsePositive"), value: z.boolean() }),
  z.object({ action: z.literal("fixFalseBan") }),
]);

export const POST = handler(async (req: NextRequest, ctx: Ctx) => {
  const { server, user } = await requireOwnedServer(ctx.params.id);
  const body = postSchema.parse(await req.json());
  const ban = await loadBan(server.id, ctx.params.banId);
  const ip = clientIp(headers());

  if (body.action === "note") {
    const notes = parseBanNotes(ban.notes);
    if (notes.length >= NOTES_MAX) throw new ApiError(400, `A ban can hold at most ${NOTES_MAX} notes`);
    const note: BanNote = { id: randomUUID(), by: user.username, at: new Date().toISOString(), text: body.text };
    await db.ban.update({ where: { id: ban.id }, data: { notes: JSON.stringify([...notes, note]) } });
    await db.serverLog.create({
      data: { serverId: server.id, level: "INFO", source: "panel", message: `BAN NOTE → ${ban.playerName} — ${user.username}` },
    });
    await audit({ userId: user.id, action: "BAN_NOTE_ADD", targetType: "Ban", targetId: ban.id, ip });
    return ok({ note });
  }

  if (body.action === "deleteNote") {
    const notes = parseBanNotes(ban.notes);
    const next = notes.filter((n) => n.id !== body.noteId);
    if (next.length === notes.length) throw new ApiError(404, "Note not found");
    await db.ban.update({ where: { id: ban.id }, data: { notes: JSON.stringify(next) } });
    await audit({ userId: user.id, action: "BAN_NOTE_DELETE", targetType: "Ban", targetId: ban.id, ip });
    return ok({ deleted: true });
  }

  if (body.action === "falsePositive") {
    // Only the record flag — lifting the ban is "Fix false ban".
    await db.ban.update({ where: { id: ban.id }, data: { falsePositive: body.value } });
    await db.serverLog.create({
      data: {
        serverId: server.id,
        level: "INFO",
        source: "panel",
        message: `${body.value ? "MARKED FALSE POSITIVE" : "UNMARKED FALSE POSITIVE"} → ${ban.playerName} — ${user.username}`,
      },
    });
    await audit({
      userId: user.id,
      action: body.value ? "BAN_FALSE_POSITIVE_MARK" : "BAN_FALSE_POSITIVE_UNMARK",
      targetType: "Ban",
      targetId: ban.id,
      ip,
    });
    return ok({ falsePositive: body.value });
  }

  // fixFalseBan: mark it, lift it (with its linked evasion bans), restore the
  // player's trust score and clear the network-ban contribution.
  let linked = 0;
  if (ban.active) {
    linked = await liftBan(server, ban, user.username, "Ban corrected — false positive", { falsePositive: true });
  } else {
    await db.$transaction(async (tx) => {
      await tx.ban.update({ where: { id: ban.id }, data: { falsePositive: true } });
      if (ban.playerId) {
        await tx.player.updateMany({
          where: { id: ban.playerId, serverId: server.id, trustScore: { lt: 100 } },
          data: { trustScore: 100 },
        });
      }
      await tx.serverLog.create({
        data: { serverId: server.id, level: "INFO", source: "panel", message: `FALSE BAN FIXED → ${ban.playerName} — ${user.username}` },
      });
    });
  }
  await audit({
    userId: user.id,
    action: "BAN_FALSE_POSITIVE_FIX",
    targetType: "Ban",
    targetId: ban.id,
    ip,
    meta: { player: ban.playerName, code: ban.code, wasActive: ban.active, linked },
  });
  return ok({ fixed: true, linked });
});
