import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes, createHmac, randomUUID } from "crypto";

const db = new PrismaClient();

// --- Yardımcılar (src/lib ile aynı mantık, seed'i bağımsız tutmak için inline) ---
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function block(len: number) {
  const b = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[b[i] % ALPHABET.length];
  return out;
}
function genKey() {
  return `COREAC-${block(4)}-${block(4)}-${block(4)}-${block(4)}`;
}
function serverToken() {
  const token = `coreac_srv_${randomUUID().replace(/-/g, "")}${block(8)}`;
  const hash = createHmac("sha256", process.env.LICENSE_HMAC_SECRET || "dev")
    .update(token)
    .digest("hex");
  return { token, hash };
}
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function main() {
  console.log("🌱 Seed başlıyor…");

  // --- Ürünler ---
  const productDefs = [
    {
      slug: "starter",
      name: "Starter",
      description: "Core detections and the web panel for smaller servers.",
      priceCents: 1499,
      interval: "MONTHLY",
      sortOrder: 0,
      features: ["aimbot_detection", "weapon_protection", "web_panel", "player_lookup"],
    },
    {
      slug: "premium",
      name: "Premium",
      description: "Server-side detections, auto-ban and the full panel.",
      priceCents: 2999,
      interval: "MONTHLY",
      sortOrder: 1,
      features: [
        "aimbot_detection", "silent_aim_detection", "overlay_detection",
        "weapon_protection", "vehicle_protection", "godmode_protection",
        "web_panel", "ingame_menu", "live_map", "player_lookup",
        "discord_logs", "auto_ban",
      ],
    },
    {
      slug: "enterprise",
      name: "Enterprise",
      description: "Every feature, including API access and screenshots.",
      priceCents: 9999,
      interval: "LIFETIME",
      sortOrder: 2,
      features: [
        "aimbot_detection", "silent_aim_detection", "overlay_detection", "spoofer_detection",
        "weapon_protection", "vehicle_protection", "godmode_protection", "resource_protection",
        "event_protection", "explosion_protection", "web_panel", "ingame_menu", "live_map",
        "player_lookup", "discord_logs", "api_access", "auto_ban", "screenshot",
      ],
    },
  ];

  for (const p of productDefs) {
    await db.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name, description: p.description, priceCents: p.priceCents,
        interval: p.interval, features: JSON.stringify(p.features), sortOrder: p.sortOrder,
      },
      create: {
        slug: p.slug, name: p.name, description: p.description, priceCents: p.priceCents,
        currency: "EUR", interval: p.interval, features: JSON.stringify(p.features),
        sortOrder: p.sortOrder, active: true,
      },
    });
  }
  const premium = await db.product.findUnique({ where: { slug: "premium" } });
  console.log("✓ Ürünler oluşturuldu");

  // --- Kullanıcılar ---
  // SECURITY: the admin password used to be the hard-coded "Admin1234",
  // printed on every seed. Anyone who deployed with the seed shipped a
  // publicly known admin login. It now comes from SEED_ADMIN_PASSWORD, or a
  // random one is generated and printed exactly once.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || randomBytes(12).toString("base64url");
  // Databases seeded before the CoreAC rename hold these accounts under the old
  // addresses; reuse them (creating a second "admin"/"demo" would hit the
  // unique username index and abort the seed).
  const existingAdmin = await db.user.findFirst({
    where: { email: { in: ["admin@coreac.online", "admin@aeigs.gg"] } },
  });
  const admin =
    existingAdmin ??
    (await db.user.create({
      data: {
        email: "admin@coreac.online",
        username: "admin",
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: "ADMIN",
      },
    }));
  const existingDemo = await db.user.findFirst({
    where: { email: { in: ["demo@coreac.online", "demo@aeigs.gg"] } },
  });
  const customer =
    existingDemo ??
    (await db.user.create({
      data: {
        email: "demo@coreac.online",
        username: "demo",
        passwordHash: await bcrypt.hash("Demo1234", 12),
        role: "USER",
      },
    }));
  console.log(`✓ Users: ${admin.email} / ${existingAdmin ? "(existing account — password unchanged)" : process.env.SEED_ADMIN_PASSWORD ? "(SEED_ADMIN_PASSWORD)" : adminPassword}  ·  ${customer.email} (read-only demo, use /api/demo)`);
  if (!existingAdmin && !process.env.SEED_ADMIN_PASSWORD) {
    console.log("  ⚠ Save the admin password above — it is not stored anywhere else. Change it after first sign-in.");
  }

  // --- Demo müşteriye lisans ---
  const licenseFeatures = JSON.parse(premium!.features);
  const license = await db.licenseKey.create({
    data: {
      key: genKey(),
      productId: premium!.id,
      ownerId: customer.id,
      status: "ACTIVE",
      features: premium!.features,
      maxServers: 1,
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdById: admin.id,
      note: "Demo licence",
    },
  });

  // Dağıtılmamış (redeem edilebilir) birkaç hediye anahtarı
  for (let i = 0; i < 3; i++) {
    await db.licenseKey.create({
      data: {
        key: genKey(),
        productId: pick(productDefs).slug === "starter" ? undefined : premium!.id,
        status: "UNUSED",
        features: JSON.stringify(licenseFeatures.slice(0, rand(4, licenseFeatures.length))),
        maxServers: 1,
        createdById: admin.id,
        note: `Gift key #${i + 1}`,
      },
    });
  }
  console.log("✓ Lisans anahtarları oluşturuldu");

  // --- Demo sunucu (varsa temizle) ---
  await db.server.deleteMany({ where: { ownerId: customer.id, name: "Demo Server" } });
  const { token, hash } = serverToken();
  const server = await db.server.create({
    data: {
      name: "Demo Server",
      ownerId: customer.id,
      licenseKeyId: license.id,
      apiTokenHash: hash,
      ip: "8.8.8.8",
      status: "ONLINE",
      acVersion: "4.7.0",
      maxSlots: 300,
      lastSeenAt: new Date(),
      config: JSON.stringify({ discordWebhook: "" }),
    },
  });
  console.log(`✓ Demo sunucu oluşturuldu (API token: ${token})`);

  // --- Oyuncular ---
  const firstNames = ["Ahmet", "Mehmet", "Can", "Deniz", "Emir", "Kaan", "Efe", "Ali", "Burak", "Cem", "Yusuf", "Arda", "Berk", "Doruk", "Ege"];
  const suffix = ["_TR", "YT", "TTV", "99", "_RP", "xX", "Pro", "gg", "01", ""];
  const players: { id: string; name: string; license: string; online: boolean }[] = [];
  for (let i = 0; i < 48; i++) {
    const name = `${pick(firstNames)}${pick(suffix)}${rand(1, 99)}`;
    const online = i < 22;
    const lic = `license:${randomBytes(20).toString("hex")}`;
    const acts = ["walking", "driving", "shooting", "swimming", "idle"];
    const p = await db.player.create({
      data: {
        serverId: server.id,
        name,
        license: lic,
        steam: `steam:110000${rand(100000000, 199999999)}`,
        discord: `discord:${rand(100000000000000000, 999999999999999999)}`,
        ip: `${rand(1, 255)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 255)}`,
        online,
        trustScore: rand(0, 100),
        playtimeSec: rand(600, 500000),
        firstSeenAt: new Date(Date.now() - rand(1, 90) * 24 * 3600 * 1000),
        lastSeenAt: online ? new Date() : new Date(Date.now() - rand(1, 72) * 3600 * 1000),
        // Çevrimiçi oyunculara canlı konum/can/kalkan (harita + izleme demo verisi)
        ...(online
          ? {
              posX: rand(-3500, 4000),
              posY: rand(-3500, 7000),
              posZ: rand(20, 300),
              heading: rand(0, 359),
              health: rand(120, 200),
              armor: rand(0, 100),
              activity: pick(acts),
              ping: rand(15, 120),
            }
          : {}),
      },
    });
    players.push({ id: p.id, name: p.name, license: lic, online });
  }
  console.log("✓ 48 oyuncu oluşturuldu");

  // --- Tespitler (son 24 saat) ---
  const detTypes = [
    { type: "AIMBOT", sev: "HIGH" }, { type: "SILENT_AIM", sev: "HIGH" },
    { type: "OVERLAY", sev: "MEDIUM" }, { type: "ILLEGAL_WEAPON", sev: "MEDIUM" },
    { type: "GODMODE", sev: "CRITICAL" }, { type: "ILLEGAL_VEHICLE", sev: "LOW" },
    { type: "SPOOFER", sev: "HIGH" }, { type: "EVENT_EXPLOIT", sev: "CRITICAL" },
    { type: "RESOURCE_INJECT", sev: "CRITICAL" }, { type: "EXPLOSION", sev: "MEDIUM" },
  ];
  for (let i = 0; i < 89; i++) {
    const p = pick(players);
    const d = pick(detTypes);
    await db.detection.create({
      data: {
        serverId: server.id,
        playerId: p.id,
        type: d.type,
        severity: d.sev,
        playerName: p.name,
        details: JSON.stringify({ value: rand(1, 100) }),
        createdAt: new Date(Date.now() - rand(0, 24 * 60) * 60 * 1000),
      },
    });
  }
  console.log("✓ 89 tespit oluşturuldu");

  // --- Cezalar (son 24 saat) ---
  const actionTypes = ["WARN", "WARN", "KICK", "KICK", "KICK", "BAN"];
  for (let i = 0; i < 91; i++) {
    const p = pick(players);
    await db.punishAction.create({
      data: {
        serverId: server.id,
        playerId: p.id,
        type: pick(actionTypes),
        reason: pick(["Aimbot", "Silent aim", "Illegal weapon", "Godmode", "Toxic", "Exploit"]),
        issuedBy: pick(["admin", "AntiCheat", "demo", "Moderator"]),
        playerName: p.name,
        status: "DELIVERED",
        deliveredAt: new Date(),
        createdAt: new Date(Date.now() - rand(0, 24 * 60) * 60 * 1000),
      },
    });
  }
  console.log("✓ 91 ceza kaydı oluşturuldu");

  // --- Banlar ---
  for (let i = 0; i < 89; i++) {
    const p = pick(players);
    const active = i < 74;
    await db.ban.create({
      data: {
        serverId: server.id,
        playerId: p.id,
        code: `AC-${block(6)}`,
        license: p.license,
        playerName: p.name,
        reason: pick(["Aimbot use", "Silent aim", "Menu/injection", "Godmode", "Money exploit"]),
        bannedBy: pick(["admin", "AntiCheat", "demo"]),
        active,
        permanent: Math.random() > 0.3,
        createdAt: new Date(Date.now() - rand(1, 60) * 24 * 3600 * 1000),
        ...(active ? {} : { unbannedAt: new Date(), unbannedBy: "admin" }),
      },
    });
  }
  console.log("✓ 89 ban kaydı oluşturuldu");

  // --- Loglar ---
  const logs = [
    { level: "INFO", src: "system", msg: "Server started" },
    { level: "INFO", src: "anticheat", msg: "Protection modules loaded" },
    { level: "DETECTION", src: "anticheat", msg: "AIMBOT detected" },
    { level: "WARN", src: "panel", msg: "BAN → player (Aimbot) — admin" },
    { level: "ERROR", src: "system", msg: "Temporary connection issue (retried)" },
  ];
  for (let i = 0; i < 40; i++) {
    const l = pick(logs);
    await db.serverLog.create({
      data: {
        serverId: server.id,
        level: l.level,
        source: l.src,
        message: l.msg,
        createdAt: new Date(Date.now() - rand(0, 48) * 3600 * 1000),
      },
    });
  }
  console.log("✓ Loglar oluşturuldu");

  // --- Bypass (whitelist) demo ---
  await db.whitelist.createMany({
    data: [
      { serverId: server.id, kind: "discord", value: `discord:${rand(100000000000000000, 999999999999999999)}`, note: "Server owner", createdBy: "admin" },
      { serverId: server.id, kind: "license", value: players[0].license, note: "Head admin", createdBy: "admin" },
    ],
  });

  // --- Kara liste demo ---
  await db.blacklist.createMany({
    data: [
      { serverId: server.id, kind: "vehicle", model: "rhino", label: "Tank", action: "BAN", createdBy: "admin" },
      { serverId: server.id, kind: "vehicle", model: "lazer", label: "Jet", action: "KICK", createdBy: "admin" },
      { serverId: server.id, kind: "weapon", model: "weapon_rpg", label: "RPG", action: "REMOVE", createdBy: "admin" },
      { serverId: server.id, kind: "object", model: "prop_gold_bar", label: "Gold bar", action: "REMOVE", createdBy: "admin" },
    ],
  });

  // --- Yönetici (oyun içi menü izinleri) demo ---
  await db.serverAdmin.create({
    data: {
      serverId: server.id,
      identifier: `discord:${rand(100000000000000000, 999999999999999999)}`,
      displayName: "Head Admin",
      role: "ADMIN",
      permissions: JSON.stringify(["kick", "ban", "unban", "warn", "spectate", "revive", "tp", "bring", "freeze", "screenshot", "logs"]),
    },
  });
  console.log("✓ Bypass + kara liste + yönetici demo verileri");

  // --- Örnek sipariş ---
  await db.order.create({
    data: {
      userId: customer.id,
      productId: premium!.id,
      status: "PAID",
      amountCents: premium!.priceCents,
      currency: "EUR",
      provider: "MANUAL",
      licenseKeyId: license.id,
      paidAt: new Date(),
    },
  }).catch(() => {});

  console.log("\n✅ Seed tamamlandı!");
  console.log("   Admin:    admin@coreac.online (password printed above)");
  console.log("   Demo:     open /api/demo — read-only, shared by all visitors");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
