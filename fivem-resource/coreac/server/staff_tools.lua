-- =============================================================================
-- server/staff_tools.lua — yetkili (staff) tanıma + admin aracı entegrasyonu
--
-- SORUN: Sunucunun meşru admin araçları (txAdmin menüsü, qb-adminmenu, QBCore
-- /tp /tpm) oyuncuyu ışınlar, NoClip'e sokar, ölümsüz yapar — hileyle AYNI
-- native'lerle. AC bunları ayırt edemediği için adminler NOCLIP / TELEPORT /
-- GODMODE ile atılıyor, admin "bring" yaptığı oyuncu TELEPORT yiyordu.
--
-- 1) CAC.isStaff(src) — yetkiyi SUNUCU doğrular (client'a hiçbir şey sorulmaz):
--      * panelde tanımlı oyun-içi yönetici (CAC.adminOf)
--      * txAdmin'de doğrulanmış admin (txAdmin:events:adminAuth)
--      * QBCore admin/god izni, ESX admin/superadmin grubu
--      * ACE 'command' (qb/txAdmin tariflerinde sunucu sahibine verilir)
-- 2) Settings.StaffBypass (varsayılan AÇIK): yetkililer hiçbir tespitten
--    otomatik kick/ban YEMEZ. Tespit yine panele düşer ("staff" işaretli) —
--    kendi admin hesabınla test ederken tespitin çalıştığını görürsün.
-- 3) Doğrulanmış araç kullanımı: txAdmin, izin kontrolünü yaptıktan SONRA her
--    menü işlemini 'txsv:logger:menuEvent' ile yayınlar. Noclip/godmode modu
--    açıkken ilgili tespitler hiç raporlanmaz; ışınlama/bring/spectate/heal
--    muafiyet açar. qb-adminmenu'nun sunucu olayları için de aynı.
--
-- GÜVENLİK: 'txsv:logger:menuEvent' ve 'txAdmin:events:adminAuth' burada
-- yalnızca AddEventHandler ile dinlenir (RegisterNetEvent YOK). FiveM, bu
-- resource'ta net-event olarak kaydedilmemiş bir olayı client'tan gelirse
-- hiç çalıştırmaz ("not safe for net") → client'lar bunları taklit edemez.
-- =============================================================================

CAC = CAC or {}

-- ---------------------------------------------------------------------------
-- txAdmin admin doğrulaması
-- ---------------------------------------------------------------------------
local txAdmins = {}      -- src -> true
local staffCache = {}    -- src -> { v = bool, t = ms }
local STAFF_TTL = 30000

AddEventHandler('txAdmin:events:adminAuth', function(data)
  if type(data) ~= 'table' then return end
  local id = tonumber(data.netid)
  if not id then return end
  if id == -1 then
    txAdmins, staffCache = {}, {}
    return
  end
  txAdmins[id] = (data.isAdmin == true) or nil
  staffCache[id] = nil
end)

local function frameworkAdmin(src)
  local ok, res = pcall(function()
    if GetResourceState('qb-core') == 'started' then
      local QB = exports['qb-core']:GetCoreObject()
      if QB and QB.Functions and QB.Functions.HasPermission then
        if QB.Functions.HasPermission(src, 'admin') or QB.Functions.HasPermission(src, 'god') then return true end
      end
    end
    if GetResourceState('es_extended') == 'started' then
      local ESX = exports['es_extended']:getSharedObject()
      local xp = ESX and ESX.GetPlayerFromId(src)
      local g = xp and xp.getGroup and xp.getGroup()
      if g == 'admin' or g == 'superadmin' then return true end
    end
    return false
  end)
  return ok and res == true
end

--- Oyuncu sunucunun doğruladığı bir yetkili mi?
function CAC.isStaff(src)
  src = tonumber(src)
  if not src or src <= 0 or not GetPlayerName(src) then return false end
  local now = GetGameTimer()
  local c = staffCache[src]
  if c and now - c.t < STAFF_TTL then return c.v end
  local v = txAdmins[src] == true
    or (CAC.adminOf and CAC.adminOf(src) ~= nil)
    or IsPlayerAceAllowed(src, 'command')
    or frameworkAdmin(src)
  v = v == true
  staffCache[src] = { v = v, t = now }
  return v
end

--- Yetkili muafiyeti bu oyuncu için geçerli mi? (panel: Settings → Staff Bypass)
function CAC.staffBypass(src)
  if CoreAC.Config.Settings.StaffBypass == false then return false end
  return CAC.isStaff(src)
end

-- ---------------------------------------------------------------------------
-- txAdmin araçları (izin kontrolü txAdmin'de yapılmış, allowed=true)
-- ---------------------------------------------------------------------------
local txMode = {}   -- src -> 'noclip' | 'godmode' | 'superjump'

-- Bir araç açıkken hiç raporlanmayacak tespit tipleri.
local TOOL_TYPES = {
  noclip    = { NOCLIP = true, TELEPORT = true, FREECAM = true, INVISIBLE = true, FLYHACK = true,
                OUT_OF_BOUNDS = true, GODMODE = true, VEHICLE_NOCLIP = true, SPECTATE = true },
  godmode   = { GODMODE = true, NO_RAGDOLL = true, NO_FALL_DAMAGE = true },
  superjump = { SUPER_JUMP = true, NO_FALL_DAMAGE = true, NO_RAGDOLL = true },
}

--- Doğrulanmış bir admin aracı bu tespiti açıklıyor mu? (true → raporlama)
function CAC.toolExempt(src, dtype)
  local mode = txMode[tonumber(src)]
  return mode ~= nil and TOOL_TYPES[mode] ~= nil and TOOL_TYPES[mode][tostring(dtype)] == true
end

--- Sunucu + client muafiyeti birlikte (client'ın kendi kontrolleri de sussun).
local function grantMove(src, ms)
  src = tonumber(src)
  if not src or not GetPlayerName(src) then return end
  CAC.grantTp(src, ms or 15000)
  TriggerClientEvent('coreac:grantTp', src)
end

local function grantHeal(src)
  src = tonumber(src)
  if not src or not GetPlayerName(src) then return end
  if CAC.markRevive then CAC.markRevive(src) end
end

AddEventHandler('txsv:logger:menuEvent', function(src, action, allowed, data)
  src = tonumber(src)
  if not src or allowed ~= true then return end
  if action == 'playerModeChanged' then
    local prev = txMode[src]
    if data == 'noclip' or data == 'godmode' or data == 'superjump' then
      txMode[src] = data
    else
      txMode[src] = nil
    end
    -- freecam/noclip açılıp kapanırken ped kameranın olduğu yere taşınır
    if data == 'noclip' or prev == 'noclip' then grantMove(src) end
  elseif action == 'teleportWaypoint' or action == 'teleportPlayer' or action == 'spectatePlayer' then
    grantMove(src)
  elseif action == 'summonPlayer' then
    grantMove(tonumber(data))
  elseif action == 'healSelf' then
    grantHeal(src)
  elseif action == 'healPlayer' then
    grantHeal(tonumber(data))
  elseif action == 'healAll' then
    for _, sid in ipairs(GetPlayers()) do grantHeal(sid) end
  end
end)

-- ---------------------------------------------------------------------------
-- qb-adminmenu — admin'in client'ı bu sunucu olaylarını tetikler; qb-adminmenu
-- kendi izin kontrolünü yapar, biz de aynı olayı dinleyip yetkiyi KENDİMİZ
-- doğrularız (yetkisiz biri tetiklerse hiçbir muafiyet verilmez).
-- ---------------------------------------------------------------------------
local function targetId(player)
  if type(player) == 'table' then return tonumber(player.id) end
  return tonumber(player)
end

local QB_ADMIN = {
  ['qb-admin:server:goto']       = function(src) grantMove(src) end,
  ['qb-admin:server:intovehicle']= function(src) grantMove(src) end,
  ['qb-admin:server:spectate']   = function(src) grantMove(src) end,
  ['qb-admin:server:bring']      = function(_, player) grantMove(targetId(player)) end,
  ['qb-admin:server:revive']     = function(_, player) grantHeal(targetId(player)) end,
}
for name, fn in pairs(QB_ADMIN) do
  RegisterNetEvent(name, function(player)
    local src = source
    if CAC.eventLimited(src, 'qbadmin', 20, 10000) then return end
    if not CAC.isStaff(src) then return end
    fn(src, player)
  end)
end

AddEventHandler('playerDropped', function()
  local s = source
  txAdmins[s], staffCache[s], txMode[s] = nil, nil, nil
end)

print('^2[CoreAC] Staff tools (txAdmin / qb-adminmenu) yuklendi.^7')
