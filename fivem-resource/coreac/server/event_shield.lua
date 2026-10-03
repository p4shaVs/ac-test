-- =============================================================================
-- server/event_shield.lua — EVENT SHIELD: sunucudaki TÜM resource'ların olayları.
--
-- Hileciler sunucuya girip istemciye inen script'leri döker (dump), içlerindeki
-- TriggerServerEvent adlarını toplar ve bu olayları executor'dan istedikleri
-- değerlerle tetikler (para, eşya, iş ödemesi…). İstemciye inen dosyalar FiveM'de
-- her zaman okunabilir; olay ADLARINI gizlemek mümkün değildir. Mümkün olan,
-- TETİKLEMEYİ yakalamaktır. Bu modül bunu üç katmanda yapar — hiçbir resource'un
-- olayını engellemez/değiştirmez, yalnızca gözler ve raporlar:
--
--   1) TARAMA + HIZ (kural anti_event_spam): açılışta tüm resource'ların sunucu
--      dosyaları taranır; istemciden çağrılabilen her olay (RegisterNetEvent) için
--      pasif bir dinleyici kurulur. Tek olayın 2 sn'de 150'den fazla, tüm olayların
--      2 sn'de 600'den fazla tetiklenmesi (para/ödül spam'i) ya da oyunda 10 sn'de
--      60'tan fazla FARKLI olay ("olay tarayıcı" — dökülen listeyi sırayla deneme)
--      → EVENT_EXPLOIT. Her karede olay gönderen kötü yazılmış bir script FPS ile
--      ölçeklenir ve herkesi aşar: aynı olay 1 saat içinde 3 farklı oyuncuda sınırı
--      aşarsa bu resource'un davranışıdır — olay otomatik muaf tutulur (konsola yazılır).
--
--   2) SUNUCU-İÇİ OLAY TUZAKLARI (kural anti_server_only_events): bir resource'un
--      yalnızca sunucu içinde dinlediği (ağdan kabul etmediği) olaylar istemciden
--      ASLA gelmez. Hile menüleri bilinen script'lerin olay listelerini körlemesine
--      dener; böyle bir olay istemciden gelirse → CHEAT_EVENT_HONEYPOT. Yanlış-pozitife
--      karşı yalnızca kesin vakalar kurulur (bkz. analyse()).
--
--   3) KAYNAK DIŞI TETİKLEME (kural anti_unauthorized_events, `ac shield install`):
--      korunan resource'lara küçük bir include eklenir (shield/include.lua); o
--      resource'un istemcide gönderdiği olayları SAYAR. Anti-cheat sayımları güvenli
--      kanaldan bildirir; sunucu aldığı olayla karşılaştırır. Resource'un kendi kodu
--      dışından (executor'dan) tetiklenen olay sayılmamış görünür → EVENT_UNAUTHORIZED.
--
-- Panel → Safe Guard → Safe Events'teki olaylar hiçbir katmanda raporlanmaz.
-- =============================================================================

CAC = CAC or {}

local ME = GetCurrentResourceName()
local SHIELD_FILE = '__shield.lua'
local SHIELD_LINE = "shared_script '" .. SHIELD_FILE .. "' -- CoreAC Event Shield (remove with: ac shield uninstall <resource>)"
local MAX_FILE = 1500000
local MAX_WATCH = 4000
local MAX_BAIT = 800

local FLOOD_WINDOW, FLOOD_LIMIT, TOTAL_LIMIT = 2000, 150, 600
local SCAN_WINDOW, SCAN_LIMIT = 10000, 60
local FLAG_COOLDOWN = 60000
local LEARN_PLAYERS, LEARN_WINDOW = 3, 3600000

-- Kurulumda dokunulmayan altyapı resource'ları.
local SKIP_INSTALL = {
  monitor = true, yarn = true, webpack = true, sessionmanager = true, spawnmanager = true,
  mapmanager = true, hardcap = true, rconlog = true, baseevents = true, ['basic-gamemode'] = true,
  runcode = true, ['fivem-map-hipster'] = true, ['fivem-map-skater'] = true,
}
-- Tuzak kurulmayan olay önekleri (FiveM/txAdmin/anti-cheat'in kendi olayları).
local SYSTEM_PREFIX = { '__cfx', '__ox', 'onResource', 'onServerResource', 'onClientResource', 'player',
  'txAdmin', 'txsv', 'txcl', 'coreac:', 'aeigs:', '__CoreAC', 'entity', 'weaponDamage', 'explosion' }

local function ruleOn(key)
  local r = CAC.getRules and CAC.getRules() or {}
  return r[key] == true
end

local function systemEvent(ev)
  for _, p in ipairs(SYSTEM_PREFIX) do
    if ev:sub(1, #p) == p then return true end
  end
  return false
end

local function norm(s) return (tostring(s or ''):lower():gsub('[^%w]', '')) end

-- ---------------------------------------------------------------- tarama
local fileCache = {}

local function readFile(res, path)
  if path:sub(1, 1) == '@' then
    local other, rest = path:match('^@([^/]+)/(.+)$')
    if not other then return nil end
    res, path = other, rest
  end
  local k = res .. '/' .. path
  local c = fileCache[k]
  if c ~= nil then return c or nil end
  local ok, data = pcall(LoadResourceFile, res, path)
  if not ok or type(data) ~= 'string' or #data > MAX_FILE then fileCache[k] = false return nil end
  fileCache[k] = data
  return data
end

local function isEscrow(res)
  local ok, data = pcall(LoadResourceFile, res, '.fxap')
  return ok and data ~= nil
end

--- Bir resource'un manifest'te tanımlı script dosyaları (sunucu/istemci tarafı).
local function resourceFiles(res)
  local info = { server = {}, client = {}, partialServer = false, partialClient = false, shield = false, hasClient = false, clientLua = false }
  for _, key in ipairs({ 'server_script', 'shared_script', 'client_script' }) do
    local n = GetNumResourceMetadata(res, key) or 0
    for i = 0, n - 1 do
      local f = GetResourceMetadata(res, key, i)
      if type(f) == 'string' and f ~= '' then
        if key == 'shared_script' and f == SHIELD_FILE then
          info.shield = true
        else
          local glob = f:find('*', 1, true) ~= nil
          if key ~= 'client_script' then
            if glob then info.partialServer = true else info.server[#info.server + 1] = f end
          end
          if key ~= 'server_script' then
            info.hasClient = true
            if glob then info.partialClient = true else info.client[#info.client + 1] = f end
            if f:lower():match('%.lua$') then info.clientLua = true end
          end
        end
      end
    end
  end
  return info
end

local function eachQuoted(src, fn, js)
  for s in src:gmatch('"([^"\n]*)"') do fn(s) end
  for s in src:gmatch("'([^'\n]*)'") do fn(s) end
  if js then for s in src:gmatch('`([^`\n]*)`') do fn(s) end end
end

local function eachCallArg(src, fname, fn)
  for s in src:gmatch(fname .. '%s*%(%s*"([^"\n]+)"') do fn(s) end
  for s in src:gmatch(fname .. "%s*%(%s*'([^'\n]+)'") do fn(s) end
end

local S = {
  done = false, at = 0,
  info = {},        -- [res] = resourceFiles + escrow
  net = {},         -- [ev] = true — istemciden çağrılabilir (RegisterNetEvent/RegisterServerEvent/onNet)
  watch = {},       -- [ev] = true — pasif dinleyici açık
  bait = {},        -- [ev] = sahibi resource — sunucu-içi olay tuzağı
  covered = {},     -- [ev] = { res… } — Event Shield karşılaştırmasına giren olaylar
  shielded = {},    -- [res] = true — include'u yüklü resource'lar
}
local watchReg, baitReg = {}, {}

--- Tüm resource'ları tarar ve setleri yeniden kurar (thread içinde çağrılır).
function CAC.shieldAnalyse(yield)
  yield = yield or function() end
  fileCache = {}
  local info, net, netN, aeh, aehOwner, lit = {}, {}, {}, {}, {}, {}
  local anyPartialServer = false
  local nres = GetNumResources() or 0
  for i = 0, nres - 1 do
    local res = GetResourceByFindIndex(i)
    -- Panel → Safe Guard → Ignored Scripts: CoreAC bu resource'a hiç dokunmaz (olayları da izlenmez).
    if type(res) == 'string' and res ~= ME and GetResourceState(res) == 'started'
       and not (CAC.isIgnoredScript and CAC.isIgnoredScript(res)) then
      local inf = resourceFiles(res)
      inf.escrow = isEscrow(res)
      info[res] = inf
      if inf.escrow then inf.partialServer = true end
      for _, f in ipairs(inf.server) do
        local src = readFile(res, f)
        local isLua = f:lower():match('%.lua$') ~= nil
        if not src then
          inf.partialServer = true
        elseif not isLua then
          inf.partialServer = true
          eachCallArg(src, 'onNet', function(ev) net[ev] = true end)
          eachCallArg(src, 'RegisterNetEvent', function(ev) net[ev] = true end)
        else
          eachCallArg(src, 'RegisterNetEvent', function(ev) net[ev] = true; netN[ev] = (netN[ev] or 0) + 1 end)
          eachCallArg(src, 'RegisterServerEvent', function(ev) net[ev] = true; netN[ev] = (netN[ev] or 0) + 1 end)
          if src:find('RegisterNetEvent%s*%(%s*[^%s"\']') or src:find('RegisterServerEvent%s*%(%s*[^%s"\']') then
            inf.dynNet = true
          end
          eachCallArg(src, 'AddEventHandler', function(ev)
            aeh[ev] = (aeh[ev] or 0) + 1
            aehOwner[ev] = aehOwner[ev] or res
          end)
          eachQuoted(src, function(s) lit[s] = (lit[s] or 0) + 1 end)
        end
        yield()
      end
      -- Belirsizlik: okunamayan sunucu dosyası ya da değişkenle olay kaydı (hangi adı
      -- kaydettiği bilinemez) → tuzaklar yalnızca önek = sahibin adı olunca kurulur.
      if inf.partialServer or inf.dynNet then anyPartialServer = true end
    end
  end

  -- İstemcide bakılacak dizeler: ağ olayları (+ son parçaları — dinamik ad kurulumu
  -- "prefix .. ':buy'" gibi) ve tuzak adayları.
  local interesting = {}
  for ev in pairs(net) do
    interesting[ev] = true
    local suf = ev:match(':([^:]+)$')
    if suf then interesting[suf] = true; interesting[':' .. suf] = true end
  end
  for ev in pairs(aeh) do interesting[ev] = true end

  local refs = {}  -- [dize] = { [res] = 'lua'|'js' }
  for res, inf in pairs(info) do
    for _, f in ipairs(inf.client) do
      local src = readFile(res, f)
      if src then
        local kind = f:lower():match('%.lua$') and 'lua' or 'js'
        eachQuoted(src, function(s)
          if interesting[s] then
            local r = refs[s] or {}
            refs[s] = r
            if r[res] ~= 'js' then r[res] = kind end
          end
        end, kind == 'js')
      else
        inf.partialClient = true
      end
      yield()
    end
  end

  local shielded = {}
  for res, inf in pairs(info) do if inf.shield then shielded[res] = true end end

  -- 2) Tuzaklar: YALNIZCA kesin vakalar.
  local bait, nb = {}, 0
  for ev, n in pairs(aeh) do
    local owner = aehOwner[ev]
    local oi = info[owner]
    if nb < MAX_BAIT and not net[ev] and ev:find(':', 1, true) and #ev <= 100 and not systemEvent(ev)
       and (lit[ev] or 0) == n                       -- yalnızca AddEventHandler'da geçiyor
       and not refs[ev]                              -- hiçbir istemci dosyasında geçmiyor
       and oi and not oi.partialServer and not oi.dynNet
       and (not anyPartialServer or norm(ev:match('^([^:]+)')) == norm(owner)) then
      bait[ev] = owner
      nb = nb + 1
    end
  end

  -- 3) Event Shield kapsamı.
  local unshieldedPartial = {}
  for res, inf in pairs(info) do
    if inf.hasClient and inf.partialClient and not shielded[res] then unshieldedPartial[#unshieldedPartial + 1] = norm(res) end
  end
  local function refUnshielded(s)
    for res in pairs(refs[s] or {}) do if not shielded[res] then return true end end
    return false
  end
  local covered = {}
  if next(shielded) then
    for ev in pairs(net) do
      local r = refs[ev]
      if r and not (CAC.isSafeEvent and CAC.isSafeEvent(ev)) then
        local ok, list = true, {}
        for res, kind in pairs(r) do
          if not shielded[res] or kind ~= 'lua' then ok = false break end
          list[#list + 1] = res
        end
        local suf = ev:match(':([^:]+)$')
        if ok and suf and (refUnshielded(suf) or refUnshielded(':' .. suf)) then ok = false end
        if ok then
          local ne = norm(ev)
          for _, p in ipairs(unshieldedPartial) do
            if p ~= '' and ne:sub(1, #p) == p then ok = false break end
          end
        end
        if ok and #list > 0 then table.sort(list); covered[ev] = list end
      end
    end
  end

  S.info, S.net, S.bait, S.covered, S.shielded = info, net, bait, covered, shielded
  S.done, S.at = true, GetGameTimer()
  fileCache = {}
  return S
end

-- ---------------------------------------------------------------- gözlem
local per = {}            -- [src] = oyuncu durumu
local learned, learnedOut = {}, {}
local floodSeen, floodExempt = {}, {}   -- her karede olay gönderen script'ler

--- Bu olayın seli bir resource davranışı mı? (aynı olay, 1 saatte 3 farklı oyuncu)
local function floodIsSystemic(src, ev)
  if floodExempt[ev] then return true end
  local now = GetGameTimer()
  local f = floodSeen[ev]
  if not f or now - f.first > LEARN_WINDOW then f = { first = now, players = {}, n = 0 }; floodSeen[ev] = f end
  if not f.players[src] then f.players[src] = true; f.n = f.n + 1 end
  if f.n >= LEARN_PLAYERS then
    floodExempt[ev] = true
    CAC.log('WARN', 'anticheat', ('Event Shield: "%s" goes over the flood limit for %d different players — a resource sends it every frame. It is no longer counted for floods.'):format(ev, f.n))
    print(('^3[CoreAC] Event Shield: "%s" is sent every frame by a resource — no longer counted for floods.^7'):format(ev))
    return true
  end
  return false
end

local function player(src)
  local p = per[src]
  if not p then
    local now = GetGameTimer()
    p = { ev = {}, total = 0, totalReset = now + FLOOD_WINDOW, distinct = {}, dn = 0, dReset = now + SCAN_WINDOW,
          rec = {}, bal = {}, streak = {}, lc = {}, flagged = {} }
    per[src] = p
  end
  return p
end

local function flag(src, p, key, dtype, details)
  local now = GetGameTimer()
  if p.flagged[key] and now - p.flagged[key] < FLAG_COOLDOWN then return end
  p.flagged[key] = now
  if CAC.isWhitelisted and CAC.isWhitelisted(src) then return end
  TriggerEvent('coreac:serverReport', src, dtype, 'HIGH', details)
end

local function observe(src, ev)
  if not GetPlayerName(src) then return end
  local p = player(src)
  if S.covered[ev] then p.rec[ev] = (p.rec[ev] or 0) + 1 end
  if not ruleOn('anti_event_spam') then return end
  if CAC.isSafeEvent and CAC.isSafeEvent(ev) then return end
  local now = GetGameTimer()

  local b = p.ev[ev]
  if not b or now > b.reset then b = { n = 0, reset = now + FLOOD_WINDOW }; p.ev[ev] = b end
  b.n = b.n + 1
  if b.n == FLOOD_LIMIT + 1 and not floodIsSystemic(src, ev) then
    flag(src, p, 'flood:' .. ev, 'EVENT_EXPLOIT', { event = ev, check = 'event flood', count = b.n, windowMs = FLOOD_WINDOW })
  end

  if now > p.totalReset then p.total = 0; p.totalReset = now + FLOOD_WINDOW end
  p.total = p.total + 1
  if p.total == TOTAL_LIMIT + 1 and not floodExempt[ev] then
    flag(src, p, 'total', 'EVENT_EXPLOIT', { event = ev, check = 'event flood (all events)', count = p.total, windowMs = FLOOD_WINDOW })
  end

  if now > p.dReset then p.distinct = {}; p.dn = 0; p.dReset = now + SCAN_WINDOW end
  if not p.distinct[ev] then
    p.distinct[ev] = true
    p.dn = p.dn + 1
    if p.dn == SCAN_LIMIT + 1 and (not CAC.isInGame or CAC.isInGame(src, 60000)) then
      flag(src, p, 'scan', 'EVENT_EXPLOIT', { event = ev, check = 'event scan (dumped event list fired one by one)', distinct = p.dn, windowMs = SCAN_WINDOW })
    end
  end
end

local function arm()
  local n = 0
  for ev in pairs(watchReg) do n = n + 1 end
  for ev in pairs(S.net) do
    if not watchReg[ev] and n < MAX_WATCH and #ev <= 120 and ev:sub(1, 5) ~= '__cfx' then
      watchReg[ev] = true
      n = n + 1
      local name = ev
      RegisterNetEvent(name, function()
        local src = tonumber(source)
        if src and src > 0 then observe(src, name) end
      end)
    end
  end
  for ev, owner in pairs(S.bait) do
    if not baitReg[ev] then
      baitReg[ev] = true
      local name = ev
      RegisterNetEvent(name, function()
        local src = tonumber(source)
        local o = S.bait[name]
        if not src or src <= 0 or not o then return end
        if not ruleOn('anti_server_only_events') then return end
        if CAC.isSafeEvent and CAC.isSafeEvent(name) then return end
        if CAC.eventLimited(src, 'shield_bait', 5, 10000) then return end
        TriggerEvent('coreac:serverReport', src, 'CHEAT_EVENT_HONEYPOT', 'HIGH', {
          event = name, side = 'server', check = 'server-only event sent by a client', owner = o,
        })
      end)
    end
  end
end

-- ---------------------------------------------------------------- 3) karşılaştırma
local function allAlive(list, alive)
  for _, r in ipairs(list or {}) do if not alive[r] then return false end end
  return list ~= nil and #list > 0
end

local function learn(src, ev)
  local now = GetGameTimer()
  local l = learned[ev]
  if not l or now - l.first > LEARN_WINDOW then l = { first = now, players = {}, n = 0 }; learned[ev] = l end
  if not l.players[src] then l.players[src] = true; l.n = l.n + 1 end
  if l.n >= LEARN_PLAYERS then
    learnedOut[ev] = true
    CAC.log('WARN', 'anticheat', ('Event Shield: "%s" is also sent by a resource without the shield (seen for %d players) — no longer checked. Install the shield on that resource or add the event to Safe Events.'):format(ev, l.n))
    print(('^3[CoreAC] Event Shield: "%s" is also sent by a resource without the shield — excluded from checks.^7'):format(ev))
    return false
  end
  return true
end

--- Güvenli kanaldan gelen sayım (server/secure_channel.lua 'tse').
function CAC.shieldBatch(src, payload)
  src = tonumber(src)
  if not src or type(payload) ~= 'table' then return end
  local p = player(src)
  local alive = {}
  for _, r in ipairs(type(payload.r) == 'table' and payload.r or {}) do
    if type(r) == 'string' and S.shielded[r] then alive[r] = true end
  end
  if not p.shieldStarted then
    -- İlk sayım, oturum öncesi geçmişi de içerir: hizalama turu.
    p.shieldStarted = true
    p.rec, p.bal, p.streak, p.lc = {}, {}, {}, {}
    return
  end
  if not ruleOn('anti_unauthorized_events') then p.rec = {} return end
  local c = type(payload.c) == 'table' and payload.c or {}
  local l = type(payload.l) == 'table' and payload.l or {}
  local seen = {}
  for ev in pairs(p.rec) do seen[ev] = true end
  for ev in pairs(p.bal) do seen[ev] = true end
  for ev in pairs(c) do if S.covered[ev] then seen[ev] = true end end
  for ev in pairs(l) do if S.covered[ev] then seen[ev] = true end end

  for ev in pairs(seen) do
    if S.covered[ev] and not learnedOut[ev] and allAlive(S.covered[ev], alive)
       and not (CAC.isSafeEvent and CAC.isSafeEvent(ev)) then
      local recv = p.rec[ev] or 0
      local cn, cl = tonumber(c[ev]) or 0, tonumber(l[ev]) or 0
      -- Latent olaylar diğerlerinden geç ulaşabilir: sayılıp henüz alınmamış
      -- latent olaylar kısa süre "alacak" olarak taşınır.
      local lc = p.lc[ev] or { v = 0, age = 0 }
      p.lc[ev] = lc
      if cl > 0 then lc.v = lc.v + cl; lc.age = 0 else lc.age = lc.age + 1; if lc.age > 10 then lc.v = 0 end end
      local bal = (p.bal[ev] or 0) + recv - cn - cl
      if bal < -lc.v then bal = -lc.v end
      if bal > 0 then
        p.streak[ev] = (p.streak[ev] or 0) + 1
        if p.streak[ev] >= 2 then
          if learn(src, ev) then
            flag(src, p, 'unauth:' .. ev, 'EVENT_UNAUTHORIZED', {
              event = ev, check = 'event sent from outside the resource\'s own code', unaccounted = bal,
              resources = table.concat(S.covered[ev], ', '),
            })
          end
          bal, p.streak[ev] = 0, 0
        end
      else
        p.streak[ev] = 0
      end
      p.bal[ev] = (bal ~= 0) and bal or nil
    else
      p.bal[ev], p.streak[ev] = nil, nil
    end
  end
  p.rec = {}
end

AddEventHandler('playerDropped', function()
  local src = tonumber(source)
  if src then per[src] = nil end
end)

-- ---------------------------------------------------------------- tarama zamanlaması
local scanning, rescanAt = false, nil

local function runScan()
  if scanning then return end
  scanning = true
  local ok, err = pcall(CAC.shieldAnalyse, function() Wait(0) end)
  if ok then
    arm()
    local nWatch, nBait, nCov, nShield = 0, 0, 0, 0
    for _ in pairs(watchReg) do nWatch = nWatch + 1 end
    for _ in pairs(S.bait) do nBait = nBait + 1 end
    for _ in pairs(S.covered) do nCov = nCov + 1 end
    for _ in pairs(S.shielded) do nShield = nShield + 1 end
    print(('^2[CoreAC] Event Shield: %d client-callable events watched, %d server-only traps, %d protected resources (%d events covered).^7')
      :format(nWatch, nBait, nShield, nCov))
  elseif Config.Debug then
    print('[CoreAC] Event Shield scan failed: ' .. tostring(err))
  end
  scanning = false
end
CAC.shieldRescan = runScan

CreateThread(function()
  Wait(10000)   -- diğer resource'lar başlasın
  runScan()
  while true do
    Wait(5000)
    if rescanAt and GetGameTimer() >= rescanAt then
      rescanAt = nil
      runScan()
    end
  end
end)

local function scheduleRescan(res)
  if res == ME then return end
  rescanAt = GetGameTimer() + 15000
end
AddEventHandler('onResourceStart', scheduleRescan)
AddEventHandler('onResourceStop', scheduleRescan)

--- Testler / durum komutu.
function CAC.shieldState() return S, learnedOut end

-- ---------------------------------------------------------------- kurulum komutu
local function manifestOf(res)
  for _, m in ipairs({ 'fxmanifest.lua', '__resource.lua' }) do
    local ok, c = pcall(LoadResourceFile, res, m)
    if ok and type(c) == 'string' then return m, c end
  end
  return nil, nil
end

local function installable(res)
  if res == ME then return false, 'the anti-cheat itself' end
  if SKIP_INSTALL[res] then return false, 'server infrastructure' end
  if GetResourceState(res) == 'missing' then return false, 'no such resource' end
  if isEscrow(res) then return false, 'escrow (encrypted) resource' end
  local inf = resourceFiles(res)
  if not inf.hasClient then return false, 'no client scripts' end
  if not inf.clientLua and not inf.partialClient then return false, 'client scripts are not Lua' end
  local m = manifestOf(res)
  if not m then return false, 'no fxmanifest.lua' end
  return true
end

local function install(res)
  local ok, why = installable(res)
  if not ok then return false, why end
  local m, content = manifestOf(res)
  if content:find(SHIELD_FILE, 1, true) then
    SaveResourceFile(res, SHIELD_FILE, LoadResourceFile(ME, 'shield/include.lua') or '', -1)
    return true, 'already installed (include refreshed)'
  end
  local include = LoadResourceFile(ME, 'shield/include.lua')
  if not include then return false, 'shield/include.lua missing in the anti-cheat' end
  if not LoadResourceFile(res, m .. '.coreac.bak') then SaveResourceFile(res, m .. '.coreac.bak', content, -1) end
  if SaveResourceFile(res, SHIELD_FILE, include, -1) == false then return false, 'could not write files (folder permissions)' end
  -- İlk satır: tüm script'lerden önce yüklenir (shared_script'ler client script'lerinden önce gelir).
  local nl = content:find('\r\n', 1, true) and '\r\n' or '\n'
  if SaveResourceFile(res, m, SHIELD_LINE .. nl .. content, -1) == false then return false, 'could not write the manifest (folder permissions)' end
  return true, 'installed'
end

local function uninstall(res)
  local m, content = manifestOf(res)
  if not m then return false, 'no fxmanifest.lua' end
  if not content:find(SHIELD_FILE, 1, true) then return false, 'not installed' end
  local out, removed = {}, 0
  for line in (content .. '\n'):gmatch('([^\n]*)\n') do
    local plain = line:gsub('\r$', '')
    if plain:find(SHIELD_FILE, 1, true) and plain:match('^%s*shared_script') then removed = removed + 1 else out[#out + 1] = line end
  end
  if removed == 0 then return false, 'line not found (edit the manifest by hand)' end
  local text = table.concat(out, '\n')
  if text:sub(-1) == '\n' and content:sub(-1) ~= '\n' then text = text:sub(1, -2) end
  if SaveResourceFile(res, m, text, -1) == false then return false, 'could not write the manifest (folder permissions)' end
  return true, 'removed'
end

local function allResources()
  local out = {}
  for i = 0, (GetNumResources() or 0) - 1 do
    local r = GetResourceByFindIndex(i)
    if type(r) == 'string' and GetResourceState(r) ~= 'missing' then out[#out + 1] = r end
  end
  table.sort(out)
  return out
end

--- `ac shield <status|install|uninstall> [resource|all]` (server/commands.lua çağırır).
function CAC.shieldCommand(args, out)
  local sub = args[2] and args[2]:lower() or 'status'
  local target = args[3]
  if sub == 'install' or sub == 'uninstall' then
    if not target then out(('Usage: ac shield %s <resource|all>'):format(sub), '^3') return end
    local list = target == 'all' and allResources() or { target }
    local done, skipped = 0, 0
    for _, res in ipairs(list) do
      local ok, msg = (sub == 'install' and install or uninstall)(res)
      if ok then done = done + 1; out(('  %s: %s'):format(res, msg), '^2')
      else
        skipped = skipped + 1
        if target ~= 'all' or (sub == 'install' and msg ~= 'no client scripts' and msg ~= 'server infrastructure' and msg ~= 'the anti-cheat itself') then
          out(('  %s: skipped (%s)'):format(res, msg), '^3')
        end
      end
    end
    out(('%s %d resource(s), skipped %d.'):format(sub == 'install' and 'Protected' or 'Removed from', done, skipped), '^2')
    if done > 0 then
      out('Restart the server to load the change (or: refresh, then ensure <resource> for each).', '^3')
      CAC.log('INFO', 'console', ('Event Shield %s: %d resource(s)'):format(sub, done))
    end
    return
  end
  -- status
  if not S.done then out('Event Shield: the first scan has not finished yet (10 s after start).', '^3') return end
  local shielded, unprotected = {}, {}
  for res, inf in pairs(S.info) do
    if inf.shield then shielded[#shielded + 1] = res
    elseif inf.hasClient and not SKIP_INSTALL[res] then
      local ok, why = installable(res)
      unprotected[#unprotected + 1] = ok and res or (res .. ' (' .. why .. ')')
    end
  end
  table.sort(shielded); table.sort(unprotected)
  local nCov, nBait, nWatch = 0, 0, 0
  for _ in pairs(S.covered) do nCov = nCov + 1 end
  for _ in pairs(S.bait) do nBait = nBait + 1 end
  for _ in pairs(watchReg) do nWatch = nWatch + 1 end
  out(('Event Shield: %d client-callable events watched, %d server-only traps.'):format(nWatch, nBait))
  out(('Protected resources (%d, %d events checked): %s'):format(#shielded, nCov, #shielded > 0 and table.concat(shielded, ', ') or 'none — run: ac shield install all'))
  if #unprotected > 0 then out(('Without the shield (%d): %s'):format(#unprotected, table.concat(unprotected, ', ')), '^3') end
  local ex = {}
  for ev in pairs(learnedOut) do ex[#ex + 1] = ev end
  if #ex > 0 then table.sort(ex); out(('Excluded after learning (also sent by unprotected code): %s'):format(table.concat(ex, ', ')), '^3') end
  local fx = {}
  for ev in pairs(floodExempt) do fx[#fx + 1] = ev end
  if #fx > 0 then table.sort(fx); out(('Not counted for floods (sent every frame by a resource): %s'):format(table.concat(fx, ', ')), '^3') end
end

print('^2[CoreAC] Event Shield yuklendi.^7')
