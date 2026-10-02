-- =============================================================================
-- client/integrity.lua — AC'nin KENDİ Lua ortamı kancalandı mı?
--
-- Bazı executor'lar kodu doğrudan anti-cheat resource'unun içine enjekte eder ve
-- TriggerServerEvent / AddEventHandler / Wait gibi çekirdek fonksiyonları değiştirir:
-- böylece raporlar sunucuya hiç gitmez, thread'ler donar, AC "çalışıyor görünür ama
-- ölüdür". Bu resource'un ortamında bu fonksiyonları yalnızca FiveM'in kendisi tanımlar
-- ve hiçbir meşru kod onları değiştirmez; değişirse bu bir müdahaledir.
--
-- Kontrol, yüklenirken alınan ORİJİNAL referanslarla yapılır ve rapor yine orijinal
-- TriggerServerEvent ile gönderilir (kancalanmış olanla değil). Her fonksiyon tek bir
-- kez raporlanır. Sunucu tarafındaki canlılık ve challenge kontrolü (liveness_guard)
-- AC'nin tamamen durdurulduğu durumu ayrıca yakalar.
-- =============================================================================

local rawget, type, pairs = rawget, type, pairs
local Wait, CreateThread = Wait, CreateThread
local sendToServer = TriggerServerEvent

local WATCH = { 'TriggerServerEvent', 'TriggerEvent', 'AddEventHandler', 'RegisterNetEvent', 'CreateThread', 'Wait' }
local WATCH_CITIZEN = { 'CreateThread', 'Wait', 'SetTimeout' }
local INTERVAL = 15000

local original, originalCitizen = {}, {}
for _, name in ipairs(WATCH) do original[name] = rawget(_G, name) end
if type(Citizen) == 'table' then
  for _, name in ipairs(WATCH_CITIZEN) do originalCitizen[name] = rawget(Citizen, name) end
end
-- AC'nin kendi rapor yolu da korunur (bridge/client.lua bunları yüklenirken yakalar).
local originalDetect = CoreAC and CoreAC.DetectPlayer
local originalAcSend = CoreAC and CoreAC.TriggerServerEvent

local reported = {}
local function tampered(name)
  if reported[name] then return end
  reported[name] = true
  sendToServer('coreac:report', 'AC_TAMPER', 'HIGH', {
    reason = 'anti-cheat environment hooked (code injected into the anti-cheat)',
    hooked = name,
  })
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
