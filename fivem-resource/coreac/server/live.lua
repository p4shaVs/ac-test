-- CoreAC Anti-Cheat — canlı özellikler modülü
-- Konum/can/kalkan aktarımı, bypass (whitelist), kara liste (blacklist),
-- yönetici listesi + izinler, ekran görüntüsü ve oyun içi yönetici aksiyonları.

local PosBuffer = {}       -- license -> son konum verisi
local Whitelist = {}       -- { kind, value }
local Blacklist = {}       -- { kind, model, action }
local Admins = {}          -- identifier -> { name, role, permissions = { perm = true } }

-- ---------------------------------------------------------------------------
-- Bypass (whitelist)
-- ---------------------------------------------------------------------------
local function refreshWhitelist()
  CAC.request('/whitelist', 'GET', nil, function(ok, data)
    if ok and data and data.whitelist then Whitelist = data.whitelist end
  end)
end

--- Oyuncunun herhangi bir kimliği bypass listesindeyse true.
function CAC.isWhitelisted(src)
  local ids = CAC.getIdents(src)
  for _, w in ipairs(Whitelist) do
    if (w.kind == 'license' and w.value == ids.license)
      or (w.kind == 'discord' and w.value == ids.discord)
      or (w.kind == 'steam' and w.value == ids.steam)
      or (w.kind == 'ip' and w.value == ids.ip) then
      return true
    end
  end
  return false
end

-- ---------------------------------------------------------------------------
-- Kara liste (blacklist) — client'lara iletilir, orada uygulanır
-- ---------------------------------------------------------------------------
local BlacklistByHash = {}  -- modelHash -> { kind, model, action }
local WeaponList = {}       -- client'a gönderilecek yasaklı silahlar { hash, action }
local function refreshBlacklist()
  CAC.request('/blacklist', 'GET', nil, function(ok, data)
    if ok and data and data.blacklist then
      Blacklist = data.blacklist
      local byHash, weapons = {}, {}
      for _, b in ipairs(Blacklist) do
        -- model bir isim ("adder") ya da sayısal hash olabilir
        local h = tonumber(b.model) or GetHashKey(b.model)
        byHash[h] = b
        if b.kind == 'weapon' then weapons[#weapons + 1] = { hash = h, action = b.action } end
      end
      BlacklistByHash = byHash
      WeaponList = weapons
      TriggerClientEvent('coreac:weaponBlacklist', -1, WeaponList)
    end
  end)
end

-- Yeni bağlanan client yasaklı silah listesini ister
RegisterNetEvent('coreac:requestWeaponBlacklist', function()
  if CAC.noteEvent then CAC.noteEvent(source) end
  TriggerClientEvent('coreac:weaponBlacklist', source, WeaponList)
end)

-- Client, envanterinde yasaklı silah tespit etti (ateş etmeden, KICK/BAN için)
RegisterNetEvent('coreac:weaponHit', function(hash)
  local src = source
  -- Client kaynaklı: spam ile panel API'sini boğmasın (her çağrı /detections + /ingame-action POST'u).
  if CAC.eventLimited(src, 'weaponHit', 3, 10000) then return end
  local entry = BlacklistByHash[hash]
  if entry and entry.kind == 'weapon' then
    CAC.enforceBlacklist(src, entry, hash)
  end
end)

--- Bir entity model hash'i kara listedeyse kaydını döndürür.
function CAC.blacklistLookup(modelHash)
  return BlacklistByHash[modelHash]
end

--- Kara liste ihlalini uygular (protection.lua entityCreating içinden çağrılır).
function CAC.enforceBlacklist(owner, entry, model)
  if not owner or owner <= 0 then return end
  if CAC.isWhitelisted(owner) then return end
  local ids = CAC.getIdents(owner)
  local pname = GetPlayerName(owner) or ('Player#' .. owner)
  CAC.log('DETECTION', 'blacklist', ('Blacklist: %s "%s" — %s'):format(entry.kind, entry.model, pname))
  CAC.request('/detections', 'POST', {
    type = 'BLACKLIST_' .. string.upper(entry.kind),
    severity = (entry.action == 'BAN') and 'CRITICAL' or 'HIGH',
    playerName = pname,
    license = ids.license,
    origin = 'server',
    details = { model = entry.model, action = entry.action },
  }, nil)
  -- Kara liste kendi kararını verir (model başına KICK/BAN, Blacklist
  -- sayfasından seçilir) — bu yüzden Log-Only modunu BURADA da uygulamalıyız.
  -- Aksi halde "Log-Only: asla kick/ban atma" açıkken kara liste yine banlıyordu.
  if CAC.isLogOnly and CAC.isLogOnly() then return end
  if entry.action == 'KICK' then
    DropPlayer(owner, '[CoreAC] You have been kicked from this server.')
  elseif entry.action == 'BAN' then
    CAC.request('/ingame-action', 'POST', {
      type = 'BAN', reason = ('Blacklist: %s (%s)'):format(entry.model, entry.kind),
      by = 'AntiCheat', license = ids.license, playerName = pname,
    }, function(ok, data)
      if CAC.refreshBans then CAC.refreshBans() end
      DropPlayer(owner, ('[CoreAC] You are banned from this server. | Ban ID: %s'):format((data and data.banCode) or '—'))
    end)
  end
end

-- ---------------------------------------------------------------------------
-- Canlı konum / can / kalkan — client gönderir, toplu API'ye aktarılır
-- ---------------------------------------------------------------------------
RegisterNetEvent('coreac:pos', function(d)
  local src = source
  if CAC.eventLimited(src, 'pos', 10, 2000) then return end
  local ids = CAC.getIdents(src)
  if not ids.license then return end
  if type(d) ~= 'table' then return end
  PosBuffer[ids.license] = {
    license = ids.license,
    x = d.x or 0.0, y = d.y or 0.0, z = d.z or 0.0,
    heading = d.heading, health = d.health, armor = d.armor,
    activity = d.activity, ping = GetPlayerPing(src),
  }
end)

-- Hafif "çarpışma kapalı mı" sinyali (~800ms, client/main.lua). TELEPORT
-- taramasının NoClip'le karışmaması (yanlış sebep) için kullanılır.
local CollState = {}  -- src -> { on, t }
RegisterNetEvent('coreac:collState', function(collisionOff)
  if CAC.noteEvent then CAC.noteEvent(source) end
  if CAC.eventLimited(source, 'collState', 15, 2000) then return end
  CollState[source] = { on = collisionOff == true, t = GetGameTimer() }
end)
local function recentlyNoclip(src, withinMs)
  local c = CollState[src]
  return c ~= nil and c.on and (GetGameTimer() - c.t) < (withinMs or 4000)
end

local function flushPositions()
  local list = {}
  for _, v in pairs(PosBuffer) do list[#list + 1] = v end
  PosBuffer = {}
  if #list > 0 then
    CAC.request('/positions', 'POST', { players = list }, nil)
  end
end

-- ---------------------------------------------------------------------------
-- Yönetici listesi + izinler (oyun içi menü)
-- ---------------------------------------------------------------------------
-- Kimlik normalizasyonu — panelde girilen identifier ile oyundaki identifier'ın
-- BİÇİM farkı yüzünden eşleşmemesi ("siteden adminim ama oyunda değilim") en sık
-- kurulum sorunuydu. İki tarafı da aynı kanonik biçime indiriyoruz:
--   * boşluk/temizlik + küçük harf (steam/license hex'i büyük-küçük fark etmesin),
--   * prefix'siz varyant da indekslenir → panelde 'discord:123' ya da düz '123'
--     girilmesi de, oyundaki 'discord:123' ile eşleşir.
-- ip ile ASLA eşleştirilmez (ortak IP → yanlışlıkla admin yetkisi vermesin).
local function normId(s)
  if type(s) ~= 'string' then return nil end
  s = s:gsub('%s', ''):lower()
  return s ~= '' and s or nil
end
local function stripId(s)
  if not s then return nil end
  local c = s:find(':', 1, true)
  return c and s:sub(c + 1) or s
end

local AdminsStripped = {}  -- prefix'siz kanonik anahtar → kayıt

local function refreshAdmins()
  CAC.request('/admins', 'GET', nil, function(ok, data)
    if not ok or not data or not data.admins then return end
    local map, stripped = {}, {}
    for _, a in ipairs(data.admins) do
      local perms = {}
      for _, p in ipairs(a.permissions or {}) do perms[p] = true end
      local rec = { name = a.name, role = a.role, permissions = perms }
      local key = normId(a.identifier)
      if key then
        map[key] = rec
        local s = normId(stripId(key))
        if s then stripped[s] = rec end
      end
    end
    Admins = map
    AdminsStripped = stripped
    -- Her çevrimiçi oyuncuya kendi izinlerini gönder (menü buna göre açılır)
    for _, src in ipairs(GetPlayers()) do
      TriggerClientEvent('coreac:perms', src, CAC.permsOf(tonumber(src)))
    end
  end)
end

--- Bir oyuncunun yönetici kaydını döndürür (prefix/case-toleranslı eşleşme).
function CAC.adminOf(src)
  local ids = CAC.getIdents(src)
  local cands = { ids.discord, ids.license, ids.steam }
  -- 1) Tam (normalize) eşleşme
  for _, v in ipairs(cands) do
    local n = normId(v)
    if n and Admins[n] then return Admins[n] end
  end
  -- 2) Prefix'siz eşleşme (panelde prefix'siz girilmiş olabilir)
  for _, v in ipairs(cands) do
    local n = normId(stripId(v))
    if n and AdminsStripped[n] then return AdminsStripped[n] end
  end
  return nil
end

function CAC.permsOf(src)
  local a = CAC.adminOf(src)
  if not a then return {} end
  local out = {}
  for k in pairs(a.permissions) do out[#out + 1] = k end
  return out
end

function CAC.hasPerm(src, perm)
  local a = CAC.adminOf(src)
  return a ~= nil and a.permissions[perm] == true
end

-- Oyuncu kendi kimliklerini ister (/ac id) — panele admin eklerken buraya
-- girilecek DOĞRU identifier'ı görmek için. Yalnızca oyuncunun KENDİ id'leri
-- döner; başka oyuncununki değil.
RegisterNetEvent('coreac:whoami', function()
  local src = source
  if CAC.noteEvent then CAC.noteEvent(src) end
  if CAC.eventLimited(src, 'whoami', 5, 10000) then return end
  local ids = CAC.getIdents(src)
  local a = CAC.adminOf(src)
  TriggerClientEvent('coreac:whoami', src, {
    license = ids.license, steam = ids.steam, discord = ids.discord,
    isAdmin = a ~= nil, role = a and a.role or nil,
  })
end)

-- Client menüsü açılırken izinleri ister
RegisterNetEvent('coreac:requestPerms', function()
  if CAC.noteEvent then CAC.noteEvent(source) end
  TriggerClientEvent('coreac:perms', source, CAC.permsOf(source))
end)

-- Görsel admin menüsü için çevrimiçi oyuncu listesi. YETKİ KAPILI: yalnızca
-- en az bir admin iznine sahip oyuncuya roster verilir (rastgele oyuncu listeyi
-- çekemesin). Sadece id + isim döner — hassas kimlik değil.
RegisterNetEvent('coreac:requestPlayers', function()
  local src = source
  if CAC.noteEvent then CAC.noteEvent(src) end
  local perms = CAC.permsOf(src)
  if not perms or #perms == 0 then return end
  local list, discords, byDiscord = {}, {}, {}
  for _, pid in ipairs(GetPlayers()) do
    local id = tonumber(pid)
    if id then
      local item = {
        id = id,
        name = GetPlayerName(id) or ('Player#' .. id),
        ping = GetPlayerPing(id) or 0,
      }
      list[#list + 1] = item
      -- discord id İSTEMCİYE GÖNDERİLMEZ; yalnızca avatar eşleştirmek için tutulur
      local d = CAC.getIdents(id).discord
      if d then discords[#discords + 1] = d; byDiscord[d] = item end
    end
  end
  -- Discord avatarlarını panelden (cache'li) çekip listeye ekle, sonra gönder.
  if #discords > 0 then
    CAC.request('/ingame/avatars', 'POST', { discords = discords }, function(okk, data)
      if okk and data and data.avatars then
        for d, url in pairs(data.avatars) do
          if byDiscord[d] then byDiscord[d].avatar = url end
        end
      end
      if GetPlayerName(src) then TriggerClientEvent('coreac:playerList', src, list) end
    end)
  else
    TriggerClientEvent('coreac:playerList', src, list)
  end
end)

-- ---------------------------------------------------------------------------
-- Oyun içi yönetici aksiyonları — client menüsünden gelir, izin doğrulanır
-- ---------------------------------------------------------------------------
local function nameOf(src) return GetPlayerName(src) or ('Player#' .. src) end

-- adminAction'ın `arg`'ı iki şekilde gelir: /ac komutundan düz metin (sebep),
-- görsel menüden { reason = ..., hours = ... } tablosu. Her ikisi de CLIENT'tan
-- gelir → tipi ve uzunluğu burada sabitlenir (panele tablo/dev metin gitmesin).
local function argReason(arg)
  local r = arg
  if type(arg) == 'table' then r = arg.reason end
  r = (type(r) == 'string' or type(r) == 'number') and tostring(r) or ''
  r = r:gsub('^%s+', ''):gsub('%s+$', '')
  if r == '' then r = 'Admin' end
  return r:sub(1, 200)
end
local function argHours(arg)
  if type(arg) ~= 'table' then return nil end
  local h = tonumber(arg.hours)
  if h and h >= 1 and h <= 87600 then return math.floor(h) end
  return nil  -- nil = kalıcı
end

-- Bazı aksiyonlar aynı izni paylaşır (heal/armor/repair "yardım" → revive,
-- wipe "temizlik" → reset, tpm "işarete ışınlan" → tp).
local PERM_ALIAS = { heal = 'revive', armor = 'revive', repair = 'revive', wipe = 'reset', tpm = 'tp' }

-- Sesi kapatılan oyuncular (menüde durum göstermek için). MumbleSetPlayerMuted
-- ses sunucusu seviyesinde çalışır — pma-voice / mumble-voip fark etmez.
local mutedPlayers = {}
AddEventHandler('playerDropped', function() mutedPlayers[source] = nil end)

--- Oyuncunun OLUŞTURDUĞU (ilk ağ sahibi olduğu) tüm araç/obje/NPC'leri siler.
--- Hile menüsüyle basılmış spawn'ları tek tuşla temizlemek için. Oyuncu
--- ped'lerine asla dokunmaz. Sunucu kararı — client'a güvenilmez.
local function wipeEntitiesOf(target)
  local n = 0
  for _, pool in ipairs({ GetAllVehicles(), GetAllObjects(), GetAllPeds() }) do
    for _, ent in ipairs(pool) do
      if DoesEntityExist(ent) and not (GetEntityType(ent) == 1 and IsPedAPlayer(ent)) then
        local ok, first = pcall(NetworkGetFirstEntityOwner, ent)
        if ok and first == target then
          DeleteEntity(ent)
          n = n + 1
        end
      end
    end
  end
  return n
end

-- ---------------------------------------------------------------------------
-- Canlı tespit uyarısı — oyundaki yetkili yöneticilere (izin: logs) anlık
-- bildirim. Oyuncu+tip başına 30 sn'de bir; client tarafında kapatılabilir
-- ya da yalnızca kick/ban'lara indirgenebilir (menü → Server).
-- ---------------------------------------------------------------------------
local alertGate = {}
function CAC.notifyStaff(src, dtype, action, label)
  src = tonumber(src)
  if not src then return end
  local key = src .. ':' .. tostring(dtype)
  local now = GetGameTimer()
  if alertGate[key] and now - alertGate[key] < 30000 then return end
  alertGate[key] = now
  local payload = {
    id = src, name = GetPlayerName(src) or ('Player#' .. src),
    type = tostring(dtype), label = tostring(label or dtype), action = tostring(action or 'LOG'),
  }
  for _, sid in ipairs(GetPlayers()) do
    local p = tonumber(sid)
    if p and p ~= src and CAC.hasPerm(p, 'logs') then
      TriggerClientEvent('coreac:acAlert', p, payload)
    end
  end
end
AddEventHandler('playerDropped', function()
  local prefix = tostring(source) .. ':'
  for k in pairs(alertGate) do
    if k:sub(1, #prefix) == prefix then alertGate[k] = nil end
  end
end)

RegisterNetEvent('coreac:adminAction', function(action, targetId, arg)
  local src = source
  if CAC.noteEvent then CAC.noteEvent(src) end
  if CAC.eventLimited(src, 'adminAction', 30, 10000) then return end
  local needPerm = PERM_ALIAS[action] or action
  if not CAC.hasPerm(src, needPerm) then
    TriggerClientEvent('coreac:notify', src, '~r~You do not have permission for: ' .. tostring(action))
    return
  end
  local target = targetId and GetPlayerName(tonumber(targetId)) and tonumber(targetId) or nil
  local adminName = nameOf(src)

  if action == 'kick' and target then
    CAC.request('/ingame-action', 'POST', {
      type = 'KICK', reason = argReason(arg), by = adminName,
      license = CAC.getIdents(target).license, playerName = nameOf(target),
    }, nil)
    DropPlayer(target, '[CoreAC] You have been kicked from this server.')
  elseif action == 'ban' and target then
    local tids = CAC.getIdents(target)
    CAC.request('/ingame-action', 'POST', {
      type = 'BAN', reason = argReason(arg), by = adminName,
      license = tids.license, playerName = nameOf(target),
      durationHours = argHours(arg),   -- nil → kalıcı ban
    }, function(ok, data)
      if CAC.refreshBans then CAC.refreshBans() end
      DropPlayer(target, ('[CoreAC] You are banned from this server. | Ban ID: %s'):format((data and data.banCode) or '—'))
    end)
  elseif action == 'warn' and target then
    local reason = argReason(arg)
    CAC.request('/ingame-action', 'POST', {
      type = 'WARN', reason = reason, by = adminName,
      license = CAC.getIdents(target).license, playerName = nameOf(target),
    }, nil)
    TriggerClientEvent('coreac:notify', target, '~y~Warning: ' .. reason)
  elseif action == 'revive' and target then
    CAC.grantRevive(target)
    TriggerClientEvent('coreac:revive', target)
  elseif action == 'heal' and target then
    CAC.grantRevive(target)   -- ani can → armor-regen/godmode tespitinden muaf
    TriggerClientEvent('coreac:heal', target)
    TriggerClientEvent('coreac:notify', src, '~g~Healed ' .. nameOf(target))
  elseif action == 'armor' and target then
    CAC.grantRevive(target)
    TriggerClientEvent('coreac:armor', target)
    TriggerClientEvent('coreac:notify', src, '~b~Gave armor to ' .. nameOf(target))
  elseif action == 'reset' and target then
    -- Hedefin aracını/yakındaki spawn'larını temizle + takıldıysa kurtar.
    TriggerClientEvent('coreac:resetEntities', target)
    TriggerClientEvent('coreac:notify', src, '~b~Reset ' .. nameOf(target))
    TriggerClientEvent('coreac:notify', target, '~b~An admin cleaned up your vehicles/objects.')
  elseif action == 'dm' and target then
    local msg = argReason(arg)
    TriggerClientEvent('coreac:dm', target, adminName, msg)
    TriggerClientEvent('coreac:notify', src, '~b~DM sent to ' .. nameOf(target))
  elseif action == 'freeze' and target then
    TriggerClientEvent('coreac:freeze', target, arg == 'on')
  elseif action == 'tp' and target then
    -- yöneticiyi hedefe ışınla (yetkili → teleport tespitinden muaf)
    local ped = GetPlayerPed(target)
    local c = GetEntityCoords(ped)
    CAC.grantTp(src)
    TriggerClientEvent('coreac:teleport', src, c.x, c.y, c.z)
  elseif action == 'bring' and target then
    local ped = GetPlayerPed(src)
    local c = GetEntityCoords(ped)
    CAC.grantTp(target)
    TriggerClientEvent('coreac:teleport', target, c.x, c.y, c.z)
  elseif action == 'spectate' and target then
    local ped = GetPlayerPed(target)
    local c = GetEntityCoords(ped)
    CAC.grantTp(src)
    TriggerClientEvent('coreac:spectate', src, targetId, c.x, c.y, c.z)
  elseif action == 'announce' then
    local msg = (type(arg) == 'string') and arg:sub(1, 200) or ''
    if msg == '' then return end
    -- Tüm oyunculara üstten kayan mavimsi NUI banner (client/main.lua NUI'si).
    TriggerClientEvent('coreac:announceBanner', -1, msg, adminName)
  elseif action == 'screenshot' and target then
    -- Eskiden yalnızca coreac_ss_upload ayarlıysa çalışıyordu (varsayılan boş →
    -- "yapılandırılmamış"). Artık panelde gerçek bir istek açılır, görüntü
    -- panelin kendi yükleme ucuna gider ve oyuncunun Monitoring/Map kartında
    -- görünür. Yöneticiye sonuç bildirimi sunucu tarafında tutulur.
    local tids = CAC.getIdents(target)
    CAC.request('/screenshot/request', 'POST', {
      license = tids.license, playerName = nameOf(target), requestedBy = adminName,
    }, function(ok, data)
      if not (ok and data and data.id) or not GetPlayerName(target) then
        TriggerClientEvent('coreac:notify', src, '~r~Could not request a screenshot for that player.')
        return
      end
      CAC.issueShot(data.id, target, src)
      TriggerClientEvent('coreac:screenshot', target, CAC.screenshotUploadBase() .. '?rid=' .. data.id, data.id, nil)
      TriggerClientEvent('coreac:notify', src, '~b~Screenshot requested — it will appear in the panel.')
    end)
  elseif action == 'repair' and target then
    CAC.grantRevive(target)   -- anlık-onarım kaydından (INSTANT_REPAIR) muaf
    TriggerClientEvent('coreac:repairVehicle', target)
    TriggerClientEvent('coreac:notify', src, '~g~Repairing the vehicle of ' .. nameOf(target))
  elseif action == 'disarm' and target then
    local ped = GetPlayerPed(target)
    if ped and ped ~= 0 then RemoveAllPedWeapons(ped, true) end
    TriggerClientEvent('coreac:disarm', target)
    TriggerClientEvent('coreac:notify', src, '~b~Disarmed ' .. nameOf(target))
  elseif action == 'mute' and target then
    local on = (arg == 'on')
    local ok = pcall(MumbleSetPlayerMuted, target, on)
    if not ok then
      TriggerClientEvent('coreac:notify', src, '~r~Voice mute is not available on this server build.')
      return
    end
    mutedPlayers[target] = on or nil
    TriggerClientEvent('coreac:notify', target, on and '~r~An admin muted your voice chat.' or '~g~Your voice chat was unmuted.')
    TriggerClientEvent('coreac:notify', src, (on and '~b~Muted ' or '~b~Unmuted ') .. nameOf(target))
  elseif action == 'wipe' and target then
    local n = wipeEntitiesOf(target)
    TriggerClientEvent('coreac:notify', src, ('~b~Removed %d vehicles/objects/NPCs spawned by %s'):format(n, nameOf(target)))
  elseif action == 'tpm' then
    -- Yöneticinin kendi harita işaretine ışınlanması. Sunucu muafiyeti ÖNCE.
    CAC.grantTp(src)
    TriggerClientEvent('coreac:tpWaypoint', src)
  elseif not target and action ~= 'announce' then
    TriggerClientEvent('coreac:notify', src, '~r~No online player with that id.')
    return
  end
  CAC.log('INFO', 'admin', ('%s -> %s%s'):format(adminName, action, target and (' #' .. target) or ''))
end)

-- ---------------------------------------------------------------------------
-- Görsel yönetim paneli (NUI) — panel verisi (Bans/Kicks/Warns/Detections/Logs),
-- oyuncu profili ve oyun içinden unban.
--
-- GÜVENLİK: her istek İZİN KAPILI (CAC.hasPerm) ve ORAN SINIRLI; veri panelden
-- bu sunucunun kendi token'ıyla çekilir. Client yalnızca arayüzdür — menü zorla
-- açılsa bile yetkisiz sekme verisi gelmez, yetkisiz unban çalışmaz.
-- ---------------------------------------------------------------------------
local TAB_PERMS = {
  bans       = { 'ban', 'unban' },
  kicks      = { 'kick' },
  warns      = { 'warn' },
  detections = { 'logs' },
  logs       = { 'logs' },
}
local function hasAnyPerm(src, list)
  for _, p in ipairs(list) do
    if CAC.hasPerm(src, p) then return true end
  end
  return false
end

RegisterNetEvent('coreac:menuData', function(tab, q)
  local src = source
  if CAC.noteEvent then CAC.noteEvent(src) end
  local need = type(tab) == 'string' and TAB_PERMS[tab] or nil
  if not need or not hasAnyPerm(src, need) then return end
  if CAC.eventLimited(src, 'menuData', 12, 10000) then return end
  local query = (type(q) == 'string' and q ~= '') and q:sub(1, 60) or nil
  CAC.request('/ingame/data', 'POST', { tab = tab, q = query }, function(ok, data)
    if not GetPlayerName(src) then return end
    TriggerClientEvent('coreac:menuData', src, tab, (ok and data and data.rows) or {}, ok == true)
  end)
end)

RegisterNetEvent('coreac:menuPlayer', function(targetId)
  local src = source
  if CAC.noteEvent then CAC.noteEvent(src) end
  local perms = CAC.permsOf(src)
  if not perms or #perms == 0 then return end
  if CAC.eventLimited(src, 'menuPlayer', 10, 10000) then return end
  local target = tonumber(targetId)
  if not target or not GetPlayerName(target) then return end

  local ids = CAC.getIdents(target)
  local ped = GetPlayerPed(target)
  -- Canlı veri sunucudan (client'ın iddiası değil). IP BİLEREK gönderilmez.
  local live = {
    id = target,
    name = GetPlayerName(target),
    ping = GetPlayerPing(target),
    health = (ped and ped ~= 0) and GetEntityHealth(ped) or nil,
    armour = (ped and ped ~= 0) and GetPedArmour(ped) or nil,
    inVehicle = (ped and ped ~= 0) and GetVehiclePedIsIn(ped, false) ~= 0 or false,
    muted = mutedPlayers[target] == true,
    license = ids.license,
    discord = ids.discord,
  }
  if not ids.license then
    TriggerClientEvent('coreac:menuPlayer', src, live, nil)
    return
  end
  CAC.request('/ingame/player', 'POST', { license = ids.license }, function(ok, data)
    if not GetPlayerName(src) then return end
    TriggerClientEvent('coreac:menuPlayer', src, live, ok and data or nil)
  end)
end)

RegisterNetEvent('coreac:menuUnban', function(banId)
  local src = source
  if CAC.noteEvent then CAC.noteEvent(src) end
  if not CAC.hasPerm(src, 'unban') then
    TriggerClientEvent('coreac:notify', src, '~r~You do not have permission to unban.')
    return
  end
  if CAC.eventLimited(src, 'menuUnban', 5, 10000) then return end
  if type(banId) ~= 'string' or #banId < 5 or #banId > 40 then return end
  local adminName = nameOf(src)
  CAC.request('/ingame/unban', 'POST', { banId = banId, by = adminName }, function(ok, data)
    if not GetPlayerName(src) then return end
    if ok then
      if CAC.refreshBans then CAC.refreshBans() end
      local who = (data and data.playerName) or 'player'
      TriggerClientEvent('coreac:notify', src, ('~g~Unbanned %s.'):format(who))
      CAC.log('INFO', 'admin', ('%s -> unban %s'):format(adminName, who))
    else
      TriggerClientEvent('coreac:notify', src, '~r~Unban failed — the ban may already be lifted.')
    end
    TriggerClientEvent('coreac:menuResult', src, 'unban', ok == true)
  end)
end)

-- Yönetici izlemeyi bitirince eski konumuna döner. Bu IŞINLAMA için sunucu
-- tarafı muafiyet gerekir (yoksa TELEPORT tespiti tetiklenir) — ama muafiyet
-- yalnızca 'spectate' izni olan yöneticiye verilir; hileci bu event'i tetikleyip
-- kendine ışınlanma muafiyeti alamaz.
RegisterNetEvent('coreac:spectateEnd', function()
  local src = source
  if CAC.noteEvent then CAC.noteEvent(src) end
  if not CAC.hasPerm(src, 'spectate') then return end
  if CAC.eventLimited(src, 'spectateEnd', 4, 10000) then return end
  CAC.grantTp(src)
  TriggerClientEvent('coreac:spectateReturn', src)
end)

-- ---------------------------------------------------------------------------
-- Ekran görüntüsü istekleri (panelden) — poll et, hedefe tetikle
-- Yükleme hedefi: özel host ayarlanmadıysa panelin dahili ucu kullanılır.
-- ---------------------------------------------------------------------------
local function ssUploadBase()
  if Config.ScreenshotUploadUrl and Config.ScreenshotUploadUrl ~= '' then
    return Config.ScreenshotUploadUrl
  end
  return (Config.ApiBase or '') .. '/screenshot/upload'
end
-- Diğer server modülleri (main.lua, protection.lua) ban anındaki ekran
-- görüntüsü serisini tetiklerken aynı yükleme adresini kullanmalı.
CAC.screenshotUploadBase = ssUploadBase

local function pollScreenshots()
  CAC.request('/screenshot/pending', 'GET', nil, function(ok, data, status)
    if not ok then
      print(('^1[CoreAC] /screenshot/pending failed (status=%s) — check coreac_api and coreac_token^7'):format(tostring(status)))
      return
    end
    if not data or not data.requests then return end
    for _, r in ipairs(data.requests) do
      -- Zaten gönderilmiş bir istek (ban anı serisi / oyun içi /ac ss) hâlâ
      -- PENDING görünür çünkü görüntü yükleniyordur. Onu tekrar tetiklemek çift
      -- çekime, "oyuncu çevrimdışı → FAILED" işaretlemek ise yarış durumuna yol
      -- açıyordu: hileci DropPlayer ile atıldıktan hemen sonra istek FAILED
      -- oluyor, birkaç yüz ms sonra gelen GERÇEK kanıt görüntüsü 409 ile
      -- reddediliyordu. Gönderilmiş isteklere yükleme için süre tanınır.
      if not (CAC.isShotIssued and CAC.isShotIssued(r.id)) then
        local target = CAC.findByLicense(r.playerLicense)
        if target then
          local url = ssUploadBase() .. '?rid=' .. r.id
          CAC.issueShot(r.id, target)
          TriggerClientEvent('coreac:screenshot', target, url, r.id, nil)
        else
          print(('^3[CoreAC] Screenshot requested but the player is no longer online (license=%s)^7'):format(tostring(r.playerLicense)))
          CAC.request('/screenshot/result', 'POST', { id = r.id, failed = true }, nil)
        end
      end
    end
  end)
end

-- ---------------------------------------------------------------------------
-- Client görüntüyü aldı → sonucu panele bildir.
--
-- GÜVENLİK: bu event'in TÜM argümanları oyuncunun client'ından gelir. Ban
-- anındaki kanıt serisinde o oyuncu, az önce yakalanan hilecidir. Eskiden:
--   * reqId doğrulanmıyordu → herhangi bir isteğin sonucu sahte URL ile
--     yazılabiliyor, gerçek kanıt masum bir görüntüyle değiştirilebiliyordu;
--   * url olduğu gibi panele gidiyordu → `javascript:` URL'si admin kanıta
--     tıkladığında adminin oturumunda kod çalıştırıyordu;
--   * adminId client'tan alınıyordu → herhangi bir oyuncuya istenen metinle
--     bildirim gönderilebiliyordu.
-- Artık yalnızca SUNUCUNUN bu oyuncuya gönderdiği istek kimlikleri kabul
-- edilir, bildirilecek yönetici sunucu tarafında tutulur, ve panel API'si de
-- ayrıca yalnızca http(s) + hâlâ PENDING istekleri kabul eder.
-- ---------------------------------------------------------------------------
local issuedShots = {}   -- [reqId] = { target = src, admin = adminSrc|nil, at = ms }

function CAC.issueShot(reqId, target, adminSrc)
  if not reqId then return end
  issuedShots[tostring(reqId)] = { target = tonumber(target), admin = tonumber(adminSrc), at = GetGameTimer() }
end

function CAC.isShotIssued(reqId)
  return reqId ~= nil and issuedShots[tostring(reqId)] ~= nil
end

RegisterNetEvent('coreac:screenshotResult', function(reqId, url)
  local src = source
  if CAC.noteEvent then CAC.noteEvent(src) end
  local rid = reqId and tostring(reqId) or nil
  local issued = rid and issuedShots[rid]
  if not issued or issued.target ~= src then return end   -- bu oyuncuya verilmemiş istek
  issuedShots[rid] = nil

  if type(url) ~= 'string' or not (url:sub(1, 8) == 'https://' or url:sub(1, 7) == 'http://') then
    url = nil   -- panelin kendi ucuna yüklendiyse URL zaten sunucuda kayıtlı
  end

  if issued.admin and GetPlayerName(issued.admin) then
    TriggerClientEvent('coreac:notify', issued.admin, url
      and '~g~Screenshot captured — open it in the panel.'
      or '~y~Screenshot finished — check the panel (if it is missing, is screenshot-basic running?).')
  end

  CAC.request('/screenshot/result', 'POST', { id = rid, url = url, failed = false }, function(ok)
    if not ok then
      print(('^1[CoreAC] Could not deliver the screenshot to the panel (rid=%s) — check the token and API URL.^7'):format(rid))
    end
  end)
end)

-- Süresi dolmuş (yanıtsız) istekleri temizle.
CreateThread(function()
  while true do
    Wait(60000)
    local now = GetGameTimer()
    for rid, s in pairs(issuedShots) do
      if now - s.at > 120000 then issuedShots[rid] = nil end
    end
  end
end)

-- ---------------------------------------------------------------------------
-- SUNUCU TARAFLI TELEPORT TESPİTİ (kandırılamaz) — NoClip/multichar/respawn'dan
-- AYRIŞTIRILMIŞ. Sunucu oyuncunun koordinatını doğrudan okur; iki örnek
-- arasında yaya >60 m/s, araç >250 m/s = fiziksel olarak imkânsız = teleport.
--
-- ÜÇ MUAFİYET/AYRIŞTIRMA (false ban'ların asıl kaynağıydı):
--   1) "Yeni giriş" muafiyeti (playerJoining) — ilk yükleme.
--   2) "Ped değişti" muafiyeti (coreac:respawnAnchor, client/core.lua) —
--      MULTICHAR karakter seçimi / ölüp-dirilme / framework respawn'ı ne
--      zaman olursa olsun konum çapası SIFIRLANIR, eski konumla kıyaslanmaz.
--      → "oyuna girer girmez / karakter seçince teleport banı" biter.
--   3) NoClip ayrışması — sıçrama anında oyuncunun çarpışması kapalıysa
--      (coreac:collState) bu TELEPORT değil NOCLIP'tir; doğru sebeple ve
--      kendi (client) NoClip tespitine bırakılır — sunucu sadece o an
--      hiç tetiklenmemişse yedek/geç bir NOCLIP raporu düşürür, TELEPORT
--      ATMAZ. → "noclip açan teleporttan yanlış sebeple banlanıyor" biter.
-- ---------------------------------------------------------------------------
local sPos = {}          -- src -> { x,y,z, t, seen }
local tpGrace = {}       -- src -> muafiyet bitiş ms (yetkili ışınlama/yeni giriş/respawn)
local noclipFallbackStrike = {}  -- src -> strike sayacı (NoClip yedek raporu)
local jumpPending = {}    -- src -> { dist, t } — sıçrama görüldü, sınıfı bir sonraki örnekte belli olur

function CAC.grantTp(src)
  tpGrace[tonumber(src)] = GetGameTimer() + 8000
end

-- Sunucu taraflı revive muafiyeti (vehicle_guard.lua'nın armor-regen kontrolü
-- kullanır — gerçek reviveyi armor artışıyla karıştırmasın diye).
local reviveGrace = {}
function CAC.grantRevive(src)
  reviveGrace[tonumber(src)] = GetGameTimer() + 8000
end
function CAC.hasReviveGrace(src)
  local until_ = reviveGrace[tonumber(src)]
  return until_ ~= nil and GetGameTimer() < until_
end

-- ---------------------------------------------------------------------------
-- CLIENT'IN KENDİ İSTEDİĞİ MUAFİYET BÜTÇESİ
--
-- Sunucu, oyuncunun client'ından gelen iki "ışınlanma meşruydu" ipucunu kabul
-- eder: ped değişimi (respawn/multichar) ve client script'lerin
-- markTeleport() çağrısı (garaj/ev/iş ışınlamaları çoğu sunucuda client'ta
-- yapılır). İkisi de client'tan geldiği için hileci de gönderebilir; bu
-- yüzden oyuncu başına dakikada en fazla GRACE_BUDGET kez muafiyet verilir.
-- Meşru oynanışta bu sınıra yaklaşılmaz; aşan istek muafiyet ALMAZ ve loglanır.
-- (Eskiden respawnAnchor 5 sn'de 10 kez = fiilen sınırsız muafiyet veriyordu.)
-- ---------------------------------------------------------------------------
local GRACE_BUDGET, GRACE_WINDOW = 6, 60000
local graceUse = {}   -- src -> { zaman damgaları }

function CAC.consumeGraceBudget(src, why)
  local now = GetGameTimer()
  local fresh = {}
  for _, t in ipairs(graceUse[src] or {}) do
    if now - t < GRACE_WINDOW then fresh[#fresh + 1] = t end
  end
  if #fresh >= GRACE_BUDGET then
    graceUse[src] = fresh
    CAC.log('WARN', 'anticheat', ('Teleport grace refused for %s — more than %d self-declared teleports in a minute (%s)')
      :format(GetPlayerName(src) or ('#' .. tostring(src)), GRACE_BUDGET, tostring(why)))
    return false
  end
  fresh[#fresh + 1] = now
  graceUse[src] = fresh
  return true
end

--- Client'ta ped handle'ı değişti (multichar/respawn/ölüp-dirilme). Konum
--- çapasını sıfırla ki eski konumla kıyaslanıp TELEPORT atılmasın.
RegisterNetEvent('coreac:respawnAnchor', function()
  local src = source
  if CAC.noteEvent then CAC.noteEvent(src) end
  if CAC.eventLimited(src, 'respawnAnchor', 3, 5000) then return end
  if not CAC.consumeGraceBudget(src, 'respawn') then return end
  sPos[src] = nil
  CAC.grantTp(src)
end)

--- Bir client script'i meşru ışınlanmadan önce markTeleport() çağırdı.
RegisterNetEvent('coreac:tpHint', function()
  local src = source
  if CAC.noteEvent then CAC.noteEvent(src) end
  if CAC.eventLimited(src, 'tpHint', 3, 5000) then return end
  if not CAC.consumeGraceBudget(src, 'script teleport') then return end
  CAC.grantTp(src)
end)

AddEventHandler('playerDropped', function() graceUse[source] = nil end)

local armourStrikes = {}   -- src -> art arda aşım sayısı

-- ---------------------------------------------------------------------------
-- ARAÇ HIZ HİLESİ (sunucu ölçümlü) — "Vehicle Speed Hack" kuralı.
--
-- Sunucu, sürücünün aracının HIZINI kendisi okur (GetEntityVelocity) — client
-- bunu değiştiremez. Yalnızca YATAY hız ölçülür (uçurumdan düşen araç
-- sayılmaz) ve tavan, oyundaki hiçbir aracın (eklenti süper arabalar dahil)
-- ulaşamayacağı kadar yüksektir. Hız tabanlı olduğu için ışınlanma (garaj/
-- depo) bunu hiç tetiklemez. Tek örnek değil: aynı araçta 3 ardışık saniye.
-- ---------------------------------------------------------------------------
local VEH_SPEED_CAP = {       -- m/s (yatay)
  automobile            = 125.0,  -- 450 km/h
  amphibious_automobile = 125.0,
  bike                  = 110.0,  -- 396 km/h
  quadbike              = 110.0,
  amphibious_quadbike   = 110.0,
  boat                  = 75.0,   -- 270 km/h
  submarine             = 45.0,
  heli                  = 110.0,
  blimp                 = 60.0,
  plane                 = 200.0,  -- 720 km/h
}
local vehSpeedStreak = {}    -- src -> { veh, n }

local function checkVehicleSpeed(src, ped, now)
  local veh = GetVehiclePedIsIn(ped, false)
  if veh == 0 or GetPedInVehicleSeat(veh, -1) ~= ped then vehSpeedStreak[src] = nil return end
  local okT, vtype = pcall(GetVehicleType, veh)
  local cap = okT and vtype and VEH_SPEED_CAP[vtype] or nil
  if not cap then vehSpeedStreak[src] = nil return end            -- tren/römork/bilinmeyen
  if tpGrace[src] and now < tpGrace[src] then vehSpeedStreak[src] = nil return end
  if CAC.isWhitelisted and CAC.isWhitelisted(src) then return end

  local v = GetEntityVelocity(veh)
  local hs = math.sqrt(v.x * v.x + v.y * v.y)
  if hs <= cap then vehSpeedStreak[src] = nil return end

  local st = vehSpeedStreak[src]
  if not st or st.veh ~= veh then st = { veh = veh, n = 0 }; vehSpeedStreak[src] = st end
  st.n = st.n + 1
  if st.n >= 3 then
    vehSpeedStreak[src] = nil
    TriggerEvent('coreac:serverReport', src, 'VEHICLE_SPEED_HACK', 'HIGH', {
      kmh = math.floor(hs * 3.6), capKmh = math.floor(cap * 3.6), vehicleType = vtype,
    })
  end
end

local function teleportScan()
  local now = GetGameTimer()
  for _, sid in ipairs(GetPlayers()) do
    local src = tonumber(sid)
    local ped = GetPlayerPed(src)
    -- Yükleme ekranı / karakter seçimi sırasında HİÇBİR tarama kontrolü
    -- çalışmaz (bkz. CAC.isInGame, server/main.lua). Konum çapası yine de
    -- aşağıda güncellenmeye devam eder ki oyuna girişteki ışınlanma
    -- "teleport" sayılmasın.
    local inGame = CAC.isInGame and CAC.isInGame(src, 15000)
    if ped and ped ~= 0 then
      local c = GetEntityCoords(ped)
      if c and not (c.x == 0.0 and c.y == 0.0 and c.z == 0.0) then
        -- Harita dışı / geçersiz derinlik: GTA V haritası kabaca
        -- -4000..8000 (x/y) ve -300..1200 (z) sınırları içindedir. Bunun
        -- ÇOK dışında (ör. Z -1000) olmak yalnızca "haritanın altına
        -- ışınlanma" hileleriyle mümkündür. Karakter seçim ekranları ped'i
        -- tam da böyle uç koordinatlara sakladığı için inGame şartı var.
        if inGame and (CAC.getRules()['anti_out_of_bounds'] == true)
            and (c.z < -300.0 or c.z > 1500.0 or c.x < -6000.0 or c.x > 10000.0 or c.y < -6000.0 or c.y > 10000.0)
            and not (CAC.isWhitelisted and CAC.isWhitelisted(src)) then
          TriggerEvent('coreac:serverReport', src, 'OUT_OF_BOUNDS', 'CRITICAL', { x = math.floor(c.x), y = math.floor(c.y), z = math.floor(c.z) })
        end

        -- ZIRH. Eski yorum "zırh > 100 fiziksel olarak imkânsız, yanlış-pozitif
        -- yok" diyordu ve kontrol TEK örnekte, yükleme ekranı dahil çalışıyordu:
        -- oyuncular daha oyuna girmeden ARMOR_HACK yiyordu. Ayrıca sunucu
        -- SetPlayerMaxArmour ile zırh sınırını 100'ün üstüne çıkarabilir.
        -- Artık: oyunda + sunucunun bildiği max zırhın üstünde + 3 sn kesintisiz.
        local armour = GetPedArmour(ped) or 0
        local okMax, maxArmour = pcall(GetPlayerMaxArmour, src)
        local cap = math.max((okMax and tonumber(maxArmour)) or 100, 100) + 5
        if inGame and armour > cap and not (CAC.isWhitelisted and CAC.isWhitelisted(src)) then
          armourStrikes[src] = (armourStrikes[src] or 0) + 1
          if armourStrikes[src] >= 3 then
            armourStrikes[src] = 0
            TriggerEvent('coreac:serverReport', src, 'ARMOR_HACK', 'CRITICAL', { armor = armour, cap = cap })
          end
        else
          armourStrikes[src] = 0
        end

        if inGame and CAC.getRules()['anti_vehicle_speed'] == true then
          checkVehicleSpeed(src, ped, now)
        end

        local prev = sPos[src]
        if not prev then
          sPos[src] = { x = c.x, y = c.y, z = c.z, t = now, seen = now }
        else
          local dt = (now - prev.t) / 1000.0
          local dist = #(c - vector3(prev.x, prev.y, prev.z))
          local settled = (now - prev.seen) > 20000        -- girişten/respawn'dan 20 sn sonra
          local granted = tpGrace[src] and now < tpGrace[src]
          local inVeh = GetVehiclePedIsIn(ped, false) ~= 0
          local perSec = dt > 0 and (dist / dt) or 0
          local limit = inVeh and 250.0 or 60.0
          local pend = jumpPending[src]
          if pend then
            -- Bir önceki saniyede sıçrama görüldü. Işınlanma TEK bir sıçramadır,
            -- sonra oyuncu durur/normal yürür. NoClip ise uçuştur: koordinat her
            -- kare elle kaydırılır, yaya olduğu hâlde saniyede 12 m+ yatay
            -- ilerler ama fizik hızı (velocity) düşüktür. Menü NoClip'lerinin
            -- çoğu çarpışmayı kapatmadığı için collState sinyali gelmeyebilir;
            -- eskiden bu durumda uçuş TELEPORT diye banlanıyordu.
            jumpPending[src] = nil
            if not granted and inGame then
              local hMove = #(vector2(c.x, c.y) - vector2(prev.x, prev.y))
              local vel = #(GetEntityVelocity(ped))
              if recentlyNoclip(src) or (not inVeh and hMove > 12.0 and vel < 30.0) then
                TriggerEvent('coreac:serverReport', src, 'NOCLIP', 'CRITICAL',
                  { source = 'server_movement', distance = pend.dist, flight = math.floor(hMove) })
              else
                TriggerEvent('coreac:serverReport', src, 'TELEPORT', 'CRITICAL', { distance = pend.dist })
              end
            end
          elseif inGame and settled and not granted and dist > 40.0 and perSec > limit
              and not (CAC.isWhitelisted and CAC.isWhitelisted(src))
              -- Yaya + yüksek fizik hızı = gerçek hareket (paraşüt/serbest düşüş,
              -- ragdoll fırlaması). Işınlanma/NoClip koordinatı elle kaydırır,
              -- velocity'yi büyütmez.
              and (inVeh or #(GetEntityVelocity(ped)) < 30.0) then
            if recentlyNoclip(src) then
              -- Bu bir sıçrama değil NoClip uçuşu — TELEPORT atma. Client'ın
              -- kendi NoClip tespiti zaten ~2 sn içinde doğru sebeple banlar;
              -- o çalışmadıysa (devre dışı bırakılmış olabilir) yedek olarak
              -- birkaç kez üst üste görülünce sunucu NOCLIP diye raporlar.
              noclipFallbackStrike[src] = (noclipFallbackStrike[src] or 0) + 1
              if noclipFallbackStrike[src] >= 3 then
                noclipFallbackStrike[src] = 0
                TriggerEvent('coreac:serverReport', src, 'NOCLIP', 'CRITICAL', { source = 'server_fallback' })
              end
            else
              -- Hemen TELEPORT deme: 1 sn sonraki örnek uçuş mu sıçrama mı söyler.
              jumpPending[src] = { dist = math.floor(dist), t = now }
            end
            sPos[src].seen = now + 5000  -- kısa süre tekrar tetiklenmesin
          end
          prev.x, prev.y, prev.z, prev.t = c.x, c.y, c.z, now
        end
      end
    end
  end
  -- ayrılanları temizle
  local online = {}
  for _, sid in ipairs(GetPlayers()) do online[tonumber(sid)] = true end
  for k in pairs(sPos) do
    if not online[k] then
      sPos[k] = nil; tpGrace[k] = nil; noclipFallbackStrike[k] = nil; jumpPending[k] = nil; CollState[k] = nil; armourStrikes[k] = nil
      vehSpeedStreak[k] = nil
    end
  end
end

AddEventHandler('playerJoining', function()
  CAC.grantTp(source)  -- yeni girişte ilk ışınlanma/yükleme muaf
end)

-- ---------------------------------------------------------------------------
-- Açılış kontrolü — ekran görüntüsü sağlayıcısı çalışıyor mu?
--
-- ÖNCEKİ MESAJ SUNUCUYU KİLİTLİYORDU: kullanıcıya "citizenfx/screenshot-basic
-- ekle, coreac'ten ÖNCE ensure et" diyordu. O repo KAYNAK koddur ve
-- sunucuda yarn+webpack build'i ister; kullanıcı mevcut satırın yanına ikinci
-- bir ensure ekleyince iki build aynı anda koştu, yarn kilidi bekleyip asılı
-- kaldı ve txAdmin açılışı zaman aşımıyla kapattı. Artık build gerektirmeyen
-- screencapture önerilir ve "yalnızca BİR kez ensure" açıkça yazılır.
-- ---------------------------------------------------------------------------
CreateThread(function()
  Wait(8000)  -- diğer resource'ların başlamasını bekle
  local sc = GetResourceState('screencapture')
  local sb = GetResourceState('screenshot-basic')
  if sc == 'started' then
    print('^2[CoreAC] screencapture found and running — screenshots enabled.^7')
  elseif sb == 'started' then
    print('^2[CoreAC] screenshot-basic found and running — screenshots enabled.^7')
  else
    print(('^3[CoreAC] Screenshots are disabled: no screenshot resource is running (screencapture: %s, screenshot-basic: %s).^7'):format(tostring(sc), tostring(sb)))
    print('^3[CoreAC] To enable them install "screencapture" and add a SINGLE line to server.cfg:  ensure screencapture^7')
    print('^3[CoreAC] Never ensure a screenshot resource twice — two concurrent yarn builds deadlock and the server will not finish starting.^7')
  end

  -- KRİTİK: Görüntü, OYUNCUNUN kendi bilgisayarından yükleme adresine POST edilir.
  -- Adres localhost/127.0.0.1 ise sadece panelle AYNI makinedeki oyuncu yükleyebilir;
  -- diğer tüm oyuncularda "ECONNRESET" olur. Herkeste çalışması için yükleme adresi
  -- HERKESİN erişebildiği PUBLIC bir adres olmalı (tünel veya VDS public IP).
  local base = (CAC.screenshotUploadBase and CAC.screenshotUploadBase()) or ''
  if base:find('localhost') or base:find('127%.0%.0%.1') then
    print('^1[CoreAC] UYARI: Panel adresin (coreac_api) LOCALHOST (' .. base .. ').^7')
    print('^1[CoreAC] Ekran goruntusu oyuncunun bilgisayarindan panele yuklenir; localhost erisilemez.^7')
    print("^3[CoreAC] Cozum: coreac_api'yi PUBLIC panel adresine ayarla (ekran goruntusu adresi ONDAN turer):^7")
    print('^3[CoreAC]   set coreac_api "https://PANEL_PUBLIC_ADRES/api/v1"^7')
    print("^3[CoreAC] (Panel VDS'te degilse Cloudflare Tunnel ile public adres alin -- bkz. KURULUM.md)^7")
  else
    print('^2[CoreAC] Ekran goruntusu yukleme adresi (otomatik): ' .. base .. '^7')
  end
end)

-- ---------------------------------------------------------------------------
-- Döngüler
-- ---------------------------------------------------------------------------
CreateThread(function()
  if not Config.Token or Config.Token == '' then
    print('^1[CoreAC] WARNING: coreac_token is not set — live features (monitoring, bypass list, blacklist, admins) are disabled.^7')
    return
  end
  Wait(2000)
  refreshWhitelist()
  refreshBlacklist()
  refreshAdmins()

  local function loop(interval, fn)
    CreateThread(function()
      while true do Wait(interval * 1000); pcall(fn) end
    end)
  end

  loop(Config.PositionInterval, flushPositions)
  loop(Config.WhitelistInterval, refreshWhitelist)
  loop(Config.BlacklistInterval, refreshBlacklist)
  loop(Config.AdminInterval, refreshAdmins)
  loop(Config.ScreenshotInterval, pollScreenshots)

  -- Teleport taraması ~1 sn (hassas ama ucuz)
  CreateThread(function()
    while true do Wait(1000); pcall(teleportScan) end
  end)
end)
