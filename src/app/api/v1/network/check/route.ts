import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { readNetworkPolicy, queryNetworkReputation } from "@/lib/network-bans";
import { sendWebhook } from "@/lib/discord";
import { severityForType } from "@/lib/detection-actions";

export const dynamic = "force-dynamic";

// The resource asks the network about a connecting player AFTER its own local
// ban check passes. The panel computes the verdict from THIS server's policy and
// returns the action; the resource just obeys. The network never bans — the
// worst it returns is KICK (deny entry), and only when the operator opted in.
const schema = z.object({
  license: z.string().max(120).optional(),
  steam: z.string().max(120).optional(),
  discord: z.string().max(120).optional(),
  playerName: z.string().max(80).default("Unknown"),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`netchk:${server.id}`, 120, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const body = schema.parse(await req.json());
  const policy = readNetworkPolicy(server.config);

  // Policy off → do not even query; the resource does nothing.
  if (policy.action === "OFF") {
    return ok({ flagged: false, action: "OFF", distinctOwners: 0 });
  }

  const rep = await queryNetworkReputation(server.ownerId, body);
  if (!rep.flagged) {
    return ok({ flagged: false, action: "LOG", distinctOwners: rep.distinctOwners });
  }

  // Flagged → always leave a visible record (panel + Discord). Action is LOG or
  // KICK only; a network flag is a signal, not proof, so it never bans and never
  // creates a local Ban row.
  const action: "LOG" | "KICK" = policy.action === "KICK" ? "KICK" : "LOG";

  const player = body.license
    ? await db.player.findUnique({
        where: { serverId_license: { serverId: server.id, license: body.license } },
      })
    : null;

  await db.detection.create({
    data: {
      serverId: server.id,
      playerId: player?.id,
      type: "NETWORK_BAN",
      severity: severityForType("NETWORK_BAN"),
      playerName: body.playerName,
      details: JSON.stringify({
        distinctOwners: rep.distinctOwners,
        totalBans: rep.totalBans,
        topReason: rep.topType,
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
      message: `NETWORK_BAN → ${body.playerName} (banned on ${rep.distinctOwners} network owners)${
        action === "KICK" ? " — entry blocked" : ""
      }`,
    },
  });

  void sendWebhook(server.config, "detection", server.name, {
    player: body.playerName,
    reason: `Network reputation — banned across ${rep.distinctOwners} server owner(s)${
      action === "KICK" ? " (entry blocked)" : ""
    }`,
  });

  return ok({ flagged: true, action, distinctOwners: rep.distinctOwners });
});
