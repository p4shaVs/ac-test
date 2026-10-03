-- server/event_shield.lua — every resource's events: floods, dumped-list scans,
-- server-only traps, triggers from outside the resource, and `ac shield install`.
--   node tools/sim/run.cjs scenario_shield.lua
H.api()

-- ------------------------------------------------------------- a small server on disk
local function res(name, o)
  SIM.resList[#SIM.resList + 1] = name
  SIM.resources[name] = 'started'
  SIM.files[name] = o.files or {}
  SIM.meta[name] = o.meta or {}
end

res('qb-shops', {
  meta = { shared_script = { '__shield.lua' }, server_script = { 'server/main.lua' }, client_script = { 'client/main.lua' } },
  files = {
    ['fxmanifest.lua'] = "fx_version 'cerulean'\ngame 'gta5'\nclient_script 'client/main.lua'\nserver_script 'server/main.lua'\n",
    ['server/main.lua'] = [[
RegisterNetEvent('qb-shops:server:buy', function(item, amount) end)
RegisterNetEvent('qb-shops:server:sell', function() end)
RegisterNetEvent('qb-shops:server:open', function() end)
AddEventHandler('qb-shops:server:internalPay', function() end)
AddEventHandler('qb-shops:server:helper', function() end)
local forwarded = { 'qb-shops:server:helper' }
]],
    ['client/main.lua'] = [[
TriggerServerEvent('qb-shops:server:buy', 'water', 1)
TriggerServerEvent('qb-shops:server:sell', 'water')
TriggerServerEvent('qb-shops:server:open')
]],
  },
})
res('qb-jobs', {
  meta = { server_script = { 'server.lua' }, client_script = { 'client.lua' } },
  files = {
    ['fxmanifest.lua'] = "fx_version 'cerulean'\r\ngame 'gta5'\r\nclient_script 'client.lua'\r\nserver_script 'server.lua'\r\n",
    ['server.lua'] = [[
RegisterNetEvent('qb-jobs:pay')
AddEventHandler('qb-jobs:pay', function() end)
AddEventHandler('qb-jobs:secret', function() end)
local eventName = 'qb-jobs:dyn'
RegisterNetEvent(eventName)
]],
    ['client.lua'] = "TriggerServerEvent('qb-jobs:pay')",
  },
})
-- Unprotected resource that also sends a shop event, and builds another one dynamically.
res('other', {
  meta = { client_script = { 'c.lua' } },
  files = { ['fxmanifest.lua'] = "fx_version 'cerulean'", ['c.lua'] = "TriggerServerEvent('qb-shops:server:sell') local ev = prefix .. ':open'" },
})
local big = { "fx_version 'cerulean'" }
local bigServer = {}
for i = 1, 70 do bigServer[#bigServer + 1] = ("RegisterNetEvent('big:ev%d', function() end)"):format(i) end
res('big', { meta = { server_script = { 's.lua' } }, files = { ['s.lua'] = table.concat(bigServer, '\n') } })
-- A converted ESX script on this QB server, renamed but keeping its esx_* event names.
res('billing', { meta = { server_script = { 's.lua' } }, files = { ['s.lua'] = "RegisterNetEvent('esx_billing:sendBill', function() end)" } })
res('weird', { meta = { server_script = { 'server/*.lua' }, client_script = { 'client/*.lua' } }, files = { ['fxmanifest.lua'] = 'x' } })
res('escrowed', { meta = { client_script = { 'c.lua' } }, files = { ['.fxap'] = 'x', ['fxmanifest.lua'] = 'x', ['c.lua'] = 'x' } })
res('server-only', { meta = { server_script = { 's.lua' } }, files = { ['fxmanifest.lua'] = 'x', ['s.lua'] = '' } })
SIM.files.coreac = { ['shield/include.lua'] = '-- CoreAC Event Shield include' }

H.pushConfig({}, { rules = { anti_event_spam = true, anti_server_only_events = true, anti_unauthorized_events = true } })
SIM.advance(11000)

local reports = {}
AddEventHandler('coreac:serverReport', function(src, dtype, _, d) reports[#reports + 1] = { src = tonumber(src), type = dtype, d = d or {} } end)
local function find(src, dtype, check)
  for i = #reports, 1, -1 do
    local r = reports[i]
    if r.src == src and r.type == dtype and (not check or (r.d.check or ''):find(check, 1, true)) then return r end
  end
end

-- ---------------------------------------------------------------------------
H.title('1. The scan')
local S = CAC.shieldState()
H.check('scan finished', S.done)
H.check('client-callable events found', S.net['qb-shops:server:buy'] and S.net['qb-jobs:pay'] and S.net['big:ev70'])
H.check('…and watched (the anti-cheat listens to them)', SIM.netSafe['qb-shops:server:buy'] == true and SIM.netSafe['big:ev1'] == true)
H.check('protected resource recognised by its manifest', S.shielded['qb-shops'] == true and not S.shielded['qb-jobs'])
H.check('server-only event used nowhere else → trap', S.bait['qb-shops:server:internalPay'] == 'qb-shops')
H.check('server-only event that also appears in a table (maybe registered in a loop) → no trap', S.bait['qb-shops:server:helper'] == nil)
H.check('resource registering events by variable → none of its events trapped', S.bait['qb-jobs:secret'] == nil)
H.check('a trapped event is net-safe only in the anti-cheat', SIM.netSafe['qb-shops:server:internalPay'] == true and SIM.netSafe['qb-shops:server:helper'] ~= true)
H.check('event sent only by the protected resource → checked', S.covered['qb-shops:server:buy'] ~= nil)
H.check('event also sent by an unprotected resource → not checked', S.covered['qb-shops:server:sell'] == nil)
H.check('event an unprotected resource may build from ":open" → not checked', S.covered['qb-shops:server:open'] == nil)

H.title('2. Floods and dumped-list scans')
local a = H.addPlayer(1, 'Ana')
for _ = 1, 150 do SIM.net('qb-jobs:pay', 1) end
H.check('150 of one event in 2 s: fine', find(1, 'EVENT_EXPLOIT') == nil)
SIM.net('qb-jobs:pay', 1)
local f = find(1, 'EVENT_EXPLOIT', 'event flood')
H.check('the 151st: EVENT_EXPLOIT (event flood)', f ~= nil and f.d.event == 'qb-jobs:pay')
SIM.advance(3000)
H.addPlayer(2, 'Ben')
for i = 1, 10 do for _ = 1, 61 do SIM.net('big:ev' .. i, 2) end end
H.check('610 events in 2 s, none over 150 on its own: EVENT_EXPLOIT (all events)', find(2, 'EVENT_EXPLOIT', 'all events') ~= nil and find(2, 'EVENT_EXPLOIT', 'event flood') == find(2, 'EVENT_EXPLOIT', 'all events'))
SIM.advance(3000)

-- A resource that sends an event every frame floods for everybody, not for one cheater.
for id = 30, 32 do
  H.addPlayer(id, 'Driver' .. id)
  for _ = 1, 151 do SIM.net('big:ev50', id) end
end
local nFlood = 0
for _, r in ipairs(reports) do if r.src >= 30 and r.src <= 32 and r.type == 'EVENT_EXPLOIT' then nFlood = nFlood + 1 end end
H.check('the same event over the limit for 3 players: the 3rd is not reported (every-frame script)', nFlood == 2, nFlood)
H.addPlayer(33, 'Driver33')
for _ = 1, 300 do SIM.net('big:ev50', 33) end
H.check('…and that event is not counted for floods any more', find(33, 'EVENT_EXPLOIT') == nil)
SIM.advance(3000)

H.addPlayer(3, 'Cem')
SIM.net('coreac:inGame', 3)
SIM.advance(70000)
for i = 1, 61 do SIM.net('big:ev' .. i, 3) end
H.check('61 different events in 10 s while playing: EVENT_EXPLOIT (event scan)', find(3, 'EVENT_EXPLOIT', 'event scan') ~= nil)
H.addPlayer(4, 'Deniz')
for i = 1, 61 do SIM.net('big:ev' .. i, 4) end
H.check('the same burst on the loading screen (just joined) is not a scan', find(4, 'EVENT_EXPLOIT', 'event scan') == nil)

CAC.setSafeGuard({ SafeEvents = { 'qb-jobs:pay' } })
H.addPlayer(5, 'Ece')
for _ = 1, 200 do SIM.net('qb-jobs:pay', 5) end
H.check('a Safe Event is never counted', find(5, 'EVENT_EXPLOIT') == nil)
CAC.setSafeGuard({})

H.title('3. Server-only traps')
H.addPlayer(6, 'Fatih')
SIM.net('qb-shops:server:internalPay', 6)
local bait = find(6, 'CHEAT_EVENT_HONEYPOT')
H.check('a game sending a server-only event: CHEAT_EVENT_HONEYPOT', bait ~= nil and bait.d.event == 'qb-shops:server:internalPay' and bait.d.owner == 'qb-shops')
H.addPlayer(40, 'Halil')
SIM.net('esx_billing:sendBill', 40)
SIM.advance(200)
H.check('a built-in menu-exploit trap a renamed resource really accepts is never fired', find(40, 'CHEAT_EVENT_HONEYPOT') == nil)
SIM.net('esx_pizza:pay', 40)
SIM.advance(200)
H.check('…while one no resource accepts still fires', find(40, 'CHEAT_EVENT_HONEYPOT') ~= nil)
H.pushConfig({}, { rules = { anti_event_spam = true, anti_server_only_events = false, anti_unauthorized_events = true } })
H.addPlayer(7, 'Gul')
SIM.net('qb-shops:server:internalPay', 7)
H.check('rule off: nothing', find(7, 'CHEAT_EVENT_HONEYPOT') == nil)
H.pushConfig({}, { rules = { anti_event_spam = true, anti_server_only_events = true, anti_unauthorized_events = true } })

H.title('4. Triggers from outside the resource (Event Shield)')
local alive = { 'qb-shops' }
local function batch(src, c, l, r) CAC.shieldBatch(src, { c = c or {}, l = l or {}, r = r or alive }) end
H.addPlayer(8, 'Hakan')
batch(8)                                    -- alignment
for _ = 1, 5 do
  SIM.net('qb-shops:server:buy', 8); SIM.net('qb-shops:server:buy', 8)
  batch(8, { ['qb-shops:server:buy'] = 2 })
end
H.check('every event the resource sent was counted by it: nothing', find(8, 'EVENT_UNAUTHORIZED') == nil)
SIM.net('qb-shops:server:sell', 8)
batch(8); batch(8)
H.check('an event outside the checked set (also sent by unprotected code): nothing', find(8, 'EVENT_UNAUTHORIZED') == nil)
batch(8, {}, { ['qb-shops:server:buy'] = 1 })   -- latent event counted, arrives later
SIM.net('qb-shops:server:buy', 8)
batch(8); batch(8)
H.check('a latent event that arrives after its count: nothing', find(8, 'EVENT_UNAUTHORIZED') == nil)
SIM.net('qb-shops:server:buy', 8)             -- executor: nobody counted it
batch(8)
H.check('one batch with an uncounted event: not yet', find(8, 'EVENT_UNAUTHORIZED') == nil)
batch(8)
local un = find(8, 'EVENT_UNAUTHORIZED')
H.check('still uncounted on the next batch: EVENT_UNAUTHORIZED', un ~= nil and un.d.event == 'qb-shops:server:buy' and un.d.unaccounted == 1)

H.addPlayer(9, 'Ilker')
batch(9, {}, {}, {})
SIM.net('qb-shops:server:buy', 9)
batch(9, {}, {}, {}); batch(9, {}, {}, {})
H.check('a player whose shield include did not start is never judged', find(9, 'EVENT_UNAUTHORIZED') == nil)

H.title('5. Learning: an event also sent by a resource without the shield')
for id = 20, 22 do
  H.addPlayer(id, 'P' .. id)
  batch(id)
  SIM.net('qb-shops:server:buy', id)
  batch(id); batch(id)
end
local nUn = 0
for _, r in ipairs(reports) do if r.type == 'EVENT_UNAUTHORIZED' and r.src >= 20 then nUn = nUn + 1 end end
H.check('the same event unaccounted for 3 different players → excluded, the 3rd is not reported', nUn == 1, nUn)
local _, learnedOut = CAC.shieldState()
H.check('…listed as excluded', learnedOut['qb-shops:server:buy'] == true)
H.addPlayer(23, 'P23')
batch(23); SIM.net('qb-shops:server:buy', 23); batch(23); batch(23)
H.check('…and not checked any more', find(23, 'EVENT_UNAUTHORIZED') == nil)

H.title('5b. Ignored Scripts are not scanned at all')
CAC.setSafeGuard({ IgnoredScripts = { 'qb-shops' } })
CAC.shieldAnalyse()
local S2 = CAC.shieldState()
H.check('an Ignored Script: no watched events, no traps, not checked', S2.net['qb-shops:server:buy'] == nil and S2.bait['qb-shops:server:internalPay'] == nil and S2.covered['qb-shops:server:buy'] == nil)
CAC.setSafeGuard({})
CAC.shieldAnalyse()

H.title('6. ac shield install / uninstall / status')
local lines = {}
local function out(m) lines[#lines + 1] = (m:gsub('%^%d', '')) end
local before = SIM.files['qb-jobs']['fxmanifest.lua']
CAC.shieldCommand({ 'shield', 'install', 'qb-jobs' }, out)
local m = SIM.files['qb-jobs']['fxmanifest.lua']
H.check('install: include added as the first line', m:sub(1, 30) == "shared_script '__shield.lua' -" and m:find(before, 1, true) ~= nil)
H.check('install: include file written, manifest backed up', SIM.files['qb-jobs']['__shield.lua'] == SIM.files.coreac['shield/include.lua'] and SIM.files['qb-jobs']['fxmanifest.lua.coreac.bak'] == before)
CAC.shieldCommand({ 'shield', 'install', 'qb-jobs' }, out)
local _, n = SIM.files['qb-jobs']['fxmanifest.lua']:gsub('__shield%.lua', '')
H.check('install twice: still one line', n == 1, n)
lines = {}
CAC.shieldCommand({ 'shield', 'install', 'escrowed' }, out)
H.check('escrow (encrypted) resources are never touched', SIM.files.escrowed['fxmanifest.lua'] == 'x' and table.concat(lines, '|'):find('escrow', 1, true) ~= nil)
CAC.shieldCommand({ 'shield', 'install', 'server-only' }, out)
H.check('server-only resources are skipped', SIM.files['server-only']['fxmanifest.lua'] == 'x')
CAC.shieldCommand({ 'shield', 'uninstall', 'qb-jobs' }, out)
H.check('uninstall: manifest back to the original, byte for byte (CRLF kept)', SIM.files['qb-jobs']['fxmanifest.lua'] == before)
lines = {}
CAC.shieldCommand({ 'shield', 'install', 'all' }, out)
H.check('install all: protects what can be protected', SIM.files.other['__shield.lua'] ~= nil and SIM.files.escrowed['__shield.lua'] == nil and SIM.files.big['__shield.lua'] == nil)
lines = {}
CAC.shieldCommand({ 'shield', 'status' }, out)
local st = table.concat(lines, '\n')
H.check('status: watched events, traps and protected resources listed', st:find('client-callable events watched', 1, true) and st:find('qb-shops', 1, true) and st:find('qb-shops:server:buy', 1, true))

H.summary()
