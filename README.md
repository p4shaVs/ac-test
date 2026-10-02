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
| Rapid fire | `server/protection.lua`: atışlar arası süre **atıcının kendi oyun saatinden** (`weaponDamageEvent.damageTime`) ölçülür — ağ gecikmesi / toplu gelen paketler etkilemez; aynı andaki isabetler (saçma, çoklu kurban) tek atış. Sınıf başına taban (tabanca 40, SMG 35, tüfek 45, MG 40, keskin 120 ms — en hızlı gerçek silahın ~yarısı); 6+ atışlık bir serinin ortanca aralığı tabanın altındaysa hızlı seri, **10 dk'da 3 hızlı seri = RAPID_FIRE** (strong → KICK). Pompalı/ağır/fırlatılan ölçülmez; eklenti silahı 2 başka oyuncu da o hızda atıyorsa doğal hızlı sayılır (vanilla silahta bu muafiyet yok). |
| Sahte konum raporu | `server/telemetry_guard.lua`: executor client'taki AC'ye sahte konum verirse (native sahteleme) noclip/teleport kontrolleri kör olur; ama ped'i oyun motoru OneSync ile sunucuya yine doğru senkronlar. AC'nin 3 sn'lik konum raporu sunucunun gördüğü konumla kıyaslanır: tolerans 30 m + hız × (1.5 sn + ping); **art arda 3 rapor** uyuşmazsa **STATE_DESYNC** (strong → KICK). Meşru ışınlanma/revive muafiyeti, ilk 45 sn, Trust whitelist ve OneSync'siz sunucu (0,0,0) atlanır. |
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

## CoreAC Network (paylaşılan ban ağı)

Bir müşterinin banı diğerleri için **sinyaldir** (`src/lib/network-bans.ts`, panel: **CoreAC Network** sayfası):

- **Ne paylaşılır:** kalıcı banlar, yalnızca license/Steam/Discord'un tek yönlü HMAC hash'iyle (IP asla). Otomatik CoreAC tespitleri tipiyle; yetkili banları sebebine göre sınıflanır — hile (`MANUAL_CHEAT`), belirsiz (`MANUAL`), **davranış** (toxic, RDM, küfür… → **hiç paylaşılmaz**).
- **Bayrak:** en az **2 farklı sahibin** son **365 gün** içindeki banı (bir sahibin sunucuları tek sayılır). **Güçlü** = o sahiplerin banları otomatik tespit ya da hile banı; **zayıf** = belirsiz yetkili banları da var.
- **Politika** (sunucu başına, ağ sayfasında): Kapalı / Yalnızca logla / **Dışarıda tut**; varsayılan "yalnızca güçlü bayrakları dışarıda tut" (zayıf olanlar loglanır). Ağ asla ban atmaz.
- **Canlı:** bir ban oyuncuyu bayraklı hâle getirdiği anda, oyuncunun **şu an oynadığı diğer sahiplerin** sunucuları bilgilendirilir (`pushToOnline`): kayıt + log + Discord, politika "dışarıda tut" ise oyundan çıkarılır. Oyuncu/sunucu başına günde bir kez.
- **Kanıt:** bayrakta topluluk sayısı, hile türleri (×adet), otomatik/yetkili dağılımı, ilk/son ban — **başka bir sunucunun adı hiçbir yerde görünmez** (panel, Discord, oyuncuya gösterilen ret mesajı).
- **Sayfa:** koruma modu ve iki anahtar, özet sayılar, şu an çevrimiçi bayraklı oyuncular, son bayraklar, kimlik sorgulama (anonim), paylaşılan banlarınız (tek tek **geri çekilebilir**). Unban / "Fix false ban" katkıyı otomatik geri alır.

## Moderasyon ve log ekranları

Kayıtların hepsinde **tam kaydın JSON'u** (kopyalanabilir) bir tık uzaktadır.

| Sayfa | İçerik |
|---|---|
| **Lookup** | Ad, licence, Discord, Steam, IP ya da Ban ID ile arama → oyuncu dosyası: güven puanı, risk özetleri (aktif ban, son 30 gün tespit, bağlı hesap, CoreAC ağı — diğer müşterilerin sunucuları **adıyla asla** gösterilmez, yalnız sayı), **sahibin tüm sunucularında oynama süresi** (dağılım çubuğu, kullanılan isim, ilk/son görülme), sicil zaman çizelgesi (tüm sunuculardaki banlar, kick/uyarılar), tespit türleri, bağlı hesaplar (IP / cihaz işareti / ≥2 donanım token'ı), kullanılan isimler, kimlikler, tek tıkla Ban. `?q=…&p=<oyuncu>` ile paylaşılabilir. |
| **Offline Ban** (Bans → Offline ban, Lookup → Ban) | Sunucuda olmayan (hiç gelmemiş de olabilir) birini banlar: licence / Discord / Steam (SteamID64 otomatik hex'e çevrilir) / IP yapıştırılır, anında çip olarak tanınır (license2, fivem, xbl kullanılmadığı söylenir); bilinen oyuncuyla eşleşirse adı ve geçmişi gösterilir; kalıcı ya da süreli (dakika/saat/gün/hafta + hazır seçenekler), bitiş tarihi önizlemesi. Aynı kimlikte aktif ban varsa reddeder; oyuncu o an çevrimiçiyse sunucudan düşürülür; oyun sunucusu ≤60 sn'de kapıda reddeder. |
| **Bans** | Özet (aktif / CoreAC / yetkili / yanlış pozitif), filtre çipleri, arama, CSV. Bir ban açılınca: kanıt (ölçülen değerler, ekran görüntüleri, replay), kayıt (sebep, Ban ID, modül, tarih, süre), banlayan, oyuncu (güven puanı, oynama süresi), kimlikler (License/Discord/Steam/IP/cihaz, tıkla-kopyala), bağlı ban-kaçırma banları. Sekmeler: **Details / History / Notes / JSON**. *This ban is a false positive* yalnızca işaretler; **Fix false ban** banı (ve ona bağlı kaçırma banlarını) kaldırır, oyuncunun güven puanını 100'e çeker, ağ-ban katkısını geri alır. `?ban=<id>` ile doğrudan açılır. |
| **Detections** | Her tespit: oyuncu, tespit adı, uygulanan aksiyon; kanıt, ekran görüntüleri, replay, ilgili bana bağlantı, JSON. Aksiyon / kategori / önem filtreleri. |
| **Kicks / Warnings** | CoreAC ya da yetkili; otomatik kick'te o anki tespit ve kanıtı, oyuncu kimlikleri, teslim durumu, JSON. |
| **Admin Logs** | Yetkililerin yaptığı her şey (ban/offline ban/kick/uyarı/unban, yanlış ban düzeltme, ban notu, ayar değişikliği, resource işlemi, konsol komutu, Windows kurulumu) — gün gün gruplu bir **aktivite akışı**, cümle olarak ("admin, X'i banladı"); satıra tıklayınca yerinde açılan ayrıntı + JSON + "Lookup" kısayolu. Sağda 24 sa / 7 gün sayaçları, tür ve yetkili filtreleri (yetkili başına işlem çubuğu); filtrelenmiş kayıtlar JSON olarak dışa aktarılır. |
| **Event Log** | Canlı akış (açıkken): Spawn, Remove, Explosion, Damage, Particle, Kill, izlenen script olayları, Join/Leave. Her satırın JSON'unda silah, hasar, kafa vuruşu, kurban, model (adıyla), netId, koordinat ya da olay argümanları. |
| **Console** | Terminal: renkli seviye/kaynak, komut geçmişi (↑/↓), Refresh / Clear / Live / Auto-scroll, 3 sn'de bir yenilenir. |
| **Server Logs** | Gün gün gruplu; satıra tıklayınca JSON. |

## Panel ekibi (Team)

Sahip, yetkililerine **kendi panel girişlerini** verir — şifre paylaşımı yok (`src/lib/team.ts`, `team-access.ts`, `team-ops.ts`; sayfa: sunucu → **Team**).

| Rol | Varsayılan yetkiler |
|---|---|
| **Owner** (sunucunun sahibi) | Her şey + yalnızca ona ait olanlar: lisans anahtarı, sunucu token'ı, kurulum dosyaları (.bat / .zip / exe), sunucuyu silmek |
| **Admin** | Tüm izinler; Moderator ve Viewer'ları yönetir |
| **Moderator** | Her sayfayı/logu görür + oyuncu moderasyonu (ban/kick/uyarı/unban, offline ban, ban notları, Fix false ban, ekran görüntüsü, CSV) |
| **Viewer** | Her sayfayı/logu görür, hiçbir şeyi değiştiremez |

- **İzinler** rol ön ayarıdır; üye başına tek tek açılıp kapatılabilir: *Moderate players*, *Console & resources*, *Configuration* (korumalar, cezalar, modeller, whitelist, korumalı event'ler, event log, ağ politikası, config kütüphanesi), *In-game admins*, *Server settings*, *Team*.
- **Kurallar:** yalnızca **senden aşağı rütbedekileri** yönetirsin (Admin başka bir Admin'e ya da sahibe dokunamaz); yalnızca **sende olan izinleri** verebilir ya da alabilirsin (konsolu olmayan bir Admin, sahibin bir Moderator'a verdiği konsolu ne alabilir ne verebilir). Kendi rolünü değiştiremezsin.
- **Davet:** e-posta ya da kullanıcı adıyla; panel e-posta göndermez, oluşan **tek kullanımlık link** (7 gün) Discord'dan iletilir. DB'de yalnız token'ın SHA-256'sı tutulur; link yalnız davet edilen hesapta çalışır (hesap varsa kullanıcı kimliğine, yoksa e-postaya bağlıdır — o e-postayla kayıt olunur). Hesabı olan kişi daveti **panel ana sayfasında** da görür (Accept / Decline). Kaybolan link için "New link", geri almak için "Revoke". Demo hesabı davet edilemez. En fazla 25 üye / 20 açık davet.
- **Erişim her istekte DB'den** okunur: üyelikten çıkarılan ya da izni alınan kişi bir sonraki tıklamada erişimi kaybeder. Rütbesi/izni düşen birinin artık veremeyeceği açık davetleri otomatik geri çekilir; kabul anında da davet edenin hâlâ bu daveti verebildiği kontrol edilir.
- **Görünürlük:** sunucuya erişimi olmayan biri için sunucu yokmuş gibidir (404). Yetkisi olmayan sayfalar menüden ve komut paletinden kalkar; adresi elle yazılırsa "Your role can't open this page" görünür; API 403 döner. Butonlar da role göre gizlenir (Players'ta Warn/Kick/Ban, ban detayında Unban/Fix/not, Network/Event Log ayarları…).
- **Hesap verebilirlik:** her işlem yapanın adıyla **Admin Logs**'a düşer; ekip olayları (davet, katılma, rol/izin değişikliği, çıkarma, ayrılma) Admin Logs'ta **Team** grubunda ve Team sayfasının "Team activity" kartında görünür.
- Paylaşılan sunucular **My Servers** ve ana sayfada "Shared with you" altında, sunucu değiştiricide rol rozetiyle listelenir.

## Windows kurulum programı (`installer-win/`)

Müşteri panelde **Download → Download CoreAC-Setup.exe** ile indirir (yalnız giriş yapmış ve lisanslı sunucusu olan hesaplar).
Exe herkes için aynıdır; panelin adresi indirme sırasında dosyanın sonuna eklenir (`/api/account/installer`, PE görüntüsünden sonraki veri Windows için önemsizdir).

1. **Lisans anahtarı** → `POST /api/v1/install/key`: anahtar geçerli mi, hangi sunucu(lar) için (birden çoksa seçtirir). Gizli bir şey dönmez.
2. **Sunucu klasörü** — otomatik: exe'nin yanı (5 üst / 3 alt klasör), çalışan `FXServer.exe` ve bulunan FXServer klasörlerinin **txAdmin profilleri** (`txData/*/config.json` → server data / cfg yolu), kullanıcı klasörleri ve sabit disklerin kökü (süre sınırlı tarama). Bulunamazsa *Browse…* (klasör ya da doğrudan `server.cfg`). CoreAC kurulu olan / txAdmin'den gelen / exe'nin yanındaki öne alınır.
3. **Kurulum** — kaynak anahtarla indirilir (`GET /api/v1/install/resource`, `X-CoreAC-Key`), açılır, `resources/<klasör>`e kopyalanır; **ancak dosyalar yerindeyken** `POST /api/v1/install/claim` yeni sunucu token'ını verir (indirme yarıda kalırsa çalışan sunucunun token'ı iptal olmaz); sonra `server.cfg` yazılır ve eski Aeigs kurulumu temizlenir. Davranış `.bat` kurulumuyla birebir aynıdır (gizli klasör adı, yerinde güncelleme, yönetilen blok diğer resource'lardan önce, tek seferlik yedek, BOM'suz UTF-8) — ikisi birbirinin kurulumunu güncelleyebilir; `panel-checks` blok işaretlerinin aynı kaldığını denetler.

Teknik: .NET Framework 4.x üzerinde WinForms (Windows'la gelen C# 5 derleyicisi — SDK gerekmez; exe ~110 KB, Windows 10/11 / Server 2016+ üzerinde ek kurulum istemez). Uzun yollar (`\\?\`), yetki hatasında *Run as administrator*, dosya kullanımda / disk dolu için anlaşılır mesajlar.

```
npm run build:installer             # installer-win/CoreAC-Setup.exe'yi yeniden üretir (Windows)
npm run build:installer -- --render # ayrıca ekran görüntüleri: installer-win/obj/screens
CoreAC-Setup.exe --selftest cfg.json out.log   # pencere açmadan uçtan uca kurulum (test)
```

Exe repoya **derlenmiş hâliyle** girer (Linux'taki paneller de sunabilsin); `installer-win/src` değişince yeniden derleyip commit edin — `panel-checks` sürüm damgasını kontrol eder. İmzasız olduğu için SmartScreen "Daha fazla bilgi → Yine de çalıştır" isteyebilir.

## Oyun sunucusu HTTP API'si

`http://SUNUCU:30120/<resource-klasörü>/<uç>` — `Authorization: Bearer <coreac_token>` şart, dakikada 60 istek/adres, `X-Forwarded-For` yok sayılır.
`GET /status`, `GET /players`, `GET /bans` her zaman; `POST /unban`, `/screenshot`, `/reload` yalnızca **Allow Write Endpoints açıkken VE Allowed IPs doluyken VE çağıran o listedeyken**.
Oyuncu/ban IP'leri yalnızca yazma açıkken döner. Her yazma loglanır (Admin Logs webhook'unda "HTTP API").

```
curl -H "Authorization: Bearer $COREAC_TOKEN" http://SUNUCU:30120/coreac/status
curl -X POST -H "Authorization: Bearer $COREAC_TOKEN" -d '{"code":"AC-7K3QP9"}' http://SUNUCU:30120/coreac/unban
```

## Testler (`tools/sim`)

`npm run test:sim` hepsini tek seferde çalıştırır: gerçek Lua 5.4 derleyicisiyle derleme, `check:ac`, gerçek resource script'lerini taklit FiveM içinde
çalıştıran senaryolar (bağlantı kapıları, ban & kanıt, Safe Guard, config/log/framework/önek, HTTP API, anti-crash, event log, silent aim & hasar,
istemci tarafı, AC bütünlüğü, rapid fire + sahte konum raporu) ve panel doğrulamaları (SSRF/injection, oyun sunucusuna giden veri, Discord yönlendirmesi, Configuration sayfası kapsamı, ban notları, ağ adaleti/güç/pencere, ekip rolleri/rütbe/izin kuralları, her `/api/servers/[id]` rotasının doğru yetkiyle korunduğu). Tek senaryo için: `node tools/sim/run.cjs scenario_conn.lua`.

Ağın canlı bildirimi gerçek bir veritabanı ister: `tools/sim/verify-network-live.ts` yalnızca adı `verify.db` olan izole bir kopyada çalışır (`DATABASE_URL=file:…/verify.db npx tsx tools/sim/verify-network-live.ts`).

## Güvenlik notları

- Gizli anahtarlar (`AUTH_SECRET`, `LICENSE_HMAC_SECRET`) yalnızca `.env`'de tutulur, repoya girmez. Sunucu token'ları DB'de yalnızca HMAC hash olarak saklanır.
- Her `/api/v1` isteğinde lisans durumu doğrulanır ve istekler rate-limit'lidir.
- Oyuncunun istemcisi saldırgan kabul edilir: client'ın gönderdiği hiçbir alan ceza muafiyeti ya da aksiyon isteği taşıyamaz.
- Demo hesabı salt okunurdur. Varsayılan şifre yoktur; admin şifresi kurulumda rastgele üretilir.
