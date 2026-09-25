-- =============================================================================
-- legit_moves.lua — meşru ışınlanma / admin aracı / çatışma durumu
--
-- SORUN: shared.js'deki native kancaları (SetEntityCoords, SetEntityInvincible…)
-- YALNIZCA bu resource'un içinde çalışır. qb-core, qb-apartments, qb-houses,
-- qb-smallresources asansörleri, qb-ambulancejob, txAdmin, qb-adminmenu gibi
-- DİĞER resource'lar oyuncuyu ışınladığında ya da ölümsüz yaptığında AC bunu
-- hiç görmüyordu → her ev/apartman/asansör girişi TELEPORT, admin menüsünün
-- godmode'u "durduk yere" GODMODE olarak düşüyordu.
--
-- Bu modül entegrasyon gerektirmeden şunları tanır:
--   * Ekran kararması (DoScreenFadeOut / yükleme sahnesi / player switch):
--     QBCore'daki neredeyse TÜM meşru ışınlanmalar ekranı karartıp yapılır
--     (apartman, ev, asansör, hastane yatağı, hapis, spawn seçimi, /tpm).
--     Kararma başlarken ve bitince muafiyet açılır, sunucuya ipucu gider
--     (sunucu bunu oyuncu başına dakikalık bütçeyle sınırlar — live.lua).
--   * Bilinen admin / framework ışınlama olayları (QBCore /tp, txAdmin, ESX).
--   * txAdmin oyuncu modları (noclip / godmode / superjump) — client kontrolleri
--     bu sırada susar; sunucu aynı bilgiyi izin kontrolü yapılmış txAdmin
--     logundan ayrıca alır (server/staff_tools.lua), client'a güvenmez.
--   * Aktif çatışma (ateş etme / yakın dövüş) ve framework "yaralı/ölü" durumu
--     — godMode.lua'nın bayrak kontrolünü doğrulamak için.
-- =============================================================================

CAC = CAC or {}

-- ---------------------------------------------------------------------------
-- Ekran kararması → meşru script ışınlaması
-- ---------------------------------------------------------------------------
CAC.fadeAt = 0

local function screenBusy()
  return not IsScreenFadedIn()
    or IsPlayerSwitchInProgress()
    or GetIsLoadingScreenActive()
    or IsNewLoadSceneActive()
end

--- Son `ms` içinde ekran karardı mı / hâlâ karanlık mı?
function CAC.fadeRecent(ms)
  return GetGameTimer() - (CAC.fadeAt or 0) < (ms or 3000)
end

CreateThread(function()
  local busy, lastHint, startPos = false, 0, nil
  while true do
    Wait(100)
    local now = GetGameTimer()
    if screenBusy() then
      CAC.fadeAt = now
      if not busy then
        busy = true
        startPos = GetEntityCoords(PlayerPedId())
        CAC.markTp()
        -- Sunucunun konum taraması da muaf olsun. Oyuna girişteki kararmalar
        -- (spawn kapısı açılmadan) sunucu tarafında zaten sayılmaz.
        if CAC.spawned and now - lastHint > 4000 then
          lastHint = now
          TriggerServerEvent('coreac:tpHint')
        end
      end
    elseif busy then
      busy = false
      CAC.markTp()  -- ekran açıldıktan sonra da ~10 sn muaf
      -- Kararma uzun sürdüyse (iç mekân yükleme) sunucu muafiyeti bitmiş
      -- olabilir: gerçekten taşındıysak bir ipucu daha gönder.
      local moved = startPos and #(GetEntityCoords(PlayerPedId()) - startPos) or 0
      if CAC.spawned and moved > 30.0 and now - lastHint > 1500 then
        lastHint = now
        TriggerServerEvent('coreac:tpHint')
      end
    end
  end
end)

-- ---------------------------------------------------------------------------
-- Bilinen admin / framework ışınlama olayları (sunucu izin kontrolünden sonra
-- tetiklenir). 'coreac:markTeleport' = CAC.markTp + sunucu ipucu (core.lua).
-- ---------------------------------------------------------------------------
for _, ev in ipairs({
  'QBCore:Command:TeleportToPlayer',  -- qb-core /tp <id>, qb-adminmenu goto
  'QBCore:Command:TeleportToCoords',  -- qb-core /tp x y z
  'QBCore:Command:GoToMarker',        -- qb-core /tpm
  'esx:teleport',                     -- ESX xPlayer.setCoords / /tp
  'txcl:tpToCoords',                  -- txAdmin tp / bring
  'txcl:tpToWaypoint',                -- txAdmin tp to waypoint
  'txcl:spectate:start',              -- txAdmin spectate (admin ped taşınır)
  'qb-admin:client:spectate',         -- qb-adminmenu spectate
}) do
  RegisterNetEvent(ev, function() TriggerEvent('coreac:markTeleport') end)
end

-- ---------------------------------------------------------------------------
-- txAdmin oyuncu modları. Yalnızca client kontrollerini susturur; sunucu
-- kararını txAdmin'in izin kontrollü logundan verir (staff_tools.lua).
-- ---------------------------------------------------------------------------
CAC.adminTool = nil
RegisterNetEvent('txcl:setPlayerMode', function(mode)
  if mode == 'noclip' or mode == 'godmode' or mode == 'superjump' then
    CAC.adminTool = mode
  else
    CAC.adminTool = nil
  end
  -- freecam/noclip kapanınca ped kameranın olduğu yere ışınlanır
  CAC.markTp()
end)

-- ---------------------------------------------------------------------------
-- Aktif çatışma: son ateş / yakın dövüş anı
-- ---------------------------------------------------------------------------
CAC.lastCombatAt = 0

--- Son `ms` içinde ateş etti ya da yakın dövüşe girdi mi?
function CAC.inCombat(ms)
  return GetGameTimer() - (CAC.lastCombatAt or 0) < (ms or 15000)
end

CreateThread(function()
  while true do
    local ped = PlayerPedId()
    if IsPedArmed(ped, 6) then            -- 2 = patlayıcı, 4 = ateşli silah
      if IsPedShooting(ped) then CAC.lastCombatAt = GetGameTimer() end
      Wait(0)
    else
      if IsPedInMeleeCombat(ped) then CAC.lastCombatAt = GetGameTimer() end
      Wait(200)
    end
  end
end)

-- ---------------------------------------------------------------------------
-- Framework "yaralı / ölü" durumu. qb-ambulancejob ölü oyuncuyu tam canla
-- diriltip DOKUNULMAZ yapar (yerde yatarken). Bu sırada ölümsüzlük meşrudur.
-- ---------------------------------------------------------------------------
local DOWNED_BAG_KEYS = { 'isDead', 'dead', 'isdead', 'isDowned', 'downed', 'inLaststand', 'laststand', 'isLaststand' }
local qbCore = nil

local function playerMetadata()
  if GetResourceState('qb-core') == 'started' then
    if qbCore == nil then
      local ok, obj = pcall(function() return exports['qb-core']:GetCoreObject() end)
      qbCore = ok and obj or false
    end
    if qbCore then
      local ok, pd = pcall(qbCore.Functions.GetPlayerData)
      if ok and type(pd) == 'table' then return pd.metadata end
    end
  elseif GetResourceState('qbx_core') == 'started' then
    local ok, pd = pcall(function() return exports.qbx_core:GetPlayerData() end)
    if ok and type(pd) == 'table' then return pd.metadata end
  end
  return nil
end

function CAC.isDowned()
  local bag = LocalPlayer.state
  for _, k in ipairs(DOWNED_BAG_KEYS) do
    if bag[k] then return true end
  end
  local m = playerMetadata()
  return type(m) == 'table' and (m.isdead == true or m.inlaststand == true)
end
