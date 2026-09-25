-- vehicle_guard.lua — Araç godmode + anlık onarım + kalkan yenilenmesi
-- (SUNUCU TARAFLI, server-authoritative — client'tan bağımsız)

local function ruleOn(key)
  local r = CAC.getRules()
  return r[key] == true
end

-- ---------------------------------------------------------------------------
-- VEHICLE GODMODE — araç GERÇEKTEN vuruluyor (weaponDamageEvent hedefi araç)
-- ama motor sağlığı hiç düşmüyorsa = invincible araç hilesi. Sürücü sorumlu
-- tutulur. godmode_guard.lua'daki oyuncu godmode mantığının araç versiyonu.
-- ---------------------------------------------------------------------------
local vWin = {}      -- [vehNetId] = { hits, first, healthStart, healthMin }
local vStrikes = {}  -- [driverSrc] = strike sayısı

-- Thread içinden kaydedilir → bu kaynaktaki diğer weaponDamageEvent
-- handler'larından SONRA çalışır ve iptal edilmiş (hiç uygulanmamış) hasarı
-- "araç hasar almadı" diye saymaz (bkz. server/godmode_guard.lua).
local function onVehicleDamage(sender, data)
  if not ruleOn('anti_vehicle_godmode') then return end
  if WasEventCanceled() then return end
  local src = tonumber(sender)
  if not src then return end
  if not data or not (data.hitGlobalIds or data.hitGlobalId) then return end

  local ids = data.hitGlobalIds or { data.hitGlobalId }
  for _, nid in ipairs(ids) do
    local veh = NetworkGetEntityFromNetworkId(nid)
    if veh and veh ~= 0 and DoesEntityExist(veh) and GetEntityType(veh) == 2 then
      local driver = GetPedInVehicleSeat(veh, -1)
      local driverSrc = driver and driver ~= 0 and NetworkGetEntityOwner(driver) or nil
      if driverSrc and driverSrc > 0 and not (CAC.isWhitelisted and CAC.isWhitelisted(driverSrc)) then
        local hp = GetEntityHealth(veh)
        local now = GetGameTimer()
        local w = vWin[nid]
        if not w or (now - w.first) > 7000 then
          w = { hits = 0, first = now, healthStart = hp, healthMin = hp }
          vWin[nid] = w
        end
        w.hits = w.hits + 1
        if hp < w.healthMin then w.healthMin = hp end
        if w.hits >= 5 and w.healthMin >= (w.healthStart - 15) then
          vWin[nid] = nil
          vStrikes[driverSrc] = (vStrikes[driverSrc] or 0) + 1
          if vStrikes[driverSrc] >= 2 then
            vStrikes[driverSrc] = 0
            TriggerEvent('coreac:serverReport', driverSrc, 'VEHICLE_GODMODE', 'CRITICAL', { hits = w.hits })
          end
        end
      end
    end
  end
end

CreateThread(function()
  AddEventHandler('weaponDamageEvent', onVehicleDamage)
end)

-- ---------------------------------------------------------------------------
-- INSTANT REPAIR — RAPOR-ONLY. Aracın sağlığı bir örnekte çok düşükken bir
-- sonraki örnekte anlık tam sağlığa sıçraması (meşru tamir script'i/mekanik
-- de bunu yapabilir, o yüzden ban ATMAZ, sadece bilgilendirir).
-- ARMOR REGEN — RAPOR-ONLY. Oyuncunun kalkanı, revive/heal muafiyeti yokken
-- kısa sürede büyük miktarda artıyorsa (pickup olmadan) şüphelidir.
-- ---------------------------------------------------------------------------
local lastVehHealth = {}   -- [vehNetId] = health
local lastArmor = {}       -- [src] = armor

CreateThread(function()
  while true do
    Wait(4000)
    for _, sid in ipairs(GetPlayers()) do
      local src = tonumber(sid)
      local ped = GetPlayerPed(src)
      if ped and ped ~= 0 then
        -- Armor regen. Karakter yüklenirken framework zırhı metadata'dan 0→100
        -- yükler; bu her girişte sahte ARMOR_REGEN kaydı üretiyordu → oyunda şartı.
        if ruleOn('anti_armor_regen') and CAC.isInGame and CAC.isInGame(src, 15000) then
          local armor = GetPedArmour(ped)
          local prev = lastArmor[src]
          local graced = CAC.hasReviveGrace and CAC.hasReviveGrace(src)
          if prev and armor - prev >= 40 and not graced
              and not (CAC.isWhitelisted and CAC.isWhitelisted(src)) then
            TriggerEvent('coreac:serverReport', src, 'ARMOR_REGEN', 'MEDIUM', { from = prev, to = armor })
          end
          lastArmor[src] = armor
        end

        -- Instant repair (sürücü olduğu araç)
        if ruleOn('anti_instant_repair') then
          local veh = GetVehiclePedIsIn(ped, false)
          if veh ~= 0 and GetPedInVehicleSeat(veh, -1) == ped then
            local vnid = NetworkGetNetworkIdFromEntity(veh)
            local hp = GetEntityHealth(veh)
            local prevH = lastVehHealth[vnid]
            if prevH and prevH < 300 and hp > 950
                and not (CAC.hasReviveGrace and CAC.hasReviveGrace(src))   -- admin "Repair" / mekanik muafiyeti
                and not (CAC.isWhitelisted and CAC.isWhitelisted(src)) then
              TriggerEvent('coreac:serverReport', src, 'INSTANT_REPAIR', 'MEDIUM', { from = prevH, to = hp })
            end
            lastVehHealth[vnid] = hp
          end
        end
      end
    end
  end
end)

AddEventHandler('playerDropped', function()
  local s = source
  vStrikes[s] = nil; lastArmor[s] = nil
end)
