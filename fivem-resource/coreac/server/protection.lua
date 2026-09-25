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
-- YANLIŞ-BAN TASARIMI (bu tip BAN atabilir):
--   * Yalnızca hitscan ateşli silahlar (patlayıcı/fırlatılan/melee/araç
--     silahında nişan yönü isabetle ilişkili değildir — ör. yapışkan bomba
--     patlatılırken oyuncu başka yöne bakar).
--   * Atıcı YAYA, kurban YAYA ve 8 m'den uzak (ağ gecikmesinin konumu
--     kaydırmasının açıya etkisi küçük kalsın).
--   * İsabet, zamanca EN YAKIN nişan örneğiyle eşlenir (±300 ms).
--   * TEK isabet asla yetmez: 10 sn içinde 60°'den fazla sapan 3 isabet.
-- ---------------------------------------------------------------------------
local HITSCAN = { pistol = true, smg = true, rifle = true, mg = true, sniper = true, shotgun = true }
local AIM_KEEP = 8
local aimData = {}   -- [src] = { {pos, fwd, t}, ... } (en yeni sonda)

RegisterNetEvent('coreac:aim', function(px, py, pz, fx, fy, fz)
  local src = source
  if CAC.eventLimited(src, 'aim', 20, 1000) then return end
  px, py, pz, fx, fy, fz = tonumber(px), tonumber(py), tonumber(pz), tonumber(fx), tonumber(fy), tonumber(fz)
  if not (px and py and pz and fx and fy and fz) then return end
  local list = aimData[src] or {}
  list[#list + 1] = { pos = vector3(px, py, pz), fwd = vector3(fx, fy, fz), t = GetGameTimer() }
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

AddEventHandler('playerDropped', function()
  local s = source
  aimData[s] = nil
end)

local silentHits = {}   -- [src] = { zaman damgaları }

-- ---------------------------------------------------------------------------
-- RAPID FIRE (fire-rate hilesi) — RAPOR-ONLY, yumuşak sinyal.
-- Aynı silahtan ardışık isabetler arasındaki süre, hiçbir gerçek silahın
-- ulaşamayacağı kadar kısaysa (60ms = 1000 rpm üstü) işaretle. Ateş hızı
-- netcode/lag'e duyarlı olduğu için TİTİZ: çok sayıda ardışık ihlal ister,
-- asla ban atmaz — sadece panelde görünür, isterseniz manuel inceleyin.
-- ---------------------------------------------------------------------------
local lastShot = {}      -- [src][weaponHash] = son isabet zamanı
local rapidFireStrike = {}

local function checkRapidFire(src, weaponHash)
  if not ruleOn('anti_rapid_fire') then return end
  lastShot[src] = lastShot[src] or {}
  local now = GetGameTimer()
  local last = lastShot[src][weaponHash]
  lastShot[src][weaponHash] = now
  if not last then return end
  local dt = now - last
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

AddEventHandler('playerDropped', function()
  local s = source
  silentHits[s] = nil; lastShot[s] = nil; rapidFireStrike[s] = nil; losStrike[s] = nil; reachStrike[s] = nil
end)

local function checkSilentAim(src, data)
  local cls = CoreAC.GetWeaponClass and CoreAC.GetWeaponClass(data.weaponType)
  if not (cls and HITSCAN[cls]) then return end
  local shooterPed = GetPlayerPed(src)
  if not shooterPed or shooterPed == 0 or GetVehiclePedIsIn(shooterPed, false) ~= 0 then return end

  local victims = {}
  for _, nid in ipairs(data.hitGlobalIds or { data.hitGlobalId }) do
    local ent = NetworkGetEntityFromNetworkId(nid)
    if ent and ent ~= 0 and GetEntityType(ent) == 1 and IsPedAPlayer(ent)
        and GetVehiclePedIsIn(ent, false) == 0 then
      victims[#victims + 1] = GetEntityCoords(ent)
    end
  end
  if #victims == 0 then return end

  -- Aynı atışın nişan örneği hasar olayından birkaç on ms SONRA gelebilir
  -- (farklı ağ kanalları) — değerlendirmeyi kısa bir süre ertele.
  local hitAt = GetGameTimer()
  SetTimeout(250, function()
    if not GetPlayerName(src) then return end
    local s = aimSampleNear(src, hitAt)
    if not s then return end
    for _, vpos in ipairs(victims) do
      local dir = vpos - s.pos
      local dist = #dir
      if dist > 8.0 then
        dir = dir / dist
        local dot = s.fwd.x * dir.x + s.fwd.y * dir.y + s.fwd.z * dir.z
        if dot < 0.5 then   -- 60°'den fazla sapma
          local now = GetGameTimer()
          local fresh = {}
          for _, t in ipairs(silentHits[src] or {}) do
            if now - t < 10000 then fresh[#fresh + 1] = t end
          end
          fresh[#fresh + 1] = now
          silentHits[src] = fresh
          if #fresh >= 3 then
            silentHits[src] = nil
            TriggerEvent('coreac:serverReport', src, 'SILENT_AIM', 'CRITICAL', {
              angleCos = math.floor(dot * 100) / 100, dist = math.floor(dist), hits = #fresh,
            })
          end
          return
        end
      end
    end
  end)
end

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

  -- Rapid fire + wallbang/ESP (rapor-only, yumuşak sinyaller) — oyuncu
  -- hedeflerine bakar, whitelist'li atıcılar hariç tutulur.
  if data and (data.hitGlobalIds or data.hitGlobalId)
      and not (CAC.isWhitelisted and CAC.isWhitelisted(src)) then
    if data.weaponType then checkRapidFire(src, data.weaponType) end
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
    local cls = CoreAC.GetWeaponClass and CoreAC.GetWeaponClass(data.weaponType)
    if not ENVIRONMENT_DAMAGE[wt] and cls ~= 'heavy' and cls ~= 'thrown' then
      TriggerEvent('coreac:serverReport', src, 'ILLEGAL_WEAPON', 'HIGH', { dmg = data.weaponDamage })
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
  -- Artık yalnızca sınıfı ve tavanı bilinen VANİLLA ateşli silahlar ölçülür.
  if ruleOn('anti_damage_multiplier') and data and data.weaponDamage
      and data.weaponDamage <= 2000 then
    local cap = CoreAC.GetWeaponMaxDamage and CoreAC.GetWeaponMaxDamage(data.weaponType)
    if cap and data.weaponDamage > cap
        and tooFast('dmgmul:' .. src, (Config.DamageConfirmHits or 2) - 1, 6000) then
      TriggerEvent('coreac:serverReport', src, 'DAMAGE_MULTIPLIER', 'CRITICAL', { dmg = math.floor(data.weaponDamage), cap = cap })
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
