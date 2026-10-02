import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/session";
import { audit } from "@/lib/audit";
import { generateServerToken } from "@/lib/keys";
import { env } from "@/lib/env";
import { pickServer, publicApiBase, resolveInstallKey, normaliseKey } from "@/lib/install-key";

export const dynamic = "force-dynamic";

const schema = z.object({ key: z.string().max(80), serverId: z.string().min(1).max(40) });

// Windows installer, last step: issue a fresh server token for the server.cfg
// it is about to write. Called only after the resource is already in place, so
// a failed download never leaves a running server with a revoked token.
export const POST = handler(async (req: NextRequest) => {
  const ip = clientIp(headers()) ?? "unknown";
  const body = schema.parse(await req.json());
  const rl = rateLimit(`install-claim:${normaliseKey(body.key)}`, 6, 60_000);
  const rlIp = rateLimit(`install-claim-ip:${ip}`, 10, 60_000);
  if (!rl.success || !rlIp.success) throw new ApiError(429, "Too many attempts — wait a minute and try again.");

  const lic = await resolveInstallKey(body.key);
  const target = pickServer(lic, body.serverId);
  const { token, hash } = generateServerToken();
  const owner = lic.ownerId ? await db.user.findUnique({ where: { id: lic.ownerId }, select: { username: true } }) : null;

  await db.$transaction([
    db.server.update({ where: { id: target.id }, data: { apiTokenHash: hash } }),
    db.serverLog.create({
      data: {
        serverId: target.id,
        level: "INFO",
        source: "panel",
        // "ACTION → target (detail) — who", like every panel line (Admin Logs reads it).
        message: `INSTALL → ${target.name} (Windows installer · new server token · ${ip}) — ${owner?.username ?? "licence holder"}`,
      },
    }),
  ]);
  await audit({
    userId: lic.ownerId,
    action: "SERVER_TOKEN_REGEN",
    targetType: "Server",
    targetId: target.id,
    ip,
    meta: { via: "windows-installer" },
  });

  const base = publicApiBase(env.APP_URL, headers());
  return ok({ serverId: target.id, serverName: target.name, token, apiUrl: `${base}/api/v1` });
});
