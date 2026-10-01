local out = SIM.out
local function title(s) out(''); out('=== ' .. s) end
local reports, sent = {}, {}
SIM.onServerEvent = function(name, a, b, c, d, e, f)
  if name == 'coreac:report' then
    local k = {} for x, y in pairs(c or {}) do if type(y) ~= 'table' then k[#k + 1] = x .. '=' .. tostring(y) end end table.sort(k)
    reports[#reports + 1] = a; out(('REPORT %-18s %s'):format(a, table.concat(k, ',')))
  elseif name == 'coreac:wstat' or name == 'coreac:aim' then
    sent[#sent + 1] = { name = name, args = { a, b, c, d, e, f } }
  end
end
local function since(n) local t = {} for i = n + 1, #reports do t[#t + 1] = reports[i] end return #t > 0 and table.concat(t, ', ') or '(none)' end

local BROWNING = GetHashKey('weapon_browning')
local G_PISTOL = GetHashKey('GROUP_PISTOL')
local VICTIM = 50
local victimPos = C.coords + vector3(30, 0, 0)
local cam = { pos = C.coords + vector3(0, 0, 1), rot = vector3(0, 0, -90) } -- bakış: +x (kurbana)
local impact = { ok = true, pos = victimPos }
local wMod, pMod = 1.0, 1.0

C.armed = true
function GetSelectedPedWeapon() return BROWNING end
function GetCurrentPedWeapon() return true, BROWNING end
function GetWeapontypeGroup() return G_PISTOL end
function GetWeaponDamageType() return 3 end
function GetWeaponDamage() return 30.0 end
function GetWeaponDamageModifier() return wMod end
function GetPlayerWeaponDamageModifier() return pMod end
function GetPlayerWeaponDefenseModifier() return 1.0 end
function GetPlayerWeaponDefenseModifier_2() return 1.0 end
function GetPlayerMeleeWeaponDefenseModifier() return 1.0 end
function GetPlayerMeleeWeaponDamageModifier() return 1.0 end
function GetFinalRenderedCamRot() return cam.rot end
function GetFinalRenderedCamCoord() return cam.pos end
function GetEntityCoords(e) if e == VICTIM then return victimPos end return C.coords end
function IsPedAPlayer(e) return e == VICTIM end
function IsPedInAnyVehicle() return false end
function GetPedLastWeaponImpactCoord() return impact.ok, impact.pos end
function HasEntityBeenDamagedByWeapon() return true end
function GetTimeOfLastPedWeaponDamage() return SIM.now end
function IsPedRagdoll() return false end
local aiming = true
function IsPlayerFreeAiming() return aiming end
CoreAC.Native.GetGameplayCamCoord = function() return cam.pos end
CoreAC.Native.GetGameplayCamRot = function() return cam.rot end
CoreAC.Native.IsAimCamActive = function() return aiming end
CoreAC.Native.GetCurrentPedWeapon = function() return true, BROWNING end
CoreAC.Native.HasPedGotWeapon = function() return true end
CoreAC.Native.IsEntityDead = function() return false end
CoreAC.Native.IsPedDeadOrDying = function() return false end
CoreAC.Native.GetGamePool = function() return { 1, VICTIM } end
CoreAC.Config.Beta.AntiSilentAim = true
CoreAC.Config.Weapons.AntiWeaponDamagesModifier = true

SIM.advance(35000)
CoreAC.playerPed = 1
out('spawned=' .. tostring(CoreAC.playerSpawned))

local function shoot(n, gap)
  for _ = 1, n do
    TriggerEvent('CEventGunShot', { 1 }, 1)
    SIM.advance(20, 10)
    TriggerEvent('CEventGunShotBulletImpact', { 1 }, 1)
    SIM.advance(gap or 600)
  end
end

title('1. legit: aiming down sights at the victim, 6 hits')
local n = #reports
shoot(6)
out('reports: ' .. since(n))

title('2. silent aim: camera looks north, bullets land on the victim 30 m east (6 hits)')
n = #reports
cam.rot = vector3(0, 0, 0)
shoot(6)
out('reports: ' .. since(n))

title('3. legit: hip fire (not aiming) with the same offset → never measured')
SIM.advance(25000)
n = #reports
aiming = false
shoot(6)
aiming = true; cam.rot = vector3(0, 0, -90)
out('reports: ' .. since(n))

title('4. legit: small spread (4° off the crosshair) while aiming')
n = #reports
cam.rot = vector3(0, 0, -86)
shoot(6)
cam.rot = vector3(0, 0, -90)
out('reports: ' .. since(n))

title('5. impact coordinate missing: twice → none, five times → report')
n = #reports
impact.ok = false
shoot(2)
out('after 2: ' .. since(n))
shoot(3)
impact.ok = true
out('after 5: ' .. since(n))

title('6. weapon stats sent every 10 s for the addon browning; server tuning 1.5x → no local report; 12x → report')
n = #reports
local before = #sent
SIM.advance(21000)
local ws
for i = before + 1, #sent do if sent[i].name == 'coreac:wstat' then ws = sent[i] end end
out('wstat: ' .. (ws and table.concat({ tostring(ws.args[1]), tostring(ws.args[2]), tostring(ws.args[3]), tostring(ws.args[4]), tostring(ws.args[5]), tostring(ws.args[6]) }, ' ') or 'none'))
wMod = 1.5
SIM.advance(21000)
out('1.5x: ' .. since(n))
wMod = 12.0
SIM.advance(21000)
out('12x: ' .. since(n))
wMod = 1.0

title('7. aim sample for the ADDON browning while shooting')
before = #sent
C.shooting = true
SIM.advance(300, 10)
C.shooting = false
local aims = 0 for i = before + 1, #sent do if sent[i].name == 'coreac:aim' then aims = aims + 1 end end
out('aim samples sent: ' .. aims)

out('')
out('errors: ' .. #SIM.errors)
