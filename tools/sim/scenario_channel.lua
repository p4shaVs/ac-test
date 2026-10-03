-- server/secure_channel.lua — the anti-cheat's signed, numbered line to the server.
--   node tools/sim/run.cjs scenario_channel.lua
H.api()
H.pushConfig({})

-- Every report the channel raises, BEFORE the 20 s per-type gate in main.lua.
local reports = {}
AddEventHandler('coreac:serverReport', function(src, dtype, _, d)
  reports[#reports + 1] = { src = tonumber(src), type = dtype, d = d or {} }
end)
local function find(src, check, dtype)
  for i = #reports, 1, -1 do
    local r = reports[i]
    if r.src == src and (not dtype or r.type == dtype) and (not check or r.d.check == check) then return r end
  end
  return nil
end
local function countFor(src)
  local n = 0
  for _, r in ipairs(reports) do if r.src == src then n = n + 1 end end
  return n
end

local N = CAC.channelNames

-- ------------------------------------------------------------- a well-behaved client
local clients = {}
local function keyFor(id)
  for i = #SIM.clientEvents, 1, -1 do
    local e = SIM.clientEvents[i]
    if e.name == N.key and e.target == id then return { e.args[1], e.args[2] }, e.args[3], i end
  end
end
local function connect(id, name, o)
  o = o or {}
  local p = H.addPlayer(id, name)
  p.coords = o.coords or vector3(100 + id, 200, 30)
  p.ping = o.ping
  SIM.dispatch('playerJoining', id)
  local c = { id = id, seq = 0, ticks = 0, answered = 0, wrong = o.wrong, frozen = o.frozen, quiet = false }
  clients[id] = c
  if not o.noHello then
    SIM.net(N.hello, id, 1, 4242 + id)
    c.key = keyFor(id)
  end
  return c
end
local function send(c, kind, payload, o)
  o = o or {}
  c.seq = o.seq or (c.seq + 1)
  local sig = o.sig or CoreAC.ChannelSig(c.key, c.seq, kind)
  SIM.net(N.msg, c.id, c.seq, kind, sig, payload)
end

-- Drives every honest client: alive every 10 s, answers each challenge.
local lastChal, aliveTimer = 0, 0
SIM.onTick = function(step)
  aliveTimer = aliveTimer + step
  for _, c in pairs(clients) do
    if c.key and not c.quiet then
      if not c.frozen then c.ticks = c.ticks + (step / 200) end
    end
  end
  if aliveTimer >= 10000 then
    aliveTimer = 0
    for _, c in pairs(clients) do
      if c.key and not c.quiet then send(c, 'alive', { t = math.floor(c.ticks) }) end
    end
  end
  for i = lastChal + 1, #SIM.clientEvents do
    local e = SIM.clientEvents[i]
    local c = e.name == N.chal and clients[e.target] or nil
    if c and c.key and not c.quiet then
      local nonce = e.args[1]
      local answer = c.wrong and 12345 or CoreAC.ChannelAnswer(c.key, nonce)
      send(c, 'reply', { n = nonce, a = answer, t = math.floor(c.ticks) })
      c.answered = c.answered + 1
    end
  end
  lastChal = #SIM.clientEvents
end

-- ---------------------------------------------------------------------------
H.title('1. Random names and the handshake')
H.check('event names are random, published in GlobalState', type(N) == 'table' and GlobalState.coreac_ch == N and #N.msg >= 10
  and N.msg ~= N.hello and N.msg:sub(1, 7) ~= 'coreac:')
local alice = connect(1, 'Alice')
H.check('hello answered with a session key echoing the client nonce', alice.key ~= nil and select(2, keyFor(1)) == 4243)
H.check('session open', CAC.hasChannel(1))
local before = #SIM.clientEvents
SIM.net(N.hello, 1, 1, 4243)
local k2 = keyFor(1)
H.check('hello retried before any message: same key re-sent, nothing reported', k2[1] == alice.key[1] and k2[2] == alice.key[2] and countFor(1) == 0 and #SIM.clientEvents > before)

H.title('2. An honest client is never reported')
SIM.advance(300000)
H.check('5 minutes of play: challenges answered', alice.answered >= 8, alice.answered)
H.check('…and not a single report', countFor(1) == 0, countFor(1))

H.title('3. Forged, replayed and blocked messages')
local bob = connect(2, 'Bob')
send(bob, 'alive', { t = 1 })
send(bob, 'alive', { t = 2 }, { sig = 999 })
H.check('one forged message alone: not yet reported', find(2, 'forged') == nil)
send(bob, 'alive', { t = 3 }, { sig = 998 })
H.check('a second forged message: AC_TAMPER (forged)', find(2, 'forged', 'AC_TAMPER') ~= nil)

local carl = connect(3, 'Carl')
send(carl, 'alive', {})
send(carl, 'alive', {})
send(carl, 'report', { t = 'NOCLIP', s = 'HIGH', d = {} }, { seq = carl.seq + 4 })
local gap = find(3, 'gap')
H.check('sequence jumped: AC_TAMPER (messages blocked), 3 missing', gap ~= nil and gap.d.missing == 3, gap and gap.d.missing)
for _ = 1, 3 do send(carl, 'alive', {}, { seq = 1 }) end
H.check('the same old message replayed 3 times: AC_TAMPER (replay)', find(3, 'replay') ~= nil)

local dina = connect(4, 'Dina')
send(dina, 'alive', {})
SIM.net(N.hello, 4, 1, 99)
H.check('hello after the anti-cheat already talked: AC_TAMPER (restarted on the client)', find(4, 'restart') ~= nil)
local newKey = keyFor(4)
H.check('…and a fresh session key was issued', newKey and (newKey[1] ~= dina.key[1] or newKey[2] ~= dina.key[2]))
dina.key, dina.seq = newKey, 0

H.title('4. Never started: blocked anti-cheat')
local erin = connect(5, 'Erin', { noHello = true })
local frank = connect(6, 'Frank', { noHello = true, coords = vector3(0, 0, 0) })
local gina = connect(7, 'Gina', { noHello = true })
SIM.players[7].ping = 0
local t0 = SIM.now
local moveHook = SIM.onTick
SIM.onTick = function(step)
  moveHook(step)
  local d = (SIM.now - t0) / 1000
  SIM.players[5].coords = vector3(100 + d, 200, 30)
  SIM.players[7].coords = vector3(300 + d, 200, 30)
end
SIM.advance(150000)
H.check('2.5 minutes without a hello: not yet (slow loaders get 3 minutes)', find(5, 'never') == nil)
SIM.advance(40000)
local never = find(5, 'never')
H.check('3 minutes in session, walking, no hello: AC_TAMPER (never started)', never ~= nil, never and never.d.moved)
H.check('a player still on the loading screen (not moving) is left alone', find(6, 'never') == nil)
H.check('a player with a broken connection (ping 0) is left alone', find(7, 'never') == nil)
SIM.onTick = moveHook

H.title('5. Silence, wrong answers and frozen threads')
local hank = connect(8, 'Hank')
SIM.advance(30000)
hank.quiet = true
SIM.advance(80000)
H.check('the anti-cheat stops talking: AC_TAMPER (went quiet)', find(8, 'silent') ~= nil)

local ivy = connect(9, 'Ivy')
SIM.advance(30000)
SIM.players[9].ping = 0
SIM.players[9].lastMsg = 60000   -- the connection is really gone: nothing arrives from that game
ivy.quiet = true
SIM.advance(120000)
H.check('the same silence while the connection is broken (ping 0, nothing arriving): nothing', find(9, 'silent') == nil and find(9, 'challenge') == nil)

local lag = connect(18, 'Lagger')
SIM.advance(30000)
SIM.players[18].ping = 650          -- "fake lag": the game keeps talking (lastMsg 0) with a huge ping
lag.quiet = true
SIM.advance(200000)
H.check('fake lag hides a dead anti-cheat for a few minutes…', find(18, 'silent') == nil)
SIM.advance(120000)
H.check('…but not past 5 minutes of silence while the game still talks: AC_TAMPER (went quiet)', find(18, 'silent') ~= nil)

local jack = connect(10, 'Jack', { wrong = true })
SIM.advance(200000)
H.check('three wrong challenge answers: AC_TAMPER (challenge failed)', find(10, 'challenge') ~= nil)
H.check('…never reported as silent (it still talks)', find(10, 'silent') == nil)

local kim = connect(11, 'Kim', { frozen = true })
SIM.advance(200000)
H.check('answers right but the loop counter never moves: AC_TAMPER (threads frozen)', find(11, 'frozen') ~= nil)
H.check('…the honest client from section 1 is still clean', countFor(1) == 0, countFor(1))

H.title('6. Old event names are traps; stray messages')
local leo = connect(12, 'Leo')
SIM.net('coreac:alive', 12)
H.check('one old "coreac:alive": nothing yet', find(12, 'legacy') == nil)
SIM.net('coreac:alive', 12)
H.check('a pre-made bypass sending it again: AC_TAMPER (old event name)', find(12, 'legacy') ~= nil)
H.addPlayer(13, 'Mona')
for i = 1, 3 do SIM.net(N.msg, 13, i, 'alive', 1, {}) end
H.check('channel messages with no session at all: AC_TAMPER (stray)', find(13, 'stray') ~= nil)

H.title('7. What the client reports through the channel')
SIM.resources = { coreac = 'started', ox_lib = 'started', ['qb-core'] = 'started' }
-- What the panel ships on (config.lua alone has these off).
CoreAC.Config.Main.AntiResourceInjection, CoreAC.Config.Main.AntiLuaMenu = true, true
local nina = connect(14, 'Nina')
local det0 = H.requestCount('/detections')
send(nina, 'report', { t = 'NOCLIP', s = 'HIGH', d = { info = 'x' } })
SIM.advance(200)
local dets = H.requests('/detections')
local lastDet = dets[#dets]
H.check('a report rides the channel into the normal pipeline (origin client)', #dets > det0 and lastDet.body.type == 'NOCLIP' and lastDet.body.origin == 'client')
send(nina, 'res', { '_cfx_internal', 'coreac', 'ox_lib', 'qb-core', 'evil_menu' })
local inj = find(14, nil, 'RESOURCE_INJECT')
SIM.advance(200)
local injReq
for _, r in ipairs(H.requests('/detections')) do if r.body.type == 'RESOURCE_INJECT' then injReq = r end end
H.check('a resource the server does not have: RESOURCE_INJECT (verified on the server, capped as client evidence)', inj ~= nil and inj.d.resource == 'evil_menu' and injReq and injReq.body.origin == 'client')
send(nina, 'res', { 'coreac', 'evil_menu' })
local injN = 0
for _, r in ipairs(reports) do if r.src == 14 and r.type == 'RESOURCE_INJECT' then injN = injN + 1 end end
H.check('…reported once, not on every list', injN == 1, injN)
CAC.setSafeGuard({ AntiResourceInjectionSafeList = { 'my_extra' } })
local olive = connect(15, 'Olive')
send(olive, 'res', { 'coreac', 'my_extra', '_cfx_tool' })
H.check('Injection Safe List and _cfx internals are never flagged', find(15, nil, 'RESOURCE_INJECT') == nil)
CAC.setSafeGuard({})
send(nina, 'cmds', { { n = 'e', r = 'ox_lib' }, { n = 'openmenu', r = 'evil_menu2' } })
local cmd = find(14, nil, 'CHEAT_MENU_SUSPECTED')
H.check('a command from a resource the server does not have: weak signal (log only)', cmd ~= nil and cmd.d.resource == 'evil_menu2')

H.title('8. Trust Whitelist and switched-off detections')
local orig = CAC.isWhitelisted
CAC.isWhitelisted = function(src) return tonumber(src) == 16 or orig(src) end
local paul = connect(16, 'Paul')
send(paul, 'alive', {}, { sig = 1 })
send(paul, 'alive', {}, { sig = 2 })
H.check('a whitelisted player forging messages: no report', find(16, 'forged') == nil)
CAC.isWhitelisted = orig
Config.DetectionsEnabled = false
local quinn = connect(17, 'Quinn')
send(quinn, 'alive', {}, { sig = 1 })
send(quinn, 'alive', {}, { sig = 2 })
H.check('detections switched off: no report', find(17, 'forged') == nil)
Config.DetectionsEnabled = true

H.title('9. Leaving cleans up')
SIM.players[1] = nil
SIM.dispatch('playerDropped', 1, 'Exiting')
H.check('session removed on drop', not CAC.hasChannel(1))

H.summary()
