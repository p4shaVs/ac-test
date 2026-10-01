local out = SIM.out
local batches = {}
SIM.api['/heartbeat'] = function() return true, { config = { eventLogEnabled = true, watchEvents = { 'qb-bankrobbery:server:setBankState' }, rules = {}, ac = {} } } end
SIM.api['/event-log'] = function(b) batches[#batches + 1] = b.events; return true, {} end
SIM.api['/whitelist'] = function() return true, { whitelist = {
  { kind = 'license', value = 'license:scoped', full = false },
  { kind = 'discord', value = 'discord:9', full = false },
  { kind = 'license', value = 'license:full', full = true },
} } end
SIM.players[1] = { name = 'cheater', ped = 101, coords = vector3(0, 0, 30), vel = vector3(0, 0, 0), veh = 0, weapon = 0, ids = { 'license:scoped', 'discord:9' } }
SIM.players[2] = { name = 'victim', ped = 102, coords = vector3(5, 0, 30), vel = vector3(0, 0, 0), veh = 0, weapon = 0, ids = { 'license:full' } }
function IsPedAPlayer(e) return e == 101 or e == 102 end
function NetworkGetEntityFromNetworkId(n) return n end
SIM.entities[102] = { type = 1, owner = 2 }
SIM.advance(4000)
out('eventLogEnabled=' .. tostring(CAC.eventLogEnabled and CAC.eventLogEnabled()) .. ' requests=' .. #SIM.requests)
for _, r in ipairs(SIM.requests) do out('  req ' .. r.path) end
out('isWhitelisted(scoped player) = ' .. tostring(CAC.isWhitelisted(1)) .. '   isWhitelisted(full player) = ' .. tostring(CAC.isWhitelisted(2)))

-- ambient traffic (pop 5) must not be logged; 30 script spawns → cap 25 + summary; one repeated line merged
for i = 1, 40 do SIM.entities[5000 + i] = { type = 2, pop = 5, owner = 1, model = GetHashKey('blista') } SIM.dispatch('entityCreating', '', 5000 + i) end
for i = 1, 5 do SIM.entities[7000 + i] = { type = 2, pop = 7, owner = 1, model = GetHashKey('adder') } SIM.dispatch('entityCreating', '', 7000 + i) end
for i = 1, 30 do SIM.entities[6000 + i] = { type = 3, pop = 7, owner = 1, model = GetHashKey('prop_asteroid_01') + i } SIM.dispatch('entityCreating', '', 6000 + i) end
TriggerEvent('weaponDamageEvent', '1', { weaponType = GetHashKey('weapon_pistol'), weaponDamage = 34, hitGlobalId = 102 })
TriggerEvent('weaponDamageEvent', '1', { weaponType = GetHashKey('weapon_pistol'), weaponDamage = 180, hitGlobalId = 102, willKill = true })
TriggerEvent('explosionEvent', '1', { explosionType = 7, f210 = 5, damageScale = 1.0 })
SIM.net('qb-bankrobbery:server:setBankState', 1, 'pacific', true, { money = 25000, hacked = true })
SIM.net('qb-bankrobbery:server:notWatched', 1)
SIM.advance(2500)
local kinds = {}
for _, r in ipairs(SIM.requests) do if r.path == '/event-log' then batches[#batches + 1] = r.body.events end end
for _, b in ipairs(batches) do for _, e in ipairs(b) do
  kinds[e.kind] = (kinds[e.kind] or 0) + 1
  if e.kind ~= 'spawn' or e.count > 1 or e.detail:find('rate') then out(('%-9s %-8s #%d  %s  x%d'):format(e.kind, e.player, e.src, e.detail, e.count)) end
end end
local k = {} for a, b in pairs(kinds) do k[#k + 1] = a .. '=' .. b end table.sort(k)
out('line counts: ' .. table.concat(k, ' '))
out('errors: ' .. #SIM.errors) for _, e in ipairs(SIM.errors) do out('  ' .. e) end
