-- client/secure_channel.lua — the client end of the anti-cheat's line, spoof-proof
-- control events, the settings seal, and what the anti-cheat reports about the game.
--   CLIENT=1 CLIENT_FILES=client/integrity.lua,client/pedModel.lua node tools/sim/run.cjs scenario_client_channel.lua
local passed, failed = 0, 0
local function check(name, cond, detail)
  if cond then passed = passed + 1; SIM.out('ok    ' .. name)
  else failed = failed + 1; SIM.out('FAIL  ' .. name .. (detail ~= nil and ('   -> ' .. tostring(detail)) or '')) end
end
local function title(s) SIM.out(''); SIM.out('=== ' .. s) end

local function msgs(kind)
  local out = {}
  for _, m in ipairs(SIM.channel) do if m.kind == kind then out[#out + 1] = m end end
  return out
end
local function tamperFor(field, value)
  for _, m in ipairs(msgs('report')) do
    local p = m.payload
    if p and p.t == 'AC_TAMPER' and p.d and p.d[field] == value then return p.d end
  end
  return nil
end

title('1. Handshake and the signed, numbered line')
SIM.advance(1000)
check('hello sent on the random name from GlobalState', SIM.hellos >= 1)
check('session key received', CAC.channelReady())
CAC.report('NOCLIP', 'HIGH', { info = 'x' }, 0)
SIM.advance(11000)
check('a detection report rides the channel', #msgs('report') >= 1 and msgs('report')[1].payload.t == 'NOCLIP')
check('alive messages flow every 10 s', #msgs('alive') >= 1)
check('every message signed with the session key, numbers without gaps', #SIM.channelBad == 0, table.concat(SIM.channelBad, ','))
local oldNames = 0
for _, e in ipairs(SIM.server) do if e.name == 'coreac:alive' or e.name == 'coreac:challengeReply' or e.name == 'coreac:report' then oldNames = oldNames + 1 end end
check('the old fixed event names are never used any more', oldNames == 0, oldNames)

title('2. Control events only the server may send')
SIM.fromServer('coreac:rules', { anti_noclip = true })
check('server rules applied', CoreAC.Config.Main.AntiNoClip == true)
TriggerEvent('coreac:rules', { anti_noclip = false })
check('the same event fired locally by an executor is refused', CoreAC.Config.Main.AntiNoClip == true)
check('…and reported as a spoofed control event', tamperFor('event', 'coreac:rules') ~= nil)
TriggerEvent('coreac:acConfig', { Main = { AntiNoClip = false } })
check('a local acConfig is refused too', CoreAC.Config.Main.AntiNoClip == true and tamperFor('event', 'coreac:acConfig') ~= nil)
TriggerEvent('__CoreAC:isInvincible', true)
check('a local "you are allowed godmode" event is refused', CoreAC.isInvincible ~= true and tamperFor('event', '__CoreAC:isInvincible') ~= nil)
TriggerEvent('coreac:grantTp')
check('a local teleport exemption is refused', not CAC.tpGrace() and tamperFor('event', 'coreac:grantTp') ~= nil)
SIM.fromServer('coreac:grantTp')
check('the server granting it still works', CAC.tpGrace())
SIM.advance(11000)

local spawned = CoreAC.playerSpawned
TriggerEvent('QBCore:Client:OnPlayerUnload')
check('a local framework "logged out" (pauses every client check) is ignored', CoreAC.playerSpawned == spawned)
TriggerEvent('txcl:setPlayerMode', 'noclip')
check('a local txAdmin noclip mode is ignored', CAC.adminTool == nil)
check('…third-party event names are not reported (their own resource may fire them)', tamperFor('event', 'txcl:setPlayerMode') == nil)
SIM.fromServer('txcl:setPlayerMode', 'noclip')
check('txAdmin itself switching noclip on still works', CAC.adminTool == 'noclip')
SIM.fromServer('txcl:setPlayerMode', 'none')

title('3. Settings sealed in memory')
SIM.fromServer('coreac:rules', { anti_noclip = true, anti_godmode = true })
check('server settings do not trip the seal', CAC.checkSeal() == nil)
CoreAC.Config.Main.AntiNoClip = false
check('injected code switching a detection off in memory is caught', CAC.checkSeal() == 'AntiNoClip' and tamperFor('key', 'AntiNoClip') ~= nil)
SIM.fromServer('coreac:rules', { anti_noclip = true })

title('4. Internal events and integration points')
SIM.invoker = 'evil_menu'
TriggerEvent('coreac:pedChanged')
check('"model changed legitimately" fired by another resource is refused', tamperFor('event', 'coreac:pedChanged') ~= nil)
SIM.invoker = nil
serverResources = {}
for _, r in ipairs({ 'coreac', 'qb-core', 'qb-garages', 'ox_lib', 'oxmysql', 'qb-inventory', 'qb-phone', 'qb-hud', 'qb-target', 'qb-menu' }) do serverResources[r] = true end
CAC.grace.tp = 0
SIM.invoker = 'evil_menu'
TriggerEvent('coreac:markTeleport')
check('a teleport exemption asked by a resource the server does not have is refused', not CAC.tpGrace() and tamperFor('event', 'evil_menu') ~= nil)
SIM.invoker = 'qb-garages'
TriggerEvent('coreac:markTeleport')
check('…a real server resource still gets it', CAC.tpGrace())
SIM.invoker = nil

title('5. Challenge')
local before = #msgs('reply')
SIM.fromServer(SIM.CH.chal, 777)
local rep = msgs('reply')[#msgs('reply')]
check('challenge answered with the keyed answer and the loop counter', #msgs('reply') == before + 1 and rep.payload.a == CoreAC.ChannelAnswer(SIM.KEY, 777) and rep.payload.t > 0)
TriggerEvent(SIM.CH.chal, 5)
check('a challenge faked locally is not answered', #msgs('reply') == before + 1)
TriggerEvent(SIM.CH.key, 1, 2, 3)
check('a session key faked locally is reported', tamperFor('event', 'key') ~= nil)

title('6. Resources and commands on the player\'s game')
SIM.clientResources = { 'coreac', 'ox_lib', 'evil_menu' }
SIM.commandList = { { name = 'e', resource = 'ox_lib' }, { name = 'quit', resource = '' }, { name = 'menu', resource = 'evil_menu' } }
SIM.advance(61000)
local res = msgs('res')[#msgs('res')]
check('started resources sent to the server', res and #res.payload == 3)
local cmds = msgs('cmds')[1]
check('commands of named resources sent (engine commands skipped)', cmds and #cmds.payload == 2, cmds and #cmds.payload)
SIM.advance(30000)
check('…each command only once', #msgs('cmds') == 1, #msgs('cmds'))

title('7. Event Shield counts')
SIM.meta.shop = { shared_script = { '__shield.lua', 'config.lua' } }
AddEventHandler(SIM.CH.pull, function()
  SIM.invoker = 'shop'
  TriggerEvent(SIM.CH.put, { ['shop:buy'] = 2 }, {})
  SIM.invoker = nil
end)
SIM.advance(1100)
local tse = msgs('tse')[#msgs('tse')]
check('protected resource counts collected and sent', tse and tse.payload.c['shop:buy'] == 2 and tse.payload.r[1] == 'shop')
SIM.invoker = 'evil_menu'
TriggerEvent(SIM.CH.put, { ['shop:buy'] = 50 }, {})
SIM.invoker = nil
check('counts "claimed" by a resource without the shield are refused and reported',
  tamperFor('reason', 'fake Event Shield counts sent from outside a protected resource') ~= nil)

title('8. Integrity of the anti-cheat\'s own Lua state')
local real = GetEntityHealth
GetEntityHealth = function() return 200 end
CoreAC.CheckIntegrity()
check('a native the checks read, replaced by an executor', tamperFor('hooked', 'GetEntityHealth') ~= nil)
GetEntityHealth = real
local realReport = CAC.report
CAC.report = function() end
CoreAC.CheckIntegrity()
check('the anti-cheat\'s own report function, replaced', tamperFor('hooked', 'CAC.report') ~= nil)
CAC.report = realReport
check('still no bad signature or sequence after everything', #SIM.channelBad == 0, table.concat(SIM.channelBad, ','))

SIM.out('')
SIM.out(('%d/%d checks passed%s   handler errors: %d'):format(passed, passed + failed, failed > 0 and ('  —  ' .. failed .. ' FAILED') or '', #SIM.errors))
for _, e in ipairs(SIM.errors) do SIM.out('   !! ' .. e) end
if __exit then __exit((failed > 0 or #SIM.errors > 0) and 1 or 0) end
