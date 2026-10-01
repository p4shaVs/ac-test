import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { readNetworkPolicy, queryNetworkReputation, reputationScore } from "@/lib/network-bans";
import { readAcSettings } from "@/lib/ac-settings";
import { sendWebhook } from "@/lib/discord";
import { severityForType } from "@/lib/detection-actions";

export const dynamic = "force-dynamic";

// The resource asks the network about a connecting player AFTER its own local
// ban check passes. The panel computes the verdict from THIS server's policy and
// returns the action; the resource just obeys. The network never bans — the
// worst it returns is KICK (deny entry), and only when the operator opted in.
//
// The same call also answers the two connection gates of Configuration →
// Settings → Connection & Identity, because both need data only the panel has:
//   * Reputation gate — network reputation (see reputationScore) below
//     "Min Reputation Score". "Reputation Gate Enforce" off = shadow mode: the
//     refusal is logged but the player gets in.
//   * Max Threat Score — 40 points per automatic kick in the last 24 hours.
// The response carries `deny` ("reputation" | "threat" | null) and `shadow`.
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
  const settings = readAcSettings(server.config);
  const gateOn = settings.MinReputationScore > 0;
  const threatOn = settings.MaxThreatScore > 0;

  // Nothing to evaluate (network policy off, both gates off) → do not even query.
  if (policy.action === "OFF" && !gateOn && !threatOn) {
    return ok({ flagged: false, action: "OFF", distinctOwners: 0, reputation: 100, threat: 0, deny: null, shadow: false });
  }

  const rep = await queryNetworkReputation(server.ownerId, body);
  const reputation = reputationScore(rep.distinctOwners);

  // Local threat: automatic kicks in the last 24 h. Staff kicks and old history
  // do not count, so a player is never locked out for good.
  let threat = 0;
  if (threatOn && body.license) {
    const known = await db.player.findUnique({
      where: { serverId_license: { serverId: server.id, license: body.license } },
      select: { id: true },
    });
    if (known) {
      const kicks = await db.punishAction.count({
        where: {
          serverId: server.id, playerId: known.id, type: "KICK", issuedBy: "AntiCheat",
          createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        },
      });
      threat = Math.min(100, kicks * 40);
    }
  }

  let deny: "reputation" | "threat" | null = null;
  let shadow = false;
  if (threatOn && threat >= settings.MaxThreatScore) deny = "threat";
  else if (gateOn && reputation < settings.MinReputationScore) {
    if (settings.ReputationGateEnforce) deny = "reputation";
    else shadow = true; // would have been refused — logged only
  }

  if (deny || shadow) {
    const why = deny === "threat"
      ? `threat ${threat} ≥ ${settings.MaxThreatScore}`
      : `reputation ${reputation} < ${settings.MinReputationScore}`;
    await db.serverLog.create({
      data: {
        serverId: server.id,
        level: "WARN",
        source: "connect",
        message: `${shadow ? "Reputation gate (shadow — not blocked)" : "Connection blocked"}: ${body.playerName} (${why})`,
      },
    });
    void sendWebhook(server.config, "warn", server.name, {
      player: body.playerName,
      reason: `${shadow ? "Reputation gate — would have blocked (shadow mode)" : "Connection blocked"}: ${why}`,
    });
  }

  // The network flag itself only matters while the network policy is on.
  if (policy.action === "OFF" || !rep.flagged) {
    return ok({
      flagged: false, action: policy.action === "OFF" ? "OFF" : "LOG",
      distinctOwners: rep.distinctOwners, reputation, threat, deny, shadow,
    });
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

  return ok({ flagged: true, action, distinctOwners: rep.distinctOwners, reputation, threat, deny, shadow });
});
