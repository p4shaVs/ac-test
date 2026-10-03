-- =============================================================================
-- server/secure_channel.lua — anti-cheat'in client ↔ sunucu güvenli hattı
-- (eski liveness_guard.lua'nın yerini alır; client tarafı client/secure_channel.lua).
--
-- Her sunucu açılışında olay adları RASTGELE seçilir (GlobalState.coreac_ch) ve her
-- oyuncuya o oturum için rastgele bir ANAHTAR verilir. Client her mesajı artan sıra
-- numarası + anahtarla imzalar. Buradan çıkan, client'ın taklit edemeyeceği kararlar
-- (hepsi AC_TAMPER, sunucu gözlemi):
--
--   never      AC hiç başlamadı: oyuncu oturumda dolaşıyor ama el sıkışma yok
--              (AC resource'u istemcide engellenmiş / silinmiş).
--   restart    AC istemcide ikinci kez başlatıldı (durdurulup yeniden başlatılmış).
--   forged     anahtarla imzalanmamış mesaj (AC'yi taklit eden kod).
--   gap        sıra numarası atladı: mesajlar yolda düşürüldü (event blocker).
--   replay     eski mesaj tekrar gönderildi.
--   silent     AC 45 sn'den uzun süre hiçbir şey göndermedi (durduruldu/donduruldu).
--   challenge  rastgele soruya üst üste 3 kez doğru cevap gelmedi.
--   frozen     cevaplar geliyor ama AC'nin döngü sayaçları ilerlemiyor (thread'ler
--              dondurulmuş, yalnızca cevaplayıcı bırakılmış).
--   legacy     eski sabit olay adları ('coreac:alive', 'coreac:challengeReply') —
--              artık yalnızca hazır/eski bypass betikleri kullanır.
--
-- YANLIŞ-POZİTİF KALKANLARI: ping 0 ya da 400+ (ağ sorunu) iken yargı yok; oturum
-- açıldıktan sonra 60 sn ısınma; tek kayıp paket hiçbir şey yapmaz (FiveM olayları
-- güvenilir ve sıralı iletir, boşluk yalnızca bilerek düşürülen mesajdır); Trust
-- Whitelist muaf; her sebep oturum başına bir kez; karar panel Punishments'ta
-- (AC_TAMPER) seçilen aksiyondur.
-- =============================================================================

CAC = CAC or {}

local WARMUP          = 60000
local ABSENCE_LIMIT   = 45000
local CHALLENGE_EVERY = 30000
local REPLY_WINDOW    = 15000
local FAIL_LIMIT      = 3
local MAX_PING        = 400
local NEVER_AFTER     = 180000   -- oturumda bu kadar ve dolaşıyor, el sıkışma yok
local NEVER_MOVED     = 40.0     -- en az bu kadar metre dolaşmış olmalı (yükleme ekranı değil)
local FROZEN_MIN      = 5        -- iki cevap arasında (≥25 sn) bundan az döngü turu = donmuş
local FROZEN_LIMIT    = 3
local LAG_SILENCE     = 300000   -- ping kalkanı arkasında bile bu kadar sessizlik = AC ölü
local LAG_NEVER       = 600000   -- ping kalkanı arkasında bile bu kadar dolaşıp el sıkışmamak

-- ---------------------------------------------------------------- rastgele adlar
do
  local addr = tonumber(tostring({}):match('0x(%x+)') or '0', 16) or 0
  math.randomseed((os and os.time and os.time() or 0) + GetGameTimer() + addr % 1000003)
end
local function hex(n)
  local t = {}
  for i = 1, n do t[i] = ('%x'):format(math.random(0, 15)) end
  return table.concat(t)
end
local function rnd31() return math.random(1, 0x7FFFFFFF) end

local NAMES = {
  hello = 'e' .. hex(15), msg = 'e' .. hex(15), key = 'e' .. hex(15), chal = 'e' .. hex(15),
  pull = 'e' .. hex(15), put = 'e' .. hex(15),
}
GlobalState.coreac_ch = NAMES
CAC.channelNames = NAMES

-- ---------------------------------------------------------------- durum
local sessions = {}   -- [src] = oturum
local joined   = {}   -- [src] = playerJoining zamanı
local presence = {}   -- [src] = { last = vector3, moved = m } (el sıkışmamış oyuncular)
local strays   = {}   -- [src] = oturumsuz mesaj sayısı
local legacy   = {}   -- [src] = { [olay] = sayı }
local neverFlagged = {}

--- Rapor verilebilir mi? (tespitler açık, oyuncu bağlı, Trust Whitelist değil)
local function canReport(src)
  if Config.DetectionsEnabled == false then return false end
  if not GetPlayerName(src) then return false end
  return not (CAC.isWhitelisted and CAC.isWhitelisted(src))
end

--- Ağ sağlıklı mı? Susma / cevapsızlık / hiç başlamama yalnızca bu durumda yargılanır.
local function netOk(src)
  local ping = GetPlayerPing(src)
  return ping ~= nil and ping > 0 and ping < MAX_PING
end

local REASONS = {
  never     = 'anti-cheat never started on this player (blocked or deleted on the client)',
  restart   = 'anti-cheat was restarted on the client (stopped and started again)',
  forged    = 'forged anti-cheat message (not signed with the session key)',
  gap       = 'anti-cheat messages were blocked on the way to the server',
  replay    = 'old anti-cheat messages were replayed',
  silent    = 'client anti-cheat stopped responding (resource stopped or suppressed)',
  challenge = 'anti-tamper challenge failed (client anti-cheat not answering correctly)',
  frozen    = 'anti-cheat threads frozen (only the event handler still answers)',
  legacy    = 'stale anti-cheat event name used (pre-made bypass script)',
  stray     = 'anti-cheat channel used without a session (forged messages)',
}

--- AC_TAMPER (sunucu gözlemi). Oturum başına sebep başına bir kez.
local function tamper(src, why, extra)
  local s = sessions[src]
  local flags = s and s.flags or nil
  if flags then
    if flags[why] then return end
    flags[why] = true
  end
  if not canReport(src) then return end
  local d = { reason = REASONS[why] or why, check = why }
  for k, v in pairs(extra or {}) do d[k] = v end
  TriggerEvent('coreac:serverReport', src, 'AC_TAMPER', 'HIGH', d)
  CAC.log('WARN', 'anticheat', ('AC_TAMPER (%s): %s'):format(why, GetPlayerName(src) or src))
end
CAC.channelTamper = tamper

-- ---------------------------------------------------------------- el sıkışma
local function newSession(src, cnonce)
  local now = GetGameTimer()
  local s = {
    key = { rnd31(), rnd31() }, seq = 0, msgs = 0, opened = now, lastAlive = now,
    fails = 0, frozen = 0, forged = 0, replays = 0, lastChallenge = now,
    flags = {}, res = {}, cmd = {},
  }
  sessions[src] = s
  presence[src] = nil
  TriggerClientEvent(NAMES.key, src, s.key[1], s.key[2], cnonce)
  return s
end

RegisterNetEvent(NAMES.hello, function(_, cnonce)
  local src = tonumber(source)
  if not src or src <= 0 or not GetPlayerName(src) then return end
  if CAC.eventLimited(src, 'ch_hello', 6, 60000) then return end
  local s = sessions[src]
  if s then
    if s.msgs == 0 then
      -- Client anahtarı alamadan tekrar sordu: aynı anahtarı yeniden gönder.
      TriggerClientEvent(NAMES.key, src, s.key[1], s.key[2], cnonce)
      return
    end
    -- AC bu oyuncuda zaten konuşmuştu; ikinci başlangıç = durdurup yeniden başlatma.
    -- Yeni oturum yine açılır (kontroller devam etsin), bayrak eskisinden taşınır.
    local flags = s.flags
    tamper(src, 'restart')
    newSession(src, cnonce).flags = flags
    return
  end
  newSession(src, cnonce)
end)

-- ---------------------------------------------------------------- mesaj türleri
local KIND = {}

KIND.alive = function(src, s, p)
  s.lastAlive = GetGameTimer()
  if type(p) == 'table' then s.ticks = tonumber(p.t) or s.ticks end
end

KIND.reply = function(src, s, p)
  if type(p) ~= 'table' then return end
  local now = GetGameTimer()
  s.lastAlive = now
  local pend = s.pending
  if not pend or tonumber(p.n) ~= pend.nonce or now - pend.at > REPLY_WINDOW then return end
  s.pending = nil
  if math.tointeger(tonumber(p.a)) == CoreAC.ChannelAnswer(s.key, pend.nonce) then
    s.fails = 0
  else
    s.fails = s.fails + 1
  end
  -- Döngü sayacı ilerliyor mu? (≥25 sn arayla iki cevap)
  local t = tonumber(p.t)
  if t then
    if s.replyTicks and now - s.replyAt >= 25000 then
      if t - s.replyTicks < FROZEN_MIN then s.frozen = s.frozen + 1 else s.frozen = 0 end
      if s.frozen >= FROZEN_LIMIT then
        tamper(src, 'frozen', { ticks = t - s.replyTicks, seconds = math.floor((now - s.replyAt) / 1000) })
        s.frozen = 0
      end
      s.replyTicks, s.replyAt = t, now
    elseif not s.replyTicks then
      s.replyTicks, s.replyAt = t, now
    end
  end
end

KIND.report = function(src, s, p)
  if type(p) ~= 'table' then return end
  if CAC.clientReport then CAC.clientReport(src, p.t, p.s, p.d) end
end

local RESERVED_RES = { [''] = true, internal = true, game = true, citizen = true, cfx = true, console = true, system = true }
local function suspiciousResource(r)
  if type(r) ~= 'string' or #r > 64 or RESERVED_RES[r] or r:sub(1, 4) == '_cfx' then return false end
  if not r:match('^[%w_%-%.%[%]]+$') then return false end
  if GetResourceState(r) ~= 'missing' then return false end
  if CAC.isInjectionSafe and CAC.isInjectionSafe(r) then return false end
  return true
end

-- İstemcide çalışan resource listesi: sunucuda OLMAYAN biri = executor'un sahte resource'u.
KIND.res = function(src, s, list)
  if type(list) ~= 'table' then return end
  if CoreAC.Config and CoreAC.Config.Main and CoreAC.Config.Main.AntiResourceInjection == false then return end
  for i = 1, math.min(#list, 1024) do
    local r = list[i]
    if not s.res[r] and suspiciousResource(r) then
      s.res[r] = true
      TriggerEvent('coreac:serverReport', src, 'RESOURCE_INJECT', 'HIGH', {
        resource = r, check = 'client resource list verified by the server', __origin = 'client',
      })
      return
    end
  end
end

-- İstemcide kayıtlı komutlar: sunucuda olmayan bir resource'a ait komut (hile
-- menüsünün kısayolu). Zayıf sinyal olarak loglanır (ceza yok).
KIND.cmds = function(src, s, list)
  if type(list) ~= 'table' then return end
  if CoreAC.Config and CoreAC.Config.Main and CoreAC.Config.Main.AntiLuaMenu == false then return end
  for i = 1, math.min(#list, 200) do
    local c = list[i]
    if type(c) == 'table' and type(c.n) == 'string' and not s.cmd[c.r or ''] and suspiciousResource(c.r) then
      s.cmd[c.r] = true
      TriggerEvent('coreac:serverReport', src, 'CHEAT_MENU_SUSPECTED', 'LOW', {
        reason = 'command registered by a resource this server does not have',
        command = c.n:sub(1, 64), resource = c.r, __origin = 'client',
      })
      return
    end
  end
end

KIND.tse = function(src, s, p)
  if CAC.shieldBatch then CAC.shieldBatch(src, p) end
end

-- ---------------------------------------------------------------- mesaj hattı
RegisterNetEvent(NAMES.msg, function(seq, kind, sig, payload)
  local src = tonumber(source)
  if not src or src <= 0 then return end
  local s = sessions[src]
  if not s then
    strays[src] = (strays[src] or 0) + 1
    if strays[src] >= 3 and not neverFlagged['stray' .. src] then
      neverFlagged['stray' .. src] = true
      if canReport(src) then
        TriggerEvent('coreac:serverReport', src, 'AC_TAMPER', 'HIGH', { reason = REASONS.stray, check = 'stray' })
      end
    end
    return
  end
  seq, sig = math.tointeger(tonumber(seq)), math.tointeger(tonumber(sig))
  if type(kind) ~= 'string' or #kind > 16 or not seq or not sig or sig ~= CoreAC.ChannelSig(s.key, seq, kind) then
    s.forged = s.forged + 1
    if s.forged >= 2 then tamper(src, 'forged', { kind = type(kind) == 'string' and kind:sub(1, 16) or nil }) end
    return
  end
  if seq <= s.seq then
    s.replays = s.replays + 1
    if s.replays >= 3 then tamper(src, 'replay') end
    return
  end
  if seq > s.seq + 1 then
    tamper(src, 'gap', { missing = seq - s.seq - 1, kind = kind })
  end
  s.seq = seq
  s.msgs = s.msgs + 1
  -- Sıra işlendikten SONRA hız sınırı: aşırı mesaj işlenmez ama boşluk da yaratmaz.
  if CAC.eventLimited(src, 'ch_msg', 150, 10000) then return end
  local h = KIND[kind]
  if h then
    local ok, err = pcall(h, src, s, payload)
    if not ok and Config.Debug then print(('[CoreAC] channel %s: %s'):format(kind, tostring(err))) end
  end
end)

-- ---------------------------------------------------------------- eski adlar = tuzak
-- Bu client artık bunları göndermez. Kullanan = AC'yi kapatıp "yaşıyorum" diyen
-- hazır/eski bir bypass betiği. İki kez görülünce raporlanır.
for _, ev in ipairs({ 'coreac:alive', 'coreac:challengeReply' }) do
  RegisterNetEvent(ev, function()
    local src = tonumber(source)
    if not src or src <= 0 then return end
    local l = legacy[src] or {}
    legacy[src] = l
    l[ev] = (l[ev] or 0) + 1
    if l[ev] == 2 then
      if sessions[src] then
        tamper(src, 'legacy', { event = ev })
      elseif canReport(src) then
        TriggerEvent('coreac:serverReport', src, 'AC_TAMPER', 'HIGH', { reason = REASONS.legacy, check = 'legacy', event = ev })
      end
    end
  end)
end

-- ---------------------------------------------------------------- oyuncu yaşam döngüsü
AddEventHandler('playerJoining', function() joined[tonumber(source)] = GetGameTimer() end)
CreateThread(function()
  for _, sid in ipairs(GetPlayers()) do
    local src = tonumber(sid)
    if src then joined[src] = joined[src] or GetGameTimer() end
  end
end)

AddEventHandler('playerDropped', function()
  local src = tonumber(source)
  if not src then return end
  sessions[src], joined[src], presence[src], strays[src], legacy[src] = nil, nil, nil, nil, nil
  neverFlagged[src], neverFlagged['stray' .. src] = nil, nil
end)

--- Testler ve diğer modüller: bu oyuncunun güvenli oturumu var mı?
function CAC.hasChannel(src) return sessions[tonumber(src)] ~= nil end

-- ---------------------------------------------------------------- denetim döngüleri
--- Bir tur (testler de çağırır).
function CAC.channelTick()
  local now = GetGameTimer()
  for _, sid in ipairs(GetPlayers()) do
    local src = tonumber(sid)
    local s = src and sessions[src]
    if s then
      if now - s.opened >= WARMUP then
        if not netOk(src) then
          -- Ağ sorunu: bekleyen soru başarısızlık sayılmaz. AMA "fake lag" ile ping'i
          -- sürekli yüksek tutup bu kalkanın arkasına saklanmak işe yaramaz: client başka
          -- trafik göndermeye devam ediyorken (lastMsg) AC 5 dakika tek mesaj atmadıysa
          -- güvenilir mesajlar bu sürede çoktan ulaşırdı — AC ölü.
          s.pending = nil
          if now - s.lastAlive > LAG_SILENCE and (GetPlayerLastMsg(src) or 0) < 5000 then
            tamper(src, 'silent', { silentFor = math.floor((now - s.lastAlive) / 1000) .. 's', ping = GetPlayerPing(src) })
          end
        else
          if now - s.lastAlive > ABSENCE_LIMIT then
            tamper(src, 'silent', { silentFor = math.floor((now - s.lastAlive) / 1000) .. 's' })
          end
          if s.pending and now - s.pending.at > REPLY_WINDOW then
            s.pending = nil
            s.fails = s.fails + 1
          end
          if s.fails >= FAIL_LIMIT then
            tamper(src, 'challenge', { failures = s.fails })
            s.fails = 0
          end
          if not s.pending and now - s.lastChallenge >= CHALLENGE_EVERY then
            local nonce = rnd31()
            s.pending = { nonce = nonce, at = now }
            s.lastChallenge = now
            TriggerClientEvent(NAMES.chal, src, nonce)
          end
        end
      end
    elseif src and GetPlayerName(src) then
      -- El sıkışmamış oyuncu: oturumda gerçekten dolaşıyor mu?
      local ped = GetPlayerPed(src)
      if ped and ped ~= 0 then
        local c = GetEntityCoords(ped)
        if c and (math.abs(c.x) > 1.0 or math.abs(c.y) > 1.0) then
          local p = presence[src] or { moved = 0.0 }
          presence[src] = p
          if p.last then p.moved = p.moved + math.min(#(c - p.last), 300.0) end
          p.last = c
        end
      end
      local p = presence[src]
      local waited = joined[src] and (now - joined[src]) or 0
      if not neverFlagged[src] and joined[src] and waited >= NEVER_AFTER
         and p and p.moved >= NEVER_MOVED and (GetPlayerLastMsg(src) or 0) < 5000
         and (netOk(src) or waited >= LAG_NEVER) and canReport(src) then
        neverFlagged[src] = true
        TriggerEvent('coreac:serverReport', src, 'AC_TAMPER', 'HIGH', {
          reason = REASONS.never, check = 'never',
          inSessionFor = math.floor((now - joined[src]) / 1000) .. 's', moved = math.floor(p.moved) .. 'm',
        })
        CAC.log('WARN', 'anticheat', ('AC_TAMPER (never started): %s'):format(GetPlayerName(src) or src))
      end
    end
  end
end

CreateThread(function()
  while true do
    Wait(5000)
    local ok, err = pcall(CAC.channelTick)
    if not ok and Config.Debug then print('[CoreAC] channel tick: ' .. tostring(err)) end
  end
end)

print('^2[CoreAC] Secure channel (anti-bypass) yuklendi.^7')
