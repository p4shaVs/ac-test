local rawout = SIM.out
local function title(s) rawout(''); rawout('=== ' .. s) end
local function ser(t)
  if type(t) ~= 'table' then return tostring(t) end
  local keys = {}
  for k in pairs(t) do keys[#keys + 1] = tostring(k) end
  table.sort(keys)
  local parts = {}
  for _, k in ipairs(keys) do
    local v = t[k]; if v == nil then v = t[tonumber(k)] end
    if type(v) ~= 'table' then parts[#parts + 1] = k .. '=' .. tostring(v) end
  end
  return '{' .. table.concat(parts, ',') .. '}'
end

local detections = {}
SIM.api['/heartbeat'] = function() return true, { config = { rules = { anti_out_of_bounds = true, anti_vehicle_speed = true }, ac = {} } } end
SIM.api['/blacklist'] = function()
  return true, { blacklist = {
    { kind = 'vehicle', model = '3078201489', label = 'Adder', action = 'REMOVE' },   -- unsigned (panel picker)
    { kind = 'vehicle', model = 'zentorno', label = 'Zentorno', action = 'KICK' },    -- by name
    { kind = 'weapon', model = '2982836145', label = 'RPG', action = 'BAN' },
  } }
end
SIM.api['/whitelist'] = function() return true, { whitelist = {} } end
SIM.api['/admins'] = function() return true, { admins = {} } end
SIM.api['/detections'] = function(body)
  detections[#detections + 1] = body
  rawout(('DETECTION %-18s origin=%-6s bypass=%-5s requested=%-6s %s'):format(
    body.type, tostring(body.origin), tostring(body.bypass), tostring(body.requestedAction), ser(body.details)))
  return true, { action = 'LOG' }
end

local P = { name = 'p4sha', ped = 101, coords = vector3(200, -800, 30), vel = vector3(0, 0, 0), veh = 0, weapon = 0,
            ids = { 'license:abc', 'discord:1' }, ace = false }
SIM.players[1] = P

-- Motion helper: each 50 ms tick applies P.speed (m/s, along +x) and optional vertical speed.
P.move = vector3(0, 0, 0)
P.reportVel = true
SIM.onTick = function(step)
  local dt = step / 1000
  P.coords = P.coords + P.move * dt
  if P.reportVel then P.vel = P.move else P.vel = vector3(0, 0, 0) end
end
local function mark(n) return #detections end
local function newSince(n) local t = {} for i = n + 1, #detections do t[#t + 1] = detections[i].type .. (detections[i].bypass and ('/' .. detections[i].bypass) or '') end return table.concat(t, ', ') end

title('boot + player joins')
SIM.advance(3000)
SIM.net('coreac:inGame', 1)            -- client spawn gate opened
SIM.advance(40000)                      -- settle (15 s inGame + 20 s anchor)
rawout('detections so far: ' .. #detections)

title('1. blacklisted Adder spawned by client (signed hash from GetEntityModel)')
SIM.entities[5001] = { model = GetHashKey('adder'), type = 2, owner = 1 }
local canceled = SIM.dispatch('entityCreating', '', 5001)
rawout('entityCreating canceled = ' .. tostring(canceled))

title('1b. same model reported UNSIGNED by the server native')
SIM.advance(21000)  -- past the 20 s per-type report gate
SIM.entities[5002] = { model = 3078201489, type = 2, owner = 1 }
rawout('entityCreating canceled = ' .. tostring(SIM.dispatch('entityCreating', '', 5002)))

title('1c. Zentorno (blacklisted by NAME, action KICK)')
SIM.advance(21000)
SIM.entities[5003] = { model = GetHashKey('zentorno'), type = 2, owner = 1 }
rawout('entityCreating canceled = ' .. tostring(SIM.dispatch('entityCreating', '', 5003)))

title('1d. server-script spawned Adder (entityCreated, no owner)')
SIM.entities[5004] = { model = GetHashKey('adder'), type = 2, owner = -1 }
SIM.dispatch('entityCreated', '', 5004)
rawout('entity still exists = ' .. tostring(SIM.entities[5004] ~= nil))

title('1e. non-blacklisted vehicle (sultan)')
SIM.entities[5005] = { model = GetHashKey('sultan'), type = 2, owner = 1 }
rawout('entityCreating canceled = ' .. tostring(SIM.dispatch('entityCreating', '', 5005)))

title('2. holding a blacklisted RPG')
SIM.advance(21000)
P.weapon = GetHashKey('weapon_rpg')
SIM.advance(2000)
rawout('weapon now = ' .. tostring(P.weapon))

title('3. single teleport 600 m, then standing still')
SIM.advance(25000)
local n = mark()
P.coords = P.coords + vector3(600, 0, 0)
SIM.advance(4000)
rawout('new: ' .. newSince(n))

title('4. slow noclip flight 20 m/s with zero physics velocity (5 s)')
SIM.advance(30000)
n = mark()
P.reportVel = false; P.move = vector3(20, 0, 0)
SIM.advance(5000)
P.move = vector3(0, 0, 0); P.reportVel = true
SIM.advance(3000)
rawout('new: ' .. newSince(n))

title('5. fast noclip 120 m/s (starts like a teleport)')
SIM.advance(30000)
n = mark()
P.reportVel = false; P.move = vector3(120, 0, 0)
SIM.advance(5000)
P.move = vector3(0, 0, 0); P.reportVel = true
SIM.advance(3000)
rawout('new: ' .. newSince(n))

title('6. legit sprint 7 m/s (velocity matches) for 10 s')
SIM.advance(30000)
n = mark()
P.move = vector3(7, 0, 0)
SIM.advance(10000)
P.move = vector3(0, 0, 0)
SIM.advance(2000)
rawout('new: ' .. (newSince(n) ~= '' and newSince(n) or '(none)'))

title('7. legit freefall 55 m/s down (velocity matches) for 6 s')
SIM.advance(5000)
n = mark()
P.coords = P.coords + vector3(0, 0, 900)   -- pretend plane (grant so the altitude change is not a tp)
CAC.grantTp(1, 3000)
SIM.advance(4000)
P.move = vector3(0, 0, -55)
SIM.advance(6000)
P.move = vector3(0, 0, 0)
SIM.advance(2000)
rawout('new: ' .. (newSince(n) ~= '' and newSince(n) or '(none)'))

title('8. screen-fade hint (tpHint) then teleport → not reported')
SIM.advance(30000)
n = mark()
SIM.net('coreac:tpHint', 1)
SIM.advance(500)
P.coords = P.coords + vector3(0, 900, 0)
SIM.advance(4000)
rawout('new: ' .. (newSince(n) ~= '' and newSince(n) or '(none)'))

title('9. staff (ACE command) teleports → logged as staff, never punished')
SIM.advance(30000)
P.ace = true
TriggerEvent('txAdmin:events:adminAuth', { netid = -1, isAdmin = false })  -- flush staff cache
n = mark()
P.coords = P.coords + vector3(-700, 0, 0)
SIM.advance(4000)
rawout('new: ' .. newSince(n))

title('10. txAdmin noclip mode (server-verified) → flight not reported at all')
SIM.advance(30000)
n = mark()
TriggerEvent('txsv:logger:menuEvent', 1, 'playerModeChanged', true, 'noclip')
P.reportVel = false; P.move = vector3(30, 0, 0)
SIM.advance(6000)
P.move = vector3(0, 0, 0); P.reportVel = true
TriggerEvent('txsv:logger:menuEvent', 1, 'playerModeChanged', true, 'none')
P.coords = P.coords + vector3(0, 300, 0)   -- freecam exit teleports ped to camera
SIM.advance(4000)
rawout('new: ' .. (newSince(n) ~= '' and newSince(n) or '(none)'))

title('11. a CLIENT cannot fake txAdmin / staff signals')
P.ace = false
TriggerEvent('txAdmin:events:adminAuth', { netid = -1, isAdmin = false })
SIM.net('txsv:logger:menuEvent', 1, 1, 'playerModeChanged', true, 'noclip')
SIM.net('txAdmin:events:adminAuth', 1, { netid = 1, isAdmin = true })
SIM.advance(21000)
n = mark()
SIM.net('coreac:report', 1, 'NOCLIP', 'HIGH', { reason = 'x', bypass = 'staff', __action = 'LOG' })
SIM.advance(200)
rawout('new: ' .. newSince(n) .. '   (client-sent bypass must be stripped)')

title('12. qb-adminmenu bring: non-staff sender ignored, staff sender grants target')
local T = { name = 'target', ped = 202, coords = vector3(-1000, -1000, 30), vel = vector3(0, 0, 0), veh = 0, weapon = 0, ids = { 'license:t' }, ace = false }
SIM.players[2] = T
SIM.net('coreac:inGame', 2)
SIM.advance(40000)
n = mark()
SIM.net('qb-admin:server:bring', 1, { id = 2 })     -- p4sha is NOT staff now
T.coords = T.coords + vector3(500, 0, 0)
SIM.advance(4000)
rawout('non-staff bring → ' .. (newSince(n) ~= '' and newSince(n) or '(none)'))
SIM.advance(30000)
P.ace = true
TriggerEvent('txAdmin:events:adminAuth', { netid = -1, isAdmin = false })
n = mark()
SIM.net('qb-admin:server:bring', 1, { id = 2 })
T.coords = T.coords + vector3(500, 0, 0)
SIM.advance(4000)
rawout('staff bring → ' .. (newSince(n) ~= '' and newSince(n) or '(none)'))

title('13. tpHint budget: a spammer gets at most 8 graces per minute')
local granted = 0
for i = 1, 12 do SIM.net('coreac:tpHint', 2); SIM.advance(5100) end
rawout('(see WARN logs in CAC log buffer)')

rawout('')
rawout('ERRORS: ' .. #SIM.errors)
for _, e in ipairs(SIM.errors) do rawout('  ' .. e) end

SIM.advance(12000)
local refused = 0
for _, r in ipairs(SIM.requests) do
  if r.path == '/logs' and type(r.body) == 'table' then
    for _, l in ipairs(r.body.logs or {}) do
      if tostring(l.message):find('grace refused', 1, true) then refused = refused + 1 end
    end
  end
end
rawout('grace refusals logged: ' .. refused .. ' (expected 4 of 12 hints within the minute window)')
