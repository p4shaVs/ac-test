-- =============================================================================
-- server/godmode_guard.lua — SUNUCU-OTORİTER GODMODE TESPİTİ
--
-- Mantık: bir oyuncuya GERÇEKTEN hasar gitti (weaponDamageEvent), ama o
-- oyuncunun can+zırh havuzu hiç düşmedi → godmode. Karar tamamen sunucuda,
-- oyuncunun kendi client'ı sonucu etkileyemez. Hangi teknikle yapılırsa
-- yapılsın (native flag, proof, damage modifier, health hook) yakalanır.
--
-- BU DOSYA BAŞTAN YAZILDI. Önceki sürümde üç ayrı ölümcül hata vardı:
--   1) AddEventHandler('weaponDamageEvent', function(data)) — FiveM bu event'i
--      (sender, data) olarak verir. Yani `data` aslında saldırganın ID'siydi
--      (sayı) ve `data.weaponDamage` her ateşte Lua hatası atıyordu. Guard
--      hiç çalışmadı, üstelik konsolu hata ile doldurdu.
--   2) Canı ölçülen kişi SALDIRGAN'dı (GetPlayerPed(sender)). Doğrusu VURULAN
--      oyuncudur — saldırganın canının düşmemesi zaten normaldir.
--   3) Sadece 'QBCore:Server:PlayerLoaded' ile aktifleşiyordu; ESX/vRP/
--      standalone sunucularda spawnTime hiç set edilmediği için guard hiç
--      devreye girmiyordu.
--
-- YANLIŞ-POZİTİF TASARIMI:
--   * Ölçüm VURULAN oyuncu üzerinde, can+zırh TOPLAMI ile yapılır (zırhın
--     emdiği hasar "düşmedi" sayılmaz).
--   * Spawn / revive / araç / ölü-yaralı / ışınlanma durumlarında atlanır.
--   * Güvenli bölge, cutscene, senaryo gibi meşru dokunulmazlıklar için
--     sunucu export'u vardır: exports['aeigs-anticheat']:markImmune(src, ms)
--   * Tek pencere yetmez: 20 sn içinde 3 bağımsız isabet gerekir.
-- =============================================================================

local SPAWN_GRACE   = 15000   -- spawn/ilk yüklenme sonrası muafiyet
local VEH_GRACE     = 5000    -- araçtan indikten sonra muafiyet
local REVIVE_GRACE  = 10000   -- revive sonrası muafiyet
local JOIN_FALLBACK = 60000   -- framework event'i yoksa: girişten bu kadar sonra izlemeye başla
local MIN_DAMAGE    = 5       -- bu hasarın altı ölçüm için anlamsız (sekme/çizik)
local SAMPLE_DELAY  = 400     -- hasarın işlenmesi için beklenen süre (ms)
local POOL_TOLERANCE= 2       -- can+zırh havuzu bu kadar bile düşmediyse "düşmedi"
local STRIKES_NEEDED= 3
local STRIKE_WINDOW = 20000

local state = {}      -- [src] = { joinTime, spawnTime, lastVehExit, lastRevive, immuneUntil, strikes, lastStrike, pending }
local pedToSrc = {}   -- [pedHandle] = src  (1 sn'de bir tazelenir)

local function st(src)
  if not state[src] then
    state[src] = {
      joinTime = GetGameTimer(), spawnTime = nil,
      lastVehExit = 0, lastRevive = 0, immuneUntil = 0,
      strikes = 0, lastStrike = 0, pending = false,
    }
  end
  return state[src]
end

-- ---------------------------------------------------------------------------
-- Spawn kaynakları — framework'ten BAĞIMSIZ olması için hepsi dinlenir,
-- hiçbiri yoksa girişten JOIN_FALLBACK sonra otomatik aktifleşir.
-- ---------------------------------------------------------------------------
local function markSpawned(src)
  src = tonumber(src)
  if not src or src <= 0 then return end
  st(src).spawnTime = GetGameTimer()
end

AddEventHandler('QBCore:Server:PlayerLoaded', function(Player)
  markSpawned(Player and Player.PlayerData and Player.PlayerData.source)
end)
AddEventHandler('esx:playerLoaded', function(src) markSpawned(src or source) end)
AddEventHandler('aeigs:playerSpawned', function(src) markSpawned(src or source) end)
-- Client core.lua her (yeniden) spawn'da bunu gönderir — framework şart değil.
RegisterNetEvent('aeigs:respawnAnchor', function()
  local src = source
  markSpawned(src)
  st(src).lastRevive = GetGameTimer()   -- respawn = revive muafiyeti
end)

AddEventHandler('QBCore:Server:PlayerUnload', function(src)
  if state[tonumber(src) or -1] then state[tonumber(src)].spawnTime = nil end
end)

-- Revive bildirimleri (yaygın hastane scriptleri + kendi event'imiz)
local function markRevive(src)
  src = tonumber(src)
  if src and src > 0 then st(src).lastRevive = GetGameTimer() end
end
AddEventHandler('aeigs:revived', markRevive)
AddEventHandler('hospital:server:RevivePlayer', markRevive)
AddEventHandler('esx_ambulancejob:revive', markRevive)

-- ---------------------------------------------------------------------------
-- MEŞRU DOKUNULMAZLIK — güvenli bölge, cutscene, senaryo, admin modu vb.
-- Sunucu script'inden:  exports['aeigs-anticheat']:markImmune(src, 30000)
-- Bu süre boyunca o oyuncu için godmode ölçümü yapılmaz (false ban önler).
-- ---------------------------------------------------------------------------
function Aeigs.markImmune(src, ms)
  src = tonumber(src)
  if not src or src <= 0 then return end
  st(src).immuneUntil = GetGameTimer() + (tonumber(ms) or 30000)
end
exports('markImmune', function(src, ms) Aeigs.markImmune(src, ms) end)
AddEventHandler('aeigs:markImmune', function(src, ms) Aeigs.markImmune(src, ms) end)

AddEventHandler('playerDropped', function()
  state[source] = nil
end)

-- ---------------------------------------------------------------------------
-- Bu oyuncu şu an ölçülebilir mi?
-- ---------------------------------------------------------------------------
local function measurable(src, now)
  local s = state[src]
  if not s then return false end
  if s.pending then return false end                                  -- zaten ölçüm sürüyor
  if now < s.immuneUntil then return false end                        -- meşru dokunulmazlık
  if (now - s.lastRevive) < REVIVE_GRACE then return false end
  if (now - s.lastVehExit) < VEH_GRACE then return false end

  -- Spawn kapısı: framework event'i geldiyse ondan, gelmediyse girişten say.
  if s.spawnTime then
    if (now - s.spawnTime) < SPAWN_GRACE then return false end
  elseif (now - s.joinTime) < JOIN_FALLBACK then
    return false
  end

  if Aeigs.isWhitelisted and Aeigs.isWhitelisted(src) then return false end
  -- Karakter gerçekten oyunda olmalı (yükleme / karakter seçimi hariç).
  if Aeigs.isInGame and not Aeigs.isInGame(src, SPAWN_GRACE) then return false end

  local ped = GetPlayerPed(src)
  if not ped or ped == 0 then return false end
  if GetVehiclePedIsIn(ped, false) ~= 0 then return false end          -- araçtaki hasar modeli farklı
  local hp = GetEntityHealth(ped)
  if hp <= 1 then return false end                                     -- ölü/yaralı
  return true, ped
end

-- ---------------------------------------------------------------------------
-- ANA TESPİT — vurulan oyuncunun can+zırh havuzu düşüyor mu?
-- ---------------------------------------------------------------------------
AddEventHandler('weaponDamageEvent', function(sender, data)
  if Config and Config.DetectionsEnabled == false then return end
  if type(data) ~= 'table' then return end

  local dmg = tonumber(data.weaponDamage) or 0
  if dmg < MIN_DAMAGE then return end

  local ids = data.hitGlobalIds or (data.hitGlobalId and { data.hitGlobalId }) or nil
  if not ids then return end

  local now = GetGameTimer()

  for _, nid in ipairs(ids) do
    local ent = NetworkGetEntityFromNetworkId(nid)
    if ent and ent ~= 0 and DoesEntityExist(ent) then
      local victim = pedToSrc[ent]
      if victim and GetPlayerName(victim) then
        local okToMeasure, ped = measurable(victim, now)
        if okToMeasure then
          local s = state[victim]
          s.pending = true
          local poolBefore = GetEntityHealth(ped) + GetPedArmour(ped)

          SetTimeout(SAMPLE_DELAY, function()
            local s2 = state[victim]
            if not s2 then return end
            s2.pending = false
            if not GetPlayerName(victim) then return end
            -- Ölçüm penceresinde meşru bir olay olduysa (revive/dokunulmazlık) iptal
            local t = GetGameTimer()
            if t < s2.immuneUntil or (t - s2.lastRevive) < REVIVE_GRACE then return end

            local pedNow = GetPlayerPed(victim)
            if not pedNow or pedNow == 0 or pedNow ~= ped then return end  -- ped değişti (respawn)

            local poolAfter = GetEntityHealth(pedNow) + GetPedArmour(pedNow)
            local drop = poolBefore - poolAfter

            if drop < POOL_TOLERANCE then
              if (t - s2.lastStrike) > STRIKE_WINDOW then s2.strikes = 0 end
              s2.strikes    = s2.strikes + 1
              s2.lastStrike = t

              if s2.strikes >= STRIKES_NEEDED then
                s2.strikes = 0
                TriggerEvent('aeigs:serverReport', victim, 'GODMODE', 'CRITICAL', {
                  source     = 'damage_no_pool_drop',
                  damage     = math.floor(dmg),
                  poolBefore = poolBefore,
                  poolAfter  = poolAfter,
                  attacker   = tonumber(sender) or 0,
                  hits       = STRIKES_NEEDED,
                })
              end
            else
              -- Gerçek hasar aldı → temiz; biriken strike'ları söndür.
              s2.strikes = math.max(0, s2.strikes - 1)
            end
          end)
        end
      end
    end
  end
end)

-- ---------------------------------------------------------------------------
-- ped→src haritası + araçtan iniş takibi (tek döngü)
-- ---------------------------------------------------------------------------
CreateThread(function()
  local inVehMap = {}
  while true do
    Wait(1000)
    local fresh = {}
    for _, sid in ipairs(GetPlayers()) do
      local src = tonumber(sid)
      if src then
        local ped = GetPlayerPed(src)
        if ped and ped ~= 0 then fresh[ped] = src end

        local inVeh = (ped and ped ~= 0) and GetVehiclePedIsIn(ped, false) ~= 0 or false
        if inVehMap[src] and not inVeh then st(src).lastVehExit = GetGameTimer() end
        inVehMap[src] = inVeh
      end
    end
    pedToSrc = fresh

    -- ayrılanları temizle
    local online = {}
    for _, sid in ipairs(GetPlayers()) do online[tonumber(sid)] = true end
    for k in pairs(state) do if not online[k] then state[k] = nil end end
    for k in pairs(inVehMap) do if not online[k] then inVehMap[k] = nil end end
  end
end)

print('^2[CoreAC] Godmode guard (server-authoritative) yuklendi.^7')
