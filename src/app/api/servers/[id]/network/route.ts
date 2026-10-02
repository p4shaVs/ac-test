import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireServerAccess } from "@/lib/api-guards";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { parseJson } from "@/lib/utils";
import { identityFrom, parseIdentifiers } from "@/lib/identifiers";
import { queryNetworkReputation, readNetworkPolicy, sanitizeNetworkPolicy, describeFlag } from "@/lib/network-bans";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("policy"),
    policy: z.object({
      action: z.enum(["OFF", "LOG", "KICK"]).optional(),
      contribute: z.boolean().optional(),
      strongOnly: z.boolean().optional(),
    }),
  }),
  z.object({ action: z.literal("withdraw"), id: z.string().min(1).max(40) }),
  z.object({ action: z.literal("check"), identifiers: z.string().min(1).max(2000) }),
]);

// Network page actions. Everything here is about THIS owner's server: its
// policy, its own shared bans, and an anonymous look-up (counts and cheat types
// only — the same answer the connection check gives when that player joins).
export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, user, access } = await requireServerAccess(ctx.params.id);
  const body = schema.parse(await req.json());
  const ip = clientIp(headers());
  // Look-ups are for any team member; changing the policy or the owner's shared
  // bans is configuration.
  if (body.action !== "check" && !access.perms.has("config")) {
    throw new ApiError(403, "Your role on this server does not allow this (needs “Configuration”).", "FORBIDDEN");
  }

  if (body.action === "policy") {
    const config = parseJson<Record<string, unknown>>(server.config, {});
    const next = sanitizeNetworkPolicy({ ...readNetworkPolicy(server.config), ...body.policy });
    config.network = next;
    await db.server.update({ where: { id: server.id }, data: { config: JSON.stringify(config) } });
    await db.serverLog.create({
      data: { serverId: server.id, level: "INFO", source: "panel", message: `Network settings updated — ${user.username}` },
    });
    await audit({ userId: user.id, action: "NETWORK_POLICY", targetType: "Server", targetId: server.id, ip, meta: { ...next } });
    return ok({ policy: next });
  }

  if (body.action === "withdraw") {
    const row = await db.networkBan.findFirst({
      where: { id: body.id, ownerId: server.ownerId, serverId: server.id, active: true },
      select: { id: true, playerName: true },
    });
    if (!row) throw new ApiError(404, "That shared ban was not found.");
    await db.networkBan.update({ where: { id: row.id }, data: { active: false } });
    await db.serverLog.create({
      data: { serverId: server.id, level: "INFO", source: "panel", message: `NETWORK WITHDRAW → ${row.playerName} — ${user.username}` },
    });
    await audit({ userId: user.id, action: "NETWORK_WITHDRAW", targetType: "NetworkBan", targetId: row.id, ip });
    return ok({ withdrawn: true });
  }

  // check
  const rl = rateLimit(`netlookup:${user.id}`, 20, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many look-ups — wait a minute.");
  const parsed = identityFrom(parseIdentifiers(body.identifiers));
  if ("error" in parsed) throw new ApiError(422, parsed.error);
  const { license, steam, discord } = parsed.identity;
  if (!license && !steam && !discord) throw new ApiError(422, "The network matches licence, Steam or Discord — an IP alone is never shared.");
  const rep = await queryNetworkReputation(server.ownerId, { license, steam, discord });
  return ok({ reputation: rep, summary: rep.distinctOwners ? describeFlag(rep) : null });
});
