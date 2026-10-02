-- Rapid fire (server/protection.lua) and spoofed position reports (server/telemetry_guard.lua)
-- through the REAL resource scripts with a FiveM stub.
--   node tools/sim/run.cjs scenario_firerate_desync.lua
--
-- Every "legit" case is something an honest player does: a fast SMG, packets that
-- arrive bunched together, shotgun pellets, a minigun, a fast car with lag, a script
-- teleport. None of them may be reported.
local check, title = H.check, H.title

H.whitelist = { { kind = 'license', value = 'license:lic9', full = true } }
H.api()
SIM.advance(3000)
local ON = { anti_rapid_fire = true, anti_state_desync = true }
H.pushConfig({}, { rules = ON })
SIM.advance(62000)

-- ---------------------------------------------------------------- world
local pedOwner = {}
local function mk(id, name, coords)
  local p = H.addPlayer(id, name)
  p.coords, p.vel, p.veh = coords or vector3(100.0 + id, 200.0, 30.0), vector3(0, 0, 0), 0
  pedOwner[p.ped] = id
  return p
end
function IsPedAPlayer(e) return pedOwner[e] ~= nil end
local _type, _owner, _exists = GetEntityType, NetworkGetEntityOwner, DoesEntityExist
function GetEntityType(e) if pedOwner[e] then return 1 end return _type(e) end
function NetworkGetEntityOwner(e) return pedOwner[e] or _owner(e) end
function DoesEntityExist(e) return pedOwner[e] ~= nil or _exists(e) end
function NetworkGetEntityFromNetworkId(n) return n end
local vehVel = {}
local _vel = GetEntityVelocity
function GetEntityVelocity(e) if vehVel[e] then return vehVel[e] end return _vel(e) end

for id = 1, 9 do mk(id, 'Player' .. id) end
local VICTIM = 9 -- whitelisted, only used as a target

local SMG = GetHashKey('weapon_smg')
local PISTOL = GetHashKey('weapon_pistol')
local SHOTGUN = GetHashKey('weapon_pumpshotgun')
local MINIGUN = GetHashKey('weapon_minigun')
local ADDON = GetHashKey('weapon_glock17_custom') -- not in the vanilla table

local function dets(from)
  local reqs, out = H.requests('/detections'), {}
  for i = (from or 0) + 1, #reqs do out[#out + 1] = reqs[i].body end
  return out, #reqs
end
local function count(list, type_, who)
  local n = 0
  for _, d in ipairs(list) do
    if d.type == type_ and (not who or d.playerName == who) then n = n + 1 end
  end
  return n
end
local function mark() local _, n = dets() return n end

-- Each shooter keeps its own game clock (damageTime).
local clock = {}
--- `shots` hits `gapMs` apart on the shooter's clock. `bunched` = all packets arrive in
--- the same server tick (what lag does); otherwise 5 ms of server time between them.
local function burst(shooter, weapon, shots, gapMs, o)
  o = o or {}
  clock[shooter] = (clock[shooter] or 1000000) + 5000
  for i = 1, shots do
    local at = clock[shooter] + (i - 1) * gapMs
    for _ = 1, (o.pellets or 1) do
      SIM.dispatch('weaponDamageEvent', '', tostring(shooter), {
        weaponType = weapon, weaponDamage = 20, hitGlobalId = SIM.players[o.victim or VICTIM].ped,
        hitComponent = 9, damageType = 3, damageTime = at,
      })
    end
    if not o.bunched then SIM.advance(5, 5) end
  end
  clock[shooter] = clock[shooter] + shots * gapMs
  SIM.advance(3000) -- the server closes the burst once the shooter stops
end

-- ================================================================= RAPID FIRE
title('rapid fire: honest players')
local c0 = mark()
for _ = 1, 5 do burst(1, SMG, 20, 70) end                      -- ~850 rpm, the real SMG range
check('a fast SMG at its real rate is never reported (5 long bursts)', count(dets(c0), 'RAPID_FIRE') == 0)
for _ = 1, 5 do burst(2, SMG, 20, 70, { bunched = true }) end
check('bunched packets do not matter — gaps come from the shooter\'s clock', count(dets(c0), 'RAPID_FIRE') == 0)
for _ = 1, 5 do burst(3, SHOTGUN, 10, 600, { pellets = 8 }) end
check('shotgun pellets of one shot count once (and shotguns are not measured)', count(dets(c0), 'RAPID_FIRE') == 0)
for _ = 1, 5 do burst(4, MINIGUN, 40, 20) end
check('a minigun (heavy weapon) is never measured', count(dets(c0), 'RAPID_FIRE') == 0)
for _ = 1, 5 do burst(5, PISTOL, 12, 55) end
check('a pistol emptied as fast as it can fire is fine (55 ms > 40 ms floor)', count(dets(c0), 'RAPID_FIRE') == 0)
for _ = 1, 5 do burst(6, SMG, 5, 10) end
check('very short bursts (under 6 gaps) never count', count(dets(c0), 'RAPID_FIRE') == 0)

title('rapid fire: cheaters')
c0 = mark()
burst(7, SMG, 12, 16)                                           -- one frame per shot at 60 fps
burst(7, SMG, 12, 16)
check('two fast bursts are not enough', count(dets(c0), 'RAPID_FIRE') == 0)
burst(7, SMG, 12, 16)
local rf = dets(c0)
check('the third fast burst in 10 minutes is rapid fire', count(rf, 'RAPID_FIRE', 'Player7') == 1)
local d = rf[#rf] and rf[#rf].details or {}
check('evidence: weapon, gap, floor, rpm and burst count', d.weapon == 'weapon_smg' and d.intervalMs == 16 and d.floorMs == 35
  and d.rpm == 3750 and d.bursts == 3 and d.source == 'fire_rate', json.encode(d))
check('reported as server-made (not capped as a client report)', rf[#rf] and rf[#rf].origin == 'server')

c0 = mark()
for _ = 1, 3 do burst(8, SMG, 12, 16, { bunched = true }) end
check('a second cheater on the same VANILLA gun is caught too (no peer excuse for vanilla guns)', count(dets(c0), 'RAPID_FIRE', 'Player8') == 1)

title('rapid fire: add-on guns')
c0 = mark()
for _ = 1, 3 do burst(1, ADDON, 12, 20) end
check('an unknown add-on gun firing at 20 ms (< 25 ms floor) alone is reported', count(dets(c0), 'RAPID_FIRE', 'Player1') == 1)
c0 = mark()
for _ = 1, 3 do burst(2, ADDON, 12, 20) end
for _ = 1, 3 do burst(3, ADDON, 12, 20) end
for _ = 1, 3 do burst(4, ADDON, 12, 20) end
check('when three players all fire that add-on gun that fast, it is a fast gun — the later ones are not reported',
  count(dets(c0), 'RAPID_FIRE', 'Player4') == 0, count(dets(c0), 'RAPID_FIRE'))

title('rapid fire: switch off')
H.pushConfig({}, { rules = { anti_rapid_fire = false, anti_state_desync = true } })
c0 = mark()
for _ = 1, 3 do burst(5, SMG, 12, 10) end
check('rule off → nothing is measured', count(dets(c0), 'RAPID_FIRE') == 0)
H.pushConfig({}, { rules = ON })

-- ================================================================= STATE DESYNC
title('position reports: honest players')
local function report(id, x, y, z, hp, armor)
  local p = SIM.players[id]
  SIM.net('coreac:pos', id, { x = x or p.coords.x, y = y or p.coords.y, z = z or p.coords.z, health = hp or 200, armor = armor or 0 })
  SIM.advance(3000)
end
-- Fresh players for this part (their first report starts the 45 s warm-up).
mk(10, 'Walker', vector3(-500.0, 300.0, 40.0))
mk(11, 'Spoofer', vector3(-900.0, 300.0, 40.0))
mk(12, 'Racer', vector3(1200.0, -300.0, 30.0))
mk(13, 'Teleported', vector3(300.0, 300.0, 30.0))

c0 = mark()
report(11, 5000.0, 5000.0, 40.0)                       -- very first report: warm-up
report(11, 5000.0, 5000.0, 40.0)
report(11, 5000.0, 5000.0, 40.0)
check('the first 45 seconds after joining are skipped (loading, character select)', count(dets(c0), 'STATE_DESYNC') == 0)
for _, id in ipairs({ 10, 12, 13 }) do report(id) end
SIM.advance(45000)

c0 = mark()
for _ = 1, 8 do
  local p = SIM.players[10]
  report(10, p.coords.x + 3.0, p.coords.y - 2.0, p.coords.z)  -- walked a few metres meanwhile
end
check('reports that match what the server sees are never flagged', count(dets(c0), 'STATE_DESYNC') == 0)

local racer = SIM.players[12]
racer.veh = 5555
vehVel[5555] = vector3(60.0, 0.0, 0.0)                  -- 216 km/h
racer.ping = 180
for _ = 1, 5 do report(12, racer.coords.x - 95.0, racer.coords.y, racer.coords.z) end
check('a fast car with lag (95 m apart at 60 m/s, ping 180) is within tolerance', count(dets(c0), 'STATE_DESYNC') == 0)

local tp = SIM.players[13]
report(13, tp.coords.x + 2000.0, tp.coords.y, tp.coords.z)
report(13, tp.coords.x + 2000.0, tp.coords.y, tp.coords.z)
report(13)                                                -- third report matches again
report(13, tp.coords.x + 2000.0, tp.coords.y, tp.coords.z)
report(13, tp.coords.x + 2000.0, tp.coords.y, tp.coords.z)
check('two mismatches, then a match, then two more never add up', count(dets(c0), 'STATE_DESYNC') == 0)

CAC.markTeleport(13)
report(13, tp.coords.x + 2000.0, tp.coords.y, tp.coords.z)
report(13, tp.coords.x + 2000.0, tp.coords.y, tp.coords.z)
check('a script teleport (markTeleport grace) is not counted', count(dets(c0), 'STATE_DESYNC') == 0)

mk(9, 'Trusted', vector3(700.0, 700.0, 30.0)) -- license:lic9 is on the whitelist
report(9)
SIM.advance(45000)
for _ = 1, 4 do report(9, 9000.0, 9000.0, 30.0) end
check('Trust Whitelist players are skipped', CAC.isWhitelisted(9) and count(dets(c0), 'STATE_DESYNC') == 0)

title('position reports: the anti-cheat is fed a fake position')
c0 = mark()
local sp = SIM.players[11]
report(11, sp.coords.x + 400.0, sp.coords.y, sp.coords.z, 200, 100)
report(11, sp.coords.x + 410.0, sp.coords.y, sp.coords.z, 200, 100)
check('two mismatching reports are not enough', count(dets(c0), 'STATE_DESYNC') == 0)
report(11, sp.coords.x + 420.0, sp.coords.y, sp.coords.z, 200, 100)
local sd = dets(c0)
check('three in a row = spoofed position reports', count(sd, 'STATE_DESYNC', 'Spoofer') == 1)
local e = sd[#sd] and sd[#sd].details or {}
check('evidence: distance, tolerance, both positions, health and armour', e.distance == 400 and e.tolerance == 30
  and e.reportedPos and e.serverPos and e.reportedArmor == 100 and e.serverArmor == 0 and e.source == 'telemetry_mismatch', json.encode(e))

title('position reports: switch off / server without OneSync')
H.pushConfig({}, { rules = { anti_rapid_fire = true, anti_state_desync = false } })
c0 = mark()
for _ = 1, 4 do report(11, 9000.0, 9000.0, 40.0) end
check('rule off → nothing is compared', count(dets(c0), 'STATE_DESYNC') == 0)
H.pushConfig({}, { rules = ON })
sp.coords = vector3(0.0, 0.0, 0.0)                       -- what a server without OneSync returns
for _ = 1, 4 do report(11, 9000.0, 9000.0, 40.0) end
check('no server-side position (0,0,0) → skipped, never guessed', count(dets(c0), 'STATE_DESYNC') == 0)

title('players leaving')
for _, id in ipairs({ 7, 8, 11 }) do SIM.dispatch('playerDropped', id, 'Exiting') end
SIM.advance(3000)
check('a rapid-fire shooter and a spoofer can leave cleanly (state is freed)', #SIM.errors == 0, SIM.errors[1])

check('no script errors', #SIM.errors == 0, SIM.errors[1])
H.summary()
