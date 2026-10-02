-- =============================================================================
-- server/connection.lua — panel → Configuration → Settings → Connection & Identity
--
-- Oyuncu bağlanma kartında beklerken (playerConnecting, server/main.lua) ban
-- kontrolünden SONRA sırayla çalışır; ilk reddeden karar verir:
--
--   1. Require Alphanumeric Name   sembol / emoji / görünmez karakterli isim
--   2. Require Steam / Discord     bağlı hesap şartı
--   3. Anti Connection Dupe        aynı hesabın ikinci bağlantısı
--   4. Anti VPN                    proxycheck.io sorgusu (24 saat önbellek)
--   5. Panel kararı                ağ itibarı kapısı + Max Threat Score + ağ politikası
--
-- MUAFİYET: sunucu yetkilileri (CAC.isStaff) ve Trust Whitelist'teki (tam kayıt)
-- oyuncular bu kapılara takılmaz. Banlar bu dosyadan ÖNCE kontrol edilir ve her
-- zaman uygulanır.
--
-- HATA DAYANIKLILIĞI: panel ya da VPN servisi yanıt vermezse oyuncu ALINIR
-- (fail-open) — panel sorunu yüzünden meşru oyuncunun girişi kapanmasın. "Block
-- Joins When Verification Fails" açıksa tersi: doğrulanamayan oyuncu reddedilir.
--
-- Bu dosya kart göstermez; { kind, message } kararı döner, kartı main.lua sunar.
-- =============================================================================

CAC = CAC or {}

local function S() return CoreAC.Config.Settings end

-- ---------------------------------------------------------------------------
-- 1) İsim
-- ---------------------------------------------------------------------------

--- UTF-8 dizisini kod noktalarına çevirir; geçersizse (bozuk dizi, overlong,
--- surrogate) nil. Lua'nın utf8 kütüphanesine bağımlı değil.
local function decodeUtf8(s)
  local cps, i, n = {}, 1, #s
  while i <= n do
    local c = s:byte(i)
    local cp, len
    if c < 0x80 then cp, len = c, 1
    elseif c >= 0xC2 and c <= 0xDF then cp, len = c & 0x1F, 2
    elseif c >= 0xE0 and c <= 0xEF then cp, len = c & 0x0F, 3
    elseif c >= 0xF0 and c <= 0xF4 then cp, len = c & 0x07, 4
    else return nil end
    if i + len - 1 > n then return nil end
    for k = 1, len - 1 do
      local cc = s:byte(i + k)
      if not cc or (cc & 0xC0) ~= 0x80 then return nil end
      cp = (cp << 6) | (cc & 0x3F)
    end
    if (len == 3 and cp < 0x800) or (len == 4 and cp < 0x10000)
        or (cp >= 0xD800 and cp <= 0xDFFF) or cp > 0x10FFFF then return nil end
    cps[#cps + 1] = cp
    i = i + len
  end
  return cps
end

-- "Harf" sayılan kod noktaları. Türkçe (ç ş ğ ı ö ü İ) dahil Latin, Yunan, Kiril,
-- İbranice, Arapça, Tay, Japonca, Çince ve Korece harfleri serbest; semboller,
-- emoji, birleştirici işaretler ("zalgo"), görünmez/biçim karakterleri değil.
local function isLetter(cp)
  return (cp >= 0x41 and cp <= 0x5A) or (cp >= 0x61 and cp <= 0x7A)        -- A-Z a-z
      or (cp >= 0xC0 and cp <= 0x24F and cp ~= 0xD7 and cp ~= 0xF7)        -- Latin-1 + Latin Ext-A/B
      or (cp >= 0x1E00 and cp <= 0x1EFF)                                   -- Latin Ext Additional
      or (cp >= 0x386 and cp <= 0x3FF and cp ~= 0x387 and cp ~= 0x3F6)     -- Yunan
      or (cp >= 0x400 and cp <= 0x52F)                                     -- Kiril
      or (cp >= 0x5D0 and cp <= 0x5EA)                                     -- İbranice
      or (cp >= 0x621 and cp <= 0x64A)                                     -- Arapça
      or (cp >= 0x0E01 and cp <= 0x0E30)                                   -- Tay
      or (cp >= 0x3041 and cp <= 0x30FF)                                   -- Hiragana / Katakana
      or (cp >= 0x4E00 and cp <= 0x9FFF)                                   -- CJK
      or (cp >= 0xAC00 and cp <= 0xD7A3)                                   -- Hangul
end

--- İsim kurala uyuyor mu? Harf (her dil), rakam, boşluk ve _ - . ' serbest; en az
--- bir harf/rakam şart. Sembol, emoji, < >, görünmez karakter ve bozuk UTF-8 red.
function CAC.nameAllowed(name)
  if type(name) ~= 'string' or name == '' then return false end
  local cps = decodeUtf8(name)
  if not cps then return false end
  local solid = false
  for _, cp in ipairs(cps) do
    if isLetter(cp) or (cp >= 0x30 and cp <= 0x39) then
      solid = true
    elseif not (cp == 0x20 or cp == 0x5F or cp == 0x2D or cp == 0x2E or cp == 0x27 or cp == 0x2019) then
      return false
    end
  end
  return solid
end

-- ---------------------------------------------------------------------------
-- 3) Çift bağlantı
-- ---------------------------------------------------------------------------
local STALE_MS = 15000

--- Aynı lisansla şu an bağlı başka oyuncunun sunucu id'si (yoksa nil).
local function otherSessionOf(src, license)
  if not license then return nil end
  for _, sid in ipairs(GetPlayers()) do
    local p = tonumber(sid)
    if p and p ~= src and CAC.getIdents(p).license == license then return p end
  end
  return nil
end

-- ---------------------------------------------------------------------------
-- 4) VPN
-- ---------------------------------------------------------------------------
local VPN_TTL = 24 * 3600 * 1000       -- bilinen sonuç 24 saat
local VPN_RETRY = 60 * 1000            -- sorgu başarısızsa 1 dk sonra yeniden dene
local vpnCache, vpnCount = {}, 0

--- true = VPN/proxy, false = temiz, nil = öğrenilemedi. Servis: proxycheck.io
--- (anahtarsız da çalışır; ücretsiz anahtar günlük sorgu limitini yükseltir).
local function vpnLookup(ip, apiKey)
  local now = GetGameTimer()
  local c = vpnCache[ip]
  if c and now - c.at < (c.vpn == nil and VPN_RETRY or VPN_TTL) then return c.vpn end

  if type(ip) ~= 'string' or not ip:match('^[%x%.:]+$') then return nil end
  local url = ('https://proxycheck.io/v2/%s?vpn=1&asn=0'):format(ip)
  if type(apiKey) == 'string' and apiKey ~= '' and apiKey:match('^[%w%._%-]+$') then
    url = url .. '&key=' .. apiKey
  end

  local done, result = false, nil
  PerformHttpRequest(url, function(status, body)
    if status == 200 and type(body) == 'string' then
      local ok, data = pcall(json.decode, body)
      if ok and type(data) == 'table' and (data.status == 'ok' or data.status == 'warning') then
        local entry = data[ip]
        if type(entry) == 'table' and entry.proxy ~= nil then result = (entry.proxy == 'yes') end
      end
    end
    done = true
  end, 'GET')
  local waited = 0
  while not done and waited < 4000 do Wait(100); waited = waited + 100 end

  if vpnCount > 2000 then vpnCache, vpnCount = {}, 0 end   -- sınırsız büyümesin
  if not vpnCache[ip] then vpnCount = vpnCount + 1 end
  vpnCache[ip] = { at = now, vpn = result }
  return result
end
CAC.vpnLookup = vpnLookup

-- ---------------------------------------------------------------------------
-- 5) Panel kararı (ağ itibarı kapısı, Max Threat, ağ politikası)
-- ---------------------------------------------------------------------------
local function panelVerdict(name, ids)
  local done, resp = false, nil
  CAC.request('/network/check', 'POST', {
    license = ids.license, steam = ids.steam, discord = ids.discord, playerName = name,
  }, function(ok, data)
    resp = (ok and data) or nil
    done = true
  end)
  local waited = 0
  while not done and waited < 3000 do Wait(100); waited = waited + 100 end
  return resp
end

--- Doğrulama panelin yanıtına mı bağlı? (Bağlı değilse panel çökse de kimse etkilenmez.)
local function panelDecides()
  local s = S()
  local net = CAC.getServerConfig and CAC.getServerConfig().network
  if type(net) == 'table' and net.action == 'KICK' then return true end
  if (tonumber(s.MaxThreatScore) or 0) > 0 then return true end
  return (tonumber(s.MinReputationScore) or 0) > 0 and s.ReputationGateEnforce == true
end

local function deny(kind, message)
  return { kind = kind, message = message }
end

local function verdictUnsafe(src, name, ids)
  local s = S()

  -- Yetkililer ve güvenilen (Trust Whitelist) oyuncular bu kapılara takılmaz.
  if (CAC.isWhitelisted and CAC.isWhitelisted(src)) or (CAC.isStaff and CAC.isStaff(src)) then
    return nil
  end

  if s.RequireAlphanumericName == true and not CAC.nameAllowed(name) then
    return deny('name', s.NameMessage)
  end
  if s.RequireSteam == true and not ids.steam then
    return deny('steam', s.SteamRequiredMessage)
  end
  if s.RequireDiscord == true and not ids.discord then
    return deny('discord', s.DiscordRequiredMessage)
  end

  if s.AntiConnectionDupe == true then
    local other = otherSessionOf(src, ids.license)
    if other then
      local idle = GetPlayerLastMsg and GetPlayerLastMsg(other)
      if type(idle) == 'number' and idle > STALE_MS then
        -- Eski oturum yanıt vermiyor (çökmüş): yenisi onun yerine geçer.
        DropPlayer(other, '[CoreAC] Your previous session stopped responding and was replaced by a new connection.')
      else
        return deny('dupe', s.DupeMessage)
      end
    end
  end

  local failClosed = s.BlockIfVerifyFails == true

  if s.AntiVPN == true and not CAC.isPrivateIp(ids.ip) then
    local vpn = vpnLookup(ids.ip, s.VpnApiKey)
    if vpn == true then
      return deny('vpn', s.VpnMessage)
    elseif vpn == nil and failClosed then
      return deny('verify', s.VerifyUnavailableMessage)
    end
  end

  local resp = panelVerdict(name, ids)
  if resp then
    if resp.deny == 'threat' then return deny('threat', s.ThreatMessage) end
    if resp.deny == 'reputation' then return deny('reputation', s.ReputationMessage) end
    if resp.flagged and resp.action == 'KICK' then
      -- Panel yalnızca sayı ve tespit türü verir; başka sunucunun adı asla gelmez.
      local why = type(resp.reason) == 'string' and resp.reason ~= '' and (': ' .. resp.reason:sub(1, 180)) or '.'
      return deny('network', 'You are blocked by the CoreAC anti-cheat network' .. why)
    end
  elseif failClosed and panelDecides() then
    return deny('verify', s.VerifyUnavailableMessage)
  end

  return nil
end

--- Oyuncu girebilir mi? nil = evet; { kind, message } = hayır (kart mesajıyla).
--- Bekleme (Wait) içerir — yalnızca playerConnecting coroutine'inden çağır.
--- Kapılardaki beklenmedik bir Lua hatası kimseyi dışarıda bırakmasın: loglanır ve
--- oyuncu alınır (kart sonsuza dek "kontrol ediliyor"da asılı kalmaz).
function CAC.connectionVerdict(src, name, ids)
  local ok, verdict = pcall(verdictUnsafe, src, name, ids)
  if ok then return verdict end
  CAC.log('ERROR', 'connect', ('Connection gate error (player let in): %s'):format(tostring(verdict)))
  return nil
end

print('^2[CoreAC] Connection & Identity yuklendi.^7')
