-- session_guard.lua — Reconnect spam, sohbet flood, kaynak allowlist (opsiyonel)

local function ruleOn(key)
  local r = Aeigs.getRules()
  return r[key] == true
end

-- ---------------------------------------------------------------------------
-- RECONNECT SPAM — aynı kimlik kısa sürede çok sık bağlanıp kopuyorsa
-- (bypass/exploit denemesi, ban sonrası hızlı yeniden bağlanma denemeleri,
-- ya da hesap paylaşım/otomasyon şüphesi) rapor eder. Ban ATMAZ.
-- ---------------------------------------------------------------------------
local reconnects = {}  -- [license] = { count, resetAt }

AddEventHandler('playerConnecting', function(_, _, deferrals)
  if not ruleOn('anti_reconnect_spam') then return end
  local src = source
  local ids = Aeigs.getIdents(src)
  if not ids.license then return end
  local now = GetGameTimer()
  local b = reconnects[ids.license]
  if not b or now > b.resetAt then
    b = { count = 0, resetAt = now + 120000 }
    reconnects[ids.license] = b
  end
  b.count = b.count + 1
  if b.count >= 6 then
    b.count = 0
    Aeigs.log('WARN', 'session', ('Frequent reconnects: %s (6+ in 2 minutes)'):format(GetPlayerName(src) or ids.license))
    Aeigs.request('/detections', 'POST', {
      type = 'RECONNECT_SPAM', severity = 'LOW', origin = 'server',
      playerName = GetPlayerName(src) or 'Unknown', license = ids.license, details = {},
    }, nil)
  end
end)

-- ---------------------------------------------------------------------------
-- CHAT FLOOD — sohbet spam koruması. Framework'ün kendi chat resource'u
-- 'chatMessage' event'ini tetikliyorsa burada yakalanır (bazı framework'ler
-- kendi event isimlerini kullanır — bu durumda etkisizdir, zararsızdır).
-- ---------------------------------------------------------------------------
local chatHits = {}

AddEventHandler('chatMessage', function(_, _, _message)
  if not ruleOn('anti_chat_flood') then return end
  local src = source
  if not src or src <= 0 then return end
  local now = GetGameTimer()
  local b = chatHits[src]
  if not b or now > b.resetAt then
    b = { count = 0, resetAt = now + 8000 }
    chatHits[src] = b
  end
  b.count = b.count + 1
  if b.count > 12 then
    CancelEvent()
    TriggerEvent('aeigs:serverReport', src, 'CHAT_FLOOD', 'HIGH', {})
  end
end)

-- ---------------------------------------------------------------------------
-- RESOURCE MISMATCH (opsiyonel, varsayılan KAPALI) — Config.AllowedResources
-- bir liste olarak tanımlanırsa, o listede OLMAYAN bir kaynak başladığında
-- rapor eder. Tanımlanmazsa bu özellik tamamen devre dışıdır (false riski
-- olmasın diye varsayılan davranış "hiçbir şey yapma").
-- ---------------------------------------------------------------------------
if Config.AllowedResources and #Config.AllowedResources > 0 then
  local allowed = {}
  for _, r in ipairs(Config.AllowedResources) do allowed[r] = true end

  AddEventHandler('onResourceStart', function(resName)
    if not ruleOn('anti_resource_mismatch') then return end
    if resName == GetCurrentResourceName() then return end
    if not allowed[resName] then
      Aeigs.log('WARN', 'resource', ('Resource outside the allowlist started: %s'):format(resName))
    end
  end)
end

AddEventHandler('playerDropped', function()
  local s = source
  chatHits[s] = nil
end)
