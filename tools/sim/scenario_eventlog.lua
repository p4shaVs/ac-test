-- Event Log (server/event_log.lua) through the REAL resource scripts with a FiveM stub.
--   node tools/sim/run.cjs scenario_eventlog.lua
local check, title = H.check, H.title

SIM.api['/heartbeat'] = function() return true, { config = { eventLogEnabled = true, watchEvents = { 'qb-bankrobbery:server:setBankState' }, rules = {}, ac = {} } } end
SIM.api['/event-log'] = function() return true, {} end
SIM.api['/whitelist'] = function() return true, { whitelist = {
  { kind = 'license', value = 'license:scoped', full = false },
  { kind = 'discord', value = 'discord:9', full = false },
  { kind = 'license', value = 'license:full', full = true },
} } end
SIM.players[1] = { name = 'cheater', ped = 101, coords = vector3(0, 0, 30), vel = vector3(0, 0, 0), veh = 0, weapon = 0, ids = { 'license:scoped', 'discord:9' } }
SIM.players[2] = { name = 'victim', ped = 102, coords = vector3(5, 0, 30), vel = vector3(0, 0, 0), veh = 0, weapon = 0, ids = { 'license:full' } }
function IsPedAPlayer(e) return e == 101 or e == 102 end
function NetworkGetEntityFromNetworkId(n) return n end
function NetworkGetNetworkIdFromEntity(e) return e + 100000 end
SIM.entities[102] = { type = 1, owner = 2 }
SIM.advance(4000)

title('setup')
check('event log is on after the heartbeat', CAC.eventLogEnabled and CAC.eventLogEnabled() == true)
check('scoped whitelist is not a full bypass', not CAC.isWhitelisted(1))
check('full whitelist entry is', CAC.isWhitelisted(2) == true)

-- ambient traffic (pop 5) must not be logged; 30 script spawns → cap 25 + summary; one repeated line merged
for i = 1, 40 do SIM.entities[5000 + i] = { type = 2, pop = 5, owner = 1, model = GetHashKey('blista') } SIM.dispatch('entityCreating', '', 5000 + i) end
for i = 1, 5 do SIM.entities[7000 + i] = { type = 2, pop = 7, owner = 1, model = GetHashKey('adder'), coords = vector3(101.26, -20.04, 30.55) } SIM.dispatch('entityCreating', '', 7000 + i) end
for i = 1, 30 do SIM.entities[6000 + i] = { type = 3, pop = 7, owner = 1, model = GetHashKey('prop_asteroid_01') + i } SIM.dispatch('entityCreating', '', 6000 + i) end
SIM.dispatch('entityRemoved', '', 7001)
SIM.dispatch('entityRemoved', '', 5001) -- traffic: not logged
TriggerEvent('weaponDamageEvent', '1', { weaponType = GetHashKey('weapon_pistol'), weaponDamage = 34, hitGlobalId = 102, hitComponent = 20 })
TriggerEvent('weaponDamageEvent', '1', { weaponType = GetHashKey('weapon_pistol'), weaponDamage = 180, hitGlobalId = 102, willKill = true })
TriggerEvent('explosionEvent', '1', { explosionType = 7, f210 = 5, damageScale = 1.0, posX = 10.04, posY = 20.06, posZ = 30.0 })
TriggerEvent('ptFxEvent', '1', { effectHash = 12345, assetHash = 678, scale = 2.25, isOnEntity = false, posX = 1, posY = 2, posZ = 3 })
SIM.net('qb-bankrobbery:server:setBankState', 1, 'pacific', true, { money = 25000, hacked = true })
SIM.net('qb-bankrobbery:server:notWatched', 1)
SIM.advance(2500)

local events = {}
for _, r in ipairs(SIM.requests) do
  if r.path == '/event-log' then for _, e in ipairs(r.body.events) do events[#events + 1] = e end end
end
local function find(kind, pred)
  for _, e in ipairs(events) do if e.kind == kind and (not pred or pred(e)) then return e end end
end
local function count(kind) local n = 0 for _, e in ipairs(events) do if e.kind == kind then n = n + 1 end end return n end

title('feed lines')
local adder = find('spawn', function(e) return e.count > 1 end)
check('identical spawn lines are merged (×5)', adder and adder.count == 5, adder and adder.detail)
check('traffic is never logged', count('spawn') <= 26)
check('spawn kind is capped with a summary line', find('spawn', function(e) return e.detail:find('rate%-limited') ~= nil end) ~= nil)
check('watched event is logged with its arguments', find('event', function(e) return e.detail:find('setBankState', 1, true) ~= nil end) ~= nil)
check('unwatched event is not logged', not find('event', function(e) return e.detail:find('notWatched', 1, true) ~= nil end))

title('structured JSON per event')
check('spawn carries entity / model / netId / coords', adder and adder.data and adder.data.entity == 'vehicle'
  and adder.data.model == GetHashKey('adder') % 4294967296 and adder.data.netId == 107001 and adder.data.coords and adder.data.coords.x == 101.3,
  adder and adder.data and json.encode(adder.data))
local rm = find('remove')
check('removing a player-created entity is logged', rm ~= nil and rm.data and rm.data.entity == 'vehicle', rm and rm.detail)
check('removing traffic is not', count('remove') == 1)
local dmg = find('damage')
check('damage carries weapon, damage, headshot and victim', dmg and dmg.data and dmg.data.weapon == 'pistol' and dmg.data.damage == 34
  and dmg.data.headshot == true and dmg.data.victim == 'victim' and dmg.data.victimId == 2, dmg and json.encode(dmg.data or {}))
local kill = find('kill')
check('kill is flagged willKill', kill and kill.data and kill.data.willKill == true)
local ex = find('explosion')
check('explosion carries type, vehicle flag and rounded coords', ex and ex.data and ex.data.type == 7 and ex.data.vehicle == true
  and ex.data.coords and ex.data.coords.x == 10.0 and ex.data.coords.y == 20.1, ex and json.encode(ex.data or {}))
local fx = find('particle')
check('particle carries effect, asset and scale', fx and fx.data and fx.data.effect == 12345 and fx.data.asset == 678 and fx.data.scale == 2.3)
local ev = find('event')
check('watched event JSON lists the arguments', ev and ev.data and ev.data.event == 'qb-bankrobbery:server:setBankState' and ev.data.argCount == 3 and #ev.data.args == 3)
check('every payload encodes as JSON', pcall(json.encode, events))

title('off = no work')
SIM.api['/heartbeat'] = function() return true, { config = { eventLogEnabled = false, rules = {}, ac = {} } } end
SIM.advance(25000)
local before = H.requestCount('/event-log')
for i = 1, 5 do SIM.entities[8000 + i] = { type = 2, pop = 7, owner = 1, model = GetHashKey('adder') } SIM.dispatch('entityCreating', '', 8000 + i) end
SIM.advance(4500)
check('nothing is sent while the log is off', H.requestCount('/event-log') == before)
check('no script errors', #SIM.errors == 0, SIM.errors[1])

H.summary()
