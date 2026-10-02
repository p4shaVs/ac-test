-- Shared helpers for the Settings-tab scenarios (scenario_conn, scenario_bans, …).
-- run.cjs loads this after the server scripts and before the scenario. Everything
-- lives in the global table `H`, so the older scenarios are unaffected.

H = { passed = 0, failed = 0, console = {}, mark = 0, bans = {}, whitelist = {}, admins = {} }

-- ------------------------------------------------------------------ reporting
function H.title(s) SIM.out(''); SIM.out('=== ' .. s) end

function H.check(name, cond, detail)
  if cond then
    H.passed = H.passed + 1
    SIM.out('ok    ' .. name)
  else
    H.failed = H.failed + 1
    SIM.out('FAIL  ' .. name .. (detail ~= nil and ('   -> ' .. tostring(detail)) or ''))
  end
end

--- Final line + process exit code (run.cjs wires __exit).
function H.summary()
  local errs = #SIM.errors
  SIM.out('')
  SIM.out(('%d/%d checks passed%s   handler errors: %d'):format(
    H.passed, H.passed + H.failed, H.failed > 0 and ('  —  ' .. H.failed .. ' FAILED') or '', errs))
  for _, e in ipairs(SIM.errors) do SIM.out('   !! ' .. e) end
  if __exit then __exit((H.failed > 0 or errs > 0) and 1 or 0) end
end

-- ------------------------------------------------------------------ console capture
-- The prelude silences print(); capture it instead so scenarios can assert on it.
print = function(...)
  local t = {}
  for i = 1, select('#', ...) do t[#t + 1] = tostring(select(i, ...)) end
  H.console[#H.console + 1] = (table.concat(t, ' '):gsub('%^%d', ''))
end

function H.consoleClear() H.console = {} end
function H.consoleHas(pattern, plain)
  for _, l in ipairs(H.console) do
    if l:find(pattern, 1, plain ~= false) then return l end
  end
  return nil
end

-- ------------------------------------------------------------------ world
function H.addPlayer(id, name, o)
  o = o or {}
  SIM.players[id] = {
    name = name, ped = 1000 + id, coords = vector3(0, 0, 0), vel = vector3(0, 0, 0), veh = 0,
    ids = o.ids or { 'license:lic' .. id, 'discord:d' .. id, 'steam:s' .. id },
    ip = o.ip or ('8.8.8.' .. id), lastMsg = o.lastMsg or 0, ace = o.ace,
  }
  return SIM.players[id]
end

function H.removePlayer(id) SIM.players[id] = nil end

-- Defaults the resource ships with (captured once, before any scenario touches them).
H.defaults = {}
for k, v in pairs(CoreAC.Config.Settings) do
  if type(v) == 'table' then
    local c = {}
    for i, x in ipairs(v) do c[i] = x end
    H.defaults[k] = c
  else
    H.defaults[k] = v
  end
end

--- Panel API defaults every scenario starts from.
function H.api()
  SIM.api['/bans'] = function() return true, { bans = H.bans } end
  SIM.api['/whitelist'] = function() return true, { whitelist = H.whitelist } end
  SIM.api['/admins'] = function() return true, { admins = H.admins } end
  SIM.api['/network/check'] = function() return true, { flagged = false, action = 'LOG', distinctOwners = 0 } end
  SIM.api['/players/sync'] = function() return true, {} end
  SIM.api['/logs'] = function() return true, {} end
  SIM.api['/detections'] = function() return true, { action = 'LOG', banned = false, kicked = false, label = 'Test' } end
  -- Pollers the resource runs every few seconds; empty answers keep the console quiet.
  for _, path in ipairs({ '/screenshot/pending', '/actions/pending', '/commands/pending', '/blacklist', '/resources/sync', '/ingame-action' }) do
    SIM.api[path] = SIM.api[path] or function() return true, { requests = {}, actions = {}, commands = {}, blacklist = {} } end
  end
end

--- Panel config the next heartbeat delivers: defaults overlaid with `settings`.
--- `extra` may carry rules / protectedEvents / network.
function H.pushConfig(settings, extra)
  extra = extra or {}
  local s = {}
  for k, v in pairs(H.defaults) do s[k] = v end
  for k, v in pairs(settings or {}) do s[k] = v end
  SIM.api['/heartbeat'] = function()
    return true, { config = {
      rules = extra.rules or {}, ac = { Settings = s, Main = { AntiTeleport = true } },
      protectedEvents = extra.protectedEvents, network = extra.network or { action = 'LOG' },
    } }
  end
  CAC.heartbeat()
  SIM.advance(300)
end

-- ------------------------------------------------------------------ connecting
--- Adaptive Card JSON -> "title | status | Ban ID: … | Expires: …"
function H.cardText(card)
  if not card then return nil end
  local ok, c = pcall(json.decode, card)
  local parts = {}
  for _, b in ipairs(ok and type(c) == 'table' and c.body or {}) do
    if b.text then parts[#parts + 1] = b.text end
  end
  return table.concat(parts, ' | ')
end

--- Runs the real playerConnecting handler inside a scheduler thread (so Wait() advances
--- simulated time) and returns { done, cards, last } — `done` = the player was let in.
function H.connect(id, o)
  o = o or {}
  local res = { done = false, cards = {} }
  local deferrals = {
    defer = function() end, update = function() end,
    presentCard = function(c) res.cards[#res.cards + 1] = H.cardText(c) end,
    done = function() res.done = true end,
  }
  CreateThread(function()
    SIM.dispatch('playerConnecting', id, SIM.players[id].name, function() end, deferrals)
  end)
  SIM.advance(o.ms or 30000)
  res.last = res.cards[#res.cards]
  return res
end

function H.verdictText(res)
  if res.done then return 'ALLOWED' end
  return res.last or '(no card)'
end

-- ------------------------------------------------------------------ requests / logs
function H.requests(path)
  local out = {}
  for _, r in ipairs(SIM.requests) do
    if r.path == path then out[#out + 1] = r end
  end
  return out
end

function H.requestCount(path) return #H.requests(path) end

--- Forget everything logged so far (see logsSince).
function H.markLogs() H.mark = #SIM.requests end

--- Every log line the resource posted to /logs since markLogs() (read from the request bodies).
function H.logsSince()
  local out = {}
  for i = H.mark + 1, #SIM.requests do
    local r = SIM.requests[i]
    if r.path == '/logs' then
      for _, l in ipairs(r.body and r.body.logs or {}) do out[#out + 1] = l end
    end
  end
  return out
end

--- Advances time so the resource flushes its log buffer, returns the lines since markLogs().
function H.flushLogs()
  SIM.advance(12000)
  return H.logsSince()
end

function H.findLog(source, pattern)
  for _, l in ipairs(H.logsSince()) do
    if l.source == source and (not pattern or tostring(l.message):find(pattern, 1, true)) then return l end
  end
  return nil
end

function H.clientEvents(name)
  local out = {}
  for _, e in ipairs(SIM.clientEvents) do
    if e.name == name then out[#out + 1] = e end
  end
  return out
end

function H.drops() return SIM.drops end
