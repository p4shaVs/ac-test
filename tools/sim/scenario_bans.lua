-- Bans & Evidence through the real resource:
--   Ban Message / expiry on the ban card, Ban Ip Address, the ban screen with the
--   Ban Video, Enable Screen Shots / Gameplay Record / Optimize Record Mode (client
--   side of the verdict), Enable Bans for self-deciding paths, punishment console lines.
--   node tools/sim/run.cjs scenario_bans.lua
local check, title = H.check, H.title

H.api()
SIM.advance(3000)
H.pushConfig({})
SIM.advance(62000)

local function dropsFor(src)
  local out = {}
  for _, d in ipairs(H.drops()) do if d.src == src then out[#out + 1] = d end end
  return out
end

-- ---------------------------------------------------------------------------
title('1. Ban Message + expiry on the connection card')
H.pushConfig({ BanMessage = 'Cheating is not tolerated here.', AntiConnectionDupe = false })
H.bans = {
  { id = 'b1', code = 'AC-PERM01', license = 'license:lic10', permanent = true },
  { id = 'b2', code = 'AC-TEMP02', license = 'license:lic11', permanent = false, expiresAt = '2026-11-05T14:30:00.000Z' },
}
SIM.advance(62000)
H.addPlayer(10, 'Permanent', { ids = { 'license:lic10' } })
local r = H.connect(10)
check('card shows the custom Ban Message', (r.last or ''):find('Cheating is not tolerated here.', 1, true) ~= nil, r.last)
check('card shows the Ban ID', (r.last or ''):find('AC-PERM01', 1, true) ~= nil)
check('permanent ban has no "Expires" line', (r.last or ''):find('Expires', 1, true) == nil, r.last)
check('the reason is never shown', (r.last or ''):lower():find('reason', 1, true) == nil)
H.addPlayer(11, 'Temporary', { ids = { 'license:lic11' } })
r = H.connect(11)
check('temporary ban shows its expiry', (r.last or ''):find('Expires: 2026-11-05 14:30 UTC', 1, true) ~= nil, r.last)

-- ---------------------------------------------------------------------------
title('2. Ban Ip Address (opt-in, never on local addresses, never on whitelisted players)')
H.bans = { { id = 'b3', code = 'AC-IPBAN3', license = 'license:old3', ip = '7.7.7.7', permanent = true },
           { id = 'b4', code = 'AC-LAN004', license = 'license:old4', ip = '192.168.1.5', permanent = true } }
SIM.advance(62000)
H.pushConfig({ BanIpAddress = false, AntiConnectionDupe = false })
H.addPlayer(20, 'SameNetwork', { ids = { 'license:new20' }, ip = '7.7.7.7' })
check('default OFF: a different account on the banned IP gets in (shared networks are safe)', H.connect(20).done)
H.pushConfig({ BanIpAddress = true, AntiConnectionDupe = false })
H.addPlayer(21, 'SameNetwork2', { ids = { 'license:new21' }, ip = '7.7.7.7' })
r = H.connect(21)
check('ON: the banned IP is refused with the ban card', not r.done and (r.last or ''):find('AC-IPBAN3', 1, true) ~= nil, H.verdictText(r))
H.addPlayer(22, 'OtherIp', { ids = { 'license:new22' }, ip = '7.7.7.8' })
check('ON: a different IP is unaffected', H.connect(22).done)
H.addPlayer(23, 'LanBan', { ids = { 'license:new23' }, ip = '192.168.1.5' })
check('ON: a ban recorded on a LAN address never matches', H.connect(23).done)
H.whitelist = { { kind = 'license', value = 'license:new24', full = true } }
SIM.advance(62000)
H.addPlayer(24, 'TrustedOnBannedIp', { ids = { 'license:new24' }, ip = '7.7.7.7' })
check('ON: a Trust-whitelisted player on the banned IP is let in', H.connect(24).done)
H.whitelist = {}
SIM.advance(62000)
check('CAC.isBanned honours the IP setting too', (function() H.addPlayer(25, 'X', { ids = { 'license:new25' }, ip = '7.7.7.7' }) return CAC.isBanned(25) end)() == true)

-- ---------------------------------------------------------------------------
title('3. Ban screen: CAC.dropBanned (message, expiry, optional video)')
H.bans = {}
SIM.advance(62000)
H.pushConfig({ BanMessage = 'You are out.', BanVideoUrl = '' })
H.addPlayer(30, 'Dropped1')
CAC.dropBanned(30, 'AC-DROP01', nil)
local d = dropsFor(30)
check('no video configured → dropped at once', #d == 1)
check('reason carries message + Ban ID', d[1] and d[1].reason:find('You are out.', 1, true) and d[1].reason:find('Ban ID: AC-DROP01', 1, true), d[1] and d[1].reason)
check('permanent → no Expires', d[1] and d[1].reason:find('Expires', 1, true) == nil)
H.addPlayer(31, 'Dropped2')
CAC.dropBanned(31, 'AC-DROP02', '2027-01-02T03:04:05.000Z')
d = dropsFor(31)
check('temporary → reason shows Expires', d[1] and d[1].reason:find('Expires: 2027-01-02 03:04 UTC', 1, true), d[1] and d[1].reason)

H.pushConfig({ BanVideoUrl = 'https://cdn.example.com/ban.mp4' })
H.addPlayer(32, 'Watcher')
local t0 = SIM.now
CAC.dropBanned(32, 'AC-VID001', nil)
SIM.advance(200)
local ev = H.clientEvents('coreac:banVideo')
check('video URL sent to that player only', #ev >= 1 and ev[#ev].target == 32 and ev[#ev].args[1] == 'https://cdn.example.com/ban.mp4', ev[#ev] and ev[#ev].target)
check('not dropped while the video plays', #dropsFor(32) == 0)
SIM.advance(16000)
check('dropped by the server after ≤ 15 s even if the client never answers', #dropsFor(32) == 1 and SIM.now - t0 <= 16500, #dropsFor(32))

H.addPlayer(33, 'QuickWatcher')
CAC.dropBanned(33, 'AC-VID002', nil)
SIM.advance(1000)
SIM.net('coreac:banVideoDone', 33)
SIM.advance(500)
check('client finished early → dropped right away', #dropsFor(33) == 1, #dropsFor(33))

for _, bad in ipairs({ 'http://cdn.example.com/a.mp4', 'javascript:alert(1)', 'https://u:p@cdn.example.com/a.mp4', 'https://x.com/a b.mp4', 'https://x.com/"onerror=1' }) do
  H.pushConfig({ BanVideoUrl = bad })
  local id = 40 + #bad % 50
  H.addPlayer(id, 'Bad' .. id)
  local evBefore = #H.clientEvents('coreac:banVideo')
  CAC.dropBanned(id, 'AC-X', nil)
  check("invalid video URL '" .. bad:sub(1, 34) .. "' → no video, dropped at once", #H.clientEvents('coreac:banVideo') == evBefore and #dropsFor(id) == 1)
end

-- ---------------------------------------------------------------------------
title('4. Verdict from the panel: evidence screenshots, then kick / ban / stay')
H.pushConfig({ BanMessage = 'Banned for cheating.', BanVideoUrl = '' })
local verdict
SIM.api['/detections'] = function(b) return true, verdict end

H.addPlayer(50, 'Cheater1')
verdict = { action = 'BAN', banned = true, banCode = 'AC-CHEAT1', label = 'NoClip', screenshotRequestIds = { 'r1', 'r2', 'r3' }, screenshotQuality = 0.55 }
SIM.net('coreac:report', 50, 'NOCLIP', 'HIGH', { info = 'x' })
SIM.advance(3000)
local shots = H.clientEvents('coreac:screenshot')
local mine = {}
for _, e in ipairs(shots) do if e.target == 50 then mine[#mine + 1] = e end end
check('3 evidence frames requested for a ban (Optimize Record Mode)', #mine == 3, #mine)
check('frames carry the lighter JPEG quality', mine[1] and mine[1].args[4] == 0.55, mine[1] and tostring(mine[1].args[4]))
check('frame upload URL carries the request id', mine[1] and mine[1].args[1]:find('?rid=r1', 1, true) ~= nil, mine[1] and mine[1].args[1])
d = dropsFor(50)
check('banned player is dropped AFTER the frames, with the custom message', #d == 1 and d[1].reason:find('Banned for cheating.', 1, true) and d[1].reason:find('AC-CHEAT1', 1, true), d[1] and d[1].reason)

H.addPlayer(51, 'Kicked1')
verdict = { action = 'KICK', kicked = true, label = 'Speed Hack', screenshotRequestIds = { 'k1' } }
SIM.net('coreac:report', 51, 'SPEEDHACK', 'HIGH', { info = 'y' })
SIM.advance(2000)
d = dropsFor(51)
check('kick with one screenshot: frame first, then dropped', #d == 1 and d[1].reason:find('kicked', 1, true) ~= nil)
local kickShots = 0
for _, e in ipairs(H.clientEvents('coreac:screenshot')) do if e.target == 51 then kickShots = kickShots + 1 end end
check('one frame for the kick', kickShots == 1, kickShots)

H.addPlayer(52, 'Logged1')
verdict = { action = 'LOG', label = 'Teleport', screenshotRequestIds = { 'l1' } }
SIM.net('coreac:report', 52, 'TELEPORT', 'HIGH', { info = 'z' })
SIM.advance(2000)
local logShots = 0
for _, e in ipairs(H.clientEvents('coreac:screenshot')) do if e.target == 52 then logShots = logShots + 1 end end
check('logged-only detection with evidence: screenshot taken, player NOT dropped', logShots == 1 and #dropsFor(52) == 0, logShots)

H.addPlayer(53, 'Logged2')
verdict = { action = 'LOG', label = 'Teleport', screenshotRequestIds = {} }
SIM.net('coreac:report', 53, 'TELEPORT', 'HIGH', { info = 'w' })
SIM.advance(2000)
local none = 0
for _, e in ipairs(H.clientEvents('coreac:screenshot')) do if e.target == 53 then none = none + 1 end end
check('no screenshot ids from the panel → no screenshot', none == 0)

-- ---------------------------------------------------------------------------
title('5. Console lines (Log Punishments To Console, Show Ip Address)')
H.consoleClear()
H.pushConfig({ LogPunishmentsToConsole = true, ShowIpAddress = false })
H.addPlayer(60, 'Cheater60', { ip = '4.4.4.4' })
verdict = { action = 'BAN', banned = true, banCode = 'AC-CON060', label = 'NoClip', screenshotRequestIds = {} }
SIM.net('coreac:report', 60, 'NOCLIP', 'HIGH', { info = 'x' })
SIM.advance(1500)
local line = H.consoleHas('BAN Cheater60', true)
check('ban line printed', line ~= nil and line:find('AC-CON060', 1, true) ~= nil, line)
check('IP hidden by default', line ~= nil and line:find('4.4.4.4', 1, true) == nil, line)

H.consoleClear()
H.pushConfig({ LogPunishmentsToConsole = true, ShowIpAddress = true })
H.addPlayer(61, 'Cheater61', { ip = '4.4.4.5' })
SIM.net('coreac:report', 61, 'NOCLIP', 'HIGH', { info = 'x' })
SIM.advance(1500)
line = H.consoleHas('BAN Cheater61', true)
check('Show Ip Address on → IP in the line', line ~= nil and line:find('4.4.4.5', 1, true) ~= nil, line)

H.consoleClear()
H.pushConfig({ LogPunishmentsToConsole = false })
H.addPlayer(62, 'Cheater62')
SIM.net('coreac:report', 62, 'NOCLIP', 'HIGH', { info = 'x' })
SIM.advance(1500)
check('Log Punishments To Console off → nothing printed', H.consoleHas('Cheater62', true) == nil)
check('…but the player is still banned', #dropsFor(62) == 1)

H.consoleClear()
H.pushConfig({ LogPunishmentsToConsole = true })
H.addPlayer(63, 'Warned63')
verdict = { action = 'LOG', label = 'NoClip', screenshotRequestIds = {} }
SIM.net('coreac:report', 63, 'NOCLIP', 'HIGH', { info = 'x' })
SIM.advance(1500)
check('a recorded-only detection prints as WARN', H.consoleHas('WARN Warned63', true) ~= nil)

-- ---------------------------------------------------------------------------
title('6. Enable Bans / Log-Only also govern the resource\'s own decisions')
H.pushConfig({ EnableBans = true, LogOnly = false })
check('default: punishing allowed', CAC.isLogOnly() == false)
H.pushConfig({ EnableBans = false })
check('Enable Bans off → treated as log-only', CAC.isLogOnly() == true)
H.pushConfig({ EnableBans = true, LogOnly = true })
check('Log-Only on → treated as log-only', CAC.isLogOnly() == true)
H.pushConfig({})

H.summary()
