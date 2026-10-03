-- Client side of the Settings tab: dynamic command prefix, framework names, the ban
-- video hand-off to the NUI, and the evidence-screenshot quality parameter.
--   CLIENT=1 CLIENT_FILES=client/admin.lua,client/main.lua node tools/sim/run.cjs scenario_client_settings.lua
local passed, failed = 0, 0
local function check(name, cond, detail)
  if cond then passed = passed + 1; SIM.out('ok    ' .. name)
  else failed = failed + 1; SIM.out('FAIL  ' .. name .. (detail ~= nil and ('   -> ' .. tostring(detail)) or '')) end
end
local function title(s) SIM.out(''); SIM.out('=== ' .. s) end

local serverEvents = {}
SIM.onServerEvent = function(name, ...) serverEvents[#serverEvents + 1] = { name = name, args = { ... } } end
local function serverEventCount(name)
  local n = 0
  for _, e in ipairs(serverEvents) do if e.name == name then n = n + 1 end end
  return n
end

SIM.advance(1000)

-- ---------------------------------------------------------------------------
title('1. Command Prefix (chat command registered by client/admin.lua)')
check('default command "ac" is registered', type(SIM.commands.ac) == 'function')
local before = serverEventCount('coreac:requestPerms')
SIM.commands.ac(0, {})
check('"ac" works before any change', serverEventCount('coreac:requestPerms') == before + 1)

SIM.fromServer('coreac:prefix', 'sec')
check('the server can change the prefix', type(SIM.commands.sec) == 'function')
before = serverEventCount('coreac:requestPerms')
SIM.commands.sec(0, {})
check('the new prefix runs the admin command', serverEventCount('coreac:requestPerms') == before + 1)
before = serverEventCount('coreac:requestPerms')
SIM.commands.ac(0, {})
check('the OLD prefix is now inert (a registered command cannot be removed, so it is gated)', serverEventCount('coreac:requestPerms') == before)

for _, bad in ipairs({ 'Bad Prefix', 'quit;', '', '1abc', 'UPPER' }) do
  local prev = {}
  for k in pairs(SIM.commands) do prev[k] = true end
  SIM.fromServer('coreac:prefix', bad)
  local added = false
  for k in pairs(SIM.commands) do if not prev[k] then added = true end end
  check("invalid prefix '" .. bad .. "' is ignored (no command registered)", not added)
end
SIM.fromServer('coreac:prefix', 7)
check('a non-string prefix is ignored', SIM.commands['7'] == nil)
SIM.fromServer('coreac:prefix', 'ac')
before = serverEventCount('coreac:requestPerms')
SIM.commands.ac(0, {})
check('switching back re-enables "ac" (and disables "sec")', serverEventCount('coreac:requestPerms') == before + 1)
before = serverEventCount('coreac:requestPerms')
SIM.commands.sec(0, {})
check('…"sec" is inert again', serverEventCount('coreac:requestPerms') == before)

-- ---------------------------------------------------------------------------
title('2. Framework resource names')
check('defaults', CAC.fwNames.qb == 'qb-core' and CAC.fwNames.qbx == 'qbx_core' and CAC.fwNames.esx == 'es_extended')
SIM.fromServer('coreac:frameworks', { qb = 'my-core', qbx = 'qbx_custom', esx = 'esx_custom' })
check('names follow the server setting', CAC.fwNames.qb == 'my-core' and CAC.fwNames.qbx == 'qbx_custom' and CAC.fwNames.esx == 'esx_custom')
SIM.fromServer('coreac:frameworks', { qb = 'bad name; drop', qbx = string.rep('x', 100), esx = 5 })
check('invalid names are rejected, the last good ones stay', CAC.fwNames.qb == 'my-core' and CAC.fwNames.qbx == 'qbx_custom' and CAC.fwNames.esx == 'esx_custom')
SIM.fromServer('coreac:frameworks', 'not a table')
check('a non-table payload is ignored', CAC.fwNames.qb == 'my-core')

-- ---------------------------------------------------------------------------
title('3. Ban video: server → NUI → server')
SIM.nui = {}
SIM.fromServer('coreac:banVideo', 'https://cdn.example.com/ban.mp4', 15000)
local msg = SIM.nui[#SIM.nui]
check('the URL is handed to the NUI as a banVideo message', msg and msg.type == 'banVideo' and msg.url == 'https://cdn.example.com/ban.mp4' and msg.ms == 15000)
local nuiBefore = #SIM.nui
SIM.fromServer('coreac:banVideo', 12345, 15000)
check('a non-string URL is ignored', #SIM.nui == nuiBefore)
check('the NUI callback exists', type(SIM.nuiCallbacks.banVideoDone) == 'function')
before = serverEventCount('coreac:banVideoDone')
local answered
SIM.nuiCallbacks.banVideoDone({}, function(r) answered = r end)
check('"video finished" is forwarded to the server', serverEventCount('coreac:banVideoDone') == before + 1)
check('the NUI callback is answered', answered ~= nil)

-- ---------------------------------------------------------------------------
title('4. Evidence screenshots: quality parameter (Optimize Record Mode)')
SIM.resources.screencapture = 'started'
local captured
exports = setmetatable({}, {
  __call = getmetatable(exports).__call,
  __index = function(_, res)
    if res == 'screencapture' then
      return setmetatable({}, { __index = function(_, fn) return function(_, url, field, opts, cb) captured = { url = url, field = field, opts = opts, cb = cb } end end })
    end
    return setmetatable({}, { __index = function() return function() return nil end end })
  end,
})
captured = nil
SIM.fromServer('coreac:screenshot', 'http://panel/api/v1/screenshot/upload?rid=r1', 'r1', nil, 0.55)
check('provider called with jpg + the requested quality', captured and captured.opts.encoding == 'jpg' and captured.opts.quality == 0.55, captured and captured.opts.quality)
captured = nil
SIM.fromServer('coreac:screenshot', 'http://panel/x?rid=r2', 'r2')
check('no quality requested → provider options carry none', captured and captured.opts.encoding == 'jpg' and captured.opts.quality == nil)
captured = nil
SIM.fromServer('coreac:screenshot', 'http://panel/x?rid=r3', 'r3', nil, 5)
check('out-of-range quality (5) is dropped, not forwarded', captured and captured.opts.quality == nil)
captured = nil
SIM.fromServer('coreac:screenshot', 'http://panel/x?rid=r4', 'r4', nil, 'high')
check('non-numeric quality is dropped', captured and captured.opts.quality == nil)

SIM.out('')
SIM.out(('%d/%d checks passed%s   handler errors: %d'):format(passed, passed + failed, failed > 0 and ('  —  ' .. failed .. ' FAILED') or '', #SIM.errors))
for _, e in ipairs(SIM.errors) do SIM.out('   !! ' .. e) end
if __exit then __exit((failed > 0 or #SIM.errors > 0) and 1 or 0) end
