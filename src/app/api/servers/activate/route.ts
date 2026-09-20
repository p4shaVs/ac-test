import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, requireUser, ApiError } from "@/lib/api";
import { activateServerSchema } from "@/lib/validation";
import { generateServerToken, isValidKeyFormat } from "@/lib/keys";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

// FeloxAC tarzı tek-adım kurulum: lisans anahtarını gir, IP/port/ad ver,
// anahtar hesaba tanımlanır (gerekirse) + sunucu oluşturulur + token döner.
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const ip = clientIp(headers()) ?? "unknown";
  const rl = rateLimit(`activate:${user.id}:${ip}`, 10, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many attempts, please wait");

  const body = activateServerSchema.parse(await req.json());
  if (!isValidKeyFormat(body.key)) throw new ApiError(400, "Invalid licence key format");

  const license = await db.licenseKey.findUnique({
    where: { key: body.key },
    include: { servers: true },
  });
  if (!license) throw new ApiError(404, "Licence key not found");
  if (license.status === "REVOKED") throw new ApiError(410, "This licence has been revoked");
  if (license.status === "SUSPENDED") throw new ApiError(403, "This licence is suspended");
  if (license.expiresAt && license.expiresAt < new Date()) throw new ApiError(410, "The licence has expired");
  if (license.ownerId && license.ownerId !== user.id) throw new ApiError(409, "This licence is tied to another account");
  if (license.servers.length >= license.maxServers) throw new ApiError(409, "This licence has reached its server limit");

  const { token, hash } = generateServerToken();

  const server = await db.$transaction(async (tx) => {
    // Anahtar sahipsizse hesaba tanımla + ACTIVE yap.
    if (!license.ownerId || license.status === "UNUSED") {
      await tx.licenseKey.update({
        where: { id: license.id },
        data: {
          ownerId: license.ownerId ?? user.id,
          status: "ACTIVE",
          activatedAt: license.activatedAt ?? new Date(),
        },
      });
    }
    const s = await tx.server.create({
      data: {
        name: body.name,
        ip: body.ip ?? null,
        port: body.port,
        ownerId: user.id,
        licenseKeyId: license.id,
        apiTokenHash: hash,
      },
    });
    await tx.serverLog.create({
      data: { serverId: s.id, level: "INFO", source: "system", message: `Server created: ${s.name}` },
    });
    return s;
  });

  await audit({ userId: user.id, action: "SERVER_ACTIVATE", targetType: "Server", targetId: server.id, ip });

  // Ham token yalnızca bir kez döner.
  return ok({ serverId: server.id, apiToken: token }, 201);
});
