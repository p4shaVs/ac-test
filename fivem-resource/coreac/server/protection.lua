-- CoreAC Anti-Cheat — sunucu taraflı korumalar
-- Panelden açılan "Güvenlik Kuralları" (heartbeat config.rules) burada okunur.
-- Başlangıç için çoğu kural RAPOR eder (report-only). Engellemeyi (CancelEvent)
-- açmak isterseniz ilgili yerdeki yorumu aktifleştirin — önce test edin.

local function ruleOn(key)
  local r = CAC.getRules()
  return r[key] == true
end

-- Basit oran sınırlayıcı (spam tespiti)
local hits = {}
local function tooFast(key, limit, windowMs)
  local now = GetGameTimer()
  local b = hits[key]
  if not b or now > b.reset then
    hits[key] = { count = 1, reset = now + windowMs }
    return false
  end
  b.count = b.count + 1
  return b.count > limit
end

local function name(src) return GetPlayerName(src) or ('Player#' .. src) end

-- Silah olmayan hasar tipleri (işaretsiz hash): patlama, ateş, araçla ezme/
-- çarpma, düşme, boğulma, kanama, dikenli tel, elektrikli çit, yorgunluk,
-- helikopter kazası. Hasar tavanı kontrolleri bunları saymaz.
local ENVIRONMENT_DAMAGE = {
  [539292904] = true, [3750660587] = true, [2741846334] = true, [133987706] = true,
  [3452007600] = true, [4284007675] = true, [1936677264] = true, [2339582971] = true,
  [1223143800] = true, [2461879995] = true, [910830060] = true, [341774354] = true,
}

-- ---------------------------------------------------------------------------
-- Patlama koruması
-- ---------------------------------------------------------------------------
-- Patlayıcı mermi sayaçları (oyuncu bazlı, kayan pencere)
local expBullet = {}

AddEventHandler('explosionEvent', function(sender, ev)
  -- sender: patlamayı tetikleyen oyuncu (net id string olabilir)
  local src = tonumber(sender)
  if not src or src <= 0 then return end
  local etype = ev and ev.explosionType

  -- Patlayıcı mermi (explosionType 18 = BULLET). TİTİZ: tek patlama değil,
  -- kısa sürede birden fazla mermi-patlaması = patlayıcı mermi hilesi.
  if ruleOn('anti_explosive_bullets') and etype == 18 then
    local now = GetGameTimer()
    local b = expBullet[src]
    if not b or now > b.reset then b = { n = 0, reset = now + 8000 }; expBullet[src] = b end
    b.n = b.n + 1
    if b.n > (Config.ExplosiveBulletMax or 4) then
      expBullet[src] = nil
      CancelEvent()
      TriggerEvent('coreac:serverReport', src, 'EXPLOSIVE_BULLETS', 'CRITICAL', { count = b.n })
      return
    end
  end

  -- Patlama selinden KORUMA: 10 sn'de 8'den fazla patlama (araç patlamaları
  -- dahil — "araç fırlat, patlat" trolü CoreAC modülünün araç kaynaklı
  -- patlamaları atlayan limitine takılmıyordu) → fazlası iptal edilir. Araç
  -- patlamasının göndereni aracın o anki sahibidir (kurban olabilir), bu yüzden
  -- burada ceza yok: yalnızca engel + log (EXPLOSION, heuristic).
  if ruleOn('anti_explosion_spam') then
    if tooFast('expl:' .. src, 8, 10000) then
      CancelEvent()
      if not tooFast('explrep:' .. src, 1, 10000) then
        TriggerEvent('coreac:serverReport', src, 'EXPLOSION', 'HIGH', { type = etype, blocked = true })
      end
    end
  end
end)

-- ---------------------------------------------------------------------------
-- İzinsiz entity (araç/ped/obje) spam koruması
-- ---------------------------------------------------------------------------
-- Panel "Blacklist" sayfasındaki modelleri uygular (dedicated liste; Entities
-- sekmesindeki BlackListedVehicles'tan AYRIDIR). Model yasaklıysa oluşumu iptal
-- eder ve model başına seçilen KICK/BAN'ı uygular.
--
-- KALDIRILDI (ILLEGAL_VEHICLE yanlış-pozitifi): eski "anti_entity_spam" sayacı.
-- `NetworkGetEntityOwner` dünyadaki ambient araç/ped'lerin sahipliğini, oyuncu
-- bir bölgeye girince ona MİGRE eder; oyuncu spawn olduğu an onlarca ambient
-- entity'nin sahibi olur ve 10 sn'de 30 eşiği anında dolardı → daha oyuna
-- girmeden ILLEGAL_VEHICLE. Popülasyon-tipi filtresi yoktu (script-spawn ile
-- ambient dünya trafiğini ayırmıyordu). Gerçek spawn tespiti + limitleri zaten
-- server/events/entityCreating.lua düzgün (isAIEntity/popType filtreli) yapıyor;
-- bu naif kopya hem gereksiz hem hatalıydı.
AddEventHandler('entityCreating', function(handle)
  local owner = NetworkGetEntityOwner(handle)
  if not owner or owner <= 0 then return end
  local etype = GetEntityType(handle) -- 1=ped, 2=vehicle, 3=object

  local model = GetEntityModel(handle)
  local entry = CAC.blacklistLookup and CAC.blacklistLookup(model)
  if entry then
    local kindMap = { vehicle = 2, ped = 1, object = 3 }
    if kindMap[entry.kind] == etype then
      CancelEvent() -- yasaklı entity oluşmasın
      CAC.enforceBlacklist(owner, entry, model)
      return
    end
  end
end)

-- Sunucunun KENDİ oluşturduğu entity'ler (qb-garages/araç satıcısı gibi
-- CreateVehicleServerSetter kullanan scriptler) entityCreating'den geçmez.
-- Client kaynaklı yasaklı oluşumlar yukarıda zaten iptal edildiği için buraya
-- gelen yasaklı model ya sunucu scriptinindir ya da kara liste yüklenmeden
-- önce oluşmuştur: kimse cezalandırılmadan kaldırılır ve loglanır.
AddEventHandler('entityCreated', function(handle)
  if not handle or handle == 0 or not DoesEntityExist(handle) then return end
  local entry = CAC.blacklistLookup and CAC.blacklistLookup(GetEntityModel(handle))
  if not entry then return end
  local kindMap = { vehicle = 2, ped = 1, object = 3 }
  if kindMap[entry.kind] ~= GetEntityType(handle) then return end
  -- Oyuncunun kendi ped'i asla silinmez (yasaklı modele geçiş entityCreating'de ele alınır).
  if entry.kind == 'ped' and IsPedAPlayer(handle) then return end
  DeleteEntity(handle)
  CAC.log('INFO', 'blacklist', ('Removed blacklisted %s "%s" (spawned by a server script)')
    :format(entry.kind, tostring(entry.label or entry.model)))
end)

-- ---------------------------------------------------------------------------
-- SILENT AIM / MAGIC BULLET — client, ateş ettiği karedeki kamera yönünü
-- bildirir (client/aimsync.lua); burada vurulan oyuncu ile o yön arasındaki
-- açı ölçülür. Nişan hedefte değilken isabet gitmesi = silent aim.
--
-- İKİ KADEME (ikisi de sunucunun gördüğü kurban konumuna bakar):
--   SILENT_AIM         aşikâr: ışın kurbanın 35°+ dışında kalan isabet, 12 sn'de 3 kez.
--   SILENT_AIM_SUBTLE  hafif / meşruya yakın: her isabette "nişan sapması" ölçülür —
--                      ışının kurbana açısı eksi (gövde + ağ gecikmesi payı). Gerçek
--                      isabette ~0'dır; silent aim'in "FOV'lu" sihirli mermisi ise
--                      ışının dışındaki hedefi de vurur. İki kural (biri yeter): son 16
--                      isabetin en az 5'inde (ve %40'ında) sapma 4°+; ya da en az 12
--                      isabette gövdeye göre ORTANCA sapma 2.5°+ (küçük FOV'lu silent aim:
--                      her isabet az ama sürekli ıskalar, meşru isabet gövdeden geçer). Ayrı bir tespit tipi:
--                      panelde kendi Log / Kick / Ban ayarı var.
--
-- YANLIŞ-BAN TASARIMI
--   * Yalnızca hitscan ateşli silahlar (patlayıcı/fırlatılan/melee/araç silahında nişan
--     yönü isabetle ilişkili değildir — ör. yapışkan bomba patlatılırken oyuncu başka
--     yöne bakar). EKLENTİ silahlar dahildir: sınıfları oyuncuların bildirdiği silah
--     grubundan öğrenilir (server/combat_guard.lua).
--   * Atıcı YAYA, kurban YAYA. Aşikâr kademe 8 m'den, hafif kademe 12 m'den uzakta
--     ölçer (yakında kamera/namlu paralaksı ve konum gecikmesi açıyı bozar).
--   * İsabet, ±200 ms içindeki TÜM nişan örnekleriyle denenir ve kurbana EN YAKIN
--     olan alınır: iki atış arasında kamerayı çevirmek (flick) meşru oyuncuyu
--     suçlu göstermez.
--   * Pay: gövde için 1.15 m'lik küre (ayakta/çömelmiş/yatan) + kurban hızı × gecikme
--     (150 ms + iki oyuncunun ping'inin yarısı) + 1.5° ölçüm payı (+2° SMG/MG: mermi
--     saçılımı). Pompalıda hafif kademe hiç ölçmez (saçma yelpazesi geniş).
--   * Gamepad (yardımlı nişan) için eşik 9°; siperden ateşte isabet hafif kademeye girmez.
--   * Yön birim vektör değilse ya da kamera konumu atıcının yerinden 15 m'den
--     uzaksa örnek uydurmadır: kullanılmaz.
--   * Tek isabet asla yetmez.
-- ---------------------------------------------------------------------------
local HITSCAN = CoreAC.HITSCAN_CLASSES
local AIM_KEEP = 12
local AIM_MATCH_MS = 200          -- bir isabeti ± bu süre içindeki örneklerle dene
local AIM_MAX_BODY_GAP = 15.0     -- örnek atıcının yerinden bu kadar uzaksa güvenilmez (m)

local BLATANT_EXCESS = 35.0        -- Kademe 1: ışın bu kadar derece FAZLA ıskalıyor
local BLATANT_HITS = 3
local BLATANT_WINDOW = 12000

local TARGET_RADIUS = 1.15         -- gövde küresi (m)
local ANGLE_JITTER = 1.5           -- ölçüm payı (derece)
-- Silahın kendi mermi saçılımı (AccuracySpread): mermi nişan ışınından birkaç derece
-- sapabilir ve yine de isabet eder. Hafif kademe, saçılımı yüksek sınıflara ek pay
-- verir; pompalıda (çoklu saçma) hiç ölçmez.
local SPREAD_EXTRA = { pistol = 0.0, smg = 2.0, rifle = 0.0, mg = 2.0, sniper = 0.0 }
local SUBTLE_MIN_DIST = 12.0
local SUBTLE_BAD_KBM = 4.0         -- Kademe 2: bu kadar derece fazla = "ıskalama"
local SUBTLE_BAD_PAD = 9.0         -- gamepad (yardımlı nişan)
local SUBTLE_KEEP = 16
local SUBTLE_MIN_HITS = 8
local SUBTLE_MIN_BAD = 5
local SUBTLE_MIN_FRAC = 0.4
-- Kademe 2b: ışının kurbanın GÖVDESİNE göre tipik (ortanca) sapması. Küçük FOV'lu silent aim
-- her isabette "az ama sürekli" ıskalar; meşru isabette ışın gövdeden geçer (sapma ≤ 0).
local SUBTLE_MEDIAN_HITS = 12
local SUBTLE_MEDIAN_KBM = 2.5
local SUBTLE_MEDIAN_PAD = 8.0
local SUBTLE_TTL = 6 * 60000
local LAG_BASE = 0.15              -- uzak oyuncunun ekranındaki gecikme (enterpolasyon), sn

--- Silah sınıfı: vanilla tablo, yoksa (eklenti) oyuncu bildirimlerinden.
local function weaponClass(hash, src)
  if CoreAC.ResolveWeaponClass then return CoreAC.ResolveWeaponClass(hash, src) end
  return CoreAC.GetWeaponClass and CoreAC.GetWeaponClass(hash)
end
local aimData = {}   -- [src] = { {pos, fwd, t, pad, cover}, ... } (en yeni sonda)

RegisterNetEvent('coreac:aim', function(px, py, pz, fx, fy, fz, flags)
  local src = source
  if CAC.eventLimited(src, 'aim', 20, 1000) then return end
  px, py, pz, fx, fy, fz = tonumber(px), tonumber(py), tonumber(pz), tonumber(fx), tonumber(fy), tonumber(fz)
  if not (px and py and pz and fx and fy and fz) then return end
  -- Yön birim vektör olmalı (NaN de elenir); olmayan örnek uydurmadır.
  local len = math.sqrt(fx * fx + fy * fy + fz * fz)
  if not (len >= 0.9 and len <= 1.1) then return end
  flags = math.floor(tonumber(flags) or 0)
  local list = aimData[src] or {}
  list[#list + 1] = {
    pos = vector3(px, py, pz), fwd = vector3(fx / len, fy / len, fz / len), t = GetGameTimer(),
    pad = flags % 2 == 1,                        -- bit 0: gamepad
    cover = math.floor(flags / 2) % 2 == 1,      -- bit 1: siperde
  }
  if #list > AIM_KEEP then table.remove(list, 1) end
  aimData[src] = list
end)

--- Verilen ana zamanca en yakın nişan örneği (±300 ms), yoksa nil.
local function aimSampleNear(src, at)
  local best, bestDt = nil, 301
  for _, s in ipairs(aimData[src] or {}) do
    local dt = math.abs(s.t - at)
    if dt < bestDt then best, bestDt = s, dt end
  end
  return best
end

--- ±AIM_MATCH_MS içindeki tüm nişan örnekleri.
local function aimSamplesNear(src, at)
  local out = {}
  for _, s in ipairs(aimData[src] or {}) do
    if math.abs(s.t - at) <= AIM_MATCH_MS then out[#out + 1] = s end
  end
  return out
end

AddEventHandler('playerDropped', function()
  local s = source
  aimData[s] = nil
end)

local subtleHits = {}  -- [src] = { {t, miss, dist, pad} }  (Kademe 2)
local silentHits = {}   -- [src] = { zaman damgaları }       (Kademe 1)

-- ---------------------------------------------------------------------------
-- RAPID FIRE (fire-rate hilesi) — RAPOR-ONLY, yumuşak sinyal.
-- Aynı silahtan ardışık isabetler arasındaki süre, hiçbir gerçek silahın
-- ulaşamayacağı kadar kısaysa (60ms = 1000 rpm üstü) işaretle. Asla ban
-- atmaz — sadece panelde görünür, isterseniz manuel inceleyin.
--
-- YANLIŞ-POZİTİF DÜZELTMESİ: aralık eskiden SUNUCUYA VARIŞ zamanıyla
-- ölçülüyordu. Ağ paketleri toplu gelir; normal hızda sıkılan mermiler
-- sunucuya 1-5 ms arayla ulaşıp "rapid fire" sayılıyordu. Artık atıcının
-- kendi saatindeki atış anı (damageTime) kullanılır. Aynı andaki isabetler
-- (pompalı saçması, tek atışta birden fazla kurban) aynı damageTime'ı taşır
-- ve sayılmaz. Minigun gibi ağır silahlar doğası gereği hızlıdır → hariç.
-- ---------------------------------------------------------------------------
local lastShot = {}      -- [src][weaponHash] = son isabet zamanı
local rapidFireStrike = {}

local function checkRapidFire(src, weaponHash, shotAt)
  if not ruleOn('anti_rapid_fire') then return end
  shotAt = tonumber(shotAt)
  if not shotAt then return end
  if weaponClass(weaponHash, src) == 'heavy' then return end
  lastShot[src] = lastShot[src] or {}
  local last = lastShot[src][weaponHash]
  if last == shotAt then return end                 -- aynı atış (saçma / çoklu kurban)
  lastShot[src][weaponHash] = shotAt
  if not last then return end
  local dt = shotAt - last
  if dt > 0 and dt < 60 then
    rapidFireStrike[src] = (rapidFireStrike[src] or 0) + 1
    if rapidFireStrike[src] >= 8 then
      rapidFireStrike[src] = 0
      TriggerEvent('coreac:serverReport', src, 'RAPID_FIRE', 'MEDIUM', { weapon = weaponHash, dt = dt })
    end
  else
    rapidFireStrike[src] = 0
  end
end

-- ---------------------------------------------------------------------------
-- WALLBANG / ESP GÖSTERGESİ — RAPOR-ONLY, yumuşak sinyal.
-- Vurulan oyuncu ile atıcı arasında görüş hattı (LOS) TAMAMEN engelliyken
-- (duvarın arkasından, aradaki geometri kesin) isabet gitmesi ESP+ateş
-- kombinasyonuna işaret eder. Netcode/gecikme yüzünden nadiren yanlış
-- olabileceğinden TİTİZ: çok sayıda doğrulama ister, asla ban atmaz.
-- ---------------------------------------------------------------------------
local losStrike = {}

local function checkWallbang(src, victimPed, shooterPed)
  if not ruleOn('anti_wallhack') then return end
  if not DoesEntityExist(shooterPed) or not DoesEntityExist(victimPed) then return end
  local dist = #(GetEntityCoords(shooterPed) - GetEntityCoords(victimPed))
  if dist < 8.0 then return end  -- yakın mesafede duvar-kenarı false riskini azalt
  local clear = HasEntityClearLosToEntity(shooterPed, victimPed, 17)
  if not clear then
    losStrike[src] = (losStrike[src] or 0) + 1
    if losStrike[src] >= 5 then
      losStrike[src] = 0
      TriggerEvent('coreac:serverReport', src, 'WALLBANG', 'MEDIUM', { dist = math.floor(dist) })
    end
  else
    losStrike[src] = math.max(0, (losStrike[src] or 0) - 1)
  end
end

-- ---------------------------------------------------------------------------
-- MELEE REACH — yakın-dövüş silahıyla İMKÂNSIZ mesafeden isabet.
--
-- Klasik FiveM istismarı: yumruk/bıçak/sopa ile karşı sokaktaki oyuncuyu
-- vurmak ("reach"/"grab"). Gerçek melee menzili ~2 m; sunucu, atıcı ile OYUNCU
-- kurban arasındaki mesafeyi ölçer. Yalnızca melee silahlar sayılır (ateşli
-- silahlar GTA'da meşru uzun menzile sahip → onlara uygulanmaz).
--
-- FALSE-POSITIVE TASARIMI: eşik 10 m (gerçek menzilin ~5 katı; hamle/momentum
-- payı), yalnızca OYUNCU kurban, üst üste 2 doğrulama, whitelist muaf. Ağ
-- konum senkronu nadiren gecikip mesafeyi şişirebileceğinden strong tip →
-- en fazla KICK (asla ban).
-- ---------------------------------------------------------------------------
local MELEE_REACH_MAX = 10.0
local reachStrike = {}

local function checkReach(src, weaponHash, victimPed, shooterPed)
  if not ruleOn('anti_melee_reach') then return end
  if not (CoreAC.IsMeleeWeapon and CoreAC.IsMeleeWeapon(weaponHash)) then return end
  if not DoesEntityExist(shooterPed) or not DoesEntityExist(victimPed) then return end
  local dist = #(GetEntityCoords(shooterPed) - GetEntityCoords(victimPed))
  if dist > MELEE_REACH_MAX then
    reachStrike[src] = (reachStrike[src] or 0) + 1
    if reachStrike[src] >= 2 then
      reachStrike[src] = 0
      TriggerEvent('coreac:serverReport', src, 'REACH', 'HIGH', { dist = math.floor(dist), weapon = weaponHash })
    end
  else
    reachStrike[src] = 0
  end
end

-- (noAimHits aşağıda "NİŞAN TELEMETRİSİ KESİLMESİ" bölümünde tanımlı. Önceden local'i
-- bu işleyiciden SONRA bildirildiği için burada global (nil) görünüyor ve her oyuncu
-- çıkışında "attempt to index a nil value (global 'noAimHits')" hatası basıyordu.)
local noAimHits = {}   -- [src] = { zamanlar }
local badAim = {}     -- [src] = { zamanlar }  (kullanılamayan örnekler)

AddEventHandler('playerDropped', function()
  local s = source
  silentHits[s] = nil; subtleHits[s] = nil; badAim[s] = nil; lastShot[s] = nil; rapidFireStrike[s] = nil; losStrike[s] = nil; reachStrike[s] = nil
  noAimHits[s] = nil
end)

-- ---------------------------------------------------------------------------
-- NİŞAN TELEMETRİSİ KESİLMESİ — client/aimsync.lua her hitscan atışında nişan
-- örneği yollar. Silent aim hilesi AC'yi susturursa (thread'i öldürür ya da
-- event'i engeller) açı kontrolü "örnek yok" diye sessizce atlanıyordu.
-- Oyuncu 60 sn içinde başka oyunculara 10+ hitscan isabeti verip bu sürede
-- TEK bir nişan örneği bile göndermediyse client tarafı devre dışıdır.
-- (Gecikme/kayıp tek tük örnek düşürür, bir dakikalık tam sessizlik değil.)
-- ---------------------------------------------------------------------------
local NO_AIM_HITS = 10
local NO_AIM_WINDOW = 60000

local function noteMissingAim(src)
  local t = GetGameTimer()
  local list = aimData[src]
  local last = list and list[#list]
  if last and t - last.t < NO_AIM_WINDOW then noAimHits[src] = nil; return end
  local fresh = {}
  for _, at in ipairs(noAimHits[src] or {}) do
    if t - at < NO_AIM_WINDOW then fresh[#fresh + 1] = at end
  end
  fresh[#fresh + 1] = t
  noAimHits[src] = fresh
  if #fresh >= NO_AIM_HITS then
    noAimHits[src] = nil
    TriggerEvent('coreac:serverReport', src, 'AC_TAMPER', 'HIGH', { source = 'no_aim_telemetry', hits = #fresh })
  end
end

--- Bir isabet için nişan sapması (derece): kamera ışınının kurbana olan açısı − izin verilen pay.
--- ~0 = ışın kurbanın gövdesinden geçiyor (meşru isabet). Pozitif = ışın o kadar daha uzakta.
--- Pay: gövde için bir küre (ayakta / çömelmiş / yatan hepsini kapsar) + kurbanın hızı × ağ
--- gecikmesi + sabit ölçüm payı. Döner: sapma (paylar düşülmüş), ham açı, kameradan kurbana
--- mesafe ve gövdeye göre sapma (ölçüm payı hariç; ortanca kuralı bunu kullanır).
local function aimMiss(s, vpos, vspeed, lagSec, extraDeg)
  local dx, dy, dz = vpos.x - s.pos.x, vpos.y - s.pos.y, vpos.z - s.pos.z
  local dist = math.sqrt(dx * dx + dy * dy + dz * dz)
  if dist < 1.0 then return nil end
  local dot = (s.fwd.x * dx + s.fwd.y * dy + s.fwd.z * dz) / dist
  if dot > 1.0 then dot = 1.0 elseif dot < -1.0 then dot = -1.0 end
  local ang = math.deg(math.acos(dot))
  local slack = TARGET_RADIUS + vspeed * lagSec
  local body = math.deg(math.asin(math.min(1.0, slack / dist)))
  return ang - (body + ANGLE_JITTER + (extraDeg or 0)), ang, dist, ang - body - (extraDeg or 0)
end

local function round1(n) return math.floor((tonumber(n) or 0) * 10 + 0.5) / 10 end

local function median(nums)
  if #nums == 0 then return 0 end
  table.sort(nums)
  local m = math.floor((#nums + 1) / 2)
  if #nums % 2 == 0 then return (nums[m] + nums[m + 1]) / 2 end
  return nums[m]
end

--- Değerlendirilen bir isabeti iki kademeye de işler.
local function recordAim(src, miss, ang, dist, sample, cls, bodyMiss)
  local now = GetGameTimer()

  -- Kademe 1 — aşikâr: ışın kurbandan çok uzakta, kısa sürede üç kez.
  if dist > 8.0 and miss >= BLATANT_EXCESS then
    local fresh = {}
    for _, t in ipairs(silentHits[src] or {}) do
      if now - t < BLATANT_WINDOW then fresh[#fresh + 1] = t end
    end
    fresh[#fresh + 1] = now
    silentHits[src] = fresh
    if #fresh >= BLATANT_HITS then
      silentHits[src] = nil
      TriggerEvent('coreac:serverReport', src, 'SILENT_AIM', 'CRITICAL', {
        angleCos = math.floor(math.cos(math.rad(ang)) * 100) / 100, dist = math.floor(dist), hits = #fresh,
      })
    end
  end

  -- Kademe 2 — hafif: son isabetlerin çoğunda ışın kurbanı belirgin biçimde ıskalıyor.
  -- Siperden ateş (körlemesine ateş) ve çok yakın mesafe değerlendirilmez.
  if sample.cover or dist < SUBTLE_MIN_DIST or cls == 'shotgun' then return end
  local fresh = {}
  for _, e in ipairs(subtleHits[src] or {}) do
    if now - e.t < SUBTLE_TTL then fresh[#fresh + 1] = e end
  end
  fresh[#fresh + 1] = { t = now, miss = miss, body = bodyMiss, dist = dist, pad = sample.pad }
  while #fresh > SUBTLE_KEEP do table.remove(fresh, 1) end
  subtleHits[src] = fresh
  if #fresh < SUBTLE_MIN_HITS then return end

  local bad, dists, bodies, pads = 0, {}, {}, 0
  for _, e in ipairs(fresh) do
    dists[#dists + 1] = e.dist
    bodies[#bodies + 1] = e.body
    if e.pad then pads = pads + 1 end
    if e.miss >= (e.pad and SUBTLE_BAD_PAD or SUBTLE_BAD_KBM) then bad = bad + 1 end
  end
  local typical = median(bodies)
  local countRule = bad >= SUBTLE_MIN_BAD and bad / #fresh >= SUBTLE_MIN_FRAC
  local medianRule = #fresh >= SUBTLE_MEDIAN_HITS
      and typical >= ((pads * 2 >= #fresh) and SUBTLE_MEDIAN_PAD or SUBTLE_MEDIAN_KBM)
  if countRule or medianRule then
    subtleHits[src] = nil
    local worst = bodies[#bodies]                       -- median() sıraladı: en büyük sapma son
    TriggerEvent('coreac:serverReport', src, 'SILENT_AIM_SUBTLE', 'HIGH', {
      source = 'aim_offset_stats', hits = #fresh, offTarget = bad,
      medianOffDeg = round1(typical), maxOffDeg = round1(worst), medianDist = math.floor(median(dists)),
    })
  end
end

--- Örnekler geliyor ama hiçbiri kullanılabilir değil (kamera atıcının yerinden çok uzak):
--- telemetriyi uydurup kontrolü atlatma denemesi. Eşik, "hiç örnek yok" ile aynı.
local function noteBadAim(src)
  local t = GetGameTimer()
  local fresh = {}
  for _, at in ipairs(badAim[src] or {}) do
    if t - at < NO_AIM_WINDOW then fresh[#fresh + 1] = at end
  end
  fresh[#fresh + 1] = t
  badAim[src] = fresh
  if #fresh >= NO_AIM_HITS then
    badAim[src] = nil
    TriggerEvent('coreac:serverReport', src, 'AC_TAMPER', 'HIGH', { source = 'aim_telemetry_invalid', hits = #fresh })
  end
end

local function checkSilentAim(src, data)
  local cls = weaponClass(data.weaponType, src)
  if not (cls and HITSCAN[cls]) then return end
  local shooterPed = GetPlayerPed(src)
  if not shooterPed or shooterPed == 0 or GetVehiclePedIsIn(shooterPed, false) ~= 0 then return end

  local victims = {}
  for _, nid in ipairs(data.hitGlobalIds or { data.hitGlobalId }) do
    local ent = NetworkGetEntityFromNetworkId(nid)
    if ent and ent ~= 0 and GetEntityType(ent) == 1 and IsPedAPlayer(ent)
        and GetVehiclePedIsIn(ent, false) == 0 then
      local vel = GetEntityVelocity(ent)
      local owner = NetworkGetEntityOwner(ent)
      victims[#victims + 1] = {
        pos = GetEntityCoords(ent),
        speed = vel and #vel or 0.0,
        ping = (owner and owner > 0 and GetPlayerPing(owner)) or 0,
      }
    end
  end
  if #victims == 0 then return end
  local shooterPing = GetPlayerPing(src) or 0

  -- Aynı atışın nişan örneği hasar olayından birkaç on ms SONRA gelebilir
  -- (farklı ağ kanalları) — değerlendirmeyi kısa bir süre ertele.
  local hitAt = GetGameTimer()
  SetTimeout(250, function()
    if not GetPlayerName(src) then return end
    local near = aimSamplesNear(src, hitAt)
    if #near == 0 then
      if not aimSampleNear(src, hitAt) then noteMissingAim(src) end
      return
    end
    -- Atıcının sunucuda görülen yerinden uzak bir kamera konumu uydurmadır: kullanılmaz.
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return end
    local body = GetEntityCoords(ped)
    local usable = {}
    for _, s in ipairs(near) do
      if #(s.pos - body) <= AIM_MAX_BODY_GAP then usable[#usable + 1] = s end
    end
    if #usable == 0 then noteBadAim(src); return end

    for _, v in ipairs(victims) do
      local lag = math.min(0.6, LAG_BASE + (shooterPing + v.ping) / 2000)
      -- İki isabet arasında kamerayı çevirmek (flick) meşru oyuncuyu suçlu göstermesin:
      -- ±200 ms içindeki örneklerin KURBANA EN YAKIN olanı alınır.
      local bestMiss, bestAng, bestDist, bestSample, bestBody
      for _, s in ipairs(usable) do
        local miss, ang, dist, body = aimMiss(s, v.pos, v.speed, lag, SPREAD_EXTRA[cls])
        if miss and (not bestMiss or miss < bestMiss) then bestMiss, bestAng, bestDist, bestSample, bestBody = miss, ang, dist, s, body end
      end
      if bestMiss then recordAim(src, bestMiss, bestAng, bestDist, bestSample, cls, bestBody) end
    end
  end)
end

-- ---------------------------------------------------------------------------
-- DAMAGE BOOST — aynı silahı kullanan DİĞER oyuncularla kıyas.
--
-- weaponDamageEvent.weaponDamage, atıcının oyununun hesapladığı hasardır: silah
-- dosyası × SetWeaponDamageModifier × SetPlayerWeaponDamageModifier. Hasar
-- hilesi bu çarpanlardan birini yükseltir; sunucunun KENDİ ayarı (RP sunucuları
-- tabancayı 1.5x yapabilir) ise herkese aynı uygulanır. Bu yüzden sınıf tavanı
-- (pistol 250…) yalnızca uç değeri yakalar; burada her silah için DİĞER
-- oyuncuların gördüğümüz hasarı referans alınır (en az 2 oyuncu × 3 isabet):
--   * referans = oyuncuların kendi en yüksek hasarlarının ALT ortancası
--     (tek bir hileci referansı yukarı çekemez),
--   * isabet referansın 1.5 katı ve 5+ fazlaysa "şişkin" sayılır,
--   * atıcının son 8 isabetinin (2 dk içinde) 5'i şişkin ya da 3 katı olan 2 isabet = rapor.
-- Menzil sönümü hasarı yalnızca AZALTIR, bu yüzden referansın üstüne çıkmak
-- meşru oyunda olmaz. Kafa/boyun (motor çarpanı), pompalı (çoklu saçma), ağır ve
-- fırlatılan silahlar sayılmaz. Yetkililer ve whitelist'tekiler ne ölçülür ne
-- referansa katılır (admin araçları hasarı değiştirebilir).
-- ---------------------------------------------------------------------------
local DMG_KEEP = 12
local DMG_TTL = 30 * 60000
local DMG_PEER_HITS = 3
local DMG_PEERS_MIN = 2
local DMG_RATIO = 1.5
local DMG_RATIO_FAST = 3.0
local DMG_MIN_EXCESS = 5
local DMG_LOOK = 8            -- atıcının son bu kadar isabeti değerlendirilir
local DMG_NEED = 5            -- …bunların en az 5'i şişkinse rapor
local DMG_NEED_FAST = 2       -- …ya da 3 katı olan 2 isabet
local DMG_WINDOW = 120000
local dmgSeen = {}            -- [silah] = { [src] = { {d, t}, ... } }

--- Diğer oyuncuların bu silahla gördüğümüz en yüksek hasarlarının alt ortancası.
local function dmgPeerReference(wh, exclude, now)
  local byWeapon = dmgSeen[wh]
  if not byWeapon then return nil end
  local tops = {}
  for s, list in pairs(byWeapon) do
    if s ~= exclude and #list >= DMG_PEER_HITS then
      local top = 0
      for _, e in ipairs(list) do
        if now - e.t < DMG_TTL and e.d > top then top = e.d end
      end
      if top > 0 then tops[#tops + 1] = top end
    end
  end
  if #tops < DMG_PEERS_MIN then return nil end
  table.sort(tops)
  return tops[math.ceil(#tops / 2)], #tops
end

local function checkPeerDamage(src, data)
  local dmg = tonumber(data.weaponDamage)
  if not dmg or dmg <= 0 or dmg > 2000 then return end
  if data.hitComponent == 19 or data.hitComponent == 20 then return end
  local cls = weaponClass(data.weaponType, src)
  if not (cls and HITSCAN[cls]) or cls == 'shotgun' then return end
  local nid = data.hitGlobalId or (data.hitGlobalIds and data.hitGlobalIds[1])
  local ent = nid and NetworkGetEntityFromNetworkId(nid) or 0
  if not ent or ent == 0 or GetEntityType(ent) ~= 1 then return end
  if CAC.staffBypass and CAC.staffBypass(src) then return end

  local wh = signedToUnsigned(data.weaponType)
  local now = GetGameTimer()
  local ref, peers = dmgPeerReference(wh, src, now)

  local byWeapon = dmgSeen[wh] or {}
  dmgSeen[wh] = byWeapon
  local mine = byWeapon[src] or {}
  mine[#mine + 1] = { d = dmg, t = now }
  while #mine > DMG_KEEP do table.remove(mine, 1) end
  byWeapon[src] = mine

  if not ref then return end                     -- kıyaslanacak yeterli oyuncu yok

  -- Son isabetler GÜNCEL referansa karşı yargılanır (referans oyuncu geldikçe değişebilir).
  local looked, inflated, fast, worst = 0, 0, 0, 0
  for i = #mine, 1, -1 do
    local e = mine[i]
    if now - e.t >= DMG_WINDOW or looked >= DMG_LOOK then break end
    looked = looked + 1
    if e.d >= ref * DMG_RATIO and e.d - ref >= DMG_MIN_EXCESS then
      inflated = inflated + 1
      if e.d >= ref * DMG_RATIO_FAST then fast = fast + 1 end
      if e.d > worst then worst = e.d end
    end
  end
  if inflated >= DMG_NEED or fast >= DMG_NEED_FAST then
    byWeapon[src] = {}                           -- aynı isabetlerle ikinci kez rapor etme
    TriggerEvent('coreac:serverReport', src, 'DAMAGE_PEER_MISMATCH', 'HIGH', {
      source = 'peer_damage', weapon = CoreAC.WeaponLabel and CoreAC.WeaponLabel(data.weaponType) or wh,
      damage = math.floor(worst), normal = math.floor(ref), players = peers, hits = inflated,
      multiplier = math.floor(worst / ref * 10 + 0.5) / 10,
    })
  end
end

-- Eski ölçümleri temizle (ayrılan oyuncuların değerleri TTL boyunca referansa katkı verir).
CreateThread(function()
  while true do
    Wait(5 * 60000)
    local t = GetGameTimer()
    for wh, byWeapon in pairs(dmgSeen) do
      local any = false
      for s, list in pairs(byWeapon) do
        local last = list[#list]
        if not last or t - last.t >= DMG_TTL then byWeapon[s] = nil else any = true end
      end
      if not any then dmgSeen[wh] = nil end
    end
  end
end)

-- ---------------------------------------------------------------------------
-- Silah hasarı — imkânsız hasar (temel örnek)
-- ---------------------------------------------------------------------------
AddEventHandler('weaponDamageEvent', function(sender, data)
  local src = tonumber(sender)
  if not src then return end

  -- Silent aim: vurulan oyuncu(lar) ile atış anındaki nişan yönü arasındaki açı
  -- (sertleştirilmiş kurallar için yukarıdaki checkSilentAim açıklamasına bakın).
  if ruleOn('anti_silent_aim') and data and data.weaponType and (data.hitGlobalIds or data.hitGlobalId)
      and not (CAC.isWhitelisted and CAC.isWhitelisted(src)) then
    checkSilentAim(src, data)
  end

  -- Damage boost: aynı silahı kullanan diğer oyuncularla kıyas (bkz. checkPeerDamage).
  if ruleOn('anti_damage_multiplier') and data and data.weaponDamage and data.weaponType
      and not (CAC.isWhitelisted and CAC.isWhitelisted(src)) then
    checkPeerDamage(src, data)
  end

  -- Rapid fire + wallbang/ESP (rapor-only, yumuşak sinyaller) — oyuncu
  -- hedeflerine bakar, whitelist'li atıcılar hariç tutulur.
  if data and (data.hitGlobalIds or data.hitGlobalId)
      and not (CAC.isWhitelisted and CAC.isWhitelisted(src)) then
    if data.weaponType then checkRapidFire(src, data.weaponType, data.damageTime) end
    local shooterPed = GetPlayerPed(src)
    local ids2 = data.hitGlobalIds or { data.hitGlobalId }
    for _, nid in ipairs(ids2) do
      local ent = NetworkGetEntityFromNetworkId(nid)
      if ent and ent ~= 0 and GetEntityType(ent) == 1 and IsPedAPlayer(ent) then
        checkWallbang(src, ent, shooterPed)
        if data.weaponType then checkReach(src, data.weaponType, ent, shooterPed) end
      end
    end
  end

  -- Kara listedeki silah kullanımı
  if data and data.weaponType then
    local entry = CAC.blacklistLookup and CAC.blacklistLookup(data.weaponType)
    if entry and entry.kind == 'weapon' then
      CancelEvent()
      CAC.enforceBlacklist(src, entry, data.weaponType)
      return
    end
  end

  if ruleOn('anti_illegal_weapon') and data and data.weaponDamage and data.weaponDamage > 2000 then
    -- Çevresel hasar (patlama, ateş, araç çarpması, düşme…) ve ağır/fırlatılan
    -- silahlar bu eşiği meşru olarak aşabilir → bunlar sayılmaz.
    local wt = signedToUnsigned(data.weaponType)
    local cls = weaponClass(data.weaponType, src)
    if not ENVIRONMENT_DAMAGE[wt] and cls ~= 'heavy' and cls ~= 'thrown' then
      TriggerEvent('coreac:serverReport', src, 'ILLEGAL_WEAPON', 'HIGH', {
        dmg = data.weaponDamage, weapon = CoreAC.WeaponLabel and CoreAC.WeaponLabel(data.weaponType) or wt,
      })
    end
  end

  -- Damage Multiplier limiti — tek atışta anormal hasar. TİTİZ: birkaç kez
  -- üst üste tavanı aşınca raporla (tek fluke ban atmasın).
  --
  -- Tavan artık SİLAH SINIFINA göre: pistol/smg 250, rifle 320, mg 380,
  -- shotgun 500, sniper 750 (weapon_data.lua). Bilinmeyen/addon silah veya
  -- melee/patlayıcı → genel Config.MaxWeaponDamage'a (400) düşer. Böylece
  -- meşru heavy-sniper/Mk2 mermisi (>400) false yakalanmaz, ama pistol'e
  -- yüklenen 300 hasar (eski düz 400 tavanının altında kalıyordu) yakalanır.
  --
  -- YANLIŞ-BAN DÜZELTMESİ: bilinmeyen silahlar eskiden genel 400 tavanına
  -- düşüyordu. RP sunucularındaki EKLENTİ (addon) silahlar (yüksek hasarlı
  -- özel keskin nişancılar vb.), patlama/araç-silahı/ezilme hasar olayları
  -- bu tavanı meşru olarak aşabiliyor ve iki isabette BAN'a dönüşüyordu.
  -- Genel 400 tavanı artık kullanılmaz; sınıfı bilinmeyen silah ölçülmez.
  --
  -- EKLENTİ SİLAHLAR: tavan, o silahın diğer oyuncularda ölçülen etkin
  -- hasarından türetilir (server/combat_guard.lua mutabakatı, en az 2 oyuncu).
  -- Mermi saçılımı/menzil düşüşü hasarı yalnızca AZALTIR; 3 katı + 60 payı
  -- bileşen ve özel mermi farklarını fazlasıyla karşılar. Kafa/boyun
  -- isabetleri ve pompalı/ağır silahlar (tek olayda çoklu saçma) sayılmaz.
  if ruleOn('anti_damage_multiplier') and data and data.weaponDamage
      and data.weaponDamage <= 2000 then
    local cap = CoreAC.GetWeaponMaxDamage and CoreAC.GetWeaponMaxDamage(data.weaponType)
    if not cap and CoreAC.WeaponConsensus and data.hitComponent ~= 19 and data.hitComponent ~= 20 then
      local c = CoreAC.WeaponConsensus(data.weaponType, src)
      local cls = c and c.group and CoreAC.WeaponClassFromGroup(c.group)
      if c and c.ref and c.ref > 0 and cls and HITSCAN[cls] and cls ~= 'shotgun' then
        cap = math.floor(math.max(c.ref * 3.0, c.ref + 60))
      end
    end
    if cap and data.weaponDamage > cap
        and tooFast('dmgmul:' .. src, (Config.DamageConfirmHits or 2) - 1, 6000) then
      TriggerEvent('coreac:serverReport', src, 'DAMAGE_MULTIPLIER', 'CRITICAL', {
        dmg = math.floor(data.weaponDamage), cap = cap,
        weapon = CoreAC.WeaponLabel and CoreAC.WeaponLabel(data.weaponType) or data.weaponType,
      })
    end
  end
end)

-- ---------------------------------------------------------------------------
-- giveWeaponEvent — kara listedeki silah bu event'le verilmeye çalışılırsa engelle
-- ---------------------------------------------------------------------------
AddEventHandler('giveWeaponEvent', function(sender, data)
  local src = tonumber(sender)
  if not src then return end
  local hash = data and (data.weaponType or data.weaponHash)
  if hash and CAC.blacklistLookup then
    local entry = CAC.blacklistLookup(hash)
    if entry and entry.kind == 'weapon' then
      CancelEvent()
      CAC.enforceBlacklist(src, entry, hash)
    end
  end
end)

-- ---------------------------------------------------------------------------
-- NOT: 'coreac:serverReport' handler'ı BİLEREK burada DEĞİL.
--
-- Eskiden bu dosyada İKİNCİ bir handler vardı ve server/main.lua'daki asıl
-- handler ile birlikte AYNI tespiti /detections'a İKİ KEZ gönderiyordu:
-- çift tespit kaydı, çift webhook, çift ekran görüntüsü isteği ve şişmiş
-- panel istatistikleri. Tek giriş noktası artık server/main.lua'daki
-- handler'dır (oran sınırlayıcı + kimlik çıkarımı orada).
-- ---------------------------------------------------------------------------
