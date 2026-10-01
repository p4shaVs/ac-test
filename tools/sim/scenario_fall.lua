local out = SIM.out
SIM.api['/heartbeat'] = function() return true, { config = { rules = {}, ac = {} } } end
SIM.api['/detections'] = function(b) out('DETECTION ' .. b.type) return true, { action = 'LOG' } end
local P = { name = 'p', ped = 101, coords = vector3(0, 0, 900), vel = vector3(0, 0, 0), veh = 0, weapon = 0, ids = { 'license:x' } }
SIM.players[1] = P
P.move = vector3(0, 0, 0)
SIM.onTick = function(step) P.coords = P.coords + P.move * (step / 1000) end   -- velocity NOT synced (stays 0)
SIM.advance(2000); SIM.net('coreac:inGame', 1); SIM.advance(40000)
out('freefall 55 m/s down for 12 s with server velocity 0:')
P.move = vector3(3, 0, -55); SIM.advance(12000); P.move = vector3(0, 0, 0); SIM.advance(3000)
out('done, errors=' .. #SIM.errors)
