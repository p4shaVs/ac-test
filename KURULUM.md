# CoreAC — Kurulum Rehberi

Bu rehber iki parçayı kurar:

1. **Panel** (web sitesi) — tespitleri, banları, ayarları yönettiğin yer. Bir Windows bilgisayarda/VDS'te çalışır.
2. **Anti-cheat** (FiveM resource) — oyun sunucusunda çalışır, panele bağlanır. Panelden tek tıkla kurulur.

Her şey çift tıklanan `.bat` dosyalarıyla yapılır. Terminal bilmen gerekmez.

---

## 1. Gerekenler (bir kez)

| Program | Nereden | Not |
|---|---|---|
| **Node.js LTS** (18 veya üstü) | https://nodejs.org | Kurulumda her şeyi varsayılan bırak. |
| **Git** (önerilir) | https://git-scm.com | Güncellemeyi tek tık yapar. |

Kurduktan sonra bilgisayarı yeniden başlatman gerekebilir.

---

## 2. Paneli indir

**Önerilen (git ile):** Masaüstünde boş bir yerde sağ tık → *Open in Terminal* → şunu yapıştır:

```bat
git clone -b coreac-overhaul https://github.com/p4shaVs/ac-test.git coreac-panel
```

Masaüstünde `coreac-panel` klasörü oluşur.

**Alternatif:** GitHub'dan ZIP indirip bir klasöre çıkar. (Bu durumda güncellemeleri yine ZIP ile elle yaparsın.)

> **Eski panelden geçiyorsan:** eski klasördeki `.env` dosyasını ve `prisma\dev.db` dosyasını yeni klasörde aynı yerlere kopyala. Hesapların, sunucuların, banların ve FiveM token'ın aynen kalır.

---

## 3. Kurulum — `kurulum.bat`

Klasördeki **`kurulum.bat`** dosyasına çift tıkla. Sırasıyla şunları yapar:

1. Node.js'i kontrol eder.
2. Gerekli paketleri kurar (`npm install`, ilk seferde birkaç dakika sürer).
3. `.env` dosyasını **rastgele gizli anahtarlarla** oluşturur. Varsa **asla ezmez**, sadece eksikleri ekler.
4. Veritabanını hazırlar. Veritabanı boşsa admin hesabı oluşturur ve şifreyi ekrana yazar:

```
============================================================
  PANEL GİRİŞİ
  Kullanıcı adı : admin
  Şifre         : xxxxxxxxxxxx
============================================================
```

   **Bu şifreyi kaydet.** (Unutursan → bölüm 7.)

5. Paneli derler (`next build`).

Tekrar çalıştırmak güvenlidir: hesaplara ve `.env`'e dokunmaz.

---

## 4. Paneli başlat — `baslat.bat`

**`baslat.bat`**'a çift tıkla. `Ready` yazısını görünce tarayıcıda **http://localhost:3000** adresini aç.

- Açılan siyah pencere **açık kalmalı**. Kapatırsan panel de kapanır.
- Kapatmak için pencerede **Ctrl+C** bas.
- Panel her zaman bu yolla (üretim modu) çalıştırılmalı. `npm run dev` canlıda kullanılmaz.

---

## 5. Panelin dışarıdan erişilen adresi — `panel-adresi.bat`

FiveM sunucusu panelle **aynı bilgisayarda değilse** ya da ekran görüntüsü özelliğini kullanacaksan (oyuncuların bilgisayarından panele yüklenir), panelin **dışarıdan erişilen adresini** ayarla:

1. `panel-adresi.bat`'a çift tıkla.
2. Adresi yaz: `http://SUNUCU_IP:3000` ya da `https://panel.alanadin.com`.
3. Paneli yeniden başlat (pencerede Ctrl+C, sonra `baslat.bat`).
4. Installer'ı panelden **yeniden indir** (adres installer'ın içine yazılır).

> Windows Güvenlik Duvarı'nda 3000 portuna izin vermeyi unutma.

---

## 6. FiveM sunucusuna kurulum (tek tık)

1. Panele `admin` ile gir.
2. **Admin → Keys**: bir lisans anahtarı oluştur (ya da **Admin → Orders → Record sale**).
3. **Dashboard → Redeem**: anahtarı hesabına tanımla.
4. **Dashboard → Servers → New**: sunucunu ekle. Gösterilen **token**'ı kopyala.
5. **Dashboard → Download**: sunucunu seç, installer'ı indir (`CoreAC-Installer-….bat`).
6. İndirdiğin dosyayı FiveM sunucunun **`server.cfg` dosyasının yanına** koy ve çift tıkla. Token'ı sorunca yapıştır.
7. txAdmin'den sunucuyu **Restart** et.

Installer anti-cheat'i gizli bir klasör adıyla kurar, `server.cfg`'ye gerekli satırları ekler ve eski kurulumları temizler.

---

## 7. Admin şifresini unuttum — `admin-sifre.bat`

Çift tıkla. Yeni bir şifre oluşturup ekrana yazar, eski oturumları da kapatır. Panel açıkken de çalışır.

---

## 8. Güncelleme — `guncelle.bat`

1. Panel penceresinde **Ctrl+C** ile paneli kapat. (Panel açıkken güncelleme bilerek reddedilir, çünkü açık panelin yanında derleme yapmak paneli bozar.)
2. **`guncelle.bat`**'a çift tıkla. Kodu indirir (`git pull`), paketleri ve veritabanını günceller, paneli derler.
3. **`baslat.bat`** ile paneli aç.
4. **FiveM tarafı:** sunucudaki `CoreAC-Installer-….bat` dosyasını tekrar çalıştır, sonra sunucuyu restart et.

ZIP ile kurduysan: yeni ZIP'i eski klasörün üstüne çıkar (`.env` ve `prisma\dev.db` dosyalarını silme), sonra `guncelle.bat`.

---

## 9. İlk ayarlar (önerilen)

- **Blacklist → "Troll & giant props" paketi → Add all.** Hilecilerin "dağ / ev / kafes" bastığı ~300 dev objeyi engeller. Oyun içi scriptleri etkilemez.
- **Configuration → Settings → "Never punish server staff"** açık kalsın. Adminler kendi araçlarıyla (noclip, godmode, teleport) atılmaz. **Kendi admin hesabınla hile testi yapacaksan geçici olarak kapat.** Kapatmazsan tespitler "Staff" etiketiyle loglanır ama ceza uygulanmaz.
- **Actions** sayfasında her tespitin ne yapacağını (Log / Kick / Ban) görebilirsin. Oyuncunun kendi bilgisayarından gelen tespitler en fazla Kick olabilir. Ban yalnızca sunucunun kendi ölçtüğü kanıtlarla atılır.

---

## 10. Sık sorunlar

| Belirti | Çözüm |
|---|---|
| `Environment variable not found: DATABASE_URL` | `.env` yok → `kurulum.bat`. |
| `Could not find a production build` | Derleme yapılmamış → `guncelle.bat` (panel kapalıyken). |
| Panel açılıyor ama her şey hata veriyor | Panel açıkken derleme yapılmış olabilir → paneli kapat, `guncelle.bat`, `baslat.bat`. |
| `Port 3000 kullanımda` | Panel zaten açık, ya da başka bir program portu kullanıyor. |
| FiveM konsolunda `coreac_token is not set` | Installer'ı `server.cfg`'nin yanında tekrar çalıştır. |
| Ekran görüntüleri gelmiyor | Bölüm 5: panel adresi `localhost` olmamalı. Sunucuda `screencapture` (ya da `screenshot-basic`) **tek sefer** ensure edilmeli. |
| Admin şifresi | `admin-sifre.bat`. |
