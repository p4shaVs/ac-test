# CoreAC Anti-Cheat — FiveM Kurulum & Kullanım (Yerel)

Bu rehber, web panelini FiveM sunucuna **yerelde** bağlamayı anlatır. Sonunda:
oyuncular (license + discord) panelde görünür, web'den ban/kick/uyarı oyunda
uygulanır, banlanan oyuncuya **ban kodu** gösterilir, konsolu ve kaynakları
(resource) web'den yönetirsin, loglar panele akar.

---

## 1) Web panelini çalıştır
Proje kökünde:
```bash
npm install
cp .env.example .env
npm run db:push
npm run db:seed
npm run build
npm run start          # http://localhost:3000 (canlı panel her zaman production modda)
```
Giriş: `admin@coreac.online` (eski kurulumlarda `admin@aeigs.gg`) — parola seed çıktısında bir kez yazılır (veya `SEED_ADMIN_PASSWORD`). Salt-okunur demo için `/api/demo`.

> `npm run dev` yalnızca geliştirme içindir; canlı panelde `.next` önbelleği bozulup her API 500 verebilir.

## 2) Panelde sunucu oluştur (tek adım)
Panelde **Sunucularım → Sunucu Ekle**. Açılan formda:
- **Lisans Anahtarı** (COREAC-XXXX-XXXX-XXXX-XXXX — eski AEIGS-… anahtarlar da geçerli)
- **Public Sunucu IP** (opsiyonel, gösterim için) ve **Port** (genelde 30120)
- **Sunucu Adı**

**Aktifleştir & Sunucu Oluştur**'a bas. Ardından ekranda **server.cfg bloğu**
(token dolu) çıkar — tek tıkla kopyala.

## 3) Resource'u sunucuna kur
**En kolayı:** panelde **Download** sayfasından tek tık installer'ı indir, `server.cfg`'nin yanına koy ve çift tıkla. Lisansı doğrular, resource'u kurar (varsayılan olarak hile menülerinin bulamayacağı rastgele bir klasör adıyla), `server.cfg`'yi diğer resource'ların **üstüne** yazar ve yedek alır.

**Elle kurulum:** `fivem-resource/coreac` klasörünü FiveM sunucunun `resources/`
klasörüne kopyala (ekran görüntüsü için `screencapture` de). Panelin verdiği bloğu
`server.cfg`'ye yapıştır:
```cfg
## ─── CoreAC Anti-Cheat ───
set coreac_api   "http://PANEL_ADRESI/api/v1"
set coreac_token "coreac_srv_BURAYA_TOKEN"
add_ace resource.coreac command allow   # konsol/kick/kaynak komutları için
ensure screencapture
ensure coreac
```
> `ensure` satırları diğer resource'ların **üstünde** olsun. Sunucuyu başlat;
> konsolda CoreAC logosunu görürsün, panelde sunucu **Çevrimiçi** olur.
> Eski kurulumlardaki `set aeigs_api` / `set aeigs_token` satırları da okunur (geriye uyumlu).

---

## 🌐 Panel yerelde (kendi PC'nde), FiveM sunucusu VDS'te — bağlama
FiveM sunucun **başka bir makinede (VDS)** ve paneli **kendi bilgisayarında**
`localhost:3000`'de açtın. VDS'teki resource `localhost`'a ulaşamaz — paneli
internetten erişilebilir yapman gerekir. En kolayı **tünel** (ücretsiz):

**Cloudflare Tunnel (hesap gerekmez):**
1. `cloudflared`'i indir (Windows: `cloudflared.exe`).
2. Panel açıkken PC'nde çalıştır:
   ```
   cloudflared tunnel --url http://localhost:3000
   ```
3. Verilen adresi kullan: `https://xxxx.trycloudflare.com`
4. `.env` dosyanda **APP_URL**'i bu adrese eşitle (ekran görüntüsü linkleri düzgün olsun):
   ```
   APP_URL="https://xxxx.trycloudflare.com"
   ```
   ve paneli yeniden başlat.
5. `server.cfg`'de `coreac_api`'yi tünele çevir:
   ```
   set coreac_api "https://xxxx.trycloudflare.com/api/v1"
   ```

> Alternatif: modem/router'da **3000 portunu** PC'ne yönlendirip ev **public IP**'ni
> kullanabilirsin (`http://EV_IP:3000/api/v1`) — ama IP değişebilir ve NAT sorun
> çıkarabilir; **tünel önerilir**.
>
> Not: `trycloudflare.com` adresi her çalıştırmada değişir. Sabit adres için
> ücretsiz bir Cloudflare hesabıyla adlandırılmış tünel kurabilir ya da paneli
> doğrudan VDS'te çalıştırabilirsin.

---

## Ne çalışır?
| Panel | Ne yapar |
|---|---|
| **Genel Bakış** | Sunucu online/offline, oyuncu/ban sayıları, canlı grafik (gerçek veri) |
| **Oyuncular** | Oyuncular **license + discord** ile listelenir; web'den **Ban/Kick/Uyarı** |
| **Yasaklar** | Banlar + kaldır; her banın bir **ban kodu** olur |
| **Güvenlik Kuralları** | Toggle'lar heartbeat ile sunucuya iner; korumalar ona göre çalışır |
| **Konsol** | Yazdığın komut sunucuda `ExecuteCommand` ile çalışır |
| **Kaynaklar** | Sunucudaki resource'lar; **Başlat/Durdur/Yeniden Başlat** |
| **Günlük** | Sunucu olayları (giriş/çıkış/tespit/konsol) panele akar |
| **İnteraktif Harita** | Oyuncular **gerçek GTA5 konumlarında**; can/kalkan/aktivite/yön anlık; 5 sn'de bir canlı yenileme |
| **İzleme** | Oyuncunun **canlı ekran görüntüsü** (screenshot-basic gerekir) |
| **Bypass** | Discord ID / license ile muafiyet — bu kişiler banlanmaz/işaretlenmez |
| **Kara Liste** | Yasaklı araç/silah/ped/nesne — oyunda otomatik engellenir (REMOVE/KICK/BAN) |
| **Yöneticiler** | Oyun içi menü izinleri (kick/ban/tp/noclip/spectate…) webden verilir |

## Yeni özellikler — nasıl çalışır?

### 🗺️ İnteraktif Harita (canlı konum + can + kalkan)
Resource her **3 saniyede** çevrimiçi oyuncuların konum/can/kalkan/aktivite/yön
verisini gönderir. Harita bunları gerçek GTA5 koordinatlarına yerleştirir; sağ
panelden bir oyuncu seçince can/kalkan barları, aktivite, ping ve konumu görünür.

### 👁️ Canlı Ekran (İzleme)
1. Sunucuya [`screencapture`](https://github.com/itschip/screencapture) ekle ve `server.cfg`'ye **tek bir** `ensure screencapture` satırı yaz. (Eski `screenshot-basic` de desteklenir.)
2. Yükleme adresi otomatik: panelin kendi `coreac_api` adresi kullanılır, ayrı ayar gerekmez. Adres oyuncuların erişebildiği **public** bir adres olmalı (localhost değil).
3. Panelde **Monitoring** veya haritada oyuncu → **Request live view**.

> ⚠️ Bir ekran görüntüsü resource'unu **asla iki kez** `ensure` etme. `citizenfx/screenshot-basic` kaynak kodu sunucuda yarn build ister; iki build aynı anda çalışınca yarn kilitlenir ve sunucu açılışı zaman aşımına düşer.

### 🛡️ Bypass (muafiyet)
**Moderasyon → Bypass**'tan Discord ID veya license ekle. Bu kimlikler otomatik
ban, hile tespiti raporu ve kara listeden **muaf** tutulur. (NoClip açan yönetici
banlanmaz.)

### 🚫 Kara Liste (araç/silah/ped/nesne)
**Yönetim → Kara Liste**'den model adı ekle (örn. `rhino`, `weapon_rpg`). Oyuncu
spawn etmeye çalışınca **oluşturma iptal edilir** ve seçtiğin işlem uygulanır:
Kaldır / Kick / Ban.

### 🎮 Oyun içi yönetici menüsü (webden izin)
**Yönetim → Yöneticiler**'den kişiyi identifier (`discord:...`) ile ekle ve
izinleri seç. Görsel menü: `/acmenu` ya da **F6**. Oyunda `/ac` yazınca izinli komutlar listelenir:
```
/ac kick [id] [sebep]     /ac ban [id] [sebep]      /ac warn [id] [sebep]
/ac tp [id]   /ac tpm     /ac bring [id]   /ac spectate [id]
/ac revive [id]   /ac repair [id]   /ac freeze [id] on|off
/ac disarm [id]   /ac mute [id] on|off   /ac wipe [id]
/ac announce [mesaj]      /ac ss [id]      /ac id  (kendi kimliklerin)
```
Menüde ayrıca: **canlı tespit uyarıları** (biri yakalanınca köşede bildirim),
**oyuncu etiketleri** (ID + isim + can), **işarete ışınlan**, **konumunu kopyala**,
**spawn temizle** (hilecinin bastığı tüm araç/obje/NPC'leri siler).
İzin **her aksiyonda sunucuda** doğrulanır (client sadece arayüz). Oyun içi
ban/kick/uyarı panele ve Discord'a da işlenir. **NoClip/Godmode menüde yoktur** —
başka bir admin menüsüyle açılırsa hile sayılır. Yetkilinin muaf olması gerekiyorsa
**Bypass (Trust Whitelist)** listesine eklenir.

### 🔔 Discord webhook logları
**Ayarlar**'da webhook URL'ini gir ve hangi olayların gönderileceğini seç
(Ban, Kick, Uyarı, Tespit, Otomatik Ban, Kara Liste İhlali, Bağlanma). Her olay
zengin **embed** olarak Discord'a düşer.

### 🚁 NoClip tespiti + otomatik ban
Client, çarpışmasız/havada anormal hareketi tespit eder → `NOCLIP (CRITICAL)`
raporlar. Tip panelde "strong" güvendedir: client kaynaklı olduğu için en fazla **KICK**
atar (ban yalnızca sunucunun kendi doğruladığı tespitlerde olur). Bypass listesindekiler muaftır.

### 🔌 Script entegrasyonu (yanlış tespiti önler)
Oyuncuyu ışınlayan/dirilten script'lerin önce CoreAC'ye haber vermesi gerekir
(klasör adından bağımsız olay adları):
```lua
TriggerEvent('coreac:markTeleport', source)       -- sunucu (client'ta parametresiz)
TriggerEvent('coreac:markRevive', source)
TriggerEvent('coreac:markImmune', source, 30000) -- güvenli bölge / cutscene
```
TELEPORT tespitleri varsayılan olarak yalnızca **kayıt** düşer; script'lerin
entegre olunca Configuration → Actions'tan KICK'e yükseltebilirsin.

### 🖥️ Sunucu konsolu (ve panel Console sayfası)
```
ac players | ac kick <id> <sebep> | ac ban <id> [saat] <sebep>
ac unban <Ban ID> | ac baninfo <Ban ID> | ac announce <mesaj>
ac clear <peds|vehicles|objects|all> | ac reload
```

## Ban kodu nasıl çalışır?
- Web'den birini banlayınca oyuncu oyundan atılırken **Ban Kodu: AC-XXXXXX**
  görür.
- Oyuncu `http://localhost:3000/ban` sayfasına kodu girip **ban sebebini**
  görebilir.

## Akış (özet)
```
FiveM resource  ──heartbeat / players / detections / logs / resources──▶  Web API
FiveM resource  ◀──actions (ban/kick/warn) / commands (konsol, resource)──  Web API
```
Resource her birkaç saniyede kuyruğu çeker; panelden bir şey yapınca birkaç
saniye içinde oyunda uygulanır.

## Opsiyonel: Ekran izleme (Monitoring)
Canlı ekran görüntüsü için sunucuya [`screencapture`](https://github.com/itschip/screencapture)
kaynağını ekle (tek `ensure`). Görüntüler panele yüklenir ve yalnızca sunucu sahibi görebilir.

## Güvenlik notları
- `coreac_token`'ı gizli tut; sızarsa panelden **Token Yenile** ile iptal et.
- Sunucu taraflı korumalar (protection.lua) başlangıçta **rapor eder**;
  engellemeyi (CancelEvent) açmadan önce kendi sunucunda test et.

## Sık sorunlar
- **Panel offline / oyuncu gelmiyor:** `coreac_api` ve `coreac_token` doğru mu?
  FiveM host'tan web adresine erişilebiliyor mu? (`localhost` vs LAN IP)
- **401 hata (konsolda):** token yanlış/iptal — panelden yenile.
- **Kaynaklar boş:** resource yeni başladıysa ~45 sn içinde senkronize olur.
