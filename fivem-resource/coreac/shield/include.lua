-- =============================================================================
-- CoreAC Event Shield — bu dosya `ac shield install` ile eklendi; elle düzenlemeyin.
-- Kaldırmak için sunucu konsolunda: ac shield uninstall <resource>
--
-- Ne yapar: bu resource'un istemcide gönderdiği sunucu olaylarını (TriggerServerEvent)
-- yalnızca SAYAR — olayların içeriğine, sırasına ya da davranışına dokunmaz. Anti-cheat
-- bu sayıları sunucuya bildirir; sunucu kendi aldığı olaylarla karşılaştırır. Bir hile
-- menüsü (executor) bu resource'un olayını kendi kodundan tetiklerse sayılmamış bir
-- olay olarak görünür ve yakalanır.
--
-- Sunucu tarafında hiçbir şey yapmaz. Bu dosya resource'un ilk script'i olarak yüklenir.
-- =============================================================================
if IsDuplicityVersion() then return end

local _TriggerServerEvent = TriggerServerEvent
local _TriggerLatentServerEvent = TriggerLatentServerEvent
local counts, latent = {}, {}

TriggerServerEvent = function(eventName, ...)
  if type(eventName) == 'string' then counts[eventName] = (counts[eventName] or 0) + 1 end
  return _TriggerServerEvent(eventName, ...)
end

if _TriggerLatentServerEvent then
  TriggerLatentServerEvent = function(eventName, bps, ...)
    if type(eventName) == 'string' then latent[eventName] = (latent[eventName] or 0) + 1 end
    return _TriggerLatentServerEvent(eventName, bps, ...)
  end
end

CreateThread(function()
  local ch
  for _ = 1, 1200 do
    ch = GlobalState.coreac_ch
    if type(ch) == 'table' and type(ch.pull) == 'string' and type(ch.put) == 'string' then break end
    ch = nil
    Wait(500)
  end
  if not ch then return end
  local put = ch.put
  AddEventHandler(ch.pull, function()
    local c, l = counts, latent
    counts, latent = {}, {}
    TriggerEvent(put, c, l)
  end)
  TriggerEvent(put, {}, {})
end)
