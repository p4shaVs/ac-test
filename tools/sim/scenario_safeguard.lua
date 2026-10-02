-- Safe Guard (Safe Events / Safe Scripts / Ignored Scripts / Injection Safe List)
-- through the real report intake, the trap system, entityCreating and the exports.
--   node tools/sim/run.cjs scenario_safeguard.lua
local check, title = H.check, H.title

H.api()
SIM.advance(3000)
H.pushConfig({})
SIM.advance(62000)

local nextId = 100
--- A fresh player each time so the 20 s per-type report gate never hides a result.
local function reporter()
  nextId = nextId + 1
  H.addPlayer(nextId, 'P' .. nextId)
  return nextId
end

--- Sends a CLIENT report and says whether it reached the panel.
local function clientReport(dtype, details)
  local src = reporter()
  local before = H.requestCount('/detections')
  SIM.net('coreac:report', src, dtype, 'HIGH', details)
  SIM.advance(200)
  return H.requestCount('/detections') > before
end

--- Same for a SERVER-side report.
local function serverReport(dtype, details)
  local src = reporter()
  local before = H.requestCount('/detections')
  TriggerEvent('coreac:serverReport', src, dtype, 'HIGH', details)
  SIM.advance(200)
  return H.requestCount('/detections') > before
end

H.pushConfig({
  SafeEvents = { 'my:safeEvent' },
  SafeScripts = { 'my_job' },
  IgnoredScripts = { 'my_ignored' },
  AntiResourceInjectionSafeList = { 'ox_lib/imports/print/client.lua', 'mapmanager' },
})

-- ---------------------------------------------------------------------------
title('1. The lists become sets on the server')
check('safe event recognised', CAC.isSafeEvent('my:safeEvent') == true and CAC.isSafeEvent('evil:event') == false)
check('safe script recognised', CAC.isSafeScript('my_job') == true and CAC.isSafeScript('evil') == false)
check('ignored script counts as safe too (superset)', CAC.isSafeScript('my_ignored') == true and CAC.isIgnoredScript('my_ignored') == true)
check('safe script is NOT ignored', CAC.isIgnoredScript('my_job') == false)
check('source path reduced to its resource name', CAC.isInjectionSafe('ox_lib') == true and CAC.isInjectionSafe('@ox_lib/imports/x.lua') == true)
check('plain resource name in the injection list', CAC.isInjectionSafe('mapmanager') == true)
check('safe scripts also pass the injection check', CAC.isInjectionSafe('my_job') == true)
check('unknown resource is not exempt anywhere', not CAC.isInjectionSafe('evil_menu') and not CAC.isSafeScript('evil_menu'))
check('resourceKey handles "@res/path" and plain names', CAC.resourceKey('@a/b/c.lua') == 'a' and CAC.resourceKey('plain') == 'plain' and CAC.resourceKey(5) == nil)

-- ---------------------------------------------------------------------------
title('2. Intake filter — client reports (coreac:report)')
check('trap event in Safe Events → never reaches the panel', clientReport('CHEAT_EVENT_HONEYPOT', { event = 'my:safeEvent' }) == false)
check('trap event NOT in Safe Events → reported', clientReport('CHEAT_EVENT_HONEYPOT', { event = 'evil:event' }) == true)
check('resource injection by an injection-safe path (ox_lib) → dropped', clientReport('RESOURCE_INJECT', { resource = 'ox_lib' }) == false)
check('resource injection by a Safe Script → dropped', clientReport('RESOURCE_INJECT', { resource = 'my_job' }) == false)
check('resource injection by an Ignored Script → dropped', clientReport('RESOURCE_INJECT', { resource = 'my_ignored' }) == false)
check('resource injection by an unknown resource → reported', clientReport('RESOURCE_INJECT', { resource = 'evil_menu' }) == true)
check('…attribution can arrive as resourceName too', clientReport('RESOURCE_INJECT', { resourceName = 'mapmanager' }) == false)
check('resource STOP of a Safe Script is still reported (stopping a trusted script is a cheat)', clientReport('AC_TAMPER', { resourceName = 'my_job' }) == true)
check('resource stop of an Ignored Script → dropped', clientReport('AC_TAMPER', { resourceName = 'my_ignored' }) == false)
check('isolated vehicle spawned by a Safe Script → dropped', clientReport('ISOLATED_VEHICLE', { script = 'my_job' }) == false)
check('isolated vehicle from an unknown script → reported', clientReport('ISOLATED_VEHICLE', { script = 'evil_menu' }) == true)
check('a report with no attribution is untouched', clientReport('NOCLIP', { info = 'x' }) == true)
check('anything attributed to an Ignored Script is dropped, whatever the type', clientReport('NOCLIP', { resource = 'my_ignored' }) == false)

-- ---------------------------------------------------------------------------
title('3. Intake filter — server reports (coreac:serverReport)')
check('honeypot on a Safe Event → dropped', serverReport('CHEAT_EVENT_HONEYPOT', { event = 'my:safeEvent' }) == false)
check('honeypot on another event → reported', serverReport('CHEAT_EVENT_HONEYPOT', { event = 'evil:event' }) == true)
check('backdoor call by a Safe Script → dropped', serverReport('BACKDOOR', { invoker = 'my_job' }) == false)
check('backdoor call by an unknown script → reported', serverReport('BACKDOOR', { invoker = 'evil' }) == true)

-- ---------------------------------------------------------------------------
title('4. Trap system: Safe Events are never armed, and never broadcast to players')
H.pushConfig({ SafeEvents = { 'a:safe' } }, { protectedEvents = { 'a:safe', 'b:trap' } })
local pe = H.clientEvents('coreac:protectedEvents')
local last = pe[#pe] and pe[#pe].args[1] or {}
local has = {}
for _, e in ipairs(last) do has[e] = true end
check('broadcast trap list excludes the Safe Event', not has['a:safe'] and has['b:trap'], table.concat(last, ','))
local trapSrc = reporter()
local before = H.requestCount('/detections')
SIM.net('b:trap', trapSrc)
SIM.advance(200)
check('a real trap still fires', H.requestCount('/detections') > before)
SIM.net('a:safe', reporter())
check('a Safe Event was never armed (not even net-safe)', SIM.netSafe['a:safe'] ~= true)

-- armed first, added to Safe Events afterwards (no heartbeat in between)
H.pushConfig({}, { protectedEvents = { 'late:event' } })
CAC.setSafeGuard({ SafeEvents = { 'late:event' } })
before = H.requestCount('/detections')
SIM.net('late:event', reporter())
SIM.advance(200)
check('an already-armed trap stays silent once it is a Safe Event', H.requestCount('/detections') == before)
CAC.setSafeGuard({})

-- ---------------------------------------------------------------------------
title('5. Entities created by Safe / Ignored Scripts skip the spawn checks')
H.pushConfig({ SafeScripts = { 'my_job' }, IgnoredScripts = { 'my_ignored' } })
local function spawn(eid, script)
  -- owner ≠ first owner makes the guard cancel — unless the creator is trusted.
  SIM.entities[eid] = { type = 2, owner = 5, first = 6, script = script, model = 0x12345, pop = 7 }
  return SIM.dispatch('entityCreating', '', eid)
end
check('unknown script, ownership mismatch → spawn cancelled (guard works)', spawn(900, 'evil_menu') == true)
check('Safe Script entity → not cancelled', spawn(901, 'my_job') == false)
check('Ignored Script entity → not cancelled', spawn(902, 'my_ignored') == false)
check('entity with no creator script → unchanged (cancelled)', spawn(903, nil) == true)

-- ---------------------------------------------------------------------------
title('6. Teleport / revive handoff from a trusted script gets a longer grace')
local seen = {}
local realGrant = CAC.grantTp
CAC.grantTp = function(src, ms) seen[#seen + 1] = ms or 'default'; return realGrant(src, ms) end
local realRevive = CAC.grantRevive
local reviveSeen = {}
CAC.grantRevive = function(src, ms) reviveSeen[#reviveSeen + 1] = ms or 'default'; return realRevive(src, ms) end
H.addPlayer(950, 'Teleported')
SIM.invoker = 'my_job'
SIM.exports.markTeleport(950)
SIM.exports.markRevive(950)
SIM.invoker = 'some_other_script'
SIM.exports.markTeleport(950)
SIM.exports.markRevive(950)
SIM.invoker = nil
TriggerEvent('coreac:markTeleport', 950)
check('export from a Safe Script → 15 s grace', seen[1] == 15000, seen[1])
check('export from any other script → default grace', seen[2] == 'default', seen[2])
check('server event (caller unknown) → default grace', seen[3] == 'default', seen[3])
check('revive from a Safe Script → 15 s grace', reviveSeen[1] == 15000, reviveSeen[1])
check('revive from any other script → default', reviveSeen[2] == 'default', reviveSeen[2])
CAC.grantTp, CAC.grantRevive = realGrant, realRevive

-- ---------------------------------------------------------------------------
title('7. Anti-backdoor hooks ignore trusted callers')
H.pushConfig({ SafeScripts = { 'my_job' }, EnableAntiBackdoors = true, StopServerWhenDetected = false })
SIM.invoker = 'unknown_tool'
check('rcon_password read by an unknown resource is blocked (returns true)', SIM.exports.checkConvar('rcon_password') == true)
SIM.invoker = 'my_job'
check('rcon_password read by a Safe Script is allowed (returns false)', SIM.exports.checkConvar('rcon_password') == false)
SIM.invoker = nil

-- ---------------------------------------------------------------------------
title('8. Nothing of this reaches the players')
local cfgEvents = H.clientEvents('coreac:acConfig')
local payload = json.encode(cfgEvents[#cfgEvents] and cfgEvents[#cfgEvents].args[1] or {})
for _, secret in ipairs({ 'my_job', 'my_ignored', 'my:safeEvent', 'ox_lib' }) do
  check("'" .. secret .. "' is absent from the config broadcast", payload:find(secret, 1, true) == nil)
end

H.summary()
