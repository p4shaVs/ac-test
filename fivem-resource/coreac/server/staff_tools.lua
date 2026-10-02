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

-- Framework resource adları panelden gelir (Settings → Framework & API); her framework
-- kendi pcall'ında çalışır ki birinin hatası (eksik export…) diğerlerini susturmasın.
local function qbAdmin(src)
  local name = CAC.fw('qb')
  if GetResourceState(name) ~= 'started' then return false end
  local QB = exports[name]:GetCoreObject()
  if QB and QB.Functions and QB.Functions.HasPermission then
    return QB.Functions.HasPermission(src, 'admin') or QB.Functions.HasPermission(src, 'god')
  end
  return false
end

local function qbxAdmin(src)
  local name = CAC.fw('qbx')
  if GetResourceState(name) ~= 'started' then return false end
  return exports[name]:HasPermission(src, 'admin') or exports[name]:HasPermission(src, 'god')
end

local function esxAdmin(src)
  local name = CAC.fw('esx')
  if GetResourceState(name) ~= 'started' then return false end
  local ESX = exports[name]:getSharedObject()
  local xp = ESX and ESX.GetPlayerFromId(src)
  local g = xp and xp.getGroup and xp.getGroup()
  return g == 'admin' or g == 'superadmin'
end

local function frameworkAdmin(src)
  for _, check in ipairs({ qbAdmin, qbxAdmin, esxAdmin }) do
    local ok, res = pcall(check, src)
    if ok and res == true then return true end
  end
  return false
end

-- ---------------------------------------------------------------------------
-- txAdmin yöneticileri DOSYADAN (panel → Framework & API → Tx Admin Path).
-- 'txAdmin:events:adminAuth' olayı oyuncu oyuna girdikten sonra gelir; admins.json ise
-- oyuncu bağlanırken bile bilinir — Require Discord / Anti VPN gibi bağlanma kapıları
-- yetkilileri engellemesin diye. Dosyadan yalnızca kimlik dizgileri (fivem:…, discord:…,
-- license:…, steam:…) okunur; parola özetleri vb. hiç saklanmaz, loglanmaz.
-- ---------------------------------------------------------------------------
local txFileIds = {}          -- "fivem:123456" → true (küçük harf)
local txLoadedPath, txLoadedAt = nil, 0
local TX_PREFIX = { fivem = true, discord = true, license = true, license2 = true, steam = true }

local function collectIdentifiers(node, set, depth)
  if depth > 8 then return end
  local t = type(node)
  if t == 'string' then
    local pre = node:match('^(%a+):%w+$')
    if pre and TX_PREFIX[pre:lower()] and #node <= 80 then set[node:lower()] = true end
  elseif t == 'table' then
    for _, v in pairs(node) do collectIdentifiers(v, set, depth + 1) end
  end
end

local function loadTxAdmins(path)
  local set, file = {}, nil
  if type(path) == 'string' and path ~= '' and io and io.open then
    -- sondaki / ve \ işaretlerini at (string.char(92) = ters eğik çizgi)
    while #path > 1 and (path:sub(-1) == '/' or path:sub(-1) == string.char(92)) do
      path = path:sub(1, -2)
    end
    for _, rel in ipairs({ '/admins.json', '/data/admins.json', '/default/data/admins.json' }) do
      local ok, f = pcall(io.open, path .. rel, 'rb')
      if ok and f then
        local raw = f:read('*a')
        f:close()
        local parsed, data = pcall(json.decode, raw or '')
        if parsed and type(data) == 'table' then
          collectIdentifiers(data, set, 0)
          file = path .. rel
          break
        end
      end
    end
  end
  local n = 0
  for _ in pairs(set) do n = n + 1 end
  local before = 0
  for _ in pairs(txFileIds) do before = before + 1 end
  txFileIds = set
  if before ~= n or txLoadedPath ~= file then
    if file then
      print(('^2[CoreAC] txAdmin: %d staff identifier(s) loaded from %s^7'):format(n, file))
    elseif type(path) == 'string' and path ~= '' then
      print(('^3[CoreAC] txAdmin: no admins.json found under "%s" (Tx Admin Path).^7'):format(path))
    end
  end
  txLoadedPath, txLoadedAt = file, GetGameTimer()
  return n
end
CAC.loadTxAdmins = loadTxAdmins

local function txFileStaff(src)
  if next(txFileIds) == nil then return false end
  for _, id in ipairs(GetPlayerIdentifiers(src)) do
    if txFileIds[id:lower()] then return true end
  end
  return false
end

local txPath = nil
CAC.onConfig(function(settings)
  local p = settings and settings.TxAdminPath or ''
  -- Yol değiştiyse hemen, değilse en fazla 5 dakikada bir yeniden oku (dosya düzenlenmiş olabilir).
  if p ~= txPath or GetGameTimer() - txLoadedAt > 300000 then
    txPath = p
    loadTxAdmins(p)
    for k in pairs(staffCache) do staffCache[k] = nil end   -- yeni liste hemen geçerli olsun
  end
end)

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
    or txFileStaff(src)
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
  noclip    = { NOCLIP = true, TELEPORT = true, FREECAM = true, INVISIBLE = true, FLYHACK = true, STATE_DESYNC = true,
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
