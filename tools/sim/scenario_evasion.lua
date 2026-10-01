local out = SIM.out
local function title(s) out(''); out('=== ' .. s) end
local rules = { anti_ban_evasion = true }
SIM.api['/heartbeat'] = function() return true, { config = { rules = rules } } end
local bans = {
  { id = 'b1', code = 'AC-AAAAAA', license = 'license:old', steam = 'steam:old', tokens = { '2:hw1', '3:hw2', '4:hw3', '5:hw4' }, deviceId = ('a'):rep(32) },
}
SIM.api['/bans'] = function() return true, { bans = bans } end
local evasions = {}
SIM.api['/bans/evasion'] = function(b)
  evasions[#evasions + 1] = b
  out(('EVASION POST banId=%s name=%s license=%s via=%s tokens=%d device=%s'):format(b.banId, b.playerName, tostring(b.license), b.via, b.tokens and #b.tokens or 0, tostring(b.deviceId)))
  return true, { banCode = 'AC-NEWNEW', linked = true }
end
SIM.api['/network/check'] = function() return true, { flagged = false } end
SIM.api['/players/sync'] = function(b)
  for _, p in ipairs(b.players) do out(('SYNC %s tokens=%d device=%s'):format(p.name, p.tokens and #p.tokens or 0, tostring(p.deviceId))) end
  return true, {}
end

local tokens = {}
function GetNumPlayerTokens(src) return #(tokens[tonumber(src)] or {}) end
function GetPlayerToken(src, i) return (tokens[tonumber(src)] or {})[i + 1] end
local function addPlayer(id, name, license, tk)
  SIM.players[id] = { name = name, ped = 100 + id, coords = vector3(0, 0, 0), vel = vector3(0, 0, 0), veh = 0, ids = { license, 'discord:' .. id } }
  tokens[id] = tk
end
local function connect(id)
  local card, done = nil, false
  local deferrals = {
    defer = function() end, update = function() end,
    presentCard = function(c) card = c end, done = function() done = true end,
  }
  SIM.dispatch('playerConnecting', id, SIM.players[id].name, function() end, deferrals)
  SIM.advance(4000)
  local ban = card and card:match('Ban ID: ([%w%-]+)')
  return done and 'ALLOWED' or ('BLOCKED ' .. tostring(ban))
end
local origJson = json.encode
json.encode = function(t)
  if type(t) == 'table' and t.body then
    for _, b in ipairs(t.body) do if b.text and b.text:find('Ban ID') then return b.text end end
    return 'card'
  end
  return origJson(t)
end

SIM.advance(3000); SIM.advance(62000)   -- heartbeat + ban list

title('1. banned player returns on a NEW account, same PC (4 of 4 tokens match)')
addPlayer(5, 'alt_account', 'license:new1', { '2:hw1', '3:hw2', '4:hw3', '5:hw4' })
out(connect(5))

title('2. innocent player on another PC shares ONE token (internet cafe / VM)')
addPlayer(6, 'innocent', 'license:inn', { '2:hw1', '3:zz2', '4:zz3', '5:zz4' })
out(connect(6))

title('3. new account, tokens spoofed, but the hidden PC marker is still there')
addPlayer(7, 'spoofer', 'license:new2', { '2:q1', '3:q2' })
out(connect(7))
SIM.net('coreac:device', 7, ('a'):rep(32))
SIM.advance(100)

title('4. the original banned account itself → normal ban (not evasion)')
addPlayer(8, 'original', 'license:old', { '2:hw1', '3:hw2' })
out(connect(8))

title('5. rule turned off in the panel → same-PC alt account allowed')
rules.anti_ban_evasion = false
SIM.advance(62000)
addPlayer(9, 'alt2', 'license:new3', { '2:hw1', '3:hw2', '4:hw3', '5:hw4' })
out(connect(9))
rules.anti_ban_evasion = true
SIM.advance(62000)

title('6. whitelisted brother on the same PC is allowed')
SIM.api['/whitelist'] = function() return true, { whitelist = { { kind = 'license', value = 'license:bro', full = true } } } end
SIM.advance(62000)
addPlayer(10, 'brother', 'license:bro', { '2:hw1', '3:hw2', '4:hw3', '5:hw4' })
out(connect(10))

title('7. player sync carries tokens + device marker')
SIM.net('coreac:device', 6, ('b'):rep(32))
SIM.advance(12000)

out('')
out('evasion posts: ' .. #evasions .. '   errors: ' .. #SIM.errors)
local paths = {} for _, r in ipairs(SIM.requests) do paths[r.path] = (paths[r.path] or 0) + 1 end
for p, n in pairs(paths) do out('REQ ' .. p .. ' x' .. n) end
for _, r in ipairs(SIM.requests) do if r.path == '/players/sync' then for _, p in ipairs(r.body.players) do out(('SYNCBODY %s tokens=%d device=%s'):format(p.name, p.tokens and #p.tokens or 0, tostring(p.deviceId))) end end end
