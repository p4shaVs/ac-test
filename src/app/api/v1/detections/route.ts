import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { authenticateServer } from "@/lib/server-auth";
import { rateLimit } from "@/lib/ratelimit";
import { generateBanCode } from "@/lib/keys";
import { parseJson } from "@/lib/utils";
import { isWhitelisted } from "@/lib/bypass";
import { sendWebhook, webhookEnabled } from "@/lib/discord";
import { sanitizeActions, sanitizeExplicit, resolveAction, capByConfidence, severityForType, detectionLabel, detectionConfidence } from "@/lib/detection-actions";
import { readAcSettings, punishmentsOn } from "@/lib/ac-settings";
import { recordNetworkBan } from "@/lib/network-bans";

// One panel log line an hour per server when a chosen Ban had to be applied as a Kick, so the
// owner can see why a Ban they picked did not ban.
const downgradeNoted = new Map<string, number>();
async function noteDowngrade(serverId: string, why: string): Promise<void> {
  const now = Date.now();
  if (now - (downgradeNoted.get(serverId) ?? 0) < 3_600_000) return;
  downgradeNoted.set(serverId, now);
  await db.serverLog
    .create({ data: { serverId, level: "WARN", source: "panel", message: `A Ban was applied as a Kick: ${why}` } })
    .catch(() => {});
}

// Kaynak, bir hile tespitini raporlar. Aksiyon (LOG/KICK/BAN) müşterinin
// Yapılandırma → Aksiyonlar sayfasında tespit tipi bazında seçtiği değerdir.
// CRITICAL raporlar "replay" (ban-anı son ~8 sn) taşıyabilir — panelde izlenir.
const schema = z.object({
  type: z.string().max(40),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  playerName: z.string().max(80),
  license: z.string().max(120).optional(),
  // The identifiers the resource saw for this player. Used to create the player record when the
  // report beats the first player sync (a cheater who trips a check seconds after joining).
  ids: z
    .object({
      license: z.string().max(120).optional(),
      steam: z.string().max(120).optional(),
      discord: z.string().max(120).optional(),
      ip: z.string().max(64).optional(),
    })
    .optional(),
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

  let player = body.license
    ? await db.player.findUnique({
        where: { serverId_license: { serverId: server.id, license: body.license } },
      })
    : null;
  // No player record yet (the report arrived before the first player sync): without one the
  // detection could only ever be logged, so a cheater acting in their first seconds on the
  // server would dodge the Kick / Ban the owner picked. Create the record from the ids.
  if (!player && body.license && body.ids?.license === body.license) {
    player = await db.player.upsert({
      where: { serverId_license: { serverId: server.id, license: body.license } },
      create: {
        serverId: server.id,
        name: body.playerName,
        license: body.license,
        steam: body.ids.steam,
        discord: body.ids.discord,
        ip: body.ids.ip,
        online: true,
      },
      update: { lastSeenAt: new Date() },
    });
  }

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
    ? await isWhitelisted(
        server.id,
        { license: player.license, discord: player.discord, steam: player.steam, ip: player.ip },
        body.type // scoped entries only exempt the protections they list
      )
    : false;

  // ---------------------------------------------------------------------
  // Aksiyon kararı: müşterinin Yapılandırma → Aksiyonlar'da tespit tipi
  // bazında seçtiği LOG / KICK / BAN. Ayar yoksa tipin varsayılanı kullanılır.
  // ---------------------------------------------------------------------
  const config = parseJson<Record<string, unknown>>(server.config, {});
  const actions = sanitizeActions(config.actions);
  // What the owner picked is applied exactly (see resolveAction); only types they never touched
  // keep the confidence cap of the shipped defaults.
  const explicitTypes = new Set(sanitizeExplicit(config.actionsExplicit));
  let action = resolveAction(actions, body.type, body.origin, explicitTypes);
  const chosenAction = action;

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
  if (action === "BAN" && !features.includes("auto_ban")) {
    action = "KICK";
    void noteDowngrade(server.id, "this licence has no Auto Ban feature");
  }
  if (whitelisted || !player) action = "LOG";
  // Yetkili muafiyeti (Settings → Staff Bypass): tespit kayıtlı, ceza yok.
  if (body.bypass === "staff") action = "LOG";

  // Ceza anahtarları (Configuration → Settings):
  //   * LOG-ONLY (deneme) modu — geçici; FP-riskli korumaları açıp önce loglardan
  //     false-positive var mı izlemek için.
  //   * Enable Bans — kalıcı politika anahtarı.
  // İkisinden biri kapatıyorsa HİÇBİR tespit kick/ban ATMAZ (ban kaydı bile açılmaz),
  // yalnızca kaydedilir. Elle verilen ban/kick'ler (moderate / oyun içi menü) etkilenmez.
  const settings = readAcSettings(server.config);
  if (!punishmentsOn(settings)) action = "LOG";

  // Otomatik ban süresi (gün). 0 = kalıcı.
  const banDays = settings.BanDuration;
  const banExpiresAt = banDays > 0 ? new Date(Date.now() + banDays * 86_400_000) : null;

  let banned = false;
  let kicked = false;
  let banCode: string | null = null;
  let screenshotRequestIds: string[] = [];

  if (action === "BAN" && player) {
    // Tekrarlı ban engeli: oyuncunun zaten aktif banı varsa yeni ban açma.
    // Süresi dolmuş ama henüz pasifleştirilmemiş (GET /bans ~dakikada bir temizler)
    // süreli ban sayılmaz: yoksa oyuncu yeni bir tespitle ban yemezdi.
    const existingBan = await db.ban.findFirst({
      where: {
        serverId: server.id, playerId: player.id, active: true,
        OR: [{ permanent: true }, { expiresAt: { gt: new Date() } }],
      },
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
            permanent: banDays === 0,
            expiresAt: banExpiresAt,
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
      // Configuration → Settings → Bans & Evidence:
      //   Enable Gameplay Record  → kare serisi (Optimize Record Mode: 3 hafif kare, yoksa 5)
      //   yalnızca Enable Screen Shots → tek kare
      const shotCount = settings.EnableGameplayRecord
        ? settings.OptimizeRecordMode ? 3 : 5
        : settings.EnableScreenShots ? 1 : 0;
      if (player.license && shotCount > 0) {
        const shots = await db.$transaction(
          Array.from({ length: shotCount }, (_, i) =>
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

      // Feed the (permanent) ban into the network reputation — only if this
      // server opted to contribute. Hashed identifiers only; see network-bans.ts.
      // A time-limited ban (Ban Duration) is a local sentence, not a network flag.
      if (banDays === 0) {
        await recordNetworkBan(server, {
          license: player.license,
          steam: player.steam,
          discord: player.discord,
          playerName: player.name,
          type: body.type,
        });
      }
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

  // Enable Screen Shots: ONE screenshot at the moment of a detection that kicks, or
  // that is strong evidence on its own. Noisy heuristics never get one, and a
  // player gets at most one a minute (and a server 200 an hour) so a chatty check
  // cannot fill the disk or hammer the players' uploads.
  if (
    !banned && player?.license && settings.EnableScreenShots &&
    (action === "KICK" || (detectionConfidence(body.type) !== "heuristic" && body.bypass !== "staff" && !whitelisted))
  ) {
    const [lastMinute, lastHour] = await Promise.all([
      db.screenshotRequest.count({
        where: { serverId: server.id, playerLicense: player.license, detectionId: { not: null }, createdAt: { gte: new Date(Date.now() - 60_000) } },
      }),
      db.screenshotRequest.count({
        where: { serverId: server.id, requestedBy: "AntiCheat", createdAt: { gte: new Date(Date.now() - 3_600_000) } },
      }),
    ]);
    if (lastMinute === 0 && lastHour < 200) {
      const shot = await db.screenshotRequest.create({
        data: {
          serverId: server.id,
          playerLicense: player.license,
          playerName: player.name,
          detectionId: detection.id,
          seq: 0,
          requestedBy: "AntiCheat",
        },
        select: { id: true },
      });
      screenshotRequestIds = [shot.id];
    }
  }

  await db.detection.update({ where: { id: detection.id }, data: { action } });

  // Discord: ONE message per detection, sent after the outcome is known
  // (it used to post "detection" before the decision and "autoban" again after).
  const hookEvent = banned && webhookEnabled(server.config, "autoban", { action }) ? "autoban" : "detection";
  void sendWebhook(server.config, hookEvent, server.name, {
    player: body.playerName,
    detectionType: body.type,
    detectionLabel: detectionLabel(body.type),
    action,
    origin: body.origin,
    staff: body.bypass === "staff",
    code: banCode ?? undefined,
    by: whitelisted ? "Trust whitelist (not punished)" : undefined,
    evidence: rawDetails,
    identifiers: player
      ? { license: player.license, discord: player.discord, steam: player.steam, ip: player.ip }
      : undefined,
    panelPath: banned ? `/dashboard/servers/${server.id}/bans` : `/dashboard/servers/${server.id}/logs`,
  });

  // banned/kicked=true → kaynak oyuncuyu hemen atmalı.
  // screenshotRequestIds doluysa kaynak, DropPlayer'dan ÖNCE bu id'ler için
  // coreac:screenshot'ı tetikleyip gerçek ekran görüntüsü serisini yakalamalı.
  // label → oyun içi yönetici uyarısında okunur ad ("NoClip", "Silent Aim"…).
  return ok({
    recorded: true, action, chosen: chosenAction, banned, kicked, banCode, whitelisted, screenshotRequestIds,
    label: detectionLabel(body.type),
    // Shown on the ban screen ("Expires …"); null = permanent.
    banExpiresAt: banned && banExpiresAt ? banExpiresAt.toISOString() : null,
    // Optimize Record Mode: lighter JPEGs for the evidence frames.
    screenshotQuality: settings.OptimizeRecordMode ? 0.55 : null,
  });
});
