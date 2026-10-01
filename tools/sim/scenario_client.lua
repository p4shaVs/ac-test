local out = SIM.out
local function title(s) out(''); out('=== ' .. s) end

local reports = {}
SIM.onServerEvent = function(name, a, b, c)
  if name == 'coreac:report' then
    local d = c or {}
    local extra = {}
    for k, v in pairs(d) do if type(v) ~= 'table' then extra[#extra + 1] = k .. '=' .. tostring(v) end end
    table.sort(extra)
    reports[#reports + 1] = a
    out(('REPORT %-10s %s'):format(tostring(a), table.concat(extra, ',')))
  elseif name == 'coreac:tpHint' or name == 'coreac:inGame' then
    out('server event: ' .. name)
  end
end

C.move = vector3(0, 0, 0)
C.reportVel = true
SIM.onTick = function(step)
  local dt = step / 1000
  C.coords = C.coords + C.move * dt
  if C.reportVel then C.vel = C.move else C.vel = vector3(0, 0, 0) end
  if C.firing then C.shooting = not C.shooting end   -- pulse IsPedShooting
end
local function mark() return #reports end
local function since(n) local t = {} for i = n + 1, #reports do t[#t + 1] = reports[i] end return #t > 0 and table.concat(t, ', ') or '(none)' end

title('boot → spawn gate')
SIM.advance(35000)
out('CoreAC.playerSpawned = ' .. tostring(CoreAC.playerSpawned))

title('A. invincible flag set by some script, player idle for 60 s (the "out of nowhere" case)')
local n = mark()
C.invincible = true
SIM.advance(60000)
out('reports: ' .. since(n))

title('B. same flag + player is shooting for 15 s (godmode abuse in a fight)')
n = mark()
C.armed = true; C.firing = true
SIM.advance(15000)
C.firing = false; C.shooting = false
out('reports: ' .. since(n))

title('C. downed (qb laststand state) + invincible + shooting')
SIM.advance(20000)
n = mark()
LocalPlayer.state.inLaststand = true
C.firing = true
SIM.advance(20000)
C.firing = false; C.shooting = false; LocalPlayer.state.inLaststand = nil
C.invincible = false; C.armed = false
out('reports: ' .. since(n))

title('D. noclip flight 15 m/s, zero physics velocity, 4 s')
SIM.advance(20000)
n = mark()
C.reportVel = false; C.move = vector3(15, 0, 0)
SIM.advance(4000)
C.move = vector3(0, 0, 0); C.reportVel = true
SIM.advance(3000)
out('reports: ' .. since(n))

title('E. fast noclip 120 m/s (1 s samples look like teleports)')
SIM.advance(20000)
n = mark()
C.reportVel = false; C.move = vector3(120, 0, 0)
SIM.advance(4000)
C.move = vector3(0, 0, 0); C.reportVel = true
SIM.advance(3000)
out('reports: ' .. since(n))

title('F. single cheat teleport 600 m')
SIM.advance(20000)
n = mark()
C.coords = C.coords + vector3(600, 0, 0)
SIM.advance(4000)
out('reports: ' .. since(n))

title('G. legit script teleport behind a screen fade (apartment/elevator/hospital)')
SIM.advance(20000)
n = mark()
C.faded = true
SIM.advance(800)
C.coords = C.coords + vector3(0, 800, -40)
SIM.advance(1500)
C.faded = false
SIM.advance(5000)
out('reports: ' .. since(n))

title('H. running 7 m/s (velocity matches) for 10 s')
SIM.advance(5000)
n = mark()
C.move = vector3(7, 0, 0)
SIM.advance(10000)
C.move = vector3(0, 0, 0)
SIM.advance(2000)
out('reports: ' .. since(n))

title('I. txAdmin noclip mode (txcl:setPlayerMode) + flight')
SIM.advance(20000)
n = mark()
TriggerEvent('txcl:setPlayerMode', 'noclip')
C.reportVel = false; C.move = vector3(25, 0, 0)
SIM.advance(5000)
C.move = vector3(0, 0, 0); C.reportVel = true
TriggerEvent('txcl:setPlayerMode', 'none')
SIM.advance(3000)
out('reports: ' .. since(n))

title('J. QBCore /tp (QBCore:Command:TeleportToCoords) → marked legit')
SIM.advance(20000)
n = mark()
TriggerEvent('QBCore:Command:TeleportToCoords', 1, 2, 3)
C.coords = C.coords + vector3(-900, 0, 0)
SIM.advance(4000)
out('reports: ' .. since(n))

out('')
out('ERRORS: ' .. #SIM.errors)
local seen = {}
for _, e in ipairs(SIM.errors) do if not seen[e] then seen[e] = true; out('  ' .. e) end end
