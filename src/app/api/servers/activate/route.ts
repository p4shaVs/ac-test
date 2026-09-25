import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, requireUser, ApiError } from "@/lib/api";
import { activateServerSchema } from "@/lib/validation";
import { generateServerToken, isValidKeyFormat } from "@/lib/keys";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";

// Tek-adım kurulum: lisans anahtarını gir, IP/port/ad ver, anahtar hesaba
// tanımlanır (gerekirse) + sunucu oluşturulur + token döner.
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const ip = clientIp(headers()) ?? "unknown";
  // Kullanıcıya bağlı limit (IP başlığı istemci tarafından uydurulabilir).
  const rl = rateLimit(`activate:${user.id}`, 10, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many attempts, please wait");

  const body = activateServerSchema.parse(await req.json());
  if (!isValidKeyFormat(body.key)) throw new ApiError(400, "Invalid licence key format");

  const license = await db.licenseKey.findUnique({ where: { key: body.key } });
  if (!license) throw new ApiError(404, "Licence key not found");
  if (license.status === "REVOKED") throw new ApiError(410, "This licence has been revoked");
  if (license.status === "SUSPENDED") throw new ApiError(403, "This licence is suspended");
  if (license.status === "EXPIRED" || (license.expiresAt && license.expiresAt < new Date())) {
    throw new ApiError(410, "The licence has expired");
  }
  if (license.ownerId && license.ownerId !== user.id) throw new ApiError(409, "This licence is tied to another account");

  const { token, hash } = generateServerToken();

  const server = await db.$transaction(async (tx) => {
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

    // Limit kontrolü YAZMADAN SONRA: SQLite yazanları sıraya koyar; eşzamanlı
    // ikinci aktivasyon bu satırı görür ve geri alınır. (Eskiden sayım
    // transaction dışında yapılıyordu → aynı anda iki istek 1 sunucu lisansına
    // iki sunucu bağlayabiliyordu.)
    const attached = await tx.server.count({ where: { licenseKeyId: license.id } });
    if (attached > license.maxServers) {
      throw new ApiError(409, "This licence has reached its server limit");
    }

    // Atomik sahiplenme + aktivasyon: yalnızca sahipsizse ya da zaten bu
    // kullanıcınınsa, ve hâlâ kullanılabilir durumdaysa.
    const claimed = await tx.licenseKey.updateMany({
      where: {
        id: license.id,
        status: { in: ["UNUSED", "ACTIVE"] },
        OR: [{ ownerId: null }, { ownerId: user.id }],
      },
      data: {
        ownerId: user.id,
        status: "ACTIVE",
        activatedAt: license.activatedAt ?? new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new ApiError(409, "This licence is tied to another account");
    }

    await tx.serverLog.create({
      data: { serverId: s.id, level: "INFO", source: "system", message: `Server created: ${s.name}` },
    });
    return s;
  });

  await audit({ userId: user.id, action: "SERVER_ACTIVATE", targetType: "Server", targetId: server.id, ip });

  // Ham token yalnızca bir kez döner.
  return ok({ serverId: server.id, apiToken: token }, 201);
});
