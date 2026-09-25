#!/usr/bin/env node
// =============================================================================
// CoreAC panel yönetim aracı — kurulum / başlatma / güncelleme / admin şifresi
//
//   node scripts/panel.mjs setup          ilk kurulum (tekrar çalıştırmak güvenli)
//   node scripts/panel.mjs start          paneli üretim modunda başlat
//   node scripts/panel.mjs update         git pull + bağımlılık + veritabanı + build
//   node scripts/panel.mjs reset-admin    admin şifresini sıfırla (yenisini yazar)
//   node scripts/panel.mjs set-url <adres> panelin dışarıdan erişilen adresi (APP_URL)
//
// Windows'ta aynı işler kök klasördeki kurulum.bat / baslat.bat / guncelle.bat /
// admin-sifre.bat ile çift tıklanarak yapılır.
//
// Kurallar (bu projede sık yaşanan kırılmalardan):
//   * .env ASLA ezilmez — yalnızca eksik anahtarlar eklenir.
//   * Panel çalışırken build ALINMAZ (açık sunucunun yanında `next build`
//     .next klasörünü bozar ve her API 500 döner).
//   * Canlı panel `next start` ile çalışır, `next dev` ile değil.
// =============================================================================
import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env");
const PORT = Number(process.env.PORT || argValue("--port") || 3000);

const c = {
  ok: (s) => console.log(`\x1b[32m✔\x1b[0m ${s}`),
  info: (s) => console.log(`\x1b[36m•\x1b[0m ${s}`),
  warn: (s) => console.log(`\x1b[33m!\x1b[0m ${s}`),
  err: (s) => console.error(`\x1b[31m✖\x1b[0m ${s}`),
  step: (s) => console.log(`\n\x1b[1m== ${s}\x1b[0m`),
};

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function fail(msg) {
  c.err(msg);
  process.exit(1);
}

function run(cmd, { allowFail = false } = {}) {
  c.info(cmd);
  const r = spawnSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true, env: process.env });
  if (r.status !== 0 && !allowFail) fail(`Komut başarısız oldu: ${cmd}`);
  return r.status === 0;
}

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => resolve(false));
    sock.setTimeout(1500, () => { sock.destroy(); resolve(false); });
  });
}

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) fail(`Node.js ${process.versions.node} çok eski. https://nodejs.org adresinden LTS sürümünü (18 veya üstü) kur.`);
  c.ok(`Node.js ${process.versions.node}`);
}

// --------------------------------------------------------------------- .env
function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

function ensureEnv() {
  c.step("Ortam dosyası (.env)");
  const url = argValue("--url") || "http://localhost:3000";
  const wanted = {
    DATABASE_URL: "file:./dev.db",
    AUTH_SECRET: randomBytes(32).toString("hex"),
    LICENSE_HMAC_SECRET: randomBytes(32).toString("hex"),
    APP_URL: url,
  };
  if (!existsSync(ENV_FILE)) {
    const body = Object.entries(wanted).map(([k, v]) => `${k}="${v}"`).join("\n") + "\n";
    writeFileSync(ENV_FILE, body, "utf8");
    c.ok(".env oluşturuldu (rastgele gizli anahtarlarla).");
    return;
  }
  const have = parseEnv(readFileSync(ENV_FILE, "utf8"));
  const missing = Object.keys(wanted).filter((k) => !have[k]);
  if (missing.length) {
    appendFileSync(ENV_FILE, "\n" + missing.map((k) => `${k}="${wanted[k]}"`).join("\n") + "\n", "utf8");
    c.ok(`.env mevcut; eksik anahtarlar eklendi: ${missing.join(", ")}`);
  } else {
    c.ok(".env mevcut (dokunulmadı).");
  }
  if ((have.AUTH_SECRET || wanted.AUTH_SECRET).length < 32) {
    c.warn("AUTH_SECRET 32 karakterden kısa — panel açılmaz. .env içinde uzatın.");
  }
}

// ------------------------------------------------------------------ database
async function prisma() {
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

async function userCount() {
  const db = await prisma();
  try { return await db.user.count(); } finally { await db.$disconnect(); }
}

function newPassword() {
  return randomBytes(9).toString("base64url");
}

function printCredentials(user, password) {
  const line = "=".repeat(60);
  console.log(`\n${line}\n  PANEL GİRİŞİ\n  Kullanıcı adı : ${user}\n  Şifre         : ${password}\n  (Bu şifreyi bir yere kaydet. Unutursan: admin-sifre.bat)\n${line}\n`);
}

async function ensureDatabase() {
  c.step("Veritabanı");
  run("npx prisma db push --skip-generate");
  const count = await userCount();
  if (count > 0) {
    c.ok(`Veritabanında ${count} kullanıcı var — örnek veri eklenmedi, hesaplara dokunulmadı.`);
    return;
  }
  const pw = newPassword();
  process.env.SEED_ADMIN_PASSWORD = pw;
  run("npm run db:seed");
  printCredentials("admin", pw);
}

async function resetAdmin() {
  c.step("Admin şifresi sıfırlanıyor");
  const bcrypt = (await import("bcryptjs")).default;
  const db = await prisma();
  try {
    const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!admin) fail("Veritabanında admin yok. Önce kurulum.bat çalıştır.");
    const pw = newPassword();
    await db.user.update({
      where: { id: admin.id },
      data: { passwordHash: await bcrypt.hash(pw, 12), failedLogins: 0, lockedUntil: null },
    });
    // Eski oturumlar geçersiz: şifresi sızmış olabilecek bir hesabın açık
    // oturumları da kapansın.
    await db.session.updateMany({ where: { userId: admin.id, revokedAt: null }, data: { revokedAt: new Date() } });
    printCredentials(admin.username, pw);
  } finally {
    await db.$disconnect();
  }
}

// --------------------------------------------------------------------- build
async function build() {
  c.step("Panel derleniyor (next build)");
  if (await portInUse(PORT)) {
    fail(`Port ${PORT} kullanımda — panel açık görünüyor. Panel penceresinde Ctrl+C ile kapat, sonra tekrar çalıştır.\n  (Panel açıkken derlemek .next klasörünü bozar.)`);
  }
  run("npx next build");
  c.ok("Derleme tamam.");
}

// --------------------------------------------------------------------- start
async function start() {
  checkNode();
  if (!existsSync(ENV_FILE)) fail(".env yok. Önce kurulum.bat (npm run setup) çalıştır.");
  if (await portInUse(PORT)) fail(`Port ${PORT} zaten kullanımda — panel zaten açık olabilir.`);
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    c.warn("Derlenmiş panel bulunamadı, önce derleniyor…");
    await build();
  }
  c.step(`Panel başlatılıyor → http://localhost:${PORT}  (kapatmak için Ctrl+C)`);
  const child = spawn(`npx next start -p ${PORT}`, { cwd: ROOT, stdio: "inherit", shell: true, env: process.env });
  child.on("exit", (code) => process.exit(code ?? 0));
}

// ------------------------------------------------------------------ commands
async function setup() {
  console.log("\nCoreAC panel kurulumu\n");
  checkNode();
  if (!existsSync(path.join(ROOT, "node_modules", "next"))) {
    c.step("Bağımlılıklar (npm install)");
    run("npm install");
  }
  ensureEnv();
  await ensureDatabase();
  await build();
  c.step("Kurulum tamamlandı");
  c.ok("Paneli başlatmak için: baslat.bat  (ya da: npm run panel)");
  c.info("FiveM sunucusuna kurmak için panelde: Dashboard → Download → installer'ı indir, server.cfg'nin yanına koy, çift tıkla.");
}

async function update() {
  console.log("\nCoreAC panel güncellemesi\n");
  checkNode();
  if (await portInUse(PORT)) {
    fail(`Port ${PORT} kullanımda — önce panel penceresinde Ctrl+C ile paneli kapat, sonra güncelle.`);
  }
  if (existsSync(path.join(ROOT, ".git"))) {
    c.step("Kod güncelleniyor (git pull)");
    run("git pull --ff-only");
  } else {
    c.warn("Bu klasör git ile kurulmamış; kod dosyalarını elle güncellediğini varsayıyorum.");
    c.info("İpucu: git clone ile kurarsan bir dahaki güncelleme tek tık olur (bkz. KURULUM.md).");
  }
  c.step("Bağımlılıklar (npm install)");
  run("npm install");
  ensureEnv();
  c.step("Veritabanı şeması");
  run("npx prisma db push --skip-generate");
  await build();
  c.step("Güncelleme tamamlandı");
  c.ok("Paneli başlat: baslat.bat");
  c.info("FiveM tarafı: sunucudaki CoreAC-Installer-….bat dosyasını tekrar çalıştır, sonra sunucuyu restart et.");
}

// Panelin DIŞARIDAN erişilen adresi. Installer bunu FiveM sunucusuna
// "coreac_api" olarak yazar; oyuncuların ekran görüntüleri de bu adrese
// yüklenir — bu yüzden localhost değil, oyuncuların ulaşabildiği adres olmalı.
async function setUrl() {
  const url = (process.argv[3] || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+$/.test(url)) {
    fail("Kullanım: node scripts/panel.mjs set-url http://SUNUCU_IP:3000   (ya da https://panel.alanadin.com)");
  }
  if (!existsSync(ENV_FILE)) fail(".env yok. Önce kurulum.bat çalıştır.");
  const text = readFileSync(ENV_FILE, "utf8");
  const line = /^[ \t]*APP_URL[ \t]*=.*$/m;
  const next = line.test(text)
    ? text.replace(line, `APP_URL="${url}"`)
    : text.trimEnd() + `\nAPP_URL="${url}"\n`;
  writeFileSync(ENV_FILE, next, "utf8");
  c.ok(`APP_URL = ${url}`);
  c.info("Paneli yeniden başlat (panel penceresinde Ctrl+C, sonra baslat.bat), sonra Download sayfasından installer'ı YENİDEN indir.");
}

const cmd = process.argv[2];
const commands = { setup, start, update, "reset-admin": resetAdmin, "set-url": setUrl };
if (!commands[cmd]) {
  console.log("Kullanım: node scripts/panel.mjs <setup|start|update|reset-admin|set-url> [--port 3000] [--url https://panel.alanadin.com]");
  process.exit(1);
}
commands[cmd]().catch((e) => fail(e?.message || String(e)));
