local out = SIM.out
local function title(s) out(''); out('=== ' .. s) end
local reports = {}
SIM.onServerEvent = function(name, a, b, c)
  if name == 'coreac:report' then
    local k = {} for x, y in pairs(c or {}) do if type(y) ~= 'table' then k[#k + 1] = x .. '=' .. tostring(y) end end table.sort(k)
    reports[#reports + 1] = a; out(('REPORT %-18s %s'):format(a, table.concat(k, ',')))
  end
end
C.cam = -1; C.camPos = C.coords; C.voice = 3.0
function GetRenderingCam() return C.cam end
function GetFinalRenderedCamCoord() return C.camPos end
function MumbleGetTalkerProximity() return C.voice end
function NetworkGetTalkerProximity() return C.voice end
C.ammo, C.clip, C.weapon = 100, 30, GetHashKey('weapon_pistol')
function GetAmmoInPedWeapon() return C.ammo end
function GetAmmoInClip() return true, C.clip end
function GetCurrentPedWeapon() return true, C.weapon end
function GetWeaponDamageType() return 3 end
function IsPlayerFreeAiming() return true end
function GetMaxAmmo() return true, 250 end
function GetWeaponRecoilShakeAmplitude() return 1.0 end
local function since(n) local t = {} for i = n + 1, #reports do t[#t + 1] = reports[i] end return #t > 0 and table.concat(t, ', ') or '(none)' end
CoreAC.Config.Main.AntiFreeCam = true; CoreAC.Config.Weapons.AntiInfiniteAmmo = true
SIM.advance(35000)
out('spawned=' .. tostring(CoreAC.playerSpawned))

title('1. character creator style cam: 3 m from ped, NUI focus → none')
local n = #reports
C.cam = 5; C.camPos = C.coords + vector3(3, 0, 1)
function IsNuiFocused() return true end
SIM.advance(12000)
out('reports: ' .. since(n))

title('2. script cam 20 m away (garage/showroom), controls on → none')
function IsNuiFocused() return false end
C.camPos = C.coords + vector3(20, 0, 5)
SIM.advance(12000)
out('reports: ' .. since(n))

title('3. menu freecam: script cam 200 m away, control on, no UI → FREECAM')
n = #reports
C.camPos = C.coords + vector3(200, 0, 40)
SIM.advance(12000)
out('reports: ' .. since(n))

title('4. same cam but player control off (cutscene-like) → none')
SIM.advance(16000)
n = #reports
C.control = false
SIM.advance(12000)
C.control = true; C.cam = -1; C.camPos = C.coords
out('reports: ' .. since(n))

title('5. ammo: two shots, ammo decreases → none; single glitch → none; sustained infinite → INFINITE_AMMO')
n = #reports
C.armed = true
local function shot() TriggerEvent('CEventGunShot', { 1 }, 1) end
shot(); SIM.advance(200); C.ammo = C.ammo - 1; C.clip = C.clip - 1; shot(); SIM.advance(200)
out('normal: ' .. since(n))
SIM.advance(12000)
shot(); SIM.advance(200); shot(); SIM.advance(12000)   -- one glitch (no decrease), then nothing for 12 s
out('one glitch: ' .. since(n))
for i = 1, 6 do shot(); SIM.advance(150) end
out('sustained: ' .. since(n))

title('6. voice range 30 m (megaphone) → none; 5000 m → VOICE_EXPLOIT after 2 checks')
C.armed = false
SIM.advance(16000)
n = #reports
CoreAC.Config.Main.AntiVoiceExploits = true
C.voice = 30.0; SIM.advance(12000)
out('30 m: ' .. since(n))
C.voice = 5000.0; SIM.advance(12000)
out('5000 m: ' .. since(n))

out(''); out('ERRORS: ' .. #SIM.errors)
local seen = {} for _, e in ipairs(SIM.errors) do if not seen[e] then seen[e] = true; out('  ' .. e) end end
