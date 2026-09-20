# Model görselleri (Model Arama kartları)

Model Arama sayfasındaki kartlarda görsel çıkması için görselleri buraya,
**tür/model adı** yapısıyla koyun. Görsel yoksa kart kategori ikonu gösterir
(sistem yine tam çalışır).

## Klasör yapısı
```
public/models/
  vehicle/   adder.png      zentorno.png   ...   (model adı = katalogdaki ad)
  weapon/    weapon_rpg.png weapon_minigun.png ...
  ped/       a_m_y_business_01.png ...
  object/    prop_gold_bar.png ...
  explosion/ exp_tag_rocket.png ...
```

- Dosya adı **tam model adı** olmalı (kartta gösterilen küçük harfli ad; örn. `adder`).
- Uzantı `.png`, `.jpg` veya `.webp` olabilir — kart üçünü de sırayla dener.
- Aynı ada sahip görsel yoksa otomatik kategori ikonuna düşer.

## Etkinleştirme
`.env` dosyasına ekleyin:
```
NEXT_PUBLIC_MODEL_IMG_BASE="/models"
```
Kendi CDN'inizde barındırıyorsanız tam URL de verebilirsiniz:
```
NEXT_PUBLIC_MODEL_IMG_BASE="https://cdn.siteniz.com/gta-models"
```
Yol her zaman `<base>/<tür>/<model>.<uzantı>` biçiminde çözülür.

## Görsel paketi nereden bulunur?
- **Araçlar/silahlar:** FiveM araç/silah önizleme paketleri (topluluk paketleri)
  bu adlandırmaya çevrilebilir; dosya adlarını model adına eşitleyin.
- **Toplu indirdiğiniz bir paket** varsa, dosya adlarını katalog adlarına göre
  yeniden adlandıran küçük bir script yeterli (isteyin, hazırlayayım).
