# CoreAC

FiveM için anti-cheat platformu: **web panel** (Next.js) + **lisans sistemi** + **FiveM resource** (Lua).
Panelden kurallar ve aksiyonlar yönetilir, oyun sunucusu panele bağlanır, tespitler canlı akar.

> **Kurulum:** [KURULUM.md](KURULUM.md) — `kurulum.bat` → `baslat.bat`, hepsi çift tık.

---

## Günlük komutlar (Windows)

| Dosya | Ne yapar |
|---|---|
| `kurulum.bat` | İlk kurulum: paketler, `.env` (rastgele gizli anahtarlar), veritabanı, admin hesabı, derleme. Tekrar çalıştırmak güvenli. |
| `baslat.bat` | Paneli üretim modunda başlatır (`next start`). |
| `guncelle.bat` | Panel kapalıyken: `git pull` + paketler + veritabanı şeması + derleme. |
| `admin-sifre.bat` | Admin şifresini sıfırlar ve yenisini yazar. |
| `panel-adresi.bat` | Panelin dışarıdan erişilen adresini (`APP_URL`) ayarlar; installer bu adresi kullanır. |

Aynı işler npm ile: `npm run setup`, `npm run panel`, `npm run panel:update`, `npm run admin:reset`.
Arka planda hepsi `scripts/panel.mjs`'i çağırır.

Geliştirici kontrolleri: `npm run check:ac` (panel ↔ Lua tutarlılığı), `npx tsc --noEmit`.

---

## Mimari

```
FiveM sunucusu (resource: coreac, gizli klasör adıyla)          Web panel (Next.js, SQLite/Prisma)
  client/*   oyuncunun oyununda çalışan kontroller   ──────►   /api/v1/*   (Bearer coreac_srv_…)
  server/*   sunucunun kendi ölçtüğü kontroller      ◄──────   aksiyonlar, komutlar, kurallar
```

- `fivem-resource/coreac/` — Lua resource. Panelin **Download** sayfasındaki installer bunu sunucuya kurar.
- `src/app/api/v1/` — resource'un konuştuğu API (heartbeat, detections, bans, blacklist, whitelist, admins, positions, screenshot…).
- `src/lib/detection-actions.ts` — **tüm tespit tiplerinin tek kaynağı**: ad, kategori, güven seviyesi, varsayılan aksiyon.

## Tespit felsefesi — yanlış ban olmadan koruma

Her tespit tipinin bir güven seviyesi vardır ve aksiyon bu seviyeyle sınırlanır:

| Seviye | En fazla | Ne demek |
|---|---|---|
| **confirmed** | BAN | Sunucunun kendi ölçtüğü, kandırılamayan kanıt (vurulduğu hâlde canı düşmeyen oyuncu, fizik hızının açıklamadığı NoClip uçuşu, kara listedeki model, imkânsız isabet açısı…). |
| **strong** | KICK | Belirgin ama oyuncunun kendi bilgisayarından gelen sinyal. Hile istemcisi bu süreci kontrol ettiği için kesin kanıt sayılmaz. |
| **heuristic** | LOG | Zayıf sinyal; yalnızca incelemek için. |

- Oyuncunun kendi oyunundan gelen "confirmed" rapor otomatik olarak **strong**'a düşer.
- Bazı tipler (ör. NoClip) sunucu kanıtıyla BAN'a, oyuncu raporuyla en fazla KICK'e kadar gider (`serverConfidence`).
- **Önce koru, sonra kanıtla cezalandır:** fırlatılan araç anında silinir, yasaklı obje hiç oluşmaz, patlama seli iptal edilir. Ceza ise ancak failin kim olduğu kesinse verilir.
- Meşru durumlar otomatik tanınır: ekran karartılarak yapılan script ışınlamaları, framework ölü/yaralı durumu, txAdmin ve qb-adminmenu araçları. Sunucunun doğruladığı yetkililer (Settings → *Never punish server staff*) cezalandırılmaz, tespitleri "Staff" etiketiyle loglanır.

## Korumalar (özet)

| Alan | Nasıl |
|---|---|
| NoClip / Teleport | Client: fizik hızı ile yer değiştirme karşılaştırması. Sunucu: 4 sn açıklanamayan hareket → NOCLIP (BAN), tek sıçrama → TELEPORT (varsayılan LOG). |
| Godmode | Sunucu: vurulup canı düşmeyen oyuncu (BAN). Client: çatışma sırasında süren dokunulmazlık (KICK). |
| Silent aim / hasar | Sunucu: atış anındaki nişan açısı, silah sınıfı hasar tavanı, patlayıcı mermi. |
| FreeCam | Oyuncudan 80 m+ uzakta tutulan script kamerası (KICK); eski geometrik kontroller yalnızca log. |
| Sınırsız mermi | Atış başına mermi düşmüyor, 10 sn'de iki doğrulama (KICK). |
| Araç fırlatma / araç yağmuru | Sunucu: 250 km/h üstünde uçan sürücüsüz araç silinir; tekrar eden sahibi cezalandırılır. Dakikalık araç spawn sınırı. |
| Patlama | Kara liste, görünmez/sessiz patlama, limit; 10 sn'de 8+ patlama (araç patlamaları dahil) iptal edilir. |
| Ses / megafon trolü | interact-sound: herkese / dev yarıçapa / 1.0 üstü ses / spam (sunucu); 100 m+ ses menzili (client). |
| Executor | AC durdurma (sunucu canlılık kontrolü), resource enjeksiyonu, overlay, Lua menü, tuzak olaylar (client + **sunucu**). |
| Model kara listesi | Araç/ped/obje/silah; sunucu `entityCreating` ile oluşumu iptal eder. Hazır **Troll & giant props** paketi (~300 dev obje). |

## Ayarlar sekmesi (Configuration → Settings)

Tespitlerin **etrafındaki** kurallar. Her ayar gerçek Lua koduna ya da panel rotasına bağlıdır; `npm run check:ac` bunu denetler
(ölü buton, panel ↔ Lua varsayılan farkı, sızıntı). Settings bölümü **oyunculara hiç gönderilmez**.

| Kart | Ne işe yarar |
|---|---|
| **Safe Guard** | Kendi script'lerin yanlış pozitif yemesin: *Safe Events* (tuzak olay sistemi bu olayları kurmaz), *Safe Scripts* (güvenilen resource — spawn'ları kontrollere girmez, ışınlama/revive devri 15 sn tolerans alır), *Ignored Scripts* (CoreAC hiç dokunmaz), *Anti Resource Injection Safe List*. Sunucu tarafında uygulanır. |
| **Connection & Identity** | Bağlanma kartında sırayla: isim kuralı (Türkçe harfler serbest), Steam/Discord şartı, çift bağlantı, VPN (proxycheck.io, 24 sa önbellek), ağ itibarı kapısı (diğer her sunucu sahibinin banı −35 puan), *Max Threat Score* (son 24 saatteki otomatik kick başına 40 puan). Yetkililer ve Trust whitelist muaf, banlar her zaman uygulanır. Panel/VPN servisi yanıt vermezse oyuncu alınır; *Block Joins When Verification Fails* açıksa reddedilir. |
| **Bans & Evidence** | *Enable Bans* (kapalıysa tespitler yalnızca kaydedilir), *Ban Duration* (gün, 0 = kalıcı), *Ban Message*, *Ban Video URL* (banlı oyuncu düşmeden önce ≤15 sn tam ekran video), *Ban Ip Address* (varsayılan kapalı — ortak ağlarda masum oyuncuları da kilitler; yerel IP'ler hiç eşleşmez), ekran görüntüsü / *Gameplay Record* (video değil, 3–5 karelik seri; *Optimize* daha hafif kare). |
| **Logs & Webhooks** | Olay başına ayrı Discord kanalı (ban, warn, kick, connect, disconnect, silent aim, admin) + konsol anahtarları. Webhook adresleri **yalnızca panelde** durur: Discord'a panel gönderir, oyun sunucusu hiç görmez (heartbeat'ten çıkarılır). |
| **Framework & API** | ESX / QBCore / Qbox resource adları, txAdmin klasörü (`admins.json`'daki yöneticiler bağlanır bağlanmaz yetkili sayılır), komut öneki (yeniden başlatmadan değişir) ve oyun sunucusunun HTTP API'si. |

### Oyun sunucusu HTTP API'si

`http://SUNUCU:30120/<resource-klasörü>/<uç>` — `Authorization: Bearer <coreac_token>` şart, dakikada 60 istek/adres, `X-Forwarded-For` yok sayılır.
`GET /status`, `GET /players`, `GET /bans` her zaman; `POST /unban`, `/screenshot`, `/reload` yalnızca **Allow Write Endpoints açıkken VE Allowed IPs doluyken VE çağıran o listedeyken**.
Oyuncu/ban IP'leri yalnızca yazma açıkken döner. Her yazma loglanır (Admin Logs webhook'unda "HTTP API").

```
curl -H "Authorization: Bearer $COREAC_TOKEN" http://SUNUCU:30120/coreac/status
curl -X POST -H "Authorization: Bearer $COREAC_TOKEN" -d '{"code":"AC-7K3QP9"}' http://SUNUCU:30120/coreac/unban
```

### Testler (`tools/sim`)

`npm run test:sim` hepsini tek seferde çalıştırır: gerçek Lua 5.4 derleyicisiyle derleme, `check:ac`, gerçek resource script'lerini taklit FiveM içinde
çalıştıran senaryolar (bağlantı kapıları, ban & kanıt, Safe Guard, config/log/framework/önek, HTTP API, istemci tarafı) ve panel doğrulamaları
(SSRF/injection, oyun sunucusuna giden veri, Discord yönlendirmesi). Tek senaryo için: `node tools/sim/run.cjs scenario_conn.lua`.

## Güvenlik notları

- Gizli anahtarlar (`AUTH_SECRET`, `LICENSE_HMAC_SECRET`) yalnızca `.env`'de tutulur, repoya girmez. Sunucu token'ları DB'de yalnızca HMAC hash olarak saklanır.
- Her `/api/v1` isteğinde lisans durumu doğrulanır ve istekler rate-limit'lidir.
- Oyuncunun istemcisi saldırgan kabul edilir: client'ın gönderdiği hiçbir alan ceza muafiyeti ya da aksiyon isteği taşıyamaz.
- Demo hesabı salt okunurdur. Varsayılan şifre yoktur; admin şifresi kurulumda rastgele üretilir.
