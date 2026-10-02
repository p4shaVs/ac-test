local out = SIM.out
local function title(s) out(''); out('=== ' .. s) end
local dets = {}
local function ser(t) local k = {} for a, b in pairs(t or {}) do if type(b) ~= 'table' then k[#k + 1] = a .. '=' .. tostring(b) end end table.sort(k) return table.concat(k, ',') end
SIM.api['/heartbeat'] = function() return true, { config = {
  rules = { anti_damage_multiplier = true, anti_headshot_rate = true, anti_silent_aim = true, anti_rapid_fire = true },
  ac = { Weapons = { AddonWeapons = { 'weapon_browning', 'weapon_addonshotgun' } } },
} } end
SIM.api['/detections'] = function(b)
  dets[#dets + 1] = b
  out(('DETECTION %-18s player=%-8s origin=%-6s %s'):format(b.type, b.playerName, b.origin, ser(b.details)))
  return true, { action = 'LOG' }
end

-- players: 1 = cheater, 2..5 = legit
local pedOwner, health, armor = {}, {}, {}
for i = 1, 5 do
  local ped = 100 + i
  SIM.players[i] = { name = i == 1 and 'SHADON' or ('player' .. i), ped = ped, coords = vector3(i * 20, 0, 30), vel = vector3(0, 0, 0), veh = 0, weapon = 0, ids = { 'license:p' .. i } }
  pedOwner[ped] = i; health[ped] = 200; armor[ped] = 100
end
function IsPedAPlayer(e) return pedOwner[e] ~= nil end
local _type, _owner, _exists = GetEntityType, NetworkGetEntityOwner, DoesEntityExist
function GetEntityType(e) if pedOwner[e] then return 1 end return _type(e) end
function NetworkGetEntityOwner(e) return pedOwner[e] or _owner(e) end
function DoesEntityExist(e) return pedOwner[e] ~= nil or _exists(e) end
function NetworkGetEntityFromNetworkId(n) return n end
function GetEntityHealth(e) return health[e] or 200 end
function GetPedArmour(e) return armor[e] or 0 end
local function heal(ped) health[ped] = 200; armor[ped] = 100 end

SIM.advance(3000)
for i = 1, 5 do SIM.net('coreac:inGame', i) end
SIM.advance(40000)
local origLog = CAC.log
CAC.log = function(l, s, m) if s == 'combat' then out('LOG ' .. m) end return origLog(l, s, m) end

local U = function(h) return h < 0 and h + 4294967296 or h end
local BROWNING = U(GetHashKey('weapon_browning'))
local SHOTGUN = U(GetHashKey('weapon_addonshotgun'))
local G_PISTOL = U(GetHashKey('GROUP_PISTOL'))
local G_SHOTGUN = U(GetHashKey('GROUP_SHOTGUN'))

local shotClock = 5000
local function hit(attacker, victimSrc, opts)
  opts = opts or {}
  shotClock = shotClock + (opts.gap or 400)
  local vped = 100 + victimSrc
  SIM.dispatch('weaponDamageEvent', '', tostring(attacker), {
    weaponType = opts.weapon or BROWNING, weaponDamage = opts.dmg or 30, hitGlobalId = vped,
    hitComponent = opts.head and 20 or 9, willKill = opts.kill or false, damageType = 3,
    damageTime = opts.at or shotClock,
  })
  if opts.kill then health[vped] = 0; armor[vped] = 0 end
end

title('0. weapon stats: players 2-5 report weapon_browning at 30 dmg (x1), shotgun group for the addon shotgun')
for i = 2, 5 do
  SIM.net('coreac:wstat', i, BROWNING, 3, G_PISTOL, 30.0, 1.0, 1.0)
  SIM.net('coreac:wstat', i, SHOTGUN, 3, G_SHOTGUN, 29.0, 1.0, 1.0)
end
out('class of browning (for cheater): ' .. tostring(CoreAC.ResolveWeaponClass(BROWNING, 1)) .. ', shotgun: ' .. tostring(CoreAC.ResolveWeaponClass(SHOTGUN, 1)))

title('A. cheater\'s browning reports 8x damage modifier every 10 s')
local n = #dets
for _ = 1, 3 do SIM.net('coreac:wstat', 1, BROWNING, 3, G_PISTOL, 30.0, 8.0, 1.0); SIM.advance(10000) end
out('new detections: ' .. (#dets - n))

title('A2. legit: server tunes the browning to 1.5x for EVERYONE (nobody stands out)')
n = #dets
for _ = 1, 3 do for i = 2, 5 do SIM.net('coreac:wstat', i, BROWNING, 3, G_PISTOL, 30.0, 1.5, 1.0) end SIM.advance(10000) end
out('new detections: ' .. (#dets - n))
for i = 2, 5 do SIM.net('coreac:wstat', i, BROWNING, 3, G_PISTOL, 30.0, 1.0, 1.0) end

title('A3. legit: owner restarts the weapon pack with +40% damage; first reporters must not be flagged')
n = #dets
SIM.dispatch('onResourceStart', '', 'weapons_pack')
for round = 1, 3 do
  for i = 2, 5 do if round > 1 or i == 2 then SIM.net('coreac:wstat', i, BROWNING, 3, G_PISTOL, 42.0, 1.0, 1.0) end end
  SIM.advance(10000)
end
out('new detections: ' .. (#dets - n))
for i = 2, 5 do SIM.net('coreac:wstat', i, BROWNING, 3, G_PISTOL, 30.0, 1.0, 1.0) end
SIM.advance(25000)

title('B. addon damage ceiling: 240 dmg body hits with the browning (normal 30)')
n = #dets
hit(1, 2, { dmg = 240 }); heal(102); SIM.advance(1000)
hit(1, 3, { dmg = 240 }); heal(103); SIM.advance(1000)
out('new detections: ' .. (#dets - n))

title('B2. legit: 240 dmg HEAD hits and 230 dmg addon-shotgun blast never count toward the ceiling')
SIM.advance(25000)
n = #dets
hit(4, 2, { dmg = 240, head = true }); heal(102); SIM.advance(700)
hit(4, 3, { dmg = 240, head = true }); heal(103); SIM.advance(700)
hit(5, 2, { dmg = 230, weapon = SHOTGUN }); heal(102); SIM.advance(700)
hit(5, 3, { dmg = 230, weapon = SHOTGUN }); heal(103); SIM.advance(700)
local dm = 0 for i = n + 1, #dets do if dets[i].type == 'DAMAGE_MULTIPLIER' then dm = dm + 1 end end
out('DAMAGE_MULTIPLIER from these: ' .. dm)

title('C. cheater drops 3 full-armour players with ONE body shot each (the video, but body)')
SIM.advance(25000)
n = #dets
for v = 2, 4 do hit(1, v, { dmg = 30, kill = true }); SIM.advance(4000); heal(100 + v) end
local oneShot = 0 for i = n + 1, #dets do if dets[i].type == 'ONE_SHOT_KILL' then oneShot = oneShot + 1 end end
out('ONE_SHOT_KILL: ' .. oneShot)

title('C2. legit: 3 single HEAD-shot kills on full-armour players (FiveM default critical hit)')
SIM.advance(25000)
n = #dets
for v = 3, 5 do hit(2, v, { head = true, kill = true }); SIM.advance(4000); heal(100 + v) end
out('new detections: ' .. (#dets - n))

title('C3. legit: kill shot lands right after a teammate\'s hits (server health still stale) — not a one-shot')
n = #dets
hit(3, 5, { dmg = 30 }); SIM.advance(300)
hit(4, 5, { dmg = 30, kill = true }); SIM.advance(4000); heal(105)
out('new detections: ' .. (#dets - n))

title('C4. legit: a genuinely overpowered addon gun — three different players one-shot with it')
SIM.advance(25000)
local SNIPEY = U(GetHashKey('weapon_boltaction'))
for i = 2, 5 do SIM.net('coreac:wstat', i, SNIPEY, 3, G_PISTOL, 300.0, 1.0, 1.0) end
n = #dets
hit(2, 5, { weapon = SNIPEY, dmg = 300, kill = true }); SIM.advance(4000); heal(105)
hit(3, 5, { weapon = SNIPEY, dmg = 300, kill = true }); SIM.advance(4000); heal(105)
for v = 2, 4 do hit(5, v, { weapon = SNIPEY, dmg = 300, kill = true }); SIM.advance(4000); heal(100 + v) end
local os2 = 0 for i = n + 1, #dets do if dets[i].type == 'ONE_SHOT_KILL' then os2 = os2 + 1 end end
out('ONE_SHOT_KILL: ' .. os2)

title('D. headshot rate: 10 kills, 9 single head shots from ~25 m')
SIM.advance(25000)
n = #dets
SIM.players[1].coords = vector3(0, 0, 30)
for k = 1, 10 do
  local v = 2 + (k % 4)
  SIM.players[v].coords = vector3(25, 0, 30)
  hit(1, v, { head = k ~= 5, kill = true }); SIM.advance(3500); heal(100 + v)
end
local hs = 0 for i = n + 1, #dets do if dets[i].type == 'HEADSHOT_RATE' then hs = hs + 1 end end
out('HEADSHOT_RATE: ' .. hs)
for i = 1, 5 do SIM.players[i].coords = vector3(i * 20, 0, 30) end

title('E. silent aim with the ADDON browning: aim points north, victims are east')
SIM.advance(25000)
n = #dets
for k = 1, 3 do
  SIM.net('coreac:aim', 1, 20.0, 0.0, 31.0, 0.0, 1.0, 0.0)
  hit(1, 3 + (k % 2), { dmg = 30 }); heal(103); heal(104)
  SIM.advance(1500)
end
local sa = 0 for i = n + 1, #dets do if dets[i].type == 'SILENT_AIM' then sa = sa + 1 end end
out('SILENT_AIM: ' .. sa)

title('E2. legit: same hits while aiming AT the victims')
SIM.advance(25000)
n = #dets
for k = 1, 4 do
  SIM.net('coreac:aim', 2, 40.0, 0.0, 31.0, 1.0, 0.0, 0.0)
  hit(2, 4, { dmg = 30 }); heal(104)
  SIM.advance(1500)
end
out('new detections: ' .. (#dets - n))

title('F. aim telemetry cut off: 10 hitscan hits on players in 40 s, zero aim samples')
SIM.advance(65000)
n = #dets
for k = 1, 10 do hit(1, 2 + (k % 3), { dmg = 30 }); heal(102); heal(103); heal(104); SIM.advance(4000) end
local tam = 0 for i = n + 1, #dets do if dets[i].type == 'AC_TAMPER' then tam = tam + 1 end end
out('AC_TAMPER: ' .. tam)

title('F2. legit: same hits, the client keeps sending aim samples')
SIM.advance(25000)
n = #dets
for k = 1, 10 do
  SIM.net('coreac:aim', 3, 60.0, 0.0, 31.0, -1.0, 0.0, 0.0)
  hit(3, 2, { dmg = 30 }); heal(102); SIM.advance(4000)
end
out('new detections: ' .. (#dets - n))

title('G. rapid fire: packets arrive together but shots are 150 ms apart on the shooter clock')
SIM.advance(25000)
n = #dets
for k = 1, 12 do SIM.net('coreac:aim', 4, 80.0, 0.0, 31.0, -1.0, 0.0, 0.0); hit(4, 2, { dmg = 30, at = 900000 + k * 150 }); heal(102) end
SIM.advance(1000)
out('new detections: ' .. (#dets - n))
title('G2. rapid fire: 12 shots 30 ms apart on the shooter clock')
n = #dets
for k = 1, 12 do SIM.net('coreac:aim', 5, 100.0, 0.0, 31.0, -1.0, 0.0, 0.0); hit(5, 2, { dmg = 30, at = 950000 + k * 30 }); heal(102) end
SIM.advance(1000)
local rf = 0 for i = n + 1, #dets do if dets[i].type == 'RAPID_FIRE' then rf = rf + 1 end end
out('RAPID_FIRE: ' .. rf)

out('')
out('errors: ' .. #SIM.errors)
