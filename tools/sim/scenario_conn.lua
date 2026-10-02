-- Connection & Identity: every gate of server/connection.lua through the REAL
-- playerConnecting handler of server/main.lua.
--   node tools/sim/run.cjs scenario_conn.lua
local check, title = H.check, H.title

H.api()
SIM.advance(3000)
H.pushConfig({})
SIM.advance(62000)

local ZWSP, RLO, COMB = utf8.char(0x200B), utf8.char(0x202E), utf8.char(0x0336)

-- ---------------------------------------------------------------------------
title('1. Name rule — CAC.nameAllowed (Turkish and other scripts must pass)')
local allowed = {
  'John Doe', 'Ahmet Çelik', 'İğdır Şeker', 'Ünal', "O'Brien", 'xX_Pro-Gamer.99_Xx', 'Мария Иванова',
  '田中太郎', '김철수', 'José Ñandú', 'Nguyễn Văn An', 'ı', '99',
}
for _, n in ipairs(allowed) do check('allows  ' .. n, CAC.nameAllowed(n) == true) end
local refused = {
  ['emoji'] = '😀Smiley', ['zero-width space'] = 'Zero' .. ZWSP .. 'Width', ['right-to-left override'] = 'Rtl' .. RLO .. 'Name',
  ['<script> markup'] = '<script>alert(1)</script>', ['trademark sign'] = 'Name™', ['only spaces'] = '   ', ['empty'] = '',
  ['combining marks (zalgo)'] = 'a' .. COMB .. 'b', ['control character'] = 'Tab' .. string.char(9) .. 'Name',
  ['invalid UTF-8'] = 'Bad' .. string.char(0xFF), ['star symbols'] = '★Star★', ['brackets'] = '[TAG] Name',
  ['at sign'] = 'me@home', ['only punctuation'] = '...___---',
}
for why, n in pairs(refused) do check('refuses ' .. why, CAC.nameAllowed(n) == false) end

-- ---------------------------------------------------------------------------
title('2. Everything off → everybody gets in, and the panel is asked once (network policy)')
H.pushConfig({ AntiConnectionDupe = false })
H.addPlayer(10, 'Plain Player')
local r = H.connect(10)
check('allowed', r.done, H.verdictText(r))
check('network check still asked (existing behaviour)', H.requestCount('/network/check') >= 1)

-- ---------------------------------------------------------------------------
title('3. Require Alphanumeric Name')
H.pushConfig({ RequireAlphanumericName = true, NameMessage = 'Fix your name, please.', AntiConnectionDupe = false })
H.addPlayer(11, 'Bad' .. ZWSP .. 'Name')
r = H.connect(11)
check('invisible character → refused with NameMessage', not r.done and (r.last or ''):find('Fix your name, please.', 1, true), H.verdictText(r))
H.addPlayer(12, 'Şeyma Öztürk')
r = H.connect(12)
check('Turkish name → allowed', r.done, H.verdictText(r))
H.pushConfig({ RequireAlphanumericName = false, AntiConnectionDupe = false })
H.addPlayer(13, '😀Smiley')
r = H.connect(13)
check('rule off → symbol name allowed', r.done, H.verdictText(r))

-- ---------------------------------------------------------------------------
title('4. Require Steam / Require Discord')
H.pushConfig({ RequireSteam = true, SteamRequiredMessage = 'Steam needed.', AntiConnectionDupe = false })
H.addPlayer(14, 'NoSteam', { ids = { 'license:lic14', 'discord:d14' } })
r = H.connect(14)
check('no Steam → refused', not r.done and (r.last or ''):find('Steam needed.', 1, true), H.verdictText(r))
H.addPlayer(15, 'HasSteam')
check('Steam linked → allowed', H.connect(15).done)

H.pushConfig({ RequireDiscord = true, DiscordRequiredMessage = 'Link Discord.', AntiConnectionDupe = false })
H.addPlayer(16, 'NoDiscord', { ids = { 'license:lic16', 'steam:s16' } })
r = H.connect(16)
check('no Discord → refused', not r.done and (r.last or ''):find('Link Discord.', 1, true), H.verdictText(r))
H.addPlayer(17, 'HasDiscord')
check('Discord linked → allowed', H.connect(17).done)

-- ---------------------------------------------------------------------------
title('4b. Exemptions: Trust-whitelisted players and server staff skip the gates')
H.whitelist = { { kind = 'license', value = 'license:lic18', full = true } }
SIM.advance(62000)
H.pushConfig({ RequireDiscord = true, AntiConnectionDupe = false })
H.addPlayer(18, 'Whitelisted', { ids = { 'license:lic18' } })
local before = H.requestCount('/network/check')
check('whitelisted player without Discord → allowed', H.connect(18).done)
check('…and the panel is not even asked about them', H.requestCount('/network/check') == before)
H.addPlayer(19, 'Staffer', { ids = { 'license:lic19' }, ace = true })
check('staff (ACE "command") without Discord → allowed', H.connect(19).done)
H.addPlayer(20, 'Regular', { ids = { 'license:lic20' } })
check('regular player without Discord → still refused', not H.connect(20).done)
H.whitelist = {}
SIM.advance(62000)

-- ---------------------------------------------------------------------------
title('5. Anti Connection Dupe')
H.pushConfig({ AntiConnectionDupe = true, DupeMessage = 'Already in!' })
H.addPlayer(30, 'First', { ids = { 'license:dup1', 'discord:d30' }, lastMsg = 100 })
H.addPlayer(31, 'Second', { ids = { 'license:dup1', 'discord:d30' } })
r = H.connect(31)
check('second connection while the first is alive → refused with DupeMessage', not r.done and (r.last or ''):find('Already in!', 1, true), H.verdictText(r))
check('the live first session was NOT dropped', #H.drops() == 0)

H.addPlayer(32, 'Crashed', { ids = { 'license:dup2' }, lastMsg = 20000 })
H.addPlayer(33, 'Rejoiner', { ids = { 'license:dup2' } })
r = H.connect(33)
check('first session stopped responding (20 s) → replaced, new connection allowed', r.done, H.verdictText(r))
check('…and the stale session was dropped', #H.drops() == 1 and H.drops()[1].src == 32, #H.drops())

H.pushConfig({ AntiConnectionDupe = false })
H.addPlayer(34, 'Third', { ids = { 'license:dup1', 'discord:d30' } })
check('rule off → duplicate allowed', H.connect(34).done)

-- ---------------------------------------------------------------------------
title('6. Anti VPN (proxycheck.io)')
local vpnAnswers = {
  ['1.2.3.4'] = '{"status":"ok","1.2.3.4":{"proxy":"yes","type":"VPN"}}',
  ['5.6.7.8'] = '{"status":"ok","5.6.7.8":{"proxy":"no"}}',
  ['9.9.9.9'] = '{"status":"error","message":"daily quota"}',
}
SIM.http = function(url)
  local ip = url:match('/v2/([%x%.:]+)%?')
  if ip and vpnAnswers[ip] then return { status = 200, body = vpnAnswers[ip] } end
  return nil   -- provider unreachable
end
local function proxycheckCalls()
  local n = 0
  for _, h in ipairs(SIM.httpLog) do if h.url:find('proxycheck.io', 1, true) then n = n + 1 end end
  return n
end

H.pushConfig({ AntiVPN = true, VpnMessage = 'No VPNs here.', AntiConnectionDupe = false })
H.addPlayer(40, 'VpnUser', { ip = '1.2.3.4' })
r = H.connect(40)
check('VPN IP → refused with VpnMessage', not r.done and (r.last or ''):find('No VPNs here.', 1, true), H.verdictText(r))
H.addPlayer(41, 'CleanIp', { ip = '5.6.7.8' })
check('clean IP → allowed', H.connect(41).done)

local calls = proxycheckCalls()
H.addPlayer(42, 'VpnAgain', { ip = '1.2.3.4' })
H.connect(42)
check('the same IP is answered from the 24 h cache (no 2nd request)', proxycheckCalls() == calls, proxycheckCalls() - calls)

H.addPlayer(43, 'QuotaHit', { ip = '9.9.9.9' })
check('service error → fail-open, player allowed', H.connect(43).done)
H.addPlayer(44, 'Offline', { ip = '7.7.7.7' })
check('service unreachable → fail-open, player allowed', H.connect(44).done)

H.pushConfig({ AntiVPN = true, BlockIfVerifyFails = true, VerifyUnavailableMessage = 'Try later.', AntiConnectionDupe = false })
H.addPlayer(45, 'Offline2', { ip = '7.7.7.8' })
r = H.connect(45)
check('Block Joins When Verification Fails + unreachable → refused with VerifyUnavailableMessage',
  not r.done and (r.last or ''):find('Try later.', 1, true), H.verdictText(r))

calls = proxycheckCalls()
H.addPlayer(46, 'LanIp', { ip = '192.168.1.50' })
check('private / LAN address is never looked up and never blocked', H.connect(46).done and proxycheckCalls() == calls)

H.pushConfig({ AntiVPN = true, VpnApiKey = 'key-ABC-123', AntiConnectionDupe = false })
H.addPlayer(47, 'KeyUser', { ip = '5.6.7.9' })
H.connect(47)
local last = SIM.httpLog[#SIM.httpLog]
check('the optional API key is sent to proxycheck', last and last.url:find('key=key-ABC-123', 1, true) ~= nil, last and last.url)

H.pushConfig({ AntiVPN = false, AntiConnectionDupe = false })
calls = proxycheckCalls()
H.addPlayer(48, 'VpnOff', { ip = '1.2.3.4' })
check('Anti VPN off → VPN IP allowed, no lookup', H.connect(48).done and proxycheckCalls() == calls)

-- ---------------------------------------------------------------------------
title('7. Panel verdict: Reputation Gate / Max Threat / network KICK')
local verdict = { flagged = false, action = 'LOG', distinctOwners = 0 }
SIM.api['/network/check'] = function() return true, verdict end
H.pushConfig({ MinReputationScore = 50, ReputationGateEnforce = true, ReputationMessage = 'Low reputation.', AntiConnectionDupe = false })
verdict = { flagged = true, action = 'LOG', distinctOwners = 2, reputation = 30, deny = 'reputation', shadow = false }
H.addPlayer(50, 'BadRep')
r = H.connect(50)
check('panel says deny=reputation → ReputationMessage', not r.done and (r.last or ''):find('Low reputation.', 1, true), H.verdictText(r))

verdict = { flagged = true, action = 'LOG', distinctOwners = 2, reputation = 30, deny = nil, shadow = true }
H.addPlayer(51, 'ShadowRep')
check('shadow mode (panel: deny=nil, shadow=true) → player allowed', H.connect(51).done)

H.pushConfig({ MaxThreatScore = 40, ThreatMessage = 'Too hot.', AntiConnectionDupe = false })
verdict = { flagged = false, action = 'LOG', threat = 40, deny = 'threat', shadow = false }
H.addPlayer(52, 'Threat')
r = H.connect(52)
check('panel says deny=threat → ThreatMessage', not r.done and (r.last or ''):find('Too hot.', 1, true), H.verdictText(r))

H.pushConfig({ AntiConnectionDupe = false })
verdict = { flagged = true, action = 'KICK', distinctOwners = 3, reason = 'banned on 3 other CoreAC communities (Aimbot ×2)' }
H.addPlayer(53, 'NetworkKick')
r = H.connect(53)
check('network policy KICK → refused with the reason (counts and cheat types only)', not r.done and (r.last or ''):find('blocked by the CoreAC anti-cheat network: banned on 3 other CoreAC communities (Aimbot', 1, true), H.verdictText(r))
verdict = { flagged = true, action = 'KICK', distinctOwners = 3 }
H.addPlayer(55, 'NetworkKickOld')
r = H.connect(55)
check('…and an older panel without a reason still refuses cleanly', not r.done and (r.last or ''):find('blocked by the CoreAC anti-cheat network.', 1, true), H.verdictText(r))

verdict = { flagged = true, action = 'LOG', distinctOwners = 3 }
H.addPlayer(54, 'NetworkLog')
check('network policy LOG → allowed', H.connect(54).done)

-- panel unreachable
SIM.api['/network/check'] = function() return false, nil, 503 end
H.pushConfig({ MaxThreatScore = 40, AntiConnectionDupe = false })
H.addPlayer(55, 'PanelDown1')
check('panel down, Block Joins off → fail-open, allowed', H.connect(55).done)
H.pushConfig({ MaxThreatScore = 40, BlockIfVerifyFails = true, VerifyUnavailableMessage = 'Verify failed.', AntiConnectionDupe = false })
H.addPlayer(56, 'PanelDown2')
r = H.connect(56)
check('panel down + Max Threat on + Block Joins on → refused with VerifyUnavailableMessage',
  not r.done and (r.last or ''):find('Verify failed.', 1, true), H.verdictText(r))
H.pushConfig({ BlockIfVerifyFails = true, AntiConnectionDupe = false })
H.addPlayer(57, 'PanelDown3')
check('panel down + Block Joins on but NOTHING needs the panel → still allowed', H.connect(57).done)

-- ---------------------------------------------------------------------------
title('8. Ban is checked first and always wins')
SIM.api['/network/check'] = function() return true, { flagged = false } end
H.bans = { { id = 'b1', code = 'AC-BANNED', license = 'license:lic60', permanent = true } }
SIM.advance(62000)
H.pushConfig({ RequireDiscord = true, AntiConnectionDupe = false })
H.addPlayer(60, 'BannedGuy', { ids = { 'license:lic60' } })
r = H.connect(60)
check('banned player sees the ban card (not the Discord message)', not r.done and (r.last or ''):find('AC-BANNED', 1, true), H.verdictText(r))

-- ---------------------------------------------------------------------------
title('9. A bug inside a gate must never lock players out')
H.bans = {}
SIM.advance(62000)
H.pushConfig({ AntiVPN = true, AntiConnectionDupe = false })
local realPrivate = CAC.isPrivateIp
CAC.isPrivateIp = function() error('boom (simulated gate bug)') end
H.markLogs()
H.addPlayer(70, 'GateBug')
r = H.connect(70)
CAC.isPrivateIp = realPrivate
check('gate throws → player is let in (not stuck on the card)', r.done, H.verdictText(r))
local errLog = H.findLog('connect', 'Connection gate error')
check('…and the error is logged as ERROR', errLog ~= nil and errLog.level == 'ERROR', errLog and errLog.level)
check('…with the cause in the message', errLog ~= nil and tostring(errLog.message):find('boom', 1, true) ~= nil)
check('no unhandled handler error leaked', #SIM.errors == 0, SIM.errors[1])

H.summary()
