-- =============================================================================
-- Event Log — canlı oyun-olayı akışı (panel "Event Log" sayfası).
--
-- Panelden AÇILDIĞINDA sunucu gördüğü olayları hafif kayıtlar hâlinde toplar ve
-- 2 sn'de bir panele akıtır. KAPALIYKEN sıfır iş yapar.
--
-- ESKİ SORUNLAR (düzeltildi):
--   * "Sadece spawn spamlanıyor": entityCreating trafikteki araç ve yayaları da
--     (popülasyon) sayıyordu; 100'lük tampon her 2 sn'de onlarla doluyor, patlama/
--     hasar/öldürme hiç görünmüyordu. Artık yalnızca OYUNCUNUN oluşturduğu script
--     varlıkları (popülasyon tipi 7) sayılır, her türün kendi kotası vardır ve aynı
--     satır tekrar ederse tek satırda "×N" olarak birleşir.
--   * "Hangi event gönderildi görünmüyor": yalnızca oyun olayları vardı. FiveM'de
--     tüm script olaylarını yakalayan genel bir kanca YOKTUR; bu yüzden panelden
--     eklenen "izlenen olaylar" (watchEvents) burada dinlenir: hangi oyuncu hangi
--     olayı hangi argümanlarla gönderdi, akışta "event" satırı olarak görünür.
--   * Ayrıntılar okunmuyordu ("model -1216765807"): artık silah/patlama adları
--     burada, model adları panelde (#hash → katalog adı) çözülür.
-- =============================================================================

CAC = CAC or {}

local KIND_CAP = { spawn = 25, damage = 30, kill = 20, explosion = 20, particle = 10, event = 40, join = 20, leave = 20 }
local buffer, index, counts, dropped = {}, {}, {}, {}

local function nameOf(src)
  src = tonumber(src)
  if src and src > 0 then return GetPlayerName(src) or ('Player#' .. src) end
  return 'server'
end

local function on() return CAC.eventLogEnabled and CAC.eventLogEnabled() end

local function unsigned(h)
  h = tonumber(h) or 0
  if h < 0 then h = h + 4294967296 end
  return math.floor(h)
end

local function weaponName(hash)
  local entry = CoreAC.WEAPON_DATA and (CoreAC.WEAPON_DATA[hash] or CoreAC.WEAPON_DATA[unsigned(hash)])
  if entry and entry.weaponName then return (entry.weaponName:gsub('^weapon_', '')) end
  return '#' .. unsigned(hash)   -- panel katalogdan çözer (addon silahsa hash kalır)
end

local function push(kind, src, detail)
  if not on() then return end
  local player = nameOf(src)
  detail = tostring(detail or ''):sub(1, 200)
  local key = kind .. '\0' .. player .. '\0' .. detail
  local ex = index[key]
  if ex then ex.count = ex.count + 1 return end
  counts[kind] = (counts[kind] or 0) + 1
  if counts[kind] > (KIND_CAP[kind] or 15) then
    dropped[kind] = (dropped[kind] or 0) + 1
    return
  end
  local e = { kind = kind, player = player, src = tonumber(src) or 0, detail = detail, count = 1 }
  buffer[#buffer + 1] = e
  index[key] = e
end

-- --------------------------------------------------------------- oyun olayları
AddEventHandler('explosionEvent', function(sender, ev)
  if not on() or not ev then return end
  local name = CoreAC.GetExplosionName and CoreAC.GetExplosionName(ev.explosionType) or tostring(ev.explosionType)
  push('explosion', sender, name:lower() .. (ev.f210 and ev.f210 ~= 0 and ' · vehicle' or ''))
end)

AddEventHandler('weaponDamageEvent', function(sender, data)
  if not on() or not data then return end
  local victim = ''
  local nid = data.hitGlobalId or (data.hitGlobalIds and data.hitGlobalIds[1])
  local ent = nid and NetworkGetEntityFromNetworkId(nid) or 0
  if ent and ent ~= 0 and DoesEntityExist(ent) and GetEntityType(ent) == 1 and IsPedAPlayer(ent) then
    local owner = NetworkGetEntityOwner(ent)
    if owner and owner > 0 then victim = ' → ' .. nameOf(owner) end
  end
  if data.willKill then
    push('kill', sender, weaponName(data.weaponType) .. victim)
  else
    push('damage', sender, ('%s · %d dmg%s'):format(weaponName(data.weaponType), math.floor(data.weaponDamage or 0), victim))
  end
end)

local ETYPE = { [1] = 'ped', [2] = 'vehicle', [3] = 'object' }
AddEventHandler('entityCreating', function(handle)
  if not on() then return end
  -- Yalnızca oyuncunun oluşturduğu script/menü varlıkları. Trafik ve yayalar
  -- (ambient popülasyon) akışı boğuyordu.
  if GetEntityPopulationType(handle) ~= 7 then return end
  local owner = NetworkGetEntityOwner(handle)
  if not owner or owner <= 0 then return end
  local kind = ETYPE[GetEntityType(handle)] or 'entity'
  push('spawn', owner, ('%s #%d'):format(kind, unsigned(GetEntityModel(handle))))
end)

AddEventHandler('ptFxEvent', function(sender, data)
  if not on() then return end
  push('particle', sender, data and data.effectHash and ('fx #' .. unsigned(data.effectHash)) or 'particle fx')
end)

AddEventHandler('playerJoining', function()
  push('join', source, 'connected')
end)

AddEventHandler('playerDropped', function(reason)
  push('leave', source, tostring(reason or ''))
end)

-- ------------------------------------------------------ izlenen script olayları
-- Panel (Event Log → Watched events) listesini heartbeat ile yollar. FiveM'de bir
-- net-event'i dinlemek onu gönderen resource'u etkilemez: olay yine kendi
-- sahibine gider, biz yalnızca "kim, ne gönderdi" kaydını alırız.
local watchActive, watchRegistered = {}, {}

local function preview(v, depth)
  local t = type(v)
  if t == 'string' then return '"' .. v:sub(1, 40) .. (#v > 40 and '…' or '') .. '"' end
  if t == 'number' or t == 'boolean' or t == 'nil' then return tostring(v) end
  if t == 'table' then
    if (depth or 0) >= 1 then return '{…}' end
    local parts, n = {}, 0
    for k, val in pairs(v) do
      n = n + 1
      if n > 4 then parts[#parts + 1] = '…' break end
      parts[#parts + 1] = tostring(k) .. '=' .. preview(val, (depth or 0) + 1)
    end
    return '{' .. table.concat(parts, ', ') .. '}'
  end
  return t
end

local function onWatched(name, ...)
  if not watchActive[name] then return end
  local src = tonumber(source)
  if not src or src <= 0 then return end
  local args, n = {}, select('#', ...)
  for i = 1, math.min(n, 4) do args[#args + 1] = preview((select(i, ...))) end
  if n > 4 then args[#args + 1] = '…' end
  push('event', src, name .. '(' .. table.concat(args, ', ') .. ')')
end

--- server/main.lua heartbeat'ten çağırır.
function CAC.setWatchedEvents(list)
  watchActive = {}
  if type(list) ~= 'table' then return end
  for _, name in ipairs(list) do
    if type(name) == 'string' and #name >= 2 and #name <= 100 and not name:find('^__cfx') then
      watchActive[name] = true
      if not watchRegistered[name] then
        watchRegistered[name] = true
        local ev = name
        RegisterNetEvent(ev, function(...) onWatched(ev, ...) end)
      end
    end
  end
end

-- ------------------------------------------------------------------ gönderim
CreateThread(function()
  while true do
    Wait(2000)
    if on() and #buffer > 0 then
      local batch = buffer
      local lost = dropped
      buffer, index, counts, dropped = {}, {}, {}, {}
      -- Kotaya takılanları kaybetmeyelim: tür başına özet satırı.
      for kind, n in pairs(lost) do
        batch[#batch + 1] = { kind = kind, player = 'server', src = 0, detail = ('+%d more %s events (rate-limited)'):format(n, kind), count = 1 }
      end
      CAC.request('/event-log', 'POST', { events = batch }, nil)
    elseif not on() then
      buffer, index, counts, dropped = {}, {}, {}, {}
    end
  end
end)
