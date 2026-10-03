-- =============================================================================
-- client/integrity.lua — AC'nin KENDİ Lua ortamı kancalandı mı?
--
-- Bazı executor'lar kodu doğrudan anti-cheat resource'unun içine enjekte eder ve
-- TriggerServerEvent / AddEventHandler / Wait gibi çekirdek fonksiyonları ya da
-- tespitlerin okuduğu native'leri (GetEntityHealth, GetPlayerInvincible,
-- GetEntityCoords…) değiştirir: raporlar gitmez, thread'ler donar ya da AC'ye
-- yalan söylenir — AC "çalışıyor görünür ama kördür". Bu resource'un ortamında bu
-- fonksiyonları yalnızca FiveM'in kendisi tanımlar ve hiçbir meşru kod onları
-- değiştirmez; değişirse bu bir müdahaledir.
--
-- Kontrol, yüklenirken alınan ORİJİNAL referanslarla yapılır; rapor güvenli kanaldan
-- (client/secure_channel.lua, yükleme anında yakalanmış CAC.tamper) gider. Her
-- fonksiyon bir kez raporlanır. AC'nin tamamen durdurulması, raporların yolda
-- düşürülmesi ve thread donması sunucuda ayrıca yakalanır (server/secure_channel.lua).
-- =============================================================================

local rawget, type, pairs, ipairs = rawget, type, pairs, ipairs
local Wait, CreateThread = Wait, CreateThread
local tamper = CAC and CAC.tamper

-- Çekirdek (scheduler) fonksiyonları — her zaman _G'de gerçek değerdir.
local WATCH = { 'TriggerServerEvent', 'TriggerEvent', 'AddEventHandler', 'RegisterNetEvent', 'CreateThread', 'Wait',
  'SetTimeout', 'exports' }
local WATCH_CITIZEN = { 'CreateThread', 'Wait', 'SetTimeout', 'InvokeNative' }

-- Tespitlerin okuduğu native'ler. FiveM native'leri _G'ye ilk erişimde bağlar;
-- burada erişerek bağlarız ve SONRA rawget ile doğrularız. Bağlanmayan (nil) ad
-- sessizce atlanır — doğrulanamayan şey işaretlenmez.
local WATCH_NATIVES = {
  'PlayerPedId', 'PlayerId', 'GetGameTimer', 'NetworkIsSessionStarted',
  'GetEntityHealth', 'GetEntityMaxHealth', 'GetPedArmour', 'GetPlayerInvincible', 'GetPlayerInvincible_2',
  'GetEntityCanBeDamaged', 'GetEntityProofs', 'IsEntityVisible', 'GetEntityAlpha',
  'GetEntityCoords', 'GetEntityVelocity', 'GetEntitySpeed', 'GetEntityHeightAboveGround',
  'GetEntityCollisionDisabled', 'IsEntityPositionFrozen', 'IsPedInAnyVehicle', 'GetVehiclePedIsIn',
  'GetSelectedPedWeapon', 'GetCurrentPedWeapon', 'GetAmmoInPedWeapon', 'IsPedFalling', 'IsPedRagdoll',
  'GetFinalRenderedCamCoord', 'GetGameplayCamCoord', 'DoesEntityExist',
  'GetRegisteredCommands', 'GetNumResources', 'GetResourceByFindIndex', 'GetResourceState',
  'GetNumResourceMetadata', 'GetResourceMetadata', 'LoadResourceFile',
  'GetInvokingResource', 'GetCurrentResourceName',
}

-- AC'nin kendi rapor ve kanal fonksiyonları.
local WATCH_CAC = { 'report', 'secureSend', 'tamper', 'fromServer', 'beat', 'actorBeat', 'sealConfig', 'checkSeal', 'shieldFlush' }

local INTERVAL = 15000

local original, originalCitizen, originalCac = {}, {}, {}
for _, name in ipairs(WATCH) do original[name] = rawget(_G, name) end
for _, name in ipairs(WATCH_NATIVES) do
  local ok, fn = pcall(function() return _G[name] end)
  if ok and type(fn) == 'function' and rawget(_G, name) == fn then original[name] = fn end
end
if type(Citizen) == 'table' then
  for _, name in ipairs(WATCH_CITIZEN) do originalCitizen[name] = rawget(Citizen, name) end
end
if type(CAC) == 'table' then
  for _, name in ipairs(WATCH_CAC) do originalCac[name] = rawget(CAC, name) end
end
-- AC'nin kendi rapor yolu da korunur (bridge/client.lua bunları yüklenirken yakalar).
local originalDetect = CoreAC and CoreAC.DetectPlayer
local originalAcSend = CoreAC and CoreAC.TriggerServerEvent

local reported = {}
local function tampered(name)
  if reported[name] then return end
  reported[name] = true
  if tamper then
    tamper({ reason = 'anti-cheat environment hooked (code injected into the anti-cheat)', hooked = name })
  end
end

--- Tek tur kontrol (testler de çağırır). Döner: bu turda bulunan değişiklik sayısı.
local function checkIntegrity()
  local found = 0
  for name, fn in pairs(original) do
    if fn ~= nil and rawget(_G, name) ~= fn then found = found + 1; tampered(name) end
  end
  if type(Citizen) == 'table' then
    for name, fn in pairs(originalCitizen) do
      if fn ~= nil and rawget(Citizen, name) ~= fn then found = found + 1; tampered('Citizen.' .. name) end
    end
  end
  if type(CAC) == 'table' then
    for name, fn in pairs(originalCac) do
      if fn ~= nil and rawget(CAC, name) ~= fn then found = found + 1; tampered('CAC.' .. name) end
    end
  end
  if CoreAC then
    if originalDetect and CoreAC.DetectPlayer ~= originalDetect then found = found + 1; tampered('CoreAC.DetectPlayer') end
    if originalAcSend and CoreAC.TriggerServerEvent ~= originalAcSend then found = found + 1; tampered('CoreAC.TriggerServerEvent') end
  end
  return found
end
CoreAC = CoreAC or {}
CoreAC.CheckIntegrity = checkIntegrity

CreateThread(function()
  while true do
    Wait(INTERVAL)
    checkIntegrity()
  end
end)
