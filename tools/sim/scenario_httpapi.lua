-- The game server's HTTP API (server/http_api.lua) — auth, IP allowlist, write gate,
-- audit trail, rate limit, input validation.
--   node tools/sim/run.cjs scenario_httpapi.lua
local check, title = H.check, H.title

H.api()
SIM.advance(3000)
H.pushConfig({})
SIM.advance(5000)

local TOKEN = Config.Token
check('the handler is registered', type(SIM.httpHandler) == 'function')

--- Drives the real handler with a fake request. opts: address, headers, body (raw string), noBody.
local function call(method, path, opts)
  opts = opts or {}
  local out = {}
  local headers = opts.headers
  if headers == nil then headers = { Authorization = 'Bearer ' .. TOKEN } end
  local req = {
    method = method, path = path, address = opts.address or '198.51.100.7:40000', headers = headers,
    setDataHandler = function(fn)
      out.handlerSet = true
      if not opts.noBody then fn(opts.body or '') end
    end,
  }
  local res = {
    writeHead = function(code, h) out.status = code; out.headers = h end,
    send = function(b) out.raw = b; local ok, d = pcall(json.decode, b); out.body = ok and d or nil end,
  }
  SIM.httpHandler(req, res)
  SIM.advance(300)
  return out
end

local function api(allowWrite, ips) H.pushConfig({ HttpApiAllowWrite = allowWrite, HttpApiAllowedIps = ips or {} }) end

-- ---------------------------------------------------------------------------
title('1. Authentication')
api(false)
check('no Authorization header → 401', call('GET', '/status', { headers = {} }).status == 401)
check('wrong token → 401', call('GET', '/status', { headers = { Authorization = 'Bearer nope' } }).status == 401)
check('a token that is only a prefix of the real one → 401', call('GET', '/status', { headers = { Authorization = 'Bearer ' .. TOKEN:sub(1, #TOKEN - 1) } }).status == 401)
check('a token with extra characters → 401', call('GET', '/status', { headers = { Authorization = 'Bearer ' .. TOKEN .. 'x' } }).status == 401)
check('not a Bearer scheme → 401', call('GET', '/status', { headers = { Authorization = TOKEN } }).status == 401)
check('correct token → 200', call('GET', '/status').status == 200)
check('header name is case-insensitive', call('GET', '/status', { headers = { aUtHoRiZaTiOn = 'Bearer ' .. TOKEN } }).status == 200)
check('"bearer" in lower case is fine', call('GET', '/status', { headers = { Authorization = 'bearer ' .. TOKEN } }).status == 200)
check('a 401 reveals nothing', (call('GET', '/status', { headers = {} }).raw or ''):find('panel', 1, true) == nil)
local saved = Config.Token
Config.Token = ''
check('no token configured on the server → 503', call('GET', '/status', { headers = { Authorization = 'Bearer ' } }).status == 503)
Config.Token = saved

-- ---------------------------------------------------------------------------
title('2. Read endpoints')
H.addPlayer(7, 'Alice', { ip = '4.4.4.7' })
H.addPlayer(8, 'Evil","injected":true,"x":"', { ip = '4.4.4.8' })
H.bans = { { id = 'b1', code = 'AC-READ01', license = 'license:x', ip = '9.9.9.9', permanent = true } }
SIM.advance(62000)
local r = call('GET', '/status')
check('/status: ok, version, player count', r.body and r.body.ok == true and r.body.version == Config.AcVersion and r.body.players == 2, r.raw)
check('/status: panel shows as connected (a heartbeat succeeded)', r.body and r.body.panel and r.body.panel.connected == true)
check('/status: tells the caller write is off', r.body and r.body.write == false)
check('/coreac/status (resource-name prefix) works too', call('GET', '/coreac/status').status == 200)
check('trailing slash is tolerated', call('GET', '/status/').status == 200)
r = call('GET', '/players')
check('/players: lists both players with identifiers', r.body and #r.body.players == 2 and r.body.players[1].license == 'license:lic7', r.raw)
check('/players: NO IP while write is off', r.body and r.body.players[1].ip == nil and (r.raw or ''):find('4.4.4.7', 1, true) == nil)
check('a hostile player name is data, not structure (no injected key)', r.body and r.body.injected == nil and (function()
  for _, p in ipairs(r.body.players) do if p.id == 8 then return p.name == 'Evil","injected":true,"x":"' and p.injected == nil end end
end)(), r.raw)
r = call('GET', '/bans')
check('/bans lists active bans without IP', r.body and #r.body.bans == 1 and r.body.bans[1].code == 'AC-READ01' and r.body.bans[1].ip == nil and (r.raw or ''):find('9.9.9.9', 1, true) == nil, r.raw)
check('unknown path → 404', call('GET', '/nothing').status == 404)
check('a GET to a write path → 404', call('GET', '/unban').status == 404)
check('POST to a read path → 404', call('POST', '/status', { body = '{}' }).status == 404)

-- ---------------------------------------------------------------------------
title('3. IP allowlist (applies to every endpoint once it is non-empty)')
api(false, { '203.0.113.0/24', '198.51.100.7', '2001:db8::1' })
check('caller inside the CIDR range → 200', call('GET', '/status', { address = '203.0.113.200:1234' }).status == 200)
check('exact address → 200', call('GET', '/status', { address = '198.51.100.7:40000' }).status == 200)
check('caller outside → 403', call('GET', '/status', { address = '203.0.114.1:1234' }).status == 403)
check('a valid token does not help a disallowed address', call('GET', '/players', { address = '8.8.8.8:1' }).status == 403)
check('IPv6 exact match (bracketed form)', call('GET', '/status', { address = '[2001:db8::1]:5000' }).status == 200)
check('IPv6 mismatch → 403', call('GET', '/status', { address = '[2001:db8::2]:5000' }).status == 403)
check('IPv4-mapped IPv6 is normalised', call('GET', '/status', { address = '::ffff:198.51.100.7' }).status == 200)
check('X-Forwarded-For is ignored (cannot spoof the allowlist)',
  call('GET', '/status', { address = '8.8.8.8:1', headers = { Authorization = 'Bearer ' .. TOKEN, ['X-Forwarded-For'] = '203.0.113.5' } }).status == 403)
check('wrong token is still 401, not 403 (no allowlist probing)', call('GET', '/status', { address = '8.8.8.8:1', headers = { Authorization = 'Bearer no' } }).status == 401)

-- ---------------------------------------------------------------------------
title('4. Write gate: switch AND non-empty Allowed IPs AND caller in the list')
api(false, {})
check('switch off → write endpoints refused (write_disabled)', (function() local x = call('POST', '/unban', { body = '{"code":"AC-ABCDE1"}' }); return x.status == 403 and x.body and x.body.error == 'write_disabled' end)())
api(true, {})
check('switch on but NO allowed IPs → refused (write_requires_allowed_ips)', (function() local x = call('POST', '/unban', { body = '{"code":"AC-ABCDE1"}' }); return x.status == 403 and x.body and x.body.error == 'write_requires_allowed_ips' end)())
api(true, { '203.0.113.9' })
check('switch on, caller not in the list → 403', call('POST', '/unban', { address = '8.8.8.8:1', body = '{"code":"AC-ABCDE1"}' }).status == 403)
check('…and reads stay closed for that caller too', call('GET', '/status', { address = '8.8.8.8:1' }).status == 403)

-- ---------------------------------------------------------------------------
title('5. Write endpoints (switch on, caller allowed)')
api(true, { '198.51.100.7' })
r = call('GET', '/status')
check('/status tells the caller write is on', r.body and r.body.write == true)
r = call('GET', '/players')
check('/players now includes IP addresses', r.body and r.body.players[1].ip == '4.4.4.7', r.raw)
r = call('GET', '/bans')
check('/bans now includes the IP', r.body and r.body.bans[1].ip == '9.9.9.9', r.raw)

-- unban
local unbanBody
SIM.api['/ingame/unban'] = function(b) unbanBody = b; if b.code == 'AC-READ01' then return true, { playerName = 'Alice' } end return false, nil, 404 end
H.markLogs()
r = call('POST', '/unban', { body = '{"code":"ac-read01"}' })
check('unban → 200 with the player name', r.status == 200 and r.body and r.body.ok == true and r.body.player == 'Alice', r.raw)
check('the panel received the upper-cased code and "HTTP API" as the actor', unbanBody and unbanBody.code == 'AC-READ01' and unbanBody.by == 'HTTP API', unbanBody and json.encode(unbanBody))
local logs = H.flushLogs()
local audit
for _, l in ipairs(logs) do if l.source == 'httpapi' then audit = l end end
check('the unban left an audit entry (Admin Logs event)', audit and audit.meta and audit.meta.event == 'admin' and audit.meta.admin == 'HTTP API' and audit.meta.action == 'unban', audit and audit.message)
check('the audit entry names the calling address', audit and audit.message:find('198.51.100.7', 1, true) ~= nil, audit and audit.message)
check('unknown ban → 404', call('POST', '/unban', { body = '{"code":"AC-NOSUCH"}' }).status == 404)
check('malformed code → 400', call('POST', '/unban', { body = '{"code":"x; drop table"}' }).status == 400)
check('missing code → 400', call('POST', '/unban', { body = '{}' }).status == 400)
check('code of the wrong type → 400', call('POST', '/unban', { body = '{"code":12345}' }).status == 400)
check('invalid JSON → 400', call('POST', '/unban', { body = '{not json' }).status == 400)
check('body over 4 KB → 400', call('POST', '/unban', { body = '{"code":"' .. string.rep('A', 5000) .. '"}' }).status == 400)
r = call('POST', '/unban', { noBody = true })
check('a body that never arrives → 408 after the timeout', r.status == 408 or (function() SIM.advance(3500); return r.status == 408 end)(), r.status)

-- screenshot
SIM.api['/screenshot/request'] = function(b) return true, { id = 'shot-42' } end
SIM.clientEvents = {}
r = call('POST', '/screenshot', { body = '{"id":7}' })
check('screenshot → 200 with the request id', r.status == 200 and r.body and r.body.requestId == 'shot-42', r.raw)
local ev = H.clientEvents('coreac:screenshot')
check('the capture was triggered on THAT player only', #ev == 1 and ev[1].target == 7 and ev[1].args[1]:find('?rid=shot-42', 1, true) ~= nil)
check('unknown player → 404', call('POST', '/screenshot', { body = '{"id":999}' }).status == 404)
check('non-numeric id → 404', call('POST', '/screenshot', { body = '{"id":"7; evil"}' }).status == 404)
check('fractional id → 404', call('POST', '/screenshot', { body = '{"id":7.5}' }).status == 404)
SIM.api['/screenshot/request'] = function() return false, nil, 503 end
check('panel down → 502', call('POST', '/screenshot', { body = '{"id":7}' }).status == 502)

-- reload
local hb = H.requestCount('/heartbeat')
r = call('POST', '/reload', { body = '{}' })
check('reload → 200 and the config is pulled from the panel now', r.status == 200 and H.requestCount('/heartbeat') == hb + 1, H.requestCount('/heartbeat') - hb)

-- ---------------------------------------------------------------------------
title('6. Rate limit (per remote address)')
api(false)
SIM.advance(61000)
local limited = 0
for i = 1, 70 do
  if call('GET', '/status', { address = '198.51.100.50:1' }).status == 429 then limited = limited + 1 end
end
check('more than 60 requests a minute from one address → 429', limited >= 9, limited)
check('another address is unaffected', call('GET', '/status', { address = '198.51.100.51:1' }).status == 200)
SIM.advance(61000)
check('the limit resets with the window', call('GET', '/status', { address = '198.51.100.50:1' }).status == 200)
local before429 = 0
for i = 1, 65 do if call('GET', '/status', { address = '198.51.100.60:1', headers = { Authorization = 'Bearer guess' .. i } }).status == 429 then before429 = before429 + 1 end end
check('token guessing is throttled as well', before429 >= 4, before429)

H.summary()
