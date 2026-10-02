local out = SIM.out
local function title(s) out(''); out('=== ' .. s) end
local dets = {}
local function ser(t) local k = {} for a, b in pairs(t or {}) do if type(b) ~= 'table' then k[#k + 1] = a .. '=' .. tostring(b) end end table.sort(k) return table.concat(k, ',') end
SIM.api['/heartbeat'] = function() return true, { config = {
  rules = { anti_explosion_spam = true },
  protectedEvents = { 'myexploit:giveMoney', 'qb-core:server:fake', 'coreac:report' },
  ac = { Entities = { AntiThrowVehicles = true, EnableVehiclesLimiter = true }, Main = { AntiVoiceExploits = true } },
} } end
SIM.api['/blacklist'] = function() return true, { blacklist = {
  { kind = 'object', model = tostring(GetHashKey('prop_asteroid_01') + 4294967296), label = 'Asteroid', action = 'REMOVE' },
} } end
SIM.api['/detections'] = function(b)
  dets[#dets + 1] = b
  out(('DETECTION %-22s origin=%-6s requested=%-6s bypass=%-5s %s'):format(b.type, b.origin, tostring(b.requestedAction), tostring(b.bypass), ser(b.details)))
  return true, { action = 'LOG' }
end
SIM.resources['qb-core'] = 'started'

local P = { name = 'cheater', ped = 101, coords = vector3(100, 100, 30), vel = vector3(0, 0, 0), veh = 0, weapon = 0, ids = { 'license:c' } }
local V = { name = 'victim', ped = 102, coords = vector3(300, 100, 30), vel = vector3(0, 0, 0), veh = 0, weapon = 0, ids = { 'license:v' } }
SIM.players[1], SIM.players[2] = P, V
local mv = vector3(0, 0, 0); local realVel = true
SIM.onTick = function(step)
  P.coords = P.coords + mv * (step / 1000); P.vel = realVel and mv or vector3(0, 0, 0)
  for _, e in pairs(SIM.entities) do if e.vel and e.coords then e.coords = e.coords + e.vel * (step / 1000) end end
end

SIM.advance(3000); SIM.net('coreac:inGame', 1); SIM.net('coreac:inGame', 2); SIM.advance(40000)

title('A. cheater launches 2 spawned cars at the victim (130 m/s, driverless)')
local n = #dets
SIM.entities[7001] = { type = 2, model = GetHashKey('sultan'), owner = 1, first = 1, coords = vector3(110, 100, 31), vel = vector3(130, 0, 5) }
SIM.advance(1200)
out('car 1 exists: ' .. tostring(SIM.entities[7001] ~= nil))
SIM.entities[7002] = { type = 2, model = GetHashKey('sultan'), owner = 1, first = 1, coords = vector3(110, 100, 31), vel = vector3(90, 0, 0) }
SIM.advance(1500)
out('car 2 exists: ' .. tostring(SIM.entities[7002] ~= nil) .. '   new detections: ' .. (#dets - n))

title('B. legit: player bails out of a 300 km/h car (driver left 2 s ago)')
n = #dets
SIM.entities[7003] = { type = 2, model = GetHashKey('t20'), owner = 2, first = 2, driver = 102, coords = vector3(0, 0, 30), vel = vector3(83, 0, 0) }
SIM.advance(1000)
SIM.entities[7003].driver = nil
SIM.advance(2000)
SIM.entities[7003].vel = vector3(30, 0, 0)
SIM.advance(2000)
out('bailed car exists: ' .. tostring(SIM.entities[7003] ~= nil) .. '   new detections: ' .. (#dets - n))

title('C. legit: car falls off a cliff at 80 m/s (descending) / towed trailer at 75 m/s')
SIM.entities[7004] = { type = 2, owner = 2, first = 2, coords = vector3(0, 50, 500), vel = vector3(10, 0, -80) }
SIM.entities[7005] = { type = 2, vtype = 'trailer', owner = 2, first = 2, coords = vector3(0, 90, 30), vel = vector3(75, 0, 0) }
SIM.advance(2000)
out('falling car exists: ' .. tostring(SIM.entities[7004] ~= nil) .. ', trailer exists: ' .. tostring(SIM.entities[7005] ~= nil))
SIM.entities[7004], SIM.entities[7005], SIM.entities[7003] = nil, nil, nil

title('D. car rain: 1 script vehicle every 400 ms for 25 s (never trips the 5 s limiter)')
n = #dets
local canceled = 0
for i = 1, 60 do
  local id = 8000 + i
  SIM.entities[id] = { type = 2, model = GetHashKey('sultan'), pop = 7, owner = 1, first = 1, coords = vector3(300, 100, 80), vel = vector3(0, 0, -20) }
  if SIM.dispatch('entityCreating', '', id) then canceled = canceled + 1; SIM.entities[id] = nil end
  SIM.advance(400)
end
out('canceled spawns: ' .. canceled .. ' of 60   new detections: ' .. (#dets - n))
for id in pairs(SIM.entities) do if id > 8000 then SIM.entities[id] = nil end end

title('E. interact-sound: legit lock sound, then earrape and whole-server spam')
n = #dets
SIM.net('InteractSound_SV:PlayWithinDistance', 2, 5.0, 'lock', 0.4)
SIM.net('InteractSound_SV:PlayOnAll', 2, 'alarm', 0.5)
SIM.advance(100)
out('legit (victim) new detections: ' .. (#dets - n))
SIM.net('InteractSound_SV:PlayWithinDistance', 1, 5000.0, 'demo', 1.0)
SIM.advance(100)
out('after 5 km radius: ' .. (#dets - n))

title('F. honeypots: builtin ESX bait on a QB server, custom protected event, prefix of an installed resource')
n = #dets
SIM.advance(21000)
SIM.net('esx_truckerjob:pay', 1, 99999)
SIM.net('myexploit:giveMoney', 1)
SIM.net('qb-core:server:fake', 1)
SIM.advance(200)
out('new detections: ' .. (#dets - n) .. '  (expected 1: the first bait; second is gated 20 s per type)')

title('G. blacklist escalation: 3 asteroid spawns in 60 s (action REMOVE)')
n = #dets
for i = 1, 3 do
  SIM.entities[9000 + i] = { type = 3, model = GetHashKey('prop_asteroid_01'), owner = 1, coords = vector3(300, 100, 30) }
  out('spawn ' .. i .. ' canceled=' .. tostring(SIM.dispatch('entityCreating', '', 9000 + i)))
  SIM.advance(5000)
end
out('new detections: ' .. (#dets - n))

title('H. server NOCLIP needs 4 s: 3 s flight → nothing, 6 s flight → NOCLIP')
SIM.advance(25000)
n = #dets
realVel = false; mv = vector3(20, 0, 0); SIM.advance(3000); mv = vector3(0, 0, 0); realVel = true; SIM.advance(3000)
out('3 s flight: ' .. (#dets - n))
SIM.advance(25000)
realVel = false; mv = vector3(20, 0, 0); SIM.advance(6000); mv = vector3(0, 0, 0); realVel = true; SIM.advance(3000)
out('6 s flight total new: ' .. (#dets - n))

title('I. train surfer: on top of a moving train at 25 m/s for 8 s')
SIM.advance(25000)
n = #dets
SIM.entities[9500] = { type = 2, vtype = 'train', driver = 999, owner = -1, coords = P.coords - vector3(0, 0, 3), vel = vector3(25, 0, 0) }
realVel = false; mv = vector3(25, 0, 0); SIM.advance(8000); mv = vector3(0, 0, 0); realVel = true
SIM.entities[9500] = nil
SIM.advance(3000)
out('train surfer detections: ' .. (#dets - n))

out('')
out('ERRORS: ' .. #SIM.errors)
for _, e in ipairs(SIM.errors) do out('  ' .. e) end
