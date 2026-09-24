# Core Shield Anti-Cheat

FiveM için **SaaS anti-cheat** platformu: web panel (Next.js) + lisans/key sistemi +
FiveM Lua resource (client tespitleri + sunucu korumaları). Panelden kurallar açılır,
key üretilir, sunucular yönetilir; oyun içinde hileler tespit edilip otomatik banlanır.

> **Kısa yol:** Kurulum için [Hızlı başlangıç](#4-hızlı-başlangıç-lokal) bölümü.
> FiveM resource kurulumu için [FiveM Resource](#7-fivem-resource-kurulumu) bölümü.
> Şu an **yerel/tek makine** kurulumu için yapılandırılmış (SQLite, `npm run dev`).

---

## İçindekiler
1. [Mimari genel bakış](#1-mimari-genel-bakış)
2. [Teknoloji yığını](#2-teknoloji-yığını)
3. [Proje yapısı](#3-proje-yapısı)
4. [Hızlı başlangıç (lokal)](#4-hızlı-başlangıç-lokal)
5. [Ortam değişkenleri](#5-ortam-değişkenleri)
6. [Veritabanı & seed](#6-veritabanı--seed)
7. [FiveM resource kurulumu](#7-fivem-resource-kurulumu)
8. [Key / lisans sistemi](#8-key--lisans-sistemi)
9. [Roller ve sayfalar](#9-roller-ve-sayfalar)
10. [Tespit sistemi (anti-cheat)](#10-tespit-sistemi-anti-cheat)
11. [Hile test/kayıt modu](#11-hile-testkayıt-modu)
12. [REST API (v1) referansı](#12-rest-api-v1-referansı)
13. [Güvenlik notları](#13-güvenlik-notları)
14. [Sık sorunlar](#14-sık-sorunlar)

---

## 1) Mimari genel bakış

```
┌──────────────────┐        HTTPS (Bearer aeigs_srv_…)      ┌─────────────────────┐
│  FiveM Sunucusu  │  ─────────────────────────────────►    │   Web Panel (Next)  │
│  aeigs-anticheat │   heartbeat / players / detections      │   /api/v1/*  (REST) │
│  (Lua resource)  │  ◄─────────────────────────────────    │                     │
│                  │   pending actions / commands / rules    │   Prisma ← SQLite   │
└──────────────────┘                                         └─────────────────────┘
        ▲                                                              ▲
        │ oyun içi tespitler (client/detections/*.lua)                │ panel (owner/admin)
        │ sunucu korumaları (server/*.lua)                            │ dashboard + admin
```

- **Client Lua** her hileyi ayrı dosyada tespit eder → sunucuya raporlar.
- **Server Lua** olay-tabanlı korumalar (silah/patlama/silent aim/godmode) + panele köprü.
- **Web panel** kuralları/keyleri/banları yönetir; `/api/v1` üzerinden resource ile konuşur.
- **DB (SQLite)** kullanıcı, lisans, sunucu, oyuncu, ban, tespit, log, denetim kayıtlarını tutar.

---

## 2) Teknoloji yığını

| Katman | Teknoloji |
|--------|-----------|
| Web framework | Next.js 14 (App Router) |
| Dil | TypeScript, React 18 |
| DB / ORM | SQLite + Prisma 5 |
| Kimlik doğrulama | Kendi JWT'si (`jose`) + `bcryptjs` (parola) |
| Doğrulama | `zod` |
| Grafik/3D | `recharts`, `three` (3D harita) |
| Stil | Tailwind CSS |
| Oyun tarafı | FiveM Lua (client + server) |

---

## 3) Proje yapısı

```
Aeigs-anticheat/
├─ prisma/
│  ├─ schema.prisma          # 18 model (User, Server, LicenseKey, Ban, Detection, …)
│  └─ seed.ts                # admin + demo kullanıcı + örnek veri
├─ src/
│  ├─ app/
│  │  ├─ (auth)/             # login / register
│  │  ├─ dashboard/          # müşteri paneli (sunucular, banlar, harita, kurallar…)
│  │  ├─ admin/              # admin paneli (keyler, ürünler, kullanıcılar, denetim)
│  │  ├─ api/
│  │  │  ├─ v1/…             # FiveM-facing REST API (Bearer token)
│  │  │  └─ …                # panel API'leri (oturum tabanlı)
│  │  ├─ pricing/ ban/ docs/ # public sayfalar
│  │  └─ page.tsx            # landing
│  └─ lib/                   # db, jwt, session, keys, features, rules, bypass, …
├─ fivem-resource/aeigs-anticheat/
│  ├─ fxmanifest.lua
│  ├─ config.lua
│  ├─ client/
│  │  ├─ core.lua            # paylaşılan durum + yardımcılar (İLK yüklenir)
│  │  ├─ detections/*.lua    # her hile ayrı dosya
│  │  ├─ main.lua            # konum/ekran görüntüsü
│  │  └─ admin.lua           # oyun içi yönetici: /ac komutları + görsel NUI menü (/acmenu, F6)
│  ├─ html/                  # NUI admin menü (menu.html/.css/.js)
│  └─ server/
│     ├─ http.lua main.lua live.lua protection.lua
│     ├─ godmode_guard.lua   # godmode 3. katman (server tarafı hasar-emilimi)
│     └─ recorder.lua        # hile test kaydı
└─ README.md
```

---

## 4) Hızlı başlangıç (lokal)

> Proje **SQLite** kullanır — ekstra veritabanı sunucusu kurmaya gerek yok,
> her şey `dev.db` dosyasında tutulur. Tamamen tek makinede (yerel) çalışır.

```bash
# 1. Bağımlılıklar
npm install

# 2. Ortam dosyası
cp .env.example .env
#   Windows PowerShell'de: copy .env.example .env
#   AUTH_SECRET ve LICENSE_HMAC_SECRET'i rastgele, uzun bir değerle değiştir.

# 3. Tabloları oluştur + örnek veri
npm run db:push
npm run db:seed

# 4. Geliştirme sunucusu
npm run dev        # http://localhost:3000
```

Seed sonrası giriş bilgileri:
- **Admin:** `admin@aeigs.gg` — parola `SEED_ADMIN_PASSWORD` ortam değişkeninden alınır; verilmezse seed rastgele bir parola üretip **bir kez** konsola yazar. Sabit/bilinen bir admin parolası yoktur.
- **Demo:** `/api/demo` adresi herkesi paylaşılan demo hesabına **salt-okunur** olarak sokar (tüm yazma istekleri 403). Demo hesabı normal giriş formundan açılsa bile salt-okunurdur.

> ⚠️ Daha önce seed çalıştırdıysan eski `Admin1234` parolası veritabanında durur — ilk girişte değiştir.

### npm script'leri
| Script | Ne yapar |
|--------|----------|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | `prisma generate && next build` |
| `npm start` | Prod sunucusu (build sonrası) |
| `npm run db:push` | Şemayı DB'ye uygular |
| `npm run db:seed` | Örnek veriyi ekler |
| `npm run db:studio` | Prisma Studio (DB görüntüleyici) |
| `npm run lint` | ESLint |

---

## 5) Ortam değişkenleri

`src/lib/env.ts` açılışta bunları **zod** ile doğrular; eksik/zayıfsa uygulama başlamaz.

| Değişken | Zorunlu | Kural | Açıklama |
|----------|:------:|-------|----------|
| `DATABASE_URL` | ✅ | min 1 | SQLite dosya yolu, örn. `file:./dev.db` |
| `AUTH_SECRET` | ✅ | **≥32 karakter** | Oturum JWT imzalama anahtarı. `openssl rand -base64 48` |
| `LICENSE_HMAC_SECRET` | ✅ | **≥16 karakter** | Lisans/API token imzalama tuzu. Kurulumdan sonra DEĞİŞTİRME |
| `APP_URL` | ⛔ (varsayılan localhost) | URL | Uygulama temel URL'i |
| `NODE_ENV` | otomatik | enum | development/production/test |

> `AUTH_SECRET` değişirse tüm oturumlar düşer. `LICENSE_HMAC_SECRET` değişirse
> tüm sunucu API token'ları geçersiz olur (yeniden token üretmek gerekir).

---

## 6) Veritabanı & seed

Prisma şeması **18 model** içerir:

`User`, `Session`, `Product`, `Order`, `LicenseKey`, `Server`, `Whitelist`,
`Blacklist`, `ScreenshotRequest`, `ServerCommand`, `ServerAdmin`, `Player`,
`Ban`, `ServerResource`, `Detection`, `PunishAction`, `ServerLog`, `AuditLog`.

Öne çıkanlar:
- **LicenseKey** — `AEIGS-XXXX-XXXX-XXXX-XXXX` formatı, durum (ACTIVE/REVOKED/SUSPENDED),
  süre, ürün ilişkisi.
- **Server** — sahibi, `apiTokenHash` (ham token saklanmaz), kurallar (JSON), heartbeat.
- **Player** — lisans başına kimlik, `trustScore` (tespitlerle düşer).
- **Ban** — ban kodu, sebep, kim/ne zaman, kalıcı/süreli.
- **Detection** — tip, severity, detay (JSON), oyuncu.

Şema değişince: `npm run db:push` (dev) veya migration akışın.

---

## 7) FiveM resource kurulumu

1. `fivem-resource/aeigs-anticheat` klasörünü sunucunun `resources/` dizinine kopyala.
2. `server.cfg`'ye ekle (panelden **Ayarlar**'dan al):
   ```cfg
   set aeigs_api   "http://SUNUCU-IP-VEYA-DOMAIN:3000/api/v1"
   set aeigs_token "aeigs_srv_xxxxxxxxxxxxxxxx"
   ensure aeigs-anticheat
   ```
3. (Opsiyonel) Ekran görüntüsü için `screencapture` resource'unu kur ve **tek bir**
   `ensure screencapture` satırı ekle. Yükleme adresi panelden otomatik türetilir.

### Yükleme sırası (fxmanifest)
`config → client/core.lua → detections/*.lua → main.lua → admin.lua`
(server tarafı: `http → main → live → protection → godmode_guard → recorder`).
**`core.lua` ilk yüklenmeli** — tüm tespitler onun paylaşılan durumunu kullanır.

### `config.lua` başlıca ayarlar
| Ayar | Varsayılan | Açıklama |
|------|-----------|----------|
| `aeigs_api` / `aeigs_token` | convar | Panel API adresi ve sunucu token'ı |
| `MaxWeaponDamage` | 400 | Bilinmeyen/addon silahlar için tek atış hasar tavanı (vanilla silahlar sınıf bazlı tavan kullanır: pistol/smg 250, rifle 320, mg 380, shotgun 500, sniper 900 — `bridge/weapon_data.lua`) |
| `GodmodeMinHits/MinDamage/Strikes` | 5/150/2 | Sunucu tarafı godmode (hasar-emilimi) eşikleri |
| `HeartbeatInterval` vb. | saniye | Panel senkron aralıkları |

---

## 7b) Ağ itibarı (global ban ağı)

Bir müşterinin sunucusunda **kalıcı** banlanan oyuncu, ağdaki diğer sunuculara
girişte sinyal olur. Rakiplerden ayrışma noktası; **false-ban üretmeyecek**
şekilde tasarlandı:

- **Gizlilik:** paylaşılan tabloda ham kimlik YOK — yalnızca keyed-HMAC hash
  (license/steam/discord). **IP hiç paylaşılmaz.**
- **Zehirlenmeye direnç:** oyuncu ancak **≥ 2 FARKLI sahip** (owner) tarafından
  banlanınca "flag" olur (`NETWORK_MIN_OWNERS`, `src/lib/network-bans.ts`). Tek
  bir müşteri masum oyuncuyu ağ-geneli damgalayamaz.
- **Asla ban yok:** ağ bir sinyaldir, kanıt değil. Sunucunun kendi politikası
  (Sunucu → Ayarlar → *Network reputation*) kararı verir: **Off / Log / Kick**.
  Varsayılan **Log** (içeri alır, panelde + Discord'da işaretler).
- **Adalet:** yerel **unban**, o sahibin ağ katkısını pasifleştirir — hatalı ban
  oyuncuyu ağda kalıcı damgalamaz.
- **Hataya dayanıklı:** panel yavaş/erişilemezse giriş **engellenmez** (fail-open).

Kaynak, girişte (yerel ban kontrolü geçince) `POST /api/v1/network/check` çağırır;
panel `{ flagged, action, distinctOwners }` döner. Flag'li tespit panelde
`NETWORK_BAN` tipiyle görünür.

---

## 7c) Oyun içi yönetim paneli (F6 / `/acmenu`)

Ekranın ortasında açılan büyük NUI paneli — webde yapılanların çoğu oyunda:

| Sekme | İçerik | Gerekli izin |
|---|---|---|
| **Players** | Canlı liste (arama, ping) + oyuncu kartı: can/zırh, güven puanı, oyun süresi, geçmiş, lisans/Discord (IP asla) | herhangi bir izin |
| | Aksiyonlar: Spectate, Revive, Go to, Bring, Freeze/Unfreeze, Screenshot, Warn, Kick, **Ban (1 saat → kalıcı)** | ilgili izin |
| **Bans** | Aktif banlar + **oyun içinden Unban** | `ban` / `unban` |
| **Kicks / Warnings** | Son kick/uyarı kayıtları | `kick` / `warn` |
| **Detections / Server Logs** | AC tespitleri ve sunucu logları | `logs` |
| **Server** | Duyuru, yetkilerin, oturum bilgisi | `announce` (duyuru) |

İzinler panelden verilir (Server → Admins). Yeni izinler: **`unban`**, **`logs`**.
Güvenlik: panel sadece arayüzdür — her aksiyon ve her veri isteği sunucuda
`Aeigs.hasPerm` + oran sınırından geçer; oyuncu adları/sebepler XSS'e karşı düz
metin olarak basılır. Admin kendini kick/ban/spectate edemez (kendi satırında
yalnızca Revive).

İzleme artık düzgün: admin dondurulur (düşüp ölmez, noclip tespitine takılmaz),
**Stop** ile sunucu onaylı ışınlanmayla eski konumuna döner. `/ac spectate 0` da çalışır.

---

## 8) Key / lisans sistemi

Akış:

1. **Admin panel → Keyler** — key üretilir: `AEIGS-XXXX-XXXX-XXXX-XXXX`
   (kriptografik rastgele; `0/O`, `1/I` gibi karışan karakterler yok).
2. **Müşteri → Kod Kullan (Redeem)** — key'i hesabına tanımlar; bir **Server** oluşur.
3. **Sunucu API token'ı** üretilir: `aeigs_srv_…`. Ham token **yalnızca bir kez**
   gösterilir; DB'de sadece **HMAC hash** saklanır (sızarsa token kullanılamaz).
4. FiveM resource bu token ile `Authorization: Bearer aeigs_srv_…` başlığıyla
   `/api/v1`'e bağlanır.
5. Her istekte lisans doğrulanır: **REVOKED/SUSPENDED** → 403, **süresi dolmuş** → 403.

İlgili kod: `src/lib/keys.ts` (üretim/hash), `src/lib/server-auth.ts` (token doğrulama).

---

## 9) Roller ve sayfalar

### Public
`/` landing · `/pricing` fiyatlar/satın alma · `/ban` ban kodu sorgulama · `/docs` dokümanlar

### Müşteri paneli (`/dashboard`)
Sunucular listesi · yeni sunucu · **Kod Kullan** · sunucu başına:
genel bakış (**Güvenlik Skoru** widget'ı ile), oyuncular, banlar (**ban replay**
izleyici + **CSV dışa aktarma**), kick/uyarı, **bağlantılı hesaplar** (ban atlatma
tespiti), **kurallar + aksiyonlar** (her hile için Log/Kick/Ban seçimi), whitelist
(bypass), blacklist (araç/silah/model), **3D harita**, izleme, konsol, loglar,
olaylar, **sorgulama (lookup)**, analytics, kaynaklar (start/stop/restart), ayarlar (token).

### Admin paneli (`/admin`)
Genel bakış · **key üretici** · ürünler · kullanıcılar · sunucular · **denetim (audit) log**.

Yetkilendirme: panel API'leri **oturum tabanlı** (`requireUser` / `requireOwnedServer`),
FiveM API'leri **Bearer token** tabanlı.

---

## 10) Tespit sistemi (anti-cheat)

### Client tespitleri (her hile ayrı dosya — `client/detections/`)
| Dosya | Yakaladığı | Yöntem |
|-------|-----------|--------|
| `noclip.lua` | NoClip (yaya + araç) | Çarpışma kapalı VEYA zemin altında hareket, ~600ms, iki bağımsız sinyal |
| `flyhack.lua` | Fly Hack | Sürdürülebilir (~2.4 sn) yerçekimsiz uçuş/asılı kalma |
| `godmode.lua` | Godmode (destekleyici) | Native bayrak taraması (invincible/proofs), rapor-only |
| `superjump.lua` | Super Jump | Beast-jump native + dikey hız |
| `speedhack.lua` | Speed hack | Yaya >18 m/s, araç >130 m/s |
| `aimbot.lua` | Aimbot | Katman 1: ani "snap"; Katman 2: hareketli düşmana 4+ sn kesintisiz kilit |
| `silentaim.lua` | Silent aim / magic bullet | Kamera yönünü sunucuya bildirir |
| `weapons.lua` | Infinite ammo / no reload / kara liste silah | Mermi sabitliği + envanter |
| `extras.lua` | Freecam/spectate/stamina/model/invisible/prop-disguise | Rapor-only |

Ortak altyapı (`core.lua`): 200ms durum önbelleği, ped-değişim (multichar/respawn)
otomatik algısı + sunucu çapa sıfırlama, ~8 sn'lik **replay tamponu** (CRITICAL
raporlara otomatik eklenir), `Aeigs.rule()` (panel kuralı), `Aeigs.report()`
(throttle'lı rapor), `Aeigs.strike()` (N vuruş/pencere), `Aeigs.active()` (spawn
öncesi tespit çalışmaz), legit-muafiyet (spawn/tp/revive).

### Server korumaları (`server/`) — ANA yöntem, client'tan bağımsız/kandırılamaz
- `godmode_guard.lua` — **godmode/health-hack ana yöntemi**: biri gerçekten
  vuruluyor (weaponDamageEvent) ama canı hiç düşmüyorsa → ban. Server kendi
  `GetEntityHealth`'ini okur; client script'ler karışamaz.
- `live.lua` — teleport taraması (koordinat sıçraması, ped-değişim/multichar'dan
  muaf), NoClip ile Teleport ayrışması (`aeigs:collState`), armor>100,
  konum/whitelist/blacklist/admin senkron, kendi event'lerimiz için oran
  sınırlayıcı (`Aeigs.eventLimited`).
- `protection.lua` — weaponDamageEvent (silent aim açı — aşırı sapmada tek
  vuruşta ban, orta sapmada 2 doğrulama), illegal weapon, damage multiplier,
  **rapid fire** ve **wallbang/ESP göstergesi** (ikisi de rapor-only, yumuşak
  sinyal), explosionEvent (patlayıcı mermi), entityCreating (kara liste).

### Ban akışı
Client/Server tespit → `TriggerServerEvent('aeigs:report'/'aeigs:serverReport')` →
`POST /api/v1/detections`. Severity **CRITICAL** + lisansta auto-ban açık + oyuncu
whitelist değilse → `Ban` + `PunishAction` oluşur, oyuncu düşürülür (ban kodu ile).
Her tespit oyuncunun **trustScore**'unu düşürür (CRITICAL −60, HIGH −30, diğer −10).

---

## 11) Hile test/kayıt modu

Kendi sunucunda hile açıp anti-cheat'in **ne gördüğünü** kaydetmek için:

```
/acrec on          # kayıt başlar (her 200ms durum + ateş/nişan/kamera)
/acrec mark <not>  # o ana etiket koy (ör. "silent açtım")
/acrec off         # durur; JSON dosyaya yazılır
```

Dosya: `resources/aeigs-anticheat/aeigs_rec_<oyuncu>_<zaman>.json`
(sunucu konsolu tam yolu basar). Eşik ayarı ve false/kaçırma analizi için kullanılır.

---

## 12) REST API (v1) referansı

Tümü `Authorization: Bearer aeigs_srv_…` ister; rate-limit'lidir.

| Method & yol | Amaç |
|--------------|------|
| `POST /api/v1/heartbeat` | Sunucuyu çevrimiçi tutar, kuralları döndürür |
| `POST /api/v1/players/sync` | Oyuncu listesi senkronu |
| `POST /api/v1/positions` | Canlı konum/can/kalkan (harita) |
| `POST /api/v1/detections` | Hile tespiti raporu (CRITICAL → oto-ban) |
| `GET  /api/v1/bans` | Ban listesi (bağlantıda kontrol) |
| `GET/POST /api/v1/actions/pending` · `/ack` | Panelden gelen cezalar |
| `GET/POST /api/v1/commands/pending` · `/ack` | Konsol komutları |
| `GET  /api/v1/whitelist` · `/blacklist` · `/admins` | Bypass/kara liste/yönetici |
| `POST /api/v1/logs` | Log gönderimi |
| `POST /api/v1/resources/sync` | Kaynak listesi |
| `GET  /api/v1/screenshot/pending` · `POST /result` · `/upload` | Ekran görüntüsü |
| `POST /api/v1/ingame-action` | Oyun içi yönetici aksiyonu |

Panel tarafı (oturum tabanlı) API'ler `src/app/api/…` altında (auth, servers,
admin/keys, redeem, checkout, ban-lookup, vb.).

---

## 13) Güvenlik notları

- **Sırlar:** `AUTH_SECRET`, `LICENSE_HMAC_SECRET`, `DATABASE_URL` yalnızca env'de;
  repoya asla girmez. Ham API token DB'de tutulmaz (HMAC hash).
- **Token doğrulama:** her `/api/v1` isteğinde lisans durumu + süresi kontrol edilir.
- **Rate limit:** `src/lib/ratelimit.ts` (ör. detections 240/dk).
- **Güvenlik başlıkları:** `next.config.mjs` (X-Frame-Options DENY, nosniff, vb.).
- **Whitelist bypass:** admin/içerik üreticiler tespitlerden muaf (`src/lib/bypass.ts`).
- **False-pozitif ilkesi:** tespitler yüksek eşik + strike + legit-muafiyet ile
  tasarlandı; godmode aktif testi oyuncuya zarar vermeden (anında geri yükleyerek) çalışır.
- ⚠️ Üçüncü parti/obfuscated hile modüllerini sunucuda **çalıştırma** (backdoor riski).

---

## 14) Sık sorunlar

| Belirti | Sebep / çözüm |
|---------|---------------|
| "Ortam değişkenleri doğrulanamadı" | `.env` eksik/kısa. `AUTH_SECRET`≥32, `LICENSE_HMAC_SECRET`≥16 karakter olmalı |
| "Can't reach database" | `.env`'de `DATABASE_URL="file:./dev.db"` var mı; `npm run db:push` çalıştırıldı mı |
| FiveM bağlanmıyor | `aeigs_api` sonu `/api/v1` mi, token doğru mu, panel (`npm run dev`/`start`) ayakta mı, FiveM sunucusu panele ağ üzerinden erişebiliyor mu |
| 401 INVALID_TOKEN | Token `aeigs_srv_` ile başlamalı; panelde yeniden üret |
| 403 LICENSE_INACTIVE/EXPIRED | Lisans askıda/iptal/süresi dolmuş |
| Godmode banlanmıyor | `anti_invincibility` kuralı açık mı; native bayrak taraması 25 sn/6 doğrulama ister (hızlı ban için server/godmode_guard.lua PvP'de yakalar) |
| Kayıt dosyası yok | `resources/aeigs-anticheat/` köküne bakılmalı (server/ değil) |

---

**Lisans:** özel/ticari. **Katkı:** geliştirme dalı `claude/fivem-anticheat-web-rhfu06`.
#   f i v e m a c f u l l  
 