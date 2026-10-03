-- shield/include.lua (the file `ac shield install` adds to a resource) together with
-- the anti-cheat's collector in client/secure_channel.lua.
--   CLIENT=1 CLIENT_FILES=shield/include.lua node tools/sim/run.cjs scenario_client_shield.lua
-- In FiveM the include runs in the PROTECTED resource's own Lua state; the simulator
-- has one state, so GetInvokingResource() is pinned to that resource here.
local passed, failed = 0, 0
local function check(name, cond, detail)
  if cond then passed = passed + 1; SIM.out('ok    ' .. name)
  else failed = failed + 1; SIM.out('FAIL  ' .. name .. (detail ~= nil and ('   -> ' .. tostring(detail)) or '')) end
end
local function title(s) SIM.out(''); SIM.out('=== ' .. s) end
local function tse()
  local last
  for _, m in ipairs(SIM.channel) do if m.kind == 'tse' then last = m end end
  return last
end
local function sent(name)
  local n = 0
  for _, e in ipairs(SIM.server) do if e.name == name then n = n + 1 end end
  return n
end

SIM.meta.shop = { shared_script = { '__shield.lua' } }
SIM.invoker = 'shop'

title('1. The include counts and passes every event through untouched')
-- (the anti-cheat's own start-up requests share this one Lua state in the simulator; let them pass)
SIM.advance(4000)
TriggerServerEvent('shop:buy', 'water', 2)
TriggerServerEvent('shop:buy', 'bread', 1)
TriggerServerEvent('shop:open')
check('events still reach the server with their arguments', sent('shop:buy') == 2 and SIM.server[#SIM.server].name == 'shop:open')
SIM.advance(1100)
local m = tse()
check('counts collected by the anti-cheat in the same tick and sent', m and m.payload.c['shop:buy'] == 2 and m.payload.c['shop:open'] == 1)
check('the protected resource is listed as alive', m and m.payload.r[1] == 'shop')

title('2. Nothing new → no traffic, then a heartbeat')
local function tseCount() local n = 0 for _, x in ipairs(SIM.channel) do if x.kind == 'tse' then n = n + 1 end end return n end
local n0 = tseCount()
SIM.advance(3000)
check('quiet seconds send no counts', tseCount() == n0, tseCount() - n0)
SIM.advance(9000)
check('…but a heartbeat with the alive list every 10 s', tseCount() > n0 and tse().payload.r[1] == 'shop')

title('3. Counts are taken exactly once')
TriggerServerEvent('shop:buy')
SIM.advance(1100)
check('each batch carries only what happened since the last one', tse().payload.c['shop:buy'] == 1)
check('every channel message signed and numbered', #SIM.channelBad == 0, table.concat(SIM.channelBad, ','))

SIM.out('')
SIM.out(('%d/%d checks passed%s   handler errors: %d'):format(passed, passed + failed, failed > 0 and ('  —  ' .. failed .. ' FAILED') or '', #SIM.errors))
for _, e in ipairs(SIM.errors) do SIM.out('   !! ' .. e) end
if __exit then __exit((failed > 0 or #SIM.errors > 0) and 1 or 0) end
