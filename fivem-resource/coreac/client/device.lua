-- device.lua — cihaz işareti (ban kaçırma engeli, server/main.lua).
--
-- Oyuncunun bilgisayarına bir kez rastgele bir kimlik yazılır (resource KVP;
-- oyun kapansa, hesap değişse de kalır) ve her girişte sunucuya bildirilir.
-- Banlı bir bilgisayardan yeni Steam/Discord/Rockstar hesabıyla girilirse
-- sunucu bunu tanır. Kimlik rastgeledir; kişisel bilgi içermez.

local KEY = 'coreac_device'
local HEX = '0123456789abcdef'

local function newId()
  local t = {}
  for i = 1, 32 do
    local n = math.random(1, 16)
    t[i] = HEX:sub(n, n)
  end
  return table.concat(t)
end

CreateThread(function()
  Wait(5000)
  local id = GetResourceKvpString(KEY)
  if type(id) ~= 'string' or #id ~= 32 or not id:match('^[a-f0-9]+$') then
    id = newId()
    SetResourceKvp(KEY, id)
  end
  TriggerServerEvent('coreac:device', id)
end)
