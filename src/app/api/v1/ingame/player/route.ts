import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { detectionLabel } from "@/lib/detection-actions";
import { getCachedAvatar, warmAvatar } from "@/lib/discord-avatar";

export const dynamic = "force-dynamic";

// Player profile for the in-game admin menu's detail pane: trust score,
// playtime and this player's moderation history on THIS server. The resource
// sends the live identifiers itself; this endpoint never returns an IP.
const schema = z.object({ license: z.string().min(3).max(120) });

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`ingame-player:${server.id}`, 240, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const { license } = schema.parse(await req.json());

  const player = await db.player.findUnique({
    where: { serverId_license: { serverId: server.id, license } },
    select: { id: true, trustScore: true, playtimeSec: true, firstSeenAt: true, lastSeenAt: true, discord: true },
  });
  if (player?.discord) void warmAvatar(player.discord);

  const banWhere = { serverId: server.id, OR: [{ license }, ...(player ? [{ playerId: player.id }] : [])] };

  const [bans, kicks, warns, detections, recentActions, recentDetections] = await Promise.all([
    db.ban.count({ where: banWhere }),
    player ? db.punishAction.count({ where: { serverId: server.id, playerId: player.id, type: "KICK" } }) : 0,
    player ? db.punishAction.count({ where: { serverId: server.id, playerId: player.id, type: "WARN" } }) : 0,
    player ? db.detection.count({ where: { serverId: server.id, playerId: player.id } }) : 0,
    player
      ? db.punishAction.findMany({
          where: { serverId: server.id, playerId: player.id },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { type: true, reason: true, issuedBy: true, createdAt: true },
        })
      : [],
    player
      ? db.detection.findMany({
          where: { serverId: server.id, playerId: player.id },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { type: true, action: true, createdAt: true },
        })
      : [],
  ]);

  // One merged, newest-first timeline for the detail pane.
  const history = [
    ...recentActions.map((a) => ({
      kind: a.type,
      text: a.reason,
      by: a.issuedBy,
      at: a.createdAt.toISOString(),
    })),
    ...recentDetections.map((d) => ({
      kind: "DETECTION",
      text: detectionLabel(d.type),
      by: d.action ?? "LOG",
      at: d.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 10);

  return ok({
    known: !!player,
    trustScore: player?.trustScore ?? null,
    playtimeSec: player?.playtimeSec ?? 0,
    firstSeenAt: player?.firstSeenAt.toISOString() ?? null,
    avatarUrl: getCachedAvatar(player?.discord),
    counts: { bans, kicks, warns, detections },
    history,
  });
});
