-- Silent aim (blatant + subtle tier) and the peer damage check, through the REAL
-- server/protection.lua with a FiveM stub.
--   node tools/sim/run.cjs scenario_aim_damage.lua
--
-- Every "legit" case is a way an honest player can produce an off-crosshair hit or a
-- strong hit (aim jitter, moving target, lag, flick, gamepad aim assist, cover fire, a
-- server that tunes weapon damage, a role buff). None of them may be reported.
local check, title = H.check, H.title

H.api()
SIM.advance(3000)
H.pushConfig({}, { rules = { anti_silent_aim = true, anti_damage_multiplier = true } })
SIM.advance(62000)

-- ---------------------------------------------------------------- world
local pedOwner = {}
local function mk(id, name, coords)
  local p = H.addPlayer(id, name)
  p.coords, p.vel, p.veh = coords, vector3(0, 0, 0), 0
  pedOwner[p.ped] = id
  return p
end
function IsPedAPlayer(e) return pedOwner[e] ~= nil end
local _type, _owner, _exists = GetEntityType, NetworkGetEntityOwner, DoesEntityExist
function GetEntityType(e) if pedOwner[e] then return 1 end return _type(e) end
function NetworkGetEntityOwner(e) return pedOwner[e] or _owner(e) end
function DoesEntityExist(e) return pedOwner[e] ~= nil or _exists(e) end
function NetworkGetEntityFromNetworkId(n) return n end
if not GetPedArmour then function GetPedArmour() return 0 end end

local PISTOL = GetHashKey('weapon_pistol')
local SMG = GetHashKey('weapon_smg')
local COMBAT = GetHashKey('weapon_combatpistol')
local SHOTGUN = GetHashKey('weapon_pumpshotgun')

local function dets(from)
  local reqs, out = H.requests('/detections'), {}
  for i = (from or 0) + 1, #reqs do out[#out + 1] = reqs[i].body end
  return out, #reqs
end
local function count(list, type_)
  local n = 0
  for _, d in ipairs(list) do if d.type == type_ then n = n + 1 end end
  return n
end

local shotAt = 10000
local function fire(attacker, victim, o)
  o = o or {}
  shotAt = shotAt + 400
  SIM.dispatch('weaponDamageEvent', '', tostring(attacker), {
    weaponType = o.weapon or PISTOL, weaponDamage = o.dmg or 26, hitGlobalId = SIM.players[victim].ped,
    hitComponent = o.head and 20 or 9, damageType = 3, damageTime = shotAt,
  })
end

--- Camera sample at the shooter, aimed at `target` but turned `offDeg` degrees sideways.
local function aim(shooter, target, offDeg, flags, camShift, point)
  local s = SIM.players[shooter].coords
  local cam = vector3(s.x + (camShift or 0), s.y, s.z + 1.0)
  local v = point or SIM.players[target].coords
  local dx, dy, dz = v.x - cam.x, v.y - cam.y, v.z - cam.z
  local len = math.sqrt(dx * dx + dy * dy + dz * dz)
  dx, dy, dz = dx / len, dy / len, dz / len
  local r = math.rad(offDeg or 0)
  local fx, fy = dx * math.cos(r) - dy * math.sin(r), dx * math.sin(r) + dy * math.cos(r)
  SIM.net('coreac:aim', shooter, cam.x, cam.y, cam.z, fx, fy, dz, flags or 0)
end

--- One shot: camera sample, then the hit, then time for the server's 250 ms wait.
local function volley(shooter, target, off, o)
  aim(shooter, target, off, o and o.flags, o and o.camShift)
  fire(shooter, target, o)
  SIM.advance(500)
end

local function placeVictim(id, dist, speed)
  SIM.players[id].coords = vector3(dist, 0, 30)
  SIM.players[id].vel = vector3(0, speed or 0, 0)
end

-- shooters 1..2, targets 3..4, peers 5..8
mk(1, 'Shooter1', vector3(0, 0, 30)); mk(2, 'Shooter2', vector3(0, 0, 30))
mk(3, 'Target3', vector3(30, 0, 30)); mk(4, 'Target4', vector3(30, 0, 30))
for i = 5, 8 do mk(i, 'Peer' .. i, vector3(0, 0, 30)) end
SIM.advance(3000)
for i = 1, 8 do SIM.net('coreac:inGame', i) end
SIM.advance(30000)

-- ---------------------------------------------------------------------------
title('1. legit: honest aim — jitter of ±1.4° on a runner 30 m away, 30 hits')
local _, c0 = dets()
local jitter = { 0.4, -0.8, 1.1, -1.3, 0.2, 0.9, -0.5, 1.4, -1.0, 0.0, 0.7, -1.2, 0.3, -0.6, 1.2 }
placeVictim(3, 30, 5)
for round = 1, 2 do for _, j in ipairs(jitter) do volley(1, 3, j) end end
local l1 = dets(c0)
check('no detection at all', #l1 == 0, #l1 > 0 and l1[1].type or nil)

title('2. legit: crosshair on the very edge of the body (1.0 m beside the target at 30 m)')
SIM.advance(30000)
_, c0 = dets()
placeVictim(3, 30, 0)
for k = 1, 16 do volley(1, 3, (k % 2 == 0 and 1 or -1) * 1.9) end
check('no detection', #dets(c0) == 0)

title('3. legit: flick between two targets — the nearest sample belongs to the other target')
SIM.advance(30000)
_, c0 = dets()
placeVictim(3, 30, 0)
SIM.players[4].coords = vector3(-24, 18, 30)     -- ~37° away from target 3
for k = 1, 12 do
  aim(2, 3, 0)                                   -- shot at 3
  SIM.advance(120)
  aim(2, 4, 0)                                   -- camera already on 4 (the next shot's sample)
  fire(2, 3)                                     -- the hit on 3 arrives after both samples: the NEAREST one points at 4
  SIM.advance(40)
  fire(2, 4)                                     -- and this hit on 4 still sees the older sample (aimed at 3) first
  SIM.advance(600)
end
check('flicking between targets is not reported', #dets(c0) == 0, #dets(c0) > 0 and dets(c0)[1].type or nil)
SIM.players[4].coords = vector3(30, 0, 30)

-- ---------------------------------------------------------------------------
title('4. subtle silent aim: bullets still land when the crosshair is 6-12° off (cone), 30 m, still target')
SIM.advance(30000)
_, c0 = dets()
placeVictim(3, 30, 0)
local cone = { 10, 7, 12, 9, 11, 6, 10, 8, 12, 9 }
for _, off in ipairs(cone) do volley(2, 3, off) end
local l4 = dets(c0)
check('reported as SILENT_AIM_SUBTLE once', count(l4, 'SILENT_AIM_SUBTLE') == 1, #l4)
check('NOT as the blatant tier', count(l4, 'SILENT_AIM') == 0)
local d4 = l4[1] and l4[1].details or {}
check('evidence: hits, hits off the crosshair, typical and worst miss',
  d4.hits and d4.offTarget and d4.offTarget >= 5 and d4.medianOffDeg and d4.maxOffDeg and d4.maxOffDeg >= d4.medianOffDeg, d4.offTarget)
check('origin is the server (it measured it)', l4[1] and l4[1].origin == 'server')

title('5. the honest limit: a cone that stays inside the body allowance (≤3.5° at 30 m) is not reported')
SIM.advance(30000)
_, c0 = dets()
for k = 1, 20 do volley(1, 3, ({ 2, 3, 1, 3.5, 2.5, 3, 1.5, 3, 2, 3 })[(k - 1) % 10 + 1]) end
check('no detection', #dets(c0) == 0)

title('5b. rule 1 (many misses): at 30 m the allowance is 3.7°; 7 of 16 hits at 8.1° (4.4° beyond) are a pattern, at 7.5° (3.8° beyond) they are not')
SIM.advance(400000)
_, c0 = dets()
placeVictim(3, 30, 0)
for k = 1, 16 do volley(1, 3, (k % 16 < 7) and 7.5 or 0.5) end
check('7 of 16 hits at 7.5°: not reported', #dets(c0) == 0)
SIM.advance(400000)
_, c0 = dets()
for k = 1, 16 do volley(2, 3, (k % 16 < 7) and 8.1 or 0.5) end
check('7 of 16 hits at 8.1°: reported', count(dets(c0), 'SILENT_AIM_SUBTLE') == 1)

title('5b2. rule 2 (typical miss): a small cone that always misses the body a little — 12+ hits')
SIM.advance(400000)
_, c0 = dets()
for _ = 1, 16 do volley(1, 3, 4.4) end                  -- 2.2° beyond the body, under the 2.5° line
check('always 4.4° off (2.2° beyond the body): not reported', #dets(c0) == 0)
SIM.advance(400000)
_, c0 = dets()
for _ = 1, 11 do volley(2, 3, 5.0) end
check('11 hits are too few for the typical-miss rule', #dets(c0) == 0)
volley(2, 3, 5.0)
local l5b = dets(c0)
check('always 5.0° off (2.8° beyond the body): reported on the 12th hit', count(l5b, 'SILENT_AIM_SUBTLE') == 1, #l5b)
check('evidence: typical miss about 2.8°', l5b[1] and l5b[1].details.medianOffDeg == 2.8, l5b[1] and l5b[1].details.medianOffDeg)

title('5c. an occasional wild hit is not a pattern')
SIM.advance(400000)
_, c0 = dets()
for k = 1, 12 do volley(1, 3, (k % 3 == 0) and 10 or 0.5) end          -- 4 of 12 off
check('4 of 12 off the crosshair: not reported', #dets(c0) == 0)
SIM.advance(400000)
_, c0 = dets()
for k = 1, 9 do volley(2, 3, (k % 2 == 0) and 10 or 0.5) end           -- 4 of 9 (44%): too few misses
check('4 of 9 off the crosshair: not reported (needs at least 5 misses)', #dets(c0) == 0)
SIM.advance(400000)
_, c0 = dets()
for k = 1, 16 do volley(1, 3, (k % 8 == 0 or k % 8 == 3 or k % 8 == 5) and 10 or 0.5) end   -- 6 of 16 (37%)
check('6 of 16 (37%) off the crosshair: not reported', #dets(c0) == 0)

title('5d. legit: a sprinting target and high pings — the crosshair sits on where the target WAS (2.8 m behind), 14 m away')
SIM.advance(400000)
_, c0 = dets()
SIM.players[1].ping, SIM.players[3].ping = 300, 300
SIM.players[3].coords, SIM.players[3].vel = vector3(14, 0, 30), vector3(0, 7, 0)
for _ = 1, 16 do
  aim(1, 3, 0, 0, 0, vector3(14, -2.8, 30))      -- what the shooter sees on screen: the lagged position
  fire(1, 3)
  SIM.advance(500)
end
check('no detection (lag and target speed are allowed for)', #dets(c0) == 0, #dets(c0) > 0 and dets(c0)[1].type or nil)
SIM.players[1].ping, SIM.players[3].ping = nil, nil
placeVictim(3, 30, 0)

title('5e. bullet spread: an SMG gets 2° more room than a pistol, a shotgun is not measured at all')
SIM.advance(400000)
_, c0 = dets()
for _ = 1, 16 do volley(1, 3, 6.5, { weapon = SMG }) end
check('SMG always 6.5° off: not reported (spread allowance)', #dets(c0) == 0)
SIM.advance(30000)
_, c0 = dets()
for _ = 1, 16 do volley(2, 3, 6.5) end
check('the same 6.5° with a pistol: reported', count(dets(c0), 'SILENT_AIM_SUBTLE') == 1)
SIM.advance(400000)
_, c0 = dets()
for _ = 1, 20 do volley(1, 3, 20, { weapon = SHOTGUN }) end
check('shotgun pellets 20° off: not measured by the subtle tier', #dets(c0) == 0)
for _ = 1, 3 do volley(1, 3, 90, { weapon = SHOTGUN }) end
check('…but 90° off with a shotgun is still blatant silent aim', count(dets(c0), 'SILENT_AIM') == 1)

title('6. gamepad aim assist: the bullet sits about 8° off the ray — tolerated for a pad, caught for mouse + keyboard')
SIM.advance(400000)
_, c0 = dets()
placeVictim(3, 30, 0)
for _ = 1, 16 do volley(1, 3, 8, { flags = 1 }) end
check('gamepad (flag bit 0): not reported', #dets(c0) == 0)
SIM.advance(30000)
_, c0 = dets()
for _ = 1, 16 do volley(2, 3, 8, { flags = 0 }) end
check('the same offsets on mouse + keyboard: reported', count(dets(c0), 'SILENT_AIM_SUBTLE') == 1)
SIM.advance(400000)
_, c0 = dets()
for _ = 1, 16 do volley(1, 3, 14, { flags = 1 }) end
check('a gamepad with a far larger offset (14°) is reported too', count(dets(c0), 'SILENT_AIM_SUBTLE') == 1)

title('7. legit: firing from cover (blind fire) — 15° off, never counted by the subtle tier')
SIM.advance(30000)
_, c0 = dets()
for _ = 1, 16 do volley(1, 3, 15, { flags = 2 }) end
check('no detection', #dets(c0) == 0)

title('8. close range (8-11 m) is left alone by the subtle tier, even with large offsets')
SIM.advance(30000)
_, c0 = dets()
placeVictim(3, 10, 0)
for _ = 1, 16 do volley(2, 3, 25) end
check('no detection', #dets(c0) == 0)
placeVictim(3, 30, 0)

title('9. blatant silent aim still works: the crosshair points 90° away, three hits')
SIM.advance(30000)
_, c0 = dets()
for _ = 1, 3 do volley(1, 3, 90) end
local l9 = dets(c0)
check('SILENT_AIM reported', count(l9, 'SILENT_AIM') == 1, #l9)
check('with the old evidence fields (aim match, distance, hits)', l9[1] and l9[1].details.angleCos ~= nil and l9[1].details.dist == 30 and l9[1].details.hits == 3)

title('10. target in a vehicle is not evaluated')
SIM.advance(30000)
_, c0 = dets()
SIM.players[3].veh = 77
for _ = 1, 8 do volley(2, 3, 90) end
check('no detection', #dets(c0) == 0)
SIM.players[3].veh = 0

title('11. forged samples are unusable: a camera 60 m from the body, a non-unit direction, NaN')
SIM.advance(65000)
_, c0 = dets()
SIM.net('coreac:aim', 1, 0, 0, 31, 0, 0, 0)            -- zero-length direction
SIM.net('coreac:aim', 1, 0, 0, 31, 0 / 0, 1, 0)        -- NaN
SIM.net('coreac:aim', 1, 0, 0, 31, 5, 5, 5)            -- not a unit vector
SIM.advance(500)
for _ = 1, 10 do volley(1, 3, 0, { camShift = 60 }) end   -- perfect aim, but from 60 m away from the ped
local l11 = dets(c0)
check('a sample from far away from the body never excuses (or accuses) anyone as a hit sample', count(l11, 'SILENT_AIM') == 0 and count(l11, 'SILENT_AIM_SUBTLE') == 0)
check('…and hiding behind forged samples is itself reported (aim telemetry unusable)', count(l11, 'AC_TAMPER') >= 1, #l11)

title('12. the Silent Aim server guard switched off in the panel')
SIM.advance(30000)
H.pushConfig({}, { rules = { anti_silent_aim = false, anti_damage_multiplier = true } })
_, c0 = dets()
for _ = 1, 12 do volley(2, 3, 90) end
check('nothing is measured', #dets(c0) == 0)
H.pushConfig({}, { rules = { anti_silent_aim = true, anti_damage_multiplier = true } })

-- ---------------------------------------------------------------------------
-- DAMAGE BOOST (peer comparison)
-- ---------------------------------------------------------------------------
local function hits(shooter, n, dmg, o)
  o = o or {}
  for k = 1, n do
    local dm = type(dmg) == 'table' and dmg[(k - 1) % #dmg + 1] or dmg
    o.dmg = dm
    aim(shooter, o.target or 3, 0)                 -- honest aim, so the aim telemetry stays healthy
    fire(shooter, o.target or 3, o)
    SIM.advance(300)
  end
end

-- The aim history of a shooter expires after 6 minutes; start the damage section clean.
SIM.advance(400000)

title('13. legit: four players use the pistol with the normal damage (26, falling off to 22 at range)')
SIM.advance(30000)
_, c0 = dets()
for _, id in ipairs({ 5, 6, 7 }) do hits(id, 6, { 26, 26, 24, 22, 26, 25 }) end
hits(2, 8, { 26, 25, 22, 26, 26, 24, 26, 23 })
local l13 = dets(c0)
check('no detection', #l13 == 0, #l13 > 0 and (l13[1].type .. ' ' .. json.encode(l13[1].details)) or nil)

title('14. damage boost x2: 52 per hit against peers who do 26')
SIM.advance(25000)
_, c0 = dets()
hits(1, 4, 52)
check('four boosted hits are not yet enough (needs 5)', count(dets(c0), 'DAMAGE_PEER_MISMATCH') == 0)
hits(1, 2, 52)
local l14 = dets(c0)
check('reported as DAMAGE_PEER_MISMATCH', count(l14, 'DAMAGE_PEER_MISMATCH') == 1, #l14)
local d14 = l14[1] and l14[1].details or {}
check('evidence: damage, what everyone else does, how many players, multiplier',
  d14.damage == 52 and d14.normal == 26 and d14.players == 4 and d14.multiplier == 2, d14.normal)
check('origin is the server', l14[1] and l14[1].origin == 'server')

title('15. damage boost x3.5: two hits are enough')
SIM.advance(25000)
_, c0 = dets()
hits(2, 2, 95)
check('reported after two hits', count(dets(c0), 'DAMAGE_PEER_MISMATCH') == 1)

title('16. legit: this server tunes the MG to 60 for everyone (peers measure the tuned value), plus a 1.3x role buff on one player')
SIM.advance(25000)
local MG = GetHashKey('weapon_mg')
for _, id in ipairs({ 5, 6, 7 }) do hits(id, 4, { 60, 60, 58, 60 }, { weapon = MG }) end
_, c0 = dets()
hits(2, 10, 60, { weapon = MG })                 -- same as everyone
hits(8, 10, 78, { weapon = MG })                 -- role buff 1.3x
check('neither the tuned server nor the 1.3x buff is reported', count(dets(c0), 'DAMAGE_PEER_MISMATCH') == 0)

title('17. not enough peers to compare with: a single other player is never a reference')
SIM.advance(25000)
_, c0 = dets()
hits(5, 4, 30, { weapon = COMBAT })
hits(1, 8, 120, { weapon = COMBAT })
check('no detection', #dets(c0) == 0)

title('18. head hits (the engine multiplies them) and shotgun pellets do not count')
SIM.advance(25000)
_, c0 = dets()
hits(1, 8, 200, { head = true })
for _, id in ipairs({ 5, 6, 7 }) do hits(id, 4, 80, { weapon = SHOTGUN }) end
hits(1, 8, 300, { weapon = SHOTGUN })
check('no detection', #dets(c0) == 0)

title('19. one cheating peer cannot lift the reference: SMG, honest users measured while a cheater is in the pool')
SIM.advance(25000)
_, c0 = dets()
hits(5, 4, 22, { weapon = SMG })
hits(6, 4, 22, { weapon = SMG })
hits(2, 3, 150, { weapon = SMG })                -- the cheater joins the pool
check('the cheater is reported', count(dets(c0), 'DAMAGE_PEER_MISMATCH') == 1)
_, c0 = dets()
hits(7, 4, 22, { weapon = SMG })
hits(8, 10, 22, { weapon = SMG })                -- honest: the pool holds 22, 22, 22, 22
check('honest SMG users are not reported although a cheater was among the peers', #dets(c0) == 0, #dets(c0) > 0 and dets(c0)[1].type or nil)
SIM.advance(25000)
_, c0 = dets()
hits(1, 4, 31, { weapon = SMG })                 -- a stealthy x1.4 user (below the 1.5 line) joins the pool
check('x1.4 is below the line: not reported', #dets(c0) == 0)
hits(2, 6, 44, { weapon = SMG })                 -- an x2 cheater: the reference must stay 22, not rise to the 31
check('an x2 cheater is still caught (a stealthy peer cannot lift the reference)', count(dets(c0), 'DAMAGE_PEER_MISMATCH') == 1, #dets(c0))

title('20. server staff and trusted (whitelisted) players are neither measured nor used as a reference')
SIM.advance(25000)
H.whitelist = { { kind = 'license', value = 'license:lic5', full = true } }
SIM.advance(62000)
_, c0 = dets()
hits(5, 8, 200, { weapon = PISTOL })
check('a whitelisted shooter with huge damage is not reported', #dets(c0) == 0)

title('21. zero / missing damage values are ignored')
_, c0 = dets()
hits(1, 8, 0)
check('no detection', #dets(c0) == 0)

title('22. the damage guard switched off in the panel')
SIM.advance(25000)
H.pushConfig({}, { rules = { anti_silent_aim = true, anti_damage_multiplier = false } })
_, c0 = dets()
hits(1, 8, 200)
check('nothing is measured', count(dets(c0), 'DAMAGE_PEER_MISMATCH') == 0)
H.pushConfig({}, { rules = { anti_silent_aim = true, anti_damage_multiplier = true } })

H.summary()
