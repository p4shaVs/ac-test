-- Anti-crash (server/crash_guard.lua) through the REAL resource scripts with a FiveM stub.
--   node tools/sim/run.cjs scenario_crash.lua
local check, title = H.check, H.title

H.api()
SIM.advance(3000)
local ALL_ON = { anti_crash_models = true, anti_crash_attach = true, anti_crash_flood = true, anti_crash_events = true }
H.pushConfig({ SafeScripts = { 'my_housing' } }, { rules = ALL_ON })
SIM.advance(62000)

-- ---------------------------------------------------------------- world
local pedOwner = {}
for id = 1, 4 do
  local p = H.addPlayer(id, 'Player' .. id)
  pedOwner[p.ped] = id
end
function IsPedAPlayer(e) return pedOwner[e] ~= nil end
local _type, _owner, _exists = GetEntityType, NetworkGetEntityOwner, DoesEntityExist
function GetEntityType(e) if pedOwner[e] then return 1 end return _type(e) end
function NetworkGetEntityOwner(e) return pedOwner[e] or _owner(e) end
function DoesEntityExist(e) return pedOwner[e] ~= nil or _exists(e) end
function NetworkGetEntityFromNetworkId(n) return n end
local PED = function(id) return 1000 + id end

local nextId = 5000
local function entity(o)
  nextId = nextId + 1
  SIM.entities[nextId] = {
    type = o.type or 3, model = GetHashKey(o.model or 'prop_box_wood01a'), owner = o.owner, first = o.owner,
    pop = o.pop or 7, attachedTo = o.attachedTo or 0, script = o.script, coords = vector3(0, 0, 0),
  }
  return nextId
end
--- Creates an entity and runs entityCreating. Returns: entity id, was the creation cancelled.
local function spawn(o)
  local e = entity(o)
  return e, SIM.dispatch('entityCreating', '', e)
end

local function dets(from)
  local reqs, out = H.requests('/detections'), {}
  for i = (from or 0) + 1, #reqs do out[#out + 1] = reqs[i].body end
  return out, #reqs
end
local function count(list, t) local n = 0 for _, d in ipairs(list) do if d.type == t then n = n + 1 end end return n end
local function mark() local _, n = dets() return n end

-- ---------------------------------------------------------------------------
title('1. crash models')
local c0 = mark()
local _, cancelled = spawn({ type = 1, model = 'slod_human', owner = 1 })
check('a slod_human ped is never created', cancelled)
check('…and reported on the first try as CRASH_ATTEMPT', count(dets(c0), 'CRASH_ATTEMPT') == 1)
check('evidence names the model', dets(c0)[1] and dets(c0)[1].details.model == 'slod_human')
SIM.advance(25000)
c0 = mark()
_, cancelled = spawn({ type = 3, model = 'prop_fnclink_05crnr1', owner = 2 })
check('a crash prop is blocked', cancelled)
check('one crash prop alone is not reported (could be a mapping script)', #dets(c0) == 0)
_, cancelled = spawn({ type = 3, model = 'prop_fnclink_05crnr1', owner = 2 })
check('the second try within 10 s is reported', cancelled and count(dets(c0), 'CRASH_ATTEMPT') == 1)
_, cancelled = spawn({ type = 3, model = 'prop_ld_ferris_wheel', owner = 3 })
check('a giant troll prop (ferris wheel) is NOT touched by anti-crash (map scripts use it)', not cancelled)
_, cancelled = spawn({ type = 1, model = 'slod_human', owner = 3, script = 'my_housing' })
check('a Safe Script is never blocked', not cancelled)
_, cancelled = spawn({ type = 1, model = 'a_m_y_skater_01', owner = 3 })
check('a normal ped is created', not cancelled)

-- ---------------------------------------------------------------------------
title('2. entity flood')
SIM.advance(25000)
c0 = mark()
local blocked = 0
for _ = 1, 60 do local _, c = spawn({ owner = 1 }) if c then blocked = blocked + 1 end SIM.advance(20, 10) end
check('60 script props in ~1.2 s pass (a housing interior)', blocked == 0, blocked)
local _, c61 = spawn({ owner = 1 })
check('the 61st inside the window is blocked', c61)
local more = 0
for _ = 1, 10 do local _, c = spawn({ owner = 1 }) if c then more = more + 1 end end
check('everything for the next 5 s is blocked', more == 10, more)
check('ENTITY_FLOOD reported exactly once', count(dets(c0), 'ENTITY_FLOOD') == 1, #dets(c0))
local _, other = spawn({ owner = 2 })
check('another player is not affected', not other)
local amb = 0
for _ = 1, 80 do local _, c = spawn({ owner = 4, pop = 5 }) if c then amb = amb + 1 end end
check('ambient traffic / peds (population type 5) never count', amb == 0, amb)
local safe = 0
for _ = 1, 100 do local _, c = spawn({ owner = 4, script = 'my_housing' }) if c then safe = safe + 1 end end
check('a Safe Script can spawn 100 at once', safe == 0, safe)
SIM.advance(6000)
local _, after = spawn({ owner = 1 })
check('the block lifts after 5 s', not after)

-- ---------------------------------------------------------------------------
title('3. particles and projectiles')
SIM.advance(25000)
c0 = mark()
local big = SIM.dispatch('ptFxEvent', '', '2', { effectHash = 1, assetHash = 2, scale = 80.0 })
check('a particle at scale 80 is dropped', big)
check('…and reported as CRASH_ATTEMPT', count(dets(c0), 'CRASH_ATTEMPT') == 1)
local normal = SIM.dispatch('ptFxEvent', '', '3', { effectHash = 1, assetHash = 2, scale = 2.0 })
check('a normal particle passes', not normal)
local ptBlocked = 0
for k = 1, 30 do if SIM.dispatch('ptFxEvent', '', '4', { effectHash = k, assetHash = 2, scale = 1.0 }) then ptBlocked = ptBlocked + 1 end end
check('30 particles at once: everything after 25 is blocked', ptBlocked == 5, ptBlocked)
check('…ENTITY_FLOOD once', count(dets(c0), 'ENTITY_FLOOD') == 1)
SIM.advance(25000)
c0 = mark()
local prBlocked = 0
for _ = 1, 24 do if SIM.dispatch('startProjectileEvent', '', '1', { weaponHash = 5 }) then prBlocked = prBlocked + 1 end SIM.advance(100) end
check('24 rockets in 2.4 s pass', prBlocked == 0, prBlocked)
for _ = 1, 4 do if SIM.dispatch('startProjectileEvent', '', '1', { weaponHash = 5 }) then prBlocked = prBlocked + 1 end end
check('the burst beyond 25 is blocked and reported once', prBlocked >= 3 and count(dets(c0), 'ENTITY_FLOOD') == 1, prBlocked)

-- ---------------------------------------------------------------------------
title('4. crash events')
SIM.advance(25000)
c0 = mark()
local t6 = 0
for _ = 1, 6 do if SIM.dispatch('givePedScriptedTaskEvent', '', '1', { entityNetId = PED(2), taskId = 1 }) then t6 = t6 + 1 end SIM.advance(500) end
check('6 scripted tasks on another player in 10 s pass (police / tackle scripts)', t6 == 0, t6)
local t7 = SIM.dispatch('givePedScriptedTaskEvent', '', '1', { entityNetId = PED(2), taskId = 1 })
check('the 7th is blocked and reported', t7 and count(dets(c0), 'ENTITY_FLOOD') == 1)
local own = 0
for _ = 1, 20 do if SIM.dispatch('givePedScriptedTaskEvent', '', '3', { entityNetId = PED(3), taskId = 1 }) then own = own + 1 end end
check('tasks on your own ped never count', own == 0)
local npc = entity({ type = 1, owner = 4, model = 'a_m_y_skater_01' })
local npcBlocked = 0
for _ = 1, 20 do if SIM.dispatch('givePedScriptedTaskEvent', '', '3', { entityNetId = npc, taskId = 1 }) then npcBlocked = npcBlocked + 1 end end
check('tasks on NPCs never count', npcBlocked == 0)
SIM.advance(25000)
c0 = mark()
check('a phone explosion request is blocked', SIM.dispatch('requestPhoneExplosionEvent', '', '2', {}))
check('…and reported as CRASH_ATTEMPT', count(dets(c0), 'CRASH_ATTEMPT') == 1)
local kv = 0
for _ = 1, 3 do if SIM.dispatch('kickVotesEvent', '', '3', {}) then kv = kv + 1 end end
check('kick votes are blocked', kv == 3)
check('…reported once as EVENT_EXPLOIT', count(dets(c0), 'EVENT_EXPLOIT') == 1)

-- ---------------------------------------------------------------------------
title('5. attaching things to other players')
SIM.advance(25000)
c0 = mark()
local car = entity({ type = 2, owner = 1, model = 'adder', attachedTo = PED(2) })
local myPhone = entity({ type = 3, owner = 3, model = 'prop_npc_phone_02', attachedTo = PED(3) })
local myBike = entity({ type = 2, owner = 3, model = 'bmx', attachedTo = PED(3) })
local npcOnHead = entity({ type = 1, owner = 1, model = 'a_m_y_skater_01', attachedTo = PED(4) })
local twoProps = { entity({ type = 3, owner = 2, attachedTo = PED(1) }), entity({ type = 3, owner = 2, attachedTo = PED(1) }) }
local safeCar = entity({ type = 2, owner = 4, model = 'adder', attachedTo = PED(1), script = 'my_housing' })
SIM.advance(2500)
check('a car stuck on another player is deleted', SIM.entities[car] == nil)
check('an NPC stuck on another player is deleted', SIM.entities[npcOnHead] == nil)
check('…both reported as CRASH_ATTEMPT', count(dets(c0), 'CRASH_ATTEMPT') >= 1)
check('your own phone and bike are untouched', SIM.entities[myPhone] ~= nil and SIM.entities[myBike] ~= nil)
check('two props on someone else are tolerated', SIM.entities[twoProps[1]] ~= nil and SIM.entities[twoProps[2]] ~= nil)
check('a Safe Script\'s vehicle is untouched', SIM.entities[safeCar] ~= nil)
-- carrying a player: player 2's ped attached to player 1's ped (carry / drag scripts)
SIM.advance(25000)
c0 = mark()
local three = entity({ type = 3, owner = 2, attachedTo = PED(1) })
SIM.advance(2500)
check('a third prop on the same player removes all three', SIM.entities[three] == nil and SIM.entities[twoProps[1]] == nil)
check('…reported once as ENTITY_FLOOD', count(dets(c0), 'ENTITY_FLOOD') == 1)

-- ---------------------------------------------------------------------------
title('6. a chat/3dme crash message is a CRASH_ATTEMPT now (it used to be an unknown type)')
SIM.advance(25000)
c0 = mark()
SIM.net('3dme:shareDisplay', 4, '<img src="x" onerror="1">')
SIM.advance(500)
check('reported as CRASH_ATTEMPT', count(dets(c0), 'CRASH_ATTEMPT') == 1, dets(c0)[1] and dets(c0)[1].type)

-- ---------------------------------------------------------------------------
title('7. every part can be switched off in the panel')
SIM.advance(25000)
H.pushConfig({}, { rules = { anti_crash_models = false, anti_crash_attach = false, anti_crash_flood = false, anti_crash_events = false } })
c0 = mark()
local _, slod = spawn({ type = 1, model = 'slod_human', owner = 1 })
check('crash models off: not blocked by anti-crash', not slod)
local fl = 0
for _ = 1, 70 do local _, c = spawn({ owner = 2 }) if c then fl = fl + 1 end end
check('flood shield off: nothing blocked', fl == 0)
check('events off: phone explosion passes', not SIM.dispatch('requestPhoneExplosionEvent', '', '2', {}))
local car2 = entity({ type = 2, owner = 1, model = 'adder', attachedTo = PED(2) })
SIM.advance(2500)
check('attach guard off: nothing deleted', SIM.entities[car2] ~= nil)
check('no anti-crash reports at all', count(dets(c0), 'CRASH_ATTEMPT') == 0 and count(dets(c0), 'ENTITY_FLOOD') == 0)

H.summary()
