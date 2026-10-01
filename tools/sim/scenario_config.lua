-- Config delivery + Logs & Webhooks + Framework & API (framework names, txAdmin
-- path, command prefix), end to end through the real resource.
--   node tools/sim/run.cjs scenario_config.lua
local check, title = H.check, H.title

H.api()
SIM.advance(3000)
H.pushConfig({})
SIM.advance(62000)

local function has(list, value)
  for _, v in ipairs(list or {}) do if v == value then return true end end
  return false
end

-- ---------------------------------------------------------------------------
title('1. What leaves the server (config broadcast + GlobalState)')
H.pushConfig({
  VpnApiKey = 'SECRET-KEY-123', TxAdminPath = 'C:/very/private/path', HttpApiAllowedIps = { '203.0.113.9' },
  NameMessage = 'Private sentence.', SafeScripts = { 'my_job' }, BanMessage = 'Customer ban text.',
  QbCoreResourceName = 'my-core', CommandPrefix = 'sec',
})
local cfg = H.clientEvents('coreac:acConfig')
local payload = cfg[#cfg] and cfg[#cfg].args[1]
check('a config broadcast happened', payload ~= nil)
check('the Settings section is NOT in the broadcast', payload ~= nil and payload.Settings == nil)
local flat = json.encode(payload or {})
for _, secret in ipairs({ 'SECRET-KEY-123', 'C:/very/private/path', '203.0.113.9', 'Private sentence.', 'my_job', 'Customer ban text.' }) do
  check("'" .. secret .. "' never reaches players", flat:find(secret, 1, true) == nil)
end
check('other sections still delivered (existing behaviour)', payload ~= nil and payload.Main ~= nil)

local bag = GlobalState[CoreAC.CFct1C6gobnW4qkaQUx3Xk9Q]
check('GlobalState bag exists', bag ~= nil)
local keys = {}
for k in pairs(bag and bag.Settings or {}) do keys[#keys + 1] = k end
table.sort(keys)
check('GlobalState Settings holds ONLY the two flags server modules read', table.concat(keys, ',') == 'EnableAntiBackdoors,StopServerWhenDetected', table.concat(keys, ','))
check('…and the server still has the full values', CoreAC.Config.Settings.VpnApiKey == 'SECRET-KEY-123')

local pfx = H.clientEvents('coreac:prefix')
local fw = H.clientEvents('coreac:frameworks')
check('prefix is sent to players (harmless)', pfx[#pfx] and pfx[#pfx].args[1] == 'sec')
check('framework names are sent to players (harmless)', fw[#fw] and fw[#fw].args[1].qb == 'my-core' and fw[#fw].args[1].qbx == 'qbx_core')
SIM.clientEvents = {}
SIM.net('coreac:requestAcConfig', 77)
check('a joining player gets prefix + frameworks too', #H.clientEvents('coreac:prefix') == 1 and #H.clientEvents('coreac:frameworks') == 1)

-- ---------------------------------------------------------------------------
title('2. Logs: Log On Connect / Connections To Console / To Discord / Show Ip Address')
local function connectAndCollect(settings, id, ip)
  H.pushConfig(settings)
  H.consoleClear()
  H.markLogs()
  H.addPlayer(id, 'Joiner' .. id, { ip = ip })
  H.connect(id)
  SIM.advance(12000)
end
local function connectLog() return H.findLog('connect', 'is connecting') end

connectAndCollect({ AntiConnectionDupe = false }, 200, '4.4.4.4')
local l = connectLog()
check('default: panel log line written', l ~= nil)
check('default: console line printed', H.consoleHas('Joiner200 is connecting', true) ~= nil)
check('default: structured event attached (for Discord)', l and l.meta and l.meta.event == 'connect' and l.meta.player == 'Joiner200')
check('default: identifiers included, IP NOT', l and l.meta and l.meta.ids and l.meta.ids.license == 'license:lic200' and l.meta.ids.ip == nil)
check('default: console line has no IP', (H.consoleHas('Joiner200', true) or ''):find('4.4.4.4', 1, true) == nil)

connectAndCollect({ AntiConnectionDupe = false, ShowIpAddress = true }, 201, '4.4.4.5')
l = connectLog()
check('Show Ip Address → IP in the Discord event', l and l.meta and l.meta.ids and l.meta.ids.ip == '4.4.4.5')
check('Show Ip Address → IP in the console line', (H.consoleHas('Joiner201', true) or ''):find('4.4.4.5', 1, true) ~= nil)

connectAndCollect({ AntiConnectionDupe = false, LogConnectionsToConsole = false }, 202, '4.4.4.6')
check('console off → nothing printed…', H.consoleHas('Joiner202', true) == nil)
check('…but the panel log is still written', connectLog() ~= nil)

connectAndCollect({ AntiConnectionDupe = false, LogConnectionsToDiscord = false }, 203, '4.4.4.7')
l = connectLog()
check('Discord off → panel log without a structured event', l ~= nil and l.meta == nil)

connectAndCollect({ AntiConnectionDupe = false, LogOnConnect = false }, 204, '4.4.4.8')
check('Log On Connect off → no panel line', connectLog() == nil)
check('Log On Connect off → no console line', H.consoleHas('Joiner204', true) == nil)

-- disconnects
local function dropAndCollect(settings, id, reason)
  H.pushConfig(settings)
  H.consoleClear()
  H.markLogs()
  SIM.dispatch('playerDropped', id, reason)
  SIM.advance(12000)
end
H.addPlayer(210, 'Leaver210', { ip = '5.5.5.5' })
dropAndCollect({}, 210, 'Exiting')
l = H.findLog('disconnect', 'Leaver210 left (Exiting)')
check('disconnect: panel log with reason', l ~= nil, l and l.message)
check('disconnect: structured event with reason', l and l.meta and l.meta.event == 'disconnect' and l.meta.reason == 'Exiting')
check('disconnect: console line', H.consoleHas('Leaver210 left (Exiting)', true) ~= nil)
H.addPlayer(211, 'Leaver211')
dropAndCollect({ LogOnDisconnect = false }, 211, 'Exiting')
check('Log On Disconnect off → nothing logged, nothing printed', H.findLog('disconnect') == nil and H.consoleHas('Leaver211', true) == nil)
H.addPlayer(212, 'Leaver212')
dropAndCollect({}, 212, string.rep('x', 400))
l = H.findLog('disconnect', 'Leaver212')
check('a very long drop reason is clipped so the panel accepts it', l and l.meta and #l.meta.reason <= 190, l and l.meta and #l.meta.reason)

-- ---------------------------------------------------------------------------
title('3. Admin Logs: admin-menu commands become structured events')
H.admins = { { identifier = 'license:adm1', name = 'Admin One', role = 'ADMIN', permissions = { 'revive', 'kick', 'freeze' } } }
SIM.advance(62000)
H.addPlayer(220, 'AdminOne', { ids = { 'license:adm1' } })
H.addPlayer(221, 'Victim')
H.pushConfig({})
H.markLogs()
SIM.net('coreac:adminAction', 220, 'revive', 221)
SIM.advance(12000)
l = H.findLog('admin', 'AdminOne -> revive')
check('revive by an admin → structured "admin" event', l and l.meta and l.meta.event == 'admin' and l.meta.admin == 'AdminOne' and l.meta.action == 'revive' and l.meta.player == 'Victim', l and json.encode(l.meta or {}))
H.markLogs()
SIM.net('coreac:adminAction', 220, 'kick', 221, 'spam')
SIM.advance(12000)
l = H.findLog('admin', 'AdminOne -> kick')
check('kick goes through /ingame-action (no duplicate event from the resource)', l ~= nil and l.meta == nil and #H.requests('/ingame-action') >= 1)
H.markLogs()
SIM.net('coreac:adminAction', 221, 'revive', 220)
SIM.advance(12000)
check('an action without permission leaves no admin event', H.findLog('admin') == nil)

-- ---------------------------------------------------------------------------
title('4. Framework resource names are configurable (QBCore / Qbox / ESX staff detection)')
local realExports = exports
local fake = {}   -- [resource][export] = function(...)
exports = setmetatable({}, {
  __call = getmetatable(realExports).__call,
  __index = function(_, res)
    if fake[res] then
      return setmetatable({}, { __index = function(_, fn) return function(_, ...) local f = fake[res][fn]; if f then return f(...) end end end })
    end
    return realExports[res]
  end,
})
fake['my-core'] = { GetCoreObject = function() return { Functions = { HasPermission = function(_, perm) return perm == 'admin' end } } end }
fake['qbx_custom'] = { HasPermission = function(_, perm) return perm == 'god' end }
fake['esx_custom'] = { getSharedObject = function() return { GetPlayerFromId = function() return { getGroup = function() return 'superadmin' end } end } end }

check('CAC.fw defaults', (function() H.pushConfig({}) return CAC.fw('qb') == 'qb-core' and CAC.fw('qbx') == 'qbx_core' and CAC.fw('esx') == 'es_extended' end)())
local nextId = 300
local function isStaffWith(settings, resources)
  H.pushConfig(settings)
  for name, state in pairs(resources or {}) do SIM.resources[name] = state end
  nextId = nextId + 1
  H.addPlayer(nextId, 'Fw' .. nextId)
  return CAC.isStaff(nextId)
end
check('renamed QBCore started, admin → staff', isStaffWith({ QbCoreResourceName = 'my-core' }, { ['my-core'] = 'started' }) == true)
check('default name "qb-core" not running → not staff', isStaffWith({}, { ['qb-core'] = 'missing' }) == false)
check('renamed Qbox ("god" permission) → staff', isStaffWith({ QbxCoreResourceName = 'qbx_custom' }, { ['qbx_custom'] = 'started' }) == true)
check('renamed ESX (superadmin) → staff', isStaffWith({ EsxResourceName = 'esx_custom' }, { ['esx_custom'] = 'started' }) == true)
check('renamed framework that is not started → not staff', isStaffWith({ EsxResourceName = 'esx_custom' }, { ['esx_custom'] = 'stopped' }) == false)
exports = realExports

-- ---------------------------------------------------------------------------
title('5. Tx Admin Path: admins.json identifiers are staff from the moment they connect')
local fakeFiles = {}
local realOpen = io.open
io.open = function(path)
  local content = fakeFiles[path]
  if not content then return nil, 'no such file' end
  return { read = function() return content end, close = function() end }
end
fakeFiles['C:/txData/default/admins.json'] = json.encode({
  version = 1,
  admins = { {
    name = 'Boss', master = true, password_hash = '$2b$10$VERYSECRETHASH',
    providers = { citizenfx = { id = 'boss', identifier = 'fivem:1234567' }, discord = { id = '1', identifier = 'discord:111222333' } },
    permissions = { 'all_permissions' },
  } },
})
H.consoleClear()
H.pushConfig({ TxAdminPath = 'C:/txData/default/', RequireDiscord = true, AntiConnectionDupe = false })
check('loaded, and the count is announced', H.consoleHas('2 staff identifier(s) loaded', true) ~= nil, H.console[#H.console])
check('no secret from the file is ever printed', H.consoleHas('VERYSECRET', true) == nil and H.consoleHas('password', true) == nil)
H.addPlayer(400, 'TxBoss', { ids = { 'license:lic400', 'fivem:1234567' } })
check('listed admin → staff', CAC.isStaff(400) == true)
H.addPlayer(401, 'TxBoss2', { ids = { 'license:lic401', 'discord:111222333' } })
check('matched by Discord identifier too', CAC.isStaff(401) == true)
H.addPlayer(402, 'NotListed', { ids = { 'license:lic402', 'fivem:999' } })
check('someone not in the file → not staff', CAC.isStaff(402) == false)
H.addPlayer(403, 'TxBossNoDiscord', { ids = { 'license:lic403', 'fivem:1234567' } })
check('txAdmin admin is exempt from Require Discord on connect', H.connect(403).done)
H.addPlayer(404, 'RegularNoDiscord', { ids = { 'license:lic404' } })
check('…while a regular player without Discord is refused', not H.connect(404).done)

-- The resource trims the trailing backslash and joins with '/': "C:\txData\default" .. "/admins.json".
-- Windows accepts the mixed separators; the fake file system matches keys exactly, so register that form.
fakeFiles['C:\\txData\\default/admins.json'] = fakeFiles['C:/txData/default/admins.json']
H.pushConfig({ TxAdminPath = 'C:\\txData\\default\\' })
H.addPlayer(405, 'TxBossWin', { ids = { 'license:lic405', 'fivem:1234567' } })
SIM.advance(31000)
check('Windows-style path with trailing backslash works', CAC.isStaff(405) == true)

H.consoleClear()
H.pushConfig({ TxAdminPath = 'D:/nowhere' })
check('a wrong path is reported once, not silently ignored', H.consoleHas('no admins.json found under "D:/nowhere"', true) ~= nil, H.console[#H.console])
H.addPlayer(406, 'TxBossGone', { ids = { 'license:lic406', 'fivem:1234567' } })
SIM.advance(31000)
check('the old list is dropped when the path changes', CAC.isStaff(406) == false)
H.pushConfig({ TxAdminPath = '' })
io.open = realOpen

-- ---------------------------------------------------------------------------
title('6. Command Prefix takes effect without a restart')
H.consoleClear()
H.pushConfig({ CommandPrefix = 'ac' })
SIM.commands.ac(0, { 'players' })
check('default prefix "ac" works from the console', H.consoleHas('player(s) online', true) ~= nil)
H.pushConfig({ CommandPrefix = 'sec' })
check('new prefix registered', type(SIM.commands.sec) == 'function')
H.consoleClear()
SIM.commands.sec(0, { 'players' })
check('new prefix works', H.consoleHas('player(s) online', true) ~= nil)
H.consoleClear()
SIM.commands.ac(0, { 'players' })
check('the OLD prefix no longer does anything', H.consoleHas('player(s) online', true) == nil)
H.consoleClear()
SIM.commands.sec(0, {})
check('help text uses the new prefix', H.consoleHas('sec players', true) ~= nil)
H.pushConfig({ CommandPrefix = 'ac' })
H.consoleClear()
SIM.commands.ac(0, { 'players' })
check('switching back re-enables "ac"', H.consoleHas('player(s) online', true) ~= nil)
H.consoleClear()
SIM.commands.ac(5, { 'players' })
check('a player (source ≠ 0) still cannot run the console command', H.consoleHas('player(s) online', true) == nil)

H.summary()
