-- client/integrity.lua: code injected into the anti-cheat's own Lua state is reported.
--   CLIENT=1 CLIENT_FILES=client/integrity.lua node tools/sim/run.cjs scenario_client_integrity.lua
local passed, failed = 0, 0
local function check(name, cond, detail)
  if cond then passed = passed + 1; SIM.out('ok    ' .. name)
  else failed = failed + 1; SIM.out('FAIL  ' .. name .. (detail ~= nil and ('   -> ' .. tostring(detail)) or '')) end
end
local function title(s) SIM.out(''); SIM.out('=== ' .. s) end

local tampers = {}
SIM.onServerEvent = function(name, dtype, severity, details)
  if name == 'coreac:report' and dtype == 'AC_TAMPER' then tampers[#tampers + 1] = details and details.hooked end
end
local function hooked(name)
  for _, h in ipairs(tampers) do if h == name then return true end end
  return false
end

title('1. an untouched anti-cheat is never reported')
SIM.advance(60000)
check('a minute of play: no report', #tampers == 0, #tampers)

title('2. an executor replaces TriggerServerEvent inside the anti-cheat to swallow reports')
local realTSE = TriggerServerEvent
TriggerServerEvent = function(name, ...) if name == 'coreac:report' then return end return realTSE(name, ...) end
SIM.advance(16000)
check('reported, through the ORIGINAL function (the hook would have swallowed it)', hooked('TriggerServerEvent'), table.concat(tampers, ','))
local n = #tampers
SIM.advance(60000)
check('reported once, not every 15 s', #tampers == n)

title('3. thread freezing (Citizen.Wait) and the anti-cheat\'s own report function')
local realWait = Citizen.Wait
Citizen.Wait = function(ms) return realWait(ms) end
CoreAC.DetectPlayer = function() end
SIM.advance(16000)
check('Citizen.Wait reported', hooked('Citizen.Wait'))
check('CoreAC.DetectPlayer reported', hooked('CoreAC.DetectPlayer'))

title('4. AddEventHandler hooked to drop the anti-cheat\'s handlers')
local realAEH = AddEventHandler
AddEventHandler = function(...) return realAEH(...) end
SIM.advance(16000)
check('AddEventHandler reported', hooked('AddEventHandler'))

SIM.out('')
SIM.out(('%d/%d checks passed%s   handler errors: %d'):format(passed, passed + failed, failed > 0 and ('  —  ' .. failed .. ' FAILED') or '', #SIM.errors))
for _, e in ipairs(SIM.errors) do SIM.out('   !! ' .. e) end
if __exit then __exit((failed > 0 or #SIM.errors > 0) and 1 or 0) end
