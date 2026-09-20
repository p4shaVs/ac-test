import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { detectionLabel } from "@/lib/detection-actions";

export const dynamic = "force-dynamic";

// Lists for the in-game admin menu (Bans / Kicks / Warns / Detections / Logs).
// The resource has already checked the requesting admin's permission for the
// tab (server/live.lua) before calling this. Only moderation fields are
// returned — never IP addresses.
const schema = z.object({
  tab: z.enum(["bans", "kicks", "warns", "detections", "logs"]),
  q: z.string().trim().max(60).optional(),
});

const TAKE = 100;

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`ingame-data:${server.id}`, 240, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const { tab, q } = schema.parse(await req.json());
  const search = q && q.length > 0 ? q : undefined;

  if (tab === "bans") {
    // Same expiry sweep as GET /v1/bans so the list never shows lapsed bans.
    await db.ban.updateMany({
      where: { serverId: server.id, active: true, permanent: false, expiresAt: { lt: new Date() } },
      data: { active: false },
    });
    const bans = await db.ban.findMany({
      where: {
        serverId: server.id,
        active: true,
        ...(search
          ? { OR: [{ playerName: { contains: search } }, { code: { contains: search.toUpperCase() } }, { reason: { contains: search } }] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: {
        id: true, code: true, playerName: true, reason: true, bannedBy: true,
        permanent: true, expiresAt: true, createdAt: true,
      },
    });
    return ok({
      rows: bans.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.playerName,
        reason: b.reason,
        by: b.bannedBy,
        permanent: b.permanent,
        expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
        at: b.createdAt.toISOString(),
      })),
    });
  }

  if (tab === "kicks" || tab === "warns") {
    const actions = await db.punishAction.findMany({
      where: {
        serverId: server.id,
        type: tab === "kicks" ? "KICK" : "WARN",
        ...(search ? { OR: [{ playerName: { contains: search } }, { reason: { contains: search } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, playerName: true, reason: true, issuedBy: true, createdAt: true },
    });
    return ok({
      rows: actions.map((a) => ({
        id: a.id,
        name: a.playerName,
        reason: a.reason,
        by: a.issuedBy,
        at: a.createdAt.toISOString(),
      })),
    });
  }

  if (tab === "detections") {
    const dets = await db.detection.findMany({
      where: {
        serverId: server.id,
        ...(search ? { OR: [{ playerName: { contains: search } }, { type: { contains: search.toUpperCase() } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, playerName: true, type: true, severity: true, action: true, createdAt: true },
    });
    return ok({
      rows: dets.map((d) => ({
        id: d.id,
        name: d.playerName,
        type: d.type,
        label: detectionLabel(d.type),
        severity: d.severity,
        action: d.action ?? "LOG",
        at: d.createdAt.toISOString(),
      })),
    });
  }

  // logs
  const logs = await db.serverLog.findMany({
    where: {
      serverId: server.id,
      ...(search ? { message: { contains: search } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
    select: { id: true, level: true, source: true, message: true, createdAt: true },
  });
  return ok({
    rows: logs.map((l) => ({
      id: l.id,
      level: l.level,
      source: l.source,
      message: l.message,
      at: l.createdAt.toISOString(),
    })),
  });
});
