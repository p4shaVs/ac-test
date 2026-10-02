# CoreAC — Geliştirici Devir Belgesi

Bu belge projeyi **yeni bir oturumda / pencerede** kaldığın yerden sürdürmek için yazıldı. Yeni oturumdaki asistana ilk mesajda şunu söylemen yeterli:

> `GELISTIRICI-DEVIR.md` dosyasını baştan sona oku, sonra `git status` ile mevcut durumu kontrol et ve bana "Açık işler" listesinden ne yapmak istediğimi sor.

Son güncelleme: **2026-09-30**. Kullanıcı Türkçe yanıt ister; kod yorumları Türkçe, panel arayüzü İngilizcedir.

---

## 1. Proje nedir?

CoreAC, **FiveM (GTA V) sunucuları için satılan bir anti-cheat ürünüdür**. İki parçadan oluşur:

| Parça | Konum | Teknoloji |
|---|---|---|
| **Web panel** (satış, lisans, sunucu yönetimi, tespitler, banlar, loglar) | repo kökü (`src/`, `prisma/`) | Next.js 14 App Router, TypeScript, Tailwind, Prisma 5.22 + SQLite, Zod, jose (JWT) |
| **FiveM resource** (oyun sunucusunda çalışan anti-cheat) | `fivem-resource/coreac/` | Lua 5.4 (CfxLua), NUI (HTML/CSS/JS), `shared.js` native hook'ları |

Resource panele HTTP ile bağlanır (`coreac_api` + `coreac_token` convar'ları). Heartbeat ile ayarları çeker, tespitleri `/api/v1/detections`'a yollar. **Ceza kararını (LOG/KICK/BAN) panel verir**, resource uygular.

Ürün eskiden **"Aeigs"** adıyla dağıtıldı. Eski anahtarlar/convar'lar hâlâ çalışmalı (bkz. §10).

---

## 2. Mevcut durum (2026-09-30)

### Git
- Branch: **`coreac-overhaul`** (main'e değil buraya çalışılıyor). Remote: `https://github.com/p4shaVs/ac-test.git`
- Son pushlanan commit: **`41b3851`** "PvP protection: addon weapons, one-shot kills, headshot review, detailed kill log"
- **Commit edilmemiş, hazır ve test edilmiş iş: Ban kaçırma engeli** (bkz. §7.9). Dosyalar:
  - `prisma/schema.prisma` — Player: `tokens`, `deviceId`; Ban: `tokens`, `deviceId`, `evasionOf`
  - `fivem-resource/coreac/server/main.lua` — token okuma, eşleştirme, `coreac:device` handler
  - `fivem-resource/coreac/client/device.lua` (yeni) + `fxmanifest.lua` kaydı
  - `src/app/api/v1/bans/evasion/route.ts` (yeni), `src/app/api/v1/bans/route.ts`, `src/app/api/v1/players/sync/route.ts`
  - `src/app/api/servers/[id]/unban/route.ts`, `src/app/api/v1/ingame/unban/route.ts` (bağlı banları da kaldırır)
  - `src/lib/rules.ts` — `anti_ban_evasion` kuralı
  - `tools/sim/` (yeni, test aracı) + `.gitignore` satırı + bu belge
- **Commit'e EKLENMEMESİ gerekenler:** `brag-output-2026-09-27-151630/` (tanıtım videosu çıktısı, 8+ MB), `.env`, `prisma/*.db`.
  Commit ederken yolları tek tek ver: `git add fivem-resource/coreac src prisma/schema.prisma tools/sim .gitignore GELISTIRICI-DEVIR.md`
- Kullanıcı açıkça "pushla" demeden commit/push yapılmaz. Commit mesajının sonuna ortam ne istiyorsa o attribution satırı eklenir.

### Kullanıcının diğer bilgisayarı
Kullanıcı testleri başka bir makinede yapar (Administrator hesabı, klasör `ac-test-coreac-overhaul`, genelde **ZIP** olarak indirir). Güncelleme adımları:
1. Paneli Ctrl+C ile kapat
2. ZIP'i eski klasörün üstüne aç (`.env` ve `prisma\dev.db` korunur) → `guncelle.bat` (şema değişikliğini `prisma db push` ile otomatik uygular)
3. `baslat.bat`
4. FiveM sunucusunda panelden indirilen `CoreAC-Installer-….bat`'ı tekrar çalıştır → sunucuyu restart et

### Canlı yayın (coreac.online) — YARIM
- Hosting: **Netlack cPanel** (`cpl.netlack.com`, kullanıcı `coreajpm`), domain `coreac.online`, SSL aktif. Node.js App: kök `/home/coreajpm/ac-panel`, Node 20.19.4, startup `server.js`.
- **Durum: her sayfa 500 veriyor.** Kök neden `stderr.log`'da görüldü: `@prisma/client did not initialize yet` → nodevenv içindeki `.prisma/client` hiç oluşturulmamış.
- Kısıtlar: **Terminal/SSH yok**, bellek sınırı **1 GB** → sunucuda `prisma generate` / `next build` çalışmaz (OOM). Her şey yerelde derlenip yüklenmeli.
- Hazırlanmış paketler: `Masaüstü\coreac-yukleme\` → `coreac-panel-update.zip` (.next + public + package.json + `scripts/db-upgrade.cjs`), `coreac-prisma-client.zip` (rhel-openssl-1.1.x ve 3.0.x motorlu Prisma client).
  **Bu paketler ban kaçırma engelinden ÖNCE derlendi.** Ban kaçırma pushlanırsa paketler yeniden derlenmeli ve `db-upgrade.cjs`'e yeni sütunlar eklenmeli (`Player.tokens`, `Player.deviceId`, `Ban.tokens`, `Ban.deviceId`, `Ban.evasionOf`).
- Windows `Compress-Archive` zip'leri Linux'ta klasör izinlerini bozar → **yalnızca dosya girdili zip** kullan (önceki oturumdaki `mkzip.mjs` mantığı: dizin girdisi yazma).
- Önceki oturumda tarayıcıdan cPanel UAPI ile dosya okuma/yazma, otomatik izin denetimi tarafından engellendi. Kullanıcı elle yükleme adımlarını da ertelediğini söyledi. Devam edilecekse: kullanıcıya File Manager adımları verilir ya da izin istenir.

---

## 3. Günlük komutlar

| Komut | Ne yapar |
|---|---|
| `kurulum.bat` / `npm run setup` | İlk kurulum: paketler, `.env` (rastgele gizli anahtarlar), DB, admin hesabı, derleme |
| `baslat.bat` / `npm run panel` | Paneli **üretim modunda** (`next start`) başlatır |
| `guncelle.bat` / `npm run panel:update` | `git pull` + paketler + `prisma db push` + derleme (panel kapalıyken) |
| `admin-sifre.bat` / `npm run admin:reset` | Admin şifresini sıfırlar |
| `panel-adresi.bat` | `APP_URL` ayarlar (installer bu adresi resource'a yazar) |
| `npm run check:ac` | **Panel ↔ Lua tutarlılık kontrolü** (her değişiklikten sonra) |
| `npx tsc --noEmit -p .` | TypeScript kontrolü |
| `npx prisma db push` | Şemayı yerel DB'ye uygular (veri silmez; yalnızca ekleme yapan değişikliklerde) |

Bütün `.bat` dosyaları `scripts/panel.mjs`'i çağırır. Kullanıcı kılavuzu: `KURULUM.md`. Kullanıcıya yönelik genel tanıtım: `README.md`.

`.env` anahtarları: `DATABASE_URL`, `AUTH_SECRET`, `LICENSE_HMAC_SECRET`, `APP_URL` (değerler `.env.example`'da açıklamalı). `.env` ve `prisma/dev.db` **gitignore'dadır, asla commit edilmez.**

---

## 4. Dizin yapısı (önemli dosyalar)

```
prisma/schema.prisma          User, Session, Product, Order, LicenseKey, Server, Whitelist, Blacklist,
                              ScreenshotRequest, ServerCommand, ServerAdmin, Player, Ban, ServerResource,
                              Detection, PunishAction, NetworkBan, ServerLog, AuditLog
scripts/panel.mjs             kurulum/başlatma/güncelleme/şifre sıfırlama mantığı
scripts/check-ac-consistency.js   panel ↔ Lua anahtar/tip/kural tutarlılık denetimi

src/lib/
  detection-actions.ts        TESPİT KAYDI