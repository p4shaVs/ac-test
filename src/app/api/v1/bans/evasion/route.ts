import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { generateBanCode } from "@/lib/keys";
import { sendWebhook } from "@/lib/discord";

// Ban kaçırma: banlı bir oyuncunun cihazı (donanım token'ları ya da
// bilgisayarına bırakılan kalıcı işaret) YENİ bir hesapla tekrar bağlandı.
// Kaynak girişi zaten engelledi; burada yeni kimlik de asıl bana bağlanır ve
// aynı süreyle banlanır — hileci o hesabı da bir daha kullanamaz.
const schema = z.object({
  banId: z.string().max(40),
  playerName: z.string().max(80),
  license: z.string().max(120).optional(),
  steam: z.string().max(120).optional(),
  discord: z.string().max(120).optional(),
  ip: z.string().max(64).optional(),
  tokens: z.array(z.string().max(128)).max(16).optional(),
  deviceId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  via: z.enum(["token", "device"]),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`evasion:${server.id}`, 30, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");
  const body = schema.parse(await req.json());

  const original = await db.ban.findFirst({
    where: { id: body.banId, serverId: server.id, active: true },
  });
  if (!original) throw new ApiError(404, "Ban not found");

  // Bu kimlik zaten banlıysa (ör. aynı hesapla ikinci deneme) yeni kayıt açma.
  const identity = [
    body.license ? { license: body.license } : null,
    body.steam ? { steam: body.steam } : null,
    body.discord ? { discord: body.discord } : null,
  ].filter(Boolean) as object[];
  if (identity.length) {
    const existing = await db.ban.findFirst({
      where: { serverId: server.id, active: true, OR: identity },
      select: { code: true },
    });
    if (existing) return ok({ banCode: existing.code, linked: false });
  }

  const player = body.license
    ? await db.player.findUnique({
        where: { serverId_license: { serverId: server.id, license: body.license } },
        select: { id: true },
      })
    : null;
  const code = generateBanCode();
  const origCode = original.code ?? original.id;
  const how = body.via === "device" ? "device marker" : "hardware tokens";
  const reason = `Ban evasion — same ${body.via === "device" ? "computer" : "hardware"} as ${origCode}`;

  await db.ban.create({
    data: {
      serverId: server.id,
      playerId: player?.id,
      code,
      license: body.license,
      steam: body.steam,
      discord: body.discord,
      ip: body.ip,
      playerName: body.playerName,
      tokens: JSON.stringify(body.tokens ?? []),
      deviceId: body.deviceId,
      evasionOf: original.code,
      reason,
      bannedBy: "AntiCheat",
      active: true,
      permanent: original.permanent,
      expiresAt: original.expiresAt,
    },
  });
  await db.serverLog.create({
    data: {
      serverId: server.id,
      level: "WARN",
      source: "anticheat",
      message: `Ban evasion blocked: ${body.playerName} matched ${original.playerName} (${origCode}) by ${how} → ${code}`,
    },
  });
  void sendWebhook(server.config, "autoban", server.name, {
    player: body.playerName,
    detectionLabel: "Ban evasion",
    action: "BAN",
    origin: "server",
    code,
    reason: `${reason} (${original.playerName})`,
    identifiers: { license: body.license, discord: body.discord, steam: body.steam, ip: body.ip },
    panelPath: `/dashboard/servers/${server.id}/bans`,
  });

  return ok({ banCode: code, linked: true });
});
