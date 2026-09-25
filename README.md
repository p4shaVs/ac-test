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

## Güvenlik notları

- Gizli anahtarlar (`AUTH_SECRET`, `LICENSE_HMAC_SECRET`) yalnızca `.env`'de tutulur, repoya girmez. Sunucu token'ları DB'de yalnızca HMAC hash olarak saklanır.
- Her `/api/v1` isteğinde lisans durumu doğrulanır ve istekler rate-limit'lidir.
- Oyuncunun istemcisi saldırgan kabul edilir: client'ın gönderdiği hiçbir alan ceza muafiyeti ya da aksiyon isteği taşıyamaz.
- Demo hesabı salt okunurdur. Varsayılan şifre yoktur; admin şifresi kurulumda rastgele üretilir.
