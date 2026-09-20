# Core Shield Anti-Cheat — FiveM Kurulum & Kullanım (Yerel)

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
npm run dev            # http://localhost:3000
```
Giriş: `admin@aeigs.gg` — parola seed çıktısında bir kez yazılır (veya `SEED_ADMIN_PASSWORD`). Salt-okunur demo için `/api/demo`.

## 2) Panelde sunucu oluştur (tek adım)
Panelde **Sunucularım → Sunucu Ekle**. Açılan formda:
- **Lisans Anahtarı** (AEIGS-XXXX-XXXX-XXXX-XXXX)
- **Public Sunucu IP** (opsiyonel, gösterim için) ve **Port** (genelde 30120)
- **Sunucu Adı**

**Aktifleştir & Sunucu Oluştur**'a bas. Ardından ekranda **server.cfg bloğu**
(token dolu) çıkar — tek tıkla kopyala.

## 3) Resource'u sunucuna ekle + server.cfg
`fivem-resource/aeigs-anticheat` klasörünü FiveM sunucunun `resources/`
klasörüne kopyala (ekran görüntüsü için `screencapture` de). Panelin verdiği bloğu
`server.cfg`'ye yapıştır:
```cfg
## ─── Core Shield Anti-Cheat ───
set aeigs_api   "http://PANEL_ADRESI/api/v1"
set aeigs_token "aeigs_srv_BURAYA_TOKEN"
add_ace resource.aeigs-anticheat command allow   # konsol/kick/kaynak komutları için
ensure screencapture
ensure aeigs-anticheat
```
> `ensure` satırları diğer resource'ların **üstünde** olsun. Sunucuyu başlat;
> konsolda `[aeigs] Anti-Cheat başlatıldı` görürsün, panelde sunucu **Çevrimiçi** olur.

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
5. `server.cfg`'de `aeigs_api`'yi tünele çevir:
   ```
   set aeigs_api "https://xxxx.trycloudflare.com/api/v1"
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
2. Yükleme adresi otomatik: panelin kendi `aeigs_api` adresi kullanılır, ayrı ayar gerekmez. Adres oyuncuların erişebildiği **public** bir adres olmalı (localhost değil).
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
izinleri seç. Oyunda `/ac` yazınca izinli komutlar listelenir:
```
/ac kick [id] [sebep]     /ac ban [id] [sebep]      /ac warn [id] [sebep]
/ac tp [id]   /ac bring [id]   /ac spectate [id]     /ac revive [id]
/ac freeze [id] on|off    /ac announce [mesaj]       /ac ss [id]
```
İzin **her aksiyonda sunucuda** doğrulanır (client sadece arayüz). Oyun içi
ban/kick/uyarı panele ve Discord'a da işlenir. **NoClip/Godmode menüde yoktur** —
bunlar hile sayılır ve yetkili bile açsa banlanır (bkz. aşağı). Yetkili birinin
gerçekten muaf olması gerekiyorsa **Bypass** listesine eklenir.

### 🔔 Discord webhook logları
**Ayarlar**'da webhook URL'ini gir ve hangi olayların gönderileceğini seç
(Ban, Kick, Uyarı, Tespit, Otomatik Ban, Kara Liste İhlali, Bağlanma). Her olay
zengin **embed** olarak Discord'a düşer.

### 🚁 NoClip tespiti + otomatik ban
Client, çarpışmasız/havada anormal hareketi tespit eder → `NOCLIP (CRITICAL)`
raporlar. Lisansta **auto_ban** açıksa ve oyuncu **bypass'lı değilse** otomatik
banlanır. (Menüyle açılan yönetici noclip'i tespiti tetiklemez.)

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
- `aeigs_token`'ı gizli tut; sızarsa panelden **Token Yenile** ile iptal et.
- Sunucu taraflı korumalar (protection.lua) başlangıçta **rapor eder**;
  engellemeyi (CancelEvent) açmadan önce kendi sunucunda test et.

## Sık sorunlar
- **Panel offline / oyuncu gelmiyor:** `aeigs_api` ve `aeigs_token` doğru mu?
  FiveM host'tan web adresine erişilebiliyor mu? (`localhost` vs LAN IP)
- **401 hata (konsolda):** token yanlış/iptal — panelden yenile.
- **Kaynaklar boş:** resource yeni başladıysa ~45 sn içinde senkronize olur.
