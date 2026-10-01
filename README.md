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

Her tespit tipinin bir güven seviyesi vardır. Seviye, **kutudan çıkan varsayılanı** ve panelde her satırın yanındaki "recommended up to" önerisini belirler:

| Seviye | Önerilen en fazla | Ne demek |
|---|---|---|
| **confirmed** | BAN | Sunucunun kendi ölçtüğü, kandırılamayan kanıt (vurulduğu hâlde canı düşmeyen oyuncu, fizik hızının açıklamadığı NoClip uçuşu, kara listedeki model, imkânsız isabet açısı…). |
| **strong** | KICK | Belirgin ama oyuncunun kendi bilgisayarından gelen sinyal. Hile istemcisi bu süreci kontrol ettiği için kesin kanıt sayılmaz. |
| **heuristic** | LOG | Zayıf sinyal; yalnızca incelemek için. |

- **Seçtiğin aksiyon aynen uygulanır** (Configuration sayfasında her korumanın yanındaki Log / Kick / Ban menüsü). Her tespit için Log / Kick / Ban seçilebilir; önerinin üstüne çıkarsan satır uyarı gösterir (meşru bir oyuncu o kontrole takılırsa cezalanır). Dokunmadığın tiplerde varsayılan güvenli davranış sürer: oyuncunun kendi oyunundan gelen "confirmed" rapor **strong**'a düşer (KICK), bazı tipler (ör. NoClip) sunucu kanıtıyla BAN'a, oyuncu raporuyla KICK'e gider (`serverConfidence`). Satırda Ban'a kendin tıklarsan sınır kalkar: o tipin her raporu banlar.
- Seçimi yine de geçersiz kılanlar: Trust whitelist'teki oyuncu, sunucu yetkilileri (*Never punish server staff*), Log-Only Mode / Enable Bans kapalıyken ve lisansında **Auto Ban** özelliği yoksa (BAN → KICK; Configuration sayfası bunu en üstte yazar).
- **Önce koru, sonra kanıtla cezalandır:** fırlatılan araç anında silinir, yasaklı obje hiç oluşmaz, patlama seli iptal edilir. Ceza ise ancak failin kim olduğu kesinse verilir.
- Meşru durumlar otomatik tanınır: ekran karartılarak yapılan script ışınlamaları, framework ölü/yaralı durumu, txAdmin ve qb-adminmenu araçları. Sunucunun doğruladığı yetkililer (Settings → *Never punish server staff*) cezalandırılmaz, tespitleri "Staff" etiketiyle loglanır.

## Korumalar (özet)

| Alan | Nasıl |
|---|---|
| NoClip / Teleport | Client: fizik hızı ile yer değiştirme karşılaştırması. Sunucu: 4 sn açıklanamayan hareket → NOCLIP (BAN), tek sıçrama → TELEPORT (varsayılan LOG). |
| Godmode | Sunucu: vurulup canı düşmeyen oyuncu (BAN). Client: çatışma sırasında süren dokunulmazlık (KICK). |
| Silent aim | Sunucu, her isabette atıcının o anki nişan ışınını kurbanın gerçek yeriyle karşılaştırır (gövde boyu, ağ gecikmesi ve kurban hızı payı düşülür). İki kademe, her birinin kendi Log/Kick/Ban ayarı var: **Silent Aim** (ışın 35°+ dışında, 12 sn'de 3 isabet) ve **Silent Aim (subtle)** — son 16 isabetin çoğu ışının 4°+ dışına (payın ötesine) düşüyorsa, yani "küçük FOV'lu sihirli mermi". Her isabet ±200 ms'deki tüm nişan örnekleriyle denenir (flick'ler suçlanmaz); gamepad için eşik 9°, siperden ateş ve pompalı saçması subtle kademede ölçülmez; atıcıdan 15 m'den uzak "kamera" örneği uydurma sayılır. |
| Hasar hilesi | Dört yol: sınıf tavanı; oyuncuların bildirdiği silah istatistiği (başkalarından yüksekse); **diğer oyuncuların aynı silahla gerçek isabet hasarıyla kıyas** (`Damage Boost`: son 8 isabetin 5'i 1.5 katı ya da 3 katı iki isabet; referans, en az 2 başka oyuncunun en yüksek hasarlarının alt ortancası — tek hileci referansı kaldıramaz, eklenti silahlarda ve sunucunun kendi hasar ayarında yanlış alarm vermez); dolu zırhlı oyuncuya tekrarlanan gövde tek atışı. Kafa vuruşu ve pompalı saçması sayılmaz. |
| FreeCam | Oyuncudan 80 m+ uzakta tutulan script kamerası (KICK); eski geometrik kontroller yalnızca log. |
| Sınırsız mermi | Atış başına mermi düşmüyor, 10 sn'de iki doğrulama (KICK). |
| Araç fırlatma / araç yağmuru | Sunucu: 250 km/h üstünde uçan sürücüsüz araç silinir; tekrar eden sahibi cezalandırılır. Dakikalık araç spawn sınırı. |
| Patlama | Kara liste, görünmez/sessiz patlama, limit; 10 sn'de 8+ patlama (araç patlamaları dahil) iptal edilir. |
| Ses / megafon trolü | interact-sound: herkese / dev yarıçapa / 1.0 üstü ses / spam (sunucu); 100 m+ ses menzili (client). |
| Executor | AC durdurma (sunucu canlılık kontrolü), resource enjeksiyonu, overlay, Lua menü, tuzak olaylar (client + **sunucu**). |
| AC'yi susturma (hook) | `client/integrity.lua`: yüklenirken `TriggerServerEvent`, `AddEventHandler`, `CreateThread`, `Wait`… ve CoreAC'nin kendi rapor fonksiyonlarının orijinalleri saklanır; 15 sn'de bir karşılaştırılır. Executor bunlardan birini değiştirirse (raporları yutmak için) orijinal kanaldan **AC_TAMPER** gider. Canlılık kontrolü de sürdüğü için resource'u durdurmak ayrıca yakalanır. |
| Anti-crash | `server/crash_guard.lua` — dört ayrı anahtar (Configuration → Anti-Crash): **crash modelleri** (slod_* yayalar, bilinen crash propları — oluşmadan iptal), **başka oyuncuya bağlanan araç/NPC/prop** (2 sn'de bir taranır, silinir), **flood kalkanı** (2 sn'de 60 varlık, 25 parçacık, 3 sn'de 25 mermi; aşan oyuncunun o türü 5 sn kilitlenir, 50+ ölçekli parçacık iptal), **crash olayları** (telefon patlaması, sahte kick oylaması, başka oyuncunun yayasına görev seli). Güvenilen script'lerin (Safe Scripts) varlıklarına dokunulmaz. Tipler: CRASH_ATTEMPT (confirmed), ENTITY_FLOOD (strong → KICK). |
| Model kara listesi | Araç/ped/obje/silah; sunucu `entityCreating` ile oluşumu iptal eder. Hazır **Troll & giant props** paketi (~300 dev obje). |

## Configuration sayfası

Tek sayfa: solda kategori dizini (Injection & Executors, Anti-Crash, Movement, Weapons & Aim, Damage, Health & Armor, Visual & Camera,
Vehicles, Peds & Objects, Explosions & Particles, Session & Network), her korumada **ad · ⓘ açıklama · ✎ ayrıntı · Log/Kick/Ban · aç/kapa**.
Kalem açılan çekmecede alt tespitlerin ayrı cezaları ve eşik değerleri durur. Sayfanın altında sunucu ayarları (aşağıda) yer alır;
arama, içe/dışa aktarma (JSON) ve tek "Save" ile config + kurallar + cezalar birlikte kaydedilir. Satırların kaynağı
`src/lib/config-catalog.ts`; `npm run test:sim` her anahtarın, kuralın ve tespit tipinin sayfada bir satırı olduğunu denetler.

## Sunucu ayarları (Configuration sayfasının alt bölümü)

Tespitlerin **etrafındaki** kurallar. Her ayar gerçek Lua koduna ya da panel rotasına bağlıdır; `npm run check:ac` bunu denetler
(ölü buton, panel ↔ Lua varsayılan farkı, sızıntı). Settings bölümü **oyunculara hiç gönderilmez**.

| Kart | Ne işe yarar |
|---|---|
| **Safe Guard** | Kendi script'lerin yanlış pozitif yemesin: *Safe Events* (tuzak olay sistemi bu olayları kurmaz), *Safe Scripts* (güvenilen resource — spawn'ları kontrollere girmez, ışınlama/revive devri 15 sn tolerans alır), *Ignored Scripts* (CoreAC hiç dokunmaz), *Anti Resource Injection Safe List*. Sunucu tarafında uygulanır. |
| **Connection & Identity** | Bağlanma kartında sırayla: isim kuralı (Türkçe harfler serbest), Steam/Discord şartı, çift bağlantı, VPN (proxycheck.io, 24 sa önbellek), ağ itibarı kapısı (diğer her sunucu sahibinin banı −35 puan), *Max Threat Score* (son 24 saatteki otomatik kick başına 40 puan). Yetkililer ve Trust whitelist muaf, banlar her zaman uygulanır. Panel/VPN servisi yanıt vermezse oyuncu alınır; *Block Joins When Verification Fails* açıksa reddedilir. |
| **Bans & Evidence** | *Enable Bans* (kapalıysa tespitler yalnızca kaydedilir), *Ban Duration* (gün, 0 = kalıcı), *Ban Message*, *Ban Video URL* (banlı oyuncu düşmeden önce ≤15 sn tam ekran video), *Ban Ip Address* (varsayılan kapalı — ortak ağlarda masum oyuncuları da kilitler; yerel IP'ler hiç eşleşmez), ekran görüntüsü / *Gameplay Record* (video değil, 3–5 karelik seri; *Optimize* daha hafif kare). |
| **Logs & Webhooks** | Olay başına ayrı Discord kanalı (ban, warn, kick, connect, disconnect, silent aim, admin) + konsol anahtarları. Webhook adresleri **yalnızca panelde** durur: Discord'a panel gönderir, oyun sunucusu hiç görmez (heartbeat'ten çıkarılır). |
| **Framework & API** | ESX / QBCore / Qbox resource adları, txAdmin klasörü (`admins.json`'daki yöneticiler bağlanır bağlanmaz yetkili sayılır), komut öneki (yeniden başlatmadan değişir) ve oyun sunucusunun HTTP API'si. |

## Moderasyon ve log ekranları

Hepsi aynı düzende: solda filtrelenebilir liste, sağda seçilen kayıt ve **tam kaydın JSON'u** (kopyalanabilir).

| Sayfa | İçerik |
|---|---|
| **Bans** | Özet (aktif / CoreAC / yetkili / yanlış pozitif), filtre çipleri, arama, CSV. Bir ban açılınca: kanıt (ölçülen değerler, ekran görüntüleri, replay), kayıt (sebep, Ban ID, modül, tarih, süre), banlayan, oyuncu (güven puanı, oynama süresi), kimlikler (License/Discord/Steam/IP/cihaz, tıkla-kopyala), bağlı ban-kaçırma banları. Sekmeler: **Details / History / Notes / JSON**. *This ban is a false positive* yalnızca işaretler; **Fix false ban** banı (ve ona bağlı kaçırma banlarını) kaldırır, oyuncunun güven puanını 100'e çeker, ağ-ban katkısını geri alır. `?ban=<id>` ile doğrudan açılır. |
| **Detections** | Her tespit: oyuncu, tespit adı, uygulanan aksiyon; kanıt, ekran görüntüleri, replay, ilgili bana bağlantı, JSON. Aksiyon / kategori / önem filtreleri. |
| **Kicks / Warnings** | CoreAC ya da yetkili; otomatik kick'te o anki tespit ve kanıtı, oyuncu kimlikleri, teslim durumu, JSON. |
| **Admin Logs** | Yetkililerin yaptığı her şey (ban/kick/uyarı/unban, yanlış ban düzeltme, ban notu, ayar değişikliği, resource işlemi, konsol komutu). Aksiyon ve yetkili filtreleri; Description / Actor / Action / Target / When + JSON. |
| **Event Log** | Canlı akış (açıkken): Spawn, Remove, Explosion, Damage, Particle, Kill, izlenen script olayları, Join/Leave. Her satırın JSON'unda silah, hasar, kafa vuruşu, kurban, model (adıyla), netId, koordinat ya da olay argümanları. |
| **Console** | Terminal: renkli seviye/kaynak, komut geçmişi (↑/↓), Refresh / Clear / Live / Auto-scroll, 3 sn'de bir yenilenir. |
| **Server Logs** | Gün gün gruplu; satıra tıklayınca JSON. |

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
çalıştıran senaryolar (bağlantı kapıları, ban & kanıt, Safe Guard, config/log/framework/önek, HTTP API, anti-crash, event log, silent aim & hasar,
istemci tarafı, AC bütünlüğü) ve panel doğrulamaları (SSRF/injection, oyun sunucusuna giden veri, Discord yönlendirmesi, Configuration sayfası kapsamı, ban notları). Tek senaryo için: `node tools/sim/run.cjs scenario_conn.lua`.

## Güvenlik notları

- Gizli anahtarlar (`AUTH_SECRET`, `LICENSE_HMAC_SECRET`) yalnızca `.env`'de tutulur, repoya girmez. Sunucu token'ları DB'de yalnızca HMAC hash olarak saklanır.
- Her `/api/v1` isteğinde lisans durumu doğrulanır ve istekler rate-limit'lidir.
- Oyuncunun istemcisi saldırgan kabul edilir: client'ın gönderdiği hiçbir alan ceza muafiyeti ya da aksiyon isteği taşıyamaz.
- Demo hesabı salt okunurdur. Varsayılan şifre yoktur; admin şifresi kurulumda rastgele üretilir.
