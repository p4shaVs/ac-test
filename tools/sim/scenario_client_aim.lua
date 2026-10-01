-- Client side of the silent-aim check: what client/aimsync.lua sends with each shot.
--   CLIENT=1 CLIENT_FILES=client/aimsync.lua node tools/sim/run.cjs scenario_client_aim.lua
local passed, failed = 0, 0
local function check(name, cond, detail)
  if cond then passed = passed + 1; SIM.out('ok    ' .. name)
  else failed = failed + 1; SIM.out('FAIL  ' .. name .. (detail ~= nil and ('   -> ' .. tostring(detail)) or '')) end
end
local function title(s) SIM.out(''); SIM.out('=== ' .. s) end

local samples = {}
SIM.onServerEvent = function(name, ...)
  if name == 'coreac:aim' then samples[#samples + 1] = { ... } end
end

-- the world the client sees
local weapon = GetHashKey('weapon_pistol')
local cam = { pos = vector3(10, 20, 31), rot = vector3(5.0, 0.0, 90.0) }
local inVehicle, kbm, cover = false, true, false
function GetSelectedPedWeapon() return weapon end
function GetWeapontypeGroup() return 0 end
function IsPedInAnyVehicle() return inVehicle end
function GetFinalRenderedCamRot() return cam.rot end
function GetFinalRenderedCamCoord() return cam.pos end
function IsUsingKeyboardAndMouse() return kbm end
function IsPedInCover() return cover end

local C = SIM.C or C
local function shoot(ms)
  C.shooting = true
  SIM.advance(ms or 100, 10)
  C.shooting = false
  SIM.advance(250, 10)
end

SIM.advance(1000)

title('1. mouse + keyboard, in the open: flags = 0, the camera position and a unit direction go along')
shoot(100)
local s = samples[#samples]
check('a sample is sent for a firearm on foot', s ~= nil and #samples >= 1)
check('camera position is the rendered camera', s and s[1] == 10 and s[2] == 20 and s[3] == 31)
local len = s and math.sqrt(s[4] * s[4] + s[5] * s[5] + s[6] * s[6]) or 0
check('direction is a unit vector (the server rejects anything else)', math.abs(len - 1) < 1e-6, len)
check('flags = 0', s and s[7] == 0, s and s[7])

title('2. gamepad: bit 0 (aim assist gets a wider margin on the server)')
kbm = false
local n = #samples
shoot(100)
check('flags = 1', samples[#samples] and #samples > n and samples[#samples][7] == 1, samples[#samples] and samples[#samples][7])

title('3. in cover: bit 1 (blind fire is not measured by the subtle tier)')
kbm, cover = true, true
n = #samples
shoot(100)
check('flags = 2', #samples > n and samples[#samples][7] == 2, samples[#samples] and samples[#samples][7])
kbm, cover = false, true
n = #samples
shoot(100)
check('gamepad in cover: flags = 3', #samples > n and samples[#samples][7] == 3)
kbm, cover = true, false

title('4. nothing is sent when the shot says nothing about the aim')
n = #samples
inVehicle = true
shoot(100)
check('in a vehicle: no sample', #samples == n)
inVehicle = false
weapon = GetHashKey('weapon_rpg')
shoot(100)
check('rocket launcher (explosive, not hitscan): no sample', #samples == n)
weapon = GetHashKey('weapon_stickybomb')
shoot(100)
check('sticky bomb (thrown): no sample', #samples == n)
weapon = GetHashKey('weapon_pistol')
SIM.advance(1000, 10)
check('not shooting: no sample', #samples == n)

title('5. throttle: at most one sample per 80 ms while holding the trigger')
n = #samples
C.shooting = true
SIM.advance(1000, 10)
C.shooting = false
local sent = #samples - n
check('about 12 per second at most (got ' .. sent .. ')', sent >= 8 and sent <= 13, sent)

SIM.out('')
SIM.out(('%d/%d checks passed%s   handler errors: %d'):format(passed, passed + failed, failed > 0 and ('  —  ' .. failed .. ' FAILED') or '', #SIM.errors))
for _, e in ipairs(SIM.errors) do SIM.out('   !! ' .. e) end
if __exit then __exit((failed > 0 or #SIM.errors > 0) and 1 or 0) end
