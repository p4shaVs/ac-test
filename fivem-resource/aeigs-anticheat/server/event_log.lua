-- =============================================================================
-- Event Log — canlı oyun-olayı akışı (panel "Event Log" sayfası).
--
-- Panel'den AÇILDIĞINDA (Aeigs.eventLogEnabled) sunucu, gördüğü oyun olaylarını
-- (spawn / explosion / damage / kill / particle) hafif kayıtlar halinde toplayıp
-- 2 sn'de bir panele akıtır; panel bunları canlı gösterir. KAPALIYKEN sıfır iş
-- yapar (buffer boş, flush atlanır) — performans etkisi yok.
--
-- Buffer bir tavana kadar dolar; taşarsa fazlası düşer (yoğun sunucuda doğal
-- örnekleme). Bu bir "izlerken aç" hata-ayıklama aracıdır, tam denetim kaydı değil.
-- =============================================================================

Aeigs = Aeigs or {}

local buffer = {}
local BUFFER_CAP = 100

local function nameOf(src)
  src = tonumber(src)
  if src and src > 0 then return GetPlayerName(src) or ('Player#' .. src) end
  return '?'
end

local function on() return Aeigs.eventLogEnabled and Aeigs.eventLogEnabled() end

local function push(kind, src, detail)
  if not on() then return end
  if #buffer >= BUFFER_CAP then return end  -- taştı → düşür (örnekleme)
  buffer[#buffer + 1] = { kind = kind, player = nameOf(src), detail = tostring(detail or ''):sub(1, 200) }
end

AddEventHandler('explosionEvent', function(sender, ev)
  if not on() then return end
  push('explosion', sender, ('type %s'):format(tostring(ev and ev.explosionType or '?')))
end)

AddEventHandler('weaponDamageEvent', function(sender, data)
  if not on() or not data then return end
  if data.willKill then
    push('kill', sender, ('weapon %s'):format(tostring(data.weaponType)))
  else
    push('damage', sender, ('%s dmg · weapon %s'):format(tostring(math.floor(data.weaponDamage or 0)), tostring(data.weaponType)))
  end
end)

AddEventHandler('entityCreating', function(handle)
  if not on() then return end
  local owner = NetworkGetEntityOwner and NetworkGetEntityOwner(handle) or -1
  local model = (GetEntityModel and DoesEntityExist(handle)) and GetEntityModel(handle) or 0
  push('spawn', owner, ('model %s'):format(tostring(model)))
end)

AddEventHandler('ptFxEvent', function(sender)
  if not on() then return end
  push('particle', sender, 'particle fx')
end)

-- Flush döngüsü — açıkken 2 sn'de bir batch gönder.
CreateThread(function()
  while true do
    Wait(2000)
    if on() and #buffer > 0 then
      local batch = buffer
      buffer = {}
      Aeigs.request('/event-log', 'POST', { events = batch }, nil)
    elseif not on() then
      buffer = {}
    end
  end
end)
