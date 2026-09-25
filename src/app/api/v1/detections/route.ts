import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { generateBanCode } from "@/lib/keys";
import { parseJson } from "@/lib/utils";
import { isWhitelisted } from "@/lib/bypass";
import { sendWebhook } from "@/lib/discord";
import { sanitizeActions, resolveAction, capByConfidence, severityForType, detectionLabel } from "@/lib/detection-actions";
import { recordNetworkBan } from "@/lib/network-bans";

// Kaynak, bir hile tespitini raporlar. Aksiyon (LOG/KICK/BAN) müşterinin
// Yapılandırma → Aksiyonlar sayfasında tespit tipi bazında seçtiği değerdir.
// CRITICAL raporlar "replay" (ban-anı son ~8 sn) taşıyabilir — panelde izlenir.
const schema = z.object({
  type: z.string().max(40),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  playerName: z.string().max(80),
  license: z.string().max(120).optional(),
  details: z.record(z.any()).optional(),
  // Where the detection was produced. Client-origin reports can never ban —
  // the cheat client owns that process. Older resource builds omit it; treat
  // a missing value as "client" so the cautious path is the default.
  origin: z.enum(["server", "client"]).default("client"),
  // Set by the resource (never by the player's client) when the player is
  // server staff and Settings → Staff Bypass is on: logged, never punished.
  bypass: z.enum(["staff"]).optional(),
  // Blacklist hits carry the action chosen for that model on the Blacklist
  // page (REMOVE = block + log only).
  requestedAction: z.enum(["REMOVE", "LOG", "KICK", "BAN"]).optional(),
});

export const POST = handler(async (req: NextRequest) => {
  const server = await authenticateServer(req);
  const rl = rateLimit(`det:${server.id}`, 240, 60_000);
  if (!rl.success) throw new ApiError(429, "Rate limit");

  const body = schema.parse(await req.json());

  // Severity, tespit TİPİNİN güven seviyesinden türetilir; kaynağın bildirdiği
  // değere güvenilmez. Modüllerin bir kısmı sabit 'HIGH', bir kısmı sabit
  // 'MEDIUM' gönderiyordu — bu, paneldeki Aksiyon seçimini fiilen geçersiz
  // kılıyordu (müşteri BAN seçse bile en fazla KICK çıkıyordu). Artık tek
  // otorite src/lib/detection-actions.ts.
  const severity = severityForType(body.type, body.severity);

  const player = body.license
    ? await db.player.findUnique({
        where: { serverId_license: { serverId: server.id, license: body.license } },
      })
    : null;

  // Replay tamponu (varsa) ayrı sakla; details'te tekrar etmesin.
  const rawDetails = { ...(body.details ?? {}) } as Record<string, unknown>;
  const replay = Array.isArray(rawDetails.replay) ? rawDetails.replay : [];
  delete rawDetails.replay;
  delete rawDetails.bypass;
  if (body.bypass) rawDetails.bypass = body.bypass;

  const detection = await db.detection.create({
    data: {
      serverId: server.id,
      playerId: player?.id,
      type: body.type,
      severity,
      playerName: body.playerName,
      details: JSON.stringify(rawDetails),
      replay: JSON.stringify(replay),
    },
  });

  await db.serverLog.create({
    data: {
      serverId: server.id,
      level: "DETECTION",
      source: "anticheat",
      message: `${body.type} (${severity}) → ${body.playerName}`,
    },
  });

  // Güven skorunu düşür.
  if (player) {
    const penalty = severity === "CRITICAL" ? 60 : severity === "HIGH" ? 30 : 10;
    await db.player.update({
      where: { id: player.id },
      data: { trustScore: Math.max(0, player.trustScore - penalty) },
    });
  }

  // Bypass (whitelist) kontrolü — muaf oyuncular ne kick ne ban yer.
  const whitelisted = player
    ? await isWhitelisted(server.id, {
        license: player.license,
        discord: player.discord,
        steam: player.steam,
        ip: player.ip,
      })
    : false;

  void sendWebhook(server.config, "detection", server.name, {
    player: body.playerName,
    reason: `${body.type} (${severity})${whitelisted ? " — BYPASSED (whitelisted)" : body.bypass === "staff" ? " — staff (not punished)" : ""}`,
    identifiers: player
      ? { license: player.license, discord: player.discord, steam: player.steam, ip: player.ip }
      : undefined,
  });

  // ---------------------------------------------------------------------
  // Aksiyon kararı: müşterinin Yapılandırma → Aksiyonlar'da tespit tipi
  // bazında seçtiği LOG / KICK / BAN. Ayar yoksa tipin varsayılanı kullanılır.
  // ---------------------------------------------------------------------
  const config = parseJson<Record<string, unknown>>(server.config, {});
  const actions = sanitizeActions(config.actions);
  let action = resolveAction(actions, body.type, body.origin);

  // Kara liste: model başına Blacklist sayfasında seçilen aksiyon geçerlidir
  // (tipin varsayılanı değil). Eskiden "Remove" seçilen model bile tipin
  // varsayılanı olan BAN'a düşüyordu.
  if (body.requestedAction && body.origin === "server" && body.type.startsWith("BLACKLIST_")) {
    const requested = body.requestedAction === "REMOVE" ? "LOG" : body.requestedAction;
    action = capByConfidence(requested, body.type, body.origin);
  }

  // BAN, lisansın "auto_ban" özelliğine bağlıdır (paket/monetizasyon); yoksa
  // KICK'e düşer (LOG kararıysa LOG kalır).
  const features = parseJson<string[]>((server as any).licenseKey?.features ?? "[]", []);
  if (action === "BAN" && !features.includes("auto_ban")) action = "KICK";
  if (whitelisted || !player) action = "LOG";
  // Yetkili muafiyeti (Settings → Staff Bypass): tespit kayıtlı, ceza yok.
  if (body.bypass === "staff") action = "LOG";

  // LOG-ONLY (deneme) modu: Configuration → Settings'ten açılır. Açıkken HİÇBİR
  // tespit kick/ban ATMAZ (ban kaydı bile açılmaz) — sadece kaydedilir/loglanır.
  // Executor gibi FP-riskli korumaları açıp önce loglardan false-positive var mı
  // izlemek için. FP yoksa modu kapatıp enforcement'a geçilir.
  const logOnly = ((config.ac as any)?.Settings?.LogOnly === true);
  if (logOnly) action = "LOG";

  let banned = false;
  let kicked = false;
  let banCode: string | null = null;
  let screenshotRequestIds: string[] = [];

  if (action === "BAN" && player) {
    // Tekrarlı ban engeli: oyuncunun zaten aktif banı varsa yeni ban açma.
    const existingBan = await db.ban.findFirst({
      where: { serverId: server.id, playerId: player.id, active: true },
      select: { code: true },
    });
    if (existingBan) {
      banned = true;
      banCode = existingBan.code;
    } else {
      banCode = generateBanCode();
      await db.$transaction([
        db.ban.create({
          data: {
            serverId: server.id,
            playerId: player.id,
            detectionId: detection.id,
            code: banCode,
            license: player.license,
            steam: player.steam,
            discord: player.discord,
            ip: player.ip,
            playerName: player.name,
            reason: `Automatic ban: ${body.type}`,
            bannedBy: "AntiCheat",
            active: true,
            permanent: true,
          },
        }),
        db.punishAction.create({
          data: {
            serverId: server.id,
            playerId: player.id,
            type: "BAN",
            reason: `Automatic ban: ${body.type}`,
            issuedBy: "AntiCheat",
            playerName: player.name,
            status: "PENDING",
          },
        }),
        db.player.update({
          where: { id: player.id },
          data: { online: false, trustScore: 0 },
        }),
      ]);
      banned = true;

      // "Ban anının kanıtı": gerçek ekran görüntüsü serisi (video DEĞİL —
      // FiveM'in scripting API'si video kaydına izin vermiyor; bunun yerine
      // oyuncunun o an ekranında GERÇEKTEN gördüğü birkaç kareyi
      // screenshot-basic ile yakalayıp banla ilişkilendiriyoruz). Kaynak
      // screenshot-basic kurulu değilse client tarafı bunu zaten sessizce
      // FAILED'a düşürür (bkz. client/main.lua coreac:screenshot handler).
      // Configuration → Settings → "Enable Gameplay Recording" (default on).
      const SHOT_COUNT = 5;
      const recordEvidence = (config.ac as any)?.Settings?.EnableGameplayRecord !== false;
      if (player.license && recordEvidence) {
        const shots = await db.$transaction(
          Array.from({ length: SHOT_COUNT }, (_, i) =>
            db.screenshotRequest.create({
              data: {
                serverId: server.id,
                playerLicense: player.license!,
                playerName: player.name,
                detectionId: detection.id,
                seq: i,
                requestedBy: "AntiCheat",
              },
              select: { id: true },
            })
          )
        );
        screenshotRequestIds = shots.map((s) => s.id);
      }

      void sendWebhook(server.config, "autoban", server.name, {
        player: player.name,
        reason: body.type,
        code: banCode,
        by: "AntiCheat",
        identifiers: { license: player.license, discord: player.discord, steam: player.steam, ip: player.ip },
      });

      // Feed the (permanent) ban into the network reputation — only if this
      // server opted to contribute. Hashed identifiers only; see network-bans.ts.
      await recordNetworkBan(server, {
        license: player.license,
        steam: player.steam,
        discord: player.discord,
        playerName: player.name,
        type: body.type,
      });
    }
  } else if (action === "KICK" && player) {
    kicked = true;
    await db.punishAction.create({
      data: {
        serverId: server.id,
        playerId: player.id,
        type: "KICK",
        reason: `Automatic kick: ${body.type}`,
        issuedBy: "AntiCheat",
        playerName: player.name,
        status: "DELIVERED",
        deliveredAt: new Date(),
      },
    });
  }

  await db.detection.update({ where: { id: detection.id }, data: { action } });

  // banned/kicked=true → kaynak oyuncuyu hemen atmalı.
  // screenshotRequestIds doluysa kaynak, DropPlayer'dan ÖNCE bu id'ler için
  // coreac:screenshot'ı tetikleyip gerçek ekran görüntüsü serisini yakalamalı.
  // label → oyun içi yönetici uyarısında okunur ad ("NoClip", "Silent Aim"…).
  return ok({
    recorded: true, action, banned, kicked, banCode, whitelisted, screenshotRequestIds,
    label: detectionLabel(body.type),
  });
});
