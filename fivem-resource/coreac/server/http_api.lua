-- =============================================================================
-- server/http_api.lua — oyun sunucusunun HTTP API'si
-- Panel → Configuration → Settings → Framework & API
--
-- FiveM'in SetHttpHandler'ı ile bu resource'un altında (sunucunun 30120 portu) bir API
-- sunar:   http://SUNUCU:30120/<resource-klasör-adı>/<uç>
-- Kimlik:  Authorization: Bearer <coreac_token>   (panelin sunucuya verdiği token)
--
--   OKUMA (token yeter; "Allowed IPs" doluysa çağıran orada olmalı)
--     GET  /status       sunucu + panel bağlantı durumu
--     GET  /players      çevrimiçi oyuncular (kimlikler; IP yalnızca yazma açıkken)
--     GET  /bans         aktif banlar (IP yalnızca yazma açıkken)
--
--   YAZMA ("HTTP API — Allow Write Endpoints" AÇIK + "Allowed IPs" DOLU + çağıran listede)
--     POST /unban        { "code": "AC-7K3QP9" }
--     POST /screenshot   { "id": 12 }                 (oyuncunun sunucu id'si)
--     POST /reload       {}                           (paneldeki config'i hemen çek)
--
-- GÜVENLİK
--   * Sıra: hız sınırı → token (sabit zamanlı karşılaştırma) → IP izin listesi → uç.
--   * Yazma varsayılan KAPALI: token sızarsa biri banları kaldırıp ekran görüntüsü
--     isteyebilirdi. Açıkken bile izin listesi ŞART — yalnızca token yetmez.
--   * X-Forwarded-For gibi başlıklara güvenilmez (taklit edilebilir): yalnızca bağlantının
--     gerçek uzak adresi kullanılır.
--   * Gövde en fazla 4 KB; alanlar sıkı doğrulanır; her yazma denetim kaydına düşer
--     (panel → Loglar + Admin Logs webhook'u: "HTTP API").
--   * Oyuncu adları oyuncudan gelir — yanıt json.encode ile üretilir, ham metin birleştirilmez.
-- =============================================================================

CAC = CAC or {}

local MAX_BODY = 4096
local RATE_LIMIT, RATE_WINDOW = 60, 60000       -- uzak adres başına dakikada 60 istek
local startedAt = GetGameTimer()

local function S() return CoreAC.Config.Settings end

-- ---------------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------------

--- Başlık değeri (büyük/küçük harf duyarsız).
local function header(req, name)
  name = name:lower()
  for k, v in pairs(req.headers or {}) do
    if tostring(k):lower() == name then return tostring(v) end
  end
  return nil
end

--- Zamanlama saldırısına kapalı eşitlik karşılaştırması.
local function constantTimeEquals(a, b)
  if type(a) ~= 'string' or type(b) ~= 'string' then return false end
  local diff = #a ~ #b
  for i = 1, math.max(#a, #b) do
    diff = diff | ((a:byte(i) or 0) ~ (b:byte(i) or 0))
  end
  return diff == 0
end

--- Bağlantının uzak IP'si ("1.2.3.4:5678", "[::1]:5678", "::ffff:1.2.3.4" biçimlerinden).
local function remoteIp(req)
  local addr = tostring(req.address or '')
  local v6 = addr:match('^%[([%x:%.]+)%]')
  if v6 then addr = v6 end
  addr = addr:lower()
  local mapped = addr:match('^::ffff:(%d+%.%d+%.%d+%.%d+)')
  if mapped then return mapped end
  local v4 = addr:match('^(%d+%.%d+%.%d+%.%d+)')
  if v4 then return v4 end
  return addr
end

local function ipv4ToInt(s)
  local a, b, c, d = tostring(s):match('^(%d+)%.(%d+)%.(%d+)%.(%d+)$')
  a, b, c, d = tonumber(a), tonumber(b), tonumber(c), tonumber(d)
  if not a or a > 255 or b > 255 or c > 255 or d > 255 then return nil end
  return (a << 24) | (b << 16) | (c << 8) | d
end

--- ip, izin listesindeki bir adres ya da IPv4 aralığında (CIDR) mı?
local function ipAllowed(ip, list)
  if type(list) ~= 'table' then return false end
  local ipInt = ipv4ToInt(ip)
  for _, entry in ipairs(list) do
    entry = tostring(entry):lower()
    local base, bits = entry:match('^([%d%.]+)/(%d+)$')
    if base and ipInt then
      bits = tonumber(bits)
      local baseInt = ipv4ToInt(base)
      if baseInt and bits and bits >= 0 and bits <= 32 then
        local mask = (bits == 0) and 0 or ((0xFFFFFFFF << (32 - bits)) & 0xFFFFFFFF)
        if (ipInt & mask) == (baseInt & mask) then return true end
      end
    elseif entry == ip then
      return true
    end
  end
  return false
end

-- Sabit pencereli hız sınırı (uzak adres başına).
local hits = {}
local function rateLimited(ip)
  local now = GetGameTimer()
  local h = hits[ip]
  if not h or now >= h.reset then
    hits[ip] = { n = 1, reset = now + RATE_WINDOW }
    return false
  end
  h.n = h.n + 1
  return h.n > RATE_LIMIT
end
CreateThread(function()   -- eski kayıtları temizle
  while true do
    Wait(120000)
    local now = GetGameTimer()
    for ip, h in pairs(hits) do
      if now >= h.reset then hits[ip] = nil end
    end
  end
end)

local function respond(res, status, body)
  res.writeHead(status, { ['Content-Type'] = 'application/json', ['Cache-Control'] = 'no-store' })
  res.send(json.encode(body))
end

--- POST gövdesini okur: cb(tablo) ya da cb(nil, hataKodu). Gelmezse 3 sn sonra zaman aşımı.
local function readBody(req, cb)
  local done = false
  req.setDataHandler(function(body)
    if done then return end
    done = true
    body = tostring(body or '')
    if #body > MAX_BODY then return cb(nil, 'body_too_large') end
    if body == '' then return cb({}) end
    local ok, data = pcall(json.decode, body)
    if ok and type(data) == 'table' then return cb(data) end
    return cb(nil, 'invalid_json')
  end)
  SetTimeout(3000, function()
    if done then return end
    done = true
    cb(nil, 'timeout')
  end)
end

--- Her yazma işlemi denetim kaydına düşer (panel Logları + Admin Logs webhook'u).
local function audit(action, ip, detail)
  CAC.log('INFO', 'httpapi', ('HTTP API: %s%s from %s'):format(action, detail and (' ' .. detail) or '', ip), {
    event = 'admin', admin = 'HTTP API', action = action,
    reason = ('used the HTTP API (%s%s) from %s'):format(action, detail and (' ' .. detail) or '', ip),
  })
end

-- ---------------------------------------------------------------------------
-- Uçlar
-- ---------------------------------------------------------------------------
local function listPlayers(withIp)
  local out = {}
  for _, sid in ipairs(GetPlayers()) do
    local id = tonumber(sid)
    local ids = CAC.getIdents(id)
    local row = {
      id = id, name = GetPlayerName(id) or ('Player#' .. id), ping = GetPlayerPing(id),
      license = ids.license, discord = ids.discord, steam = ids.steam,
    }
    if withIp then row.ip = ids.ip end
    out[#out + 1] = row
  end
  return out
end

local function listBans(withIp)
  local out = {}
  for _, b in ipairs(CAC.getBans and CAC.getBans() or {}) do
    local row = {
      code = b.code, license = b.license, discord = b.discord, steam = b.steam,
      permanent = b.permanent ~= false, expiresAt = b.expiresAt,
    }
    if withIp then row.ip = b.ip end
    out[#out + 1] = row
  end
  return out
end

local function handle(req, res)
  local ip = remoteIp(req)
  if rateLimited(ip) then return respond(res, 429, { error = 'rate_limited' }) end

  -- 1) Token (panelin bu sunucuya verdiği coreac_token)
  local token = Config.Token
  if not token or token == '' then return respond(res, 503, { error = 'not_configured' }) end
  local given = (header(req, 'authorization') or ''):match('^[Bb]earer%s+(%S+)$')
  if not given or not constantTimeEquals(given, token) then
    return respond(res, 401, { error = 'unauthorized' })
  end

  -- 2) IP izin listesi (doluysa herkes için geçerli)
  local allowList = S().HttpApiAllowedIps
  local listed = type(allowList) == 'table' and #allowList > 0
  local callerAllowed = listed and ipAllowed(ip, allowList) or false
  if listed and not callerAllowed then return respond(res, 403, { error = 'address_not_allowed' }) end

  -- 3) Yazma yetkisi: anahtar AÇIK + liste DOLU + çağıran listede
  local writeOn = S().HttpApiAllowWrite == true
  local canWrite = writeOn and callerAllowed

  -- Uç yolu: "/<resource>/status" → "/status"
  local path = tostring(req.path or '/')
  local prefix = '/' .. GetCurrentResourceName()
  if path:sub(1, #prefix + 1) == prefix .. '/' then path = path:sub(#prefix + 1) end
  while #path > 1 and path:sub(-1) == '/' do path = path:sub(1, -2) end
  local method = tostring(req.method or 'GET'):upper()

  if method == 'GET' and path == '/status' then
    local now = GetGameTimer()
    local lastOk = CAC.lastHeartbeatOk
    return respond(res, 200, {
      ok = true,
      resource = GetCurrentResourceName(),
      version = Config.AcVersion,
      uptimeSeconds = math.floor((now - startedAt) / 1000),
      players = #GetPlayers(),
      maxClients = GetConvarInt('sv_maxclients', 48),
      detections = Config.DetectionsEnabled ~= false,
      logOnly = CAC.isLogOnly(),
      panel = { connected = lastOk ~= nil and (now - lastOk) < 65000, lastSyncSecondsAgo = lastOk and math.floor((now - lastOk) / 1000) or nil },
      write = canWrite,
    })
  elseif method == 'GET' and path == '/players' then
    return respond(res, 200, { players = listPlayers(canWrite) })
  elseif method == 'GET' and path == '/bans' then
    return respond(res, 200, { bans = listBans(canWrite) })
  end

  -- Buradan sonrası yazma uçları.
  local isWrite = method == 'POST' and (path == '/unban' or path == '/screenshot' or path == '/reload')
  if not isWrite then return respond(res, 404, { error = 'not_found' }) end
  if not writeOn then return respond(res, 403, { error = 'write_disabled' }) end
  if not canWrite then return respond(res, 403, { error = 'write_requires_allowed_ips' }) end

  readBody(req, function(body, err)
    if not body then return respond(res, err == 'timeout' and 408 or 400, { error = err }) end

    if path == '/reload' then
      audit('reload', ip)
      if CAC.heartbeat then CAC.heartbeat() end
      return respond(res, 200, { ok = true })

    elseif path == '/unban' then
      local code = type(body.code) == 'string' and body.code:upper() or nil
      if not code or not code:match('^[A-Z0-9%-]+$') or #code < 5 or #code > 20 then
        return respond(res, 400, { error = 'invalid_code' })
      end
      CAC.request('/ingame/unban', 'POST', { code = code, by = 'HTTP API' }, function(ok, data)
        if ok then
          if CAC.refreshBans then CAC.refreshBans() end
          audit('unban', ip, code)
          return respond(res, 200, { ok = true, player = data and data.playerName or nil })
        end
        return respond(res, 404, { error = 'no_active_ban' })
      end)

    elseif path == '/screenshot' then
      local id = tonumber(body.id)
      if not id or id ~= math.floor(id) or not GetPlayerName(id) then
        return respond(res, 404, { error = 'player_not_found' })
      end
      CAC.requestScreenshot(id, 'HTTP API', nil, function(ok, requestId)
        if ok then
          audit('screenshot', ip, '#' .. id)
          return respond(res, 200, { ok = true, requestId = requestId })
        end
        return respond(res, 502, { error = 'panel_unavailable' })
      end)
    end
  end)
end

SetHttpHandler(function(req, res)
  local ok, err = pcall(handle, req, res)
  if not ok then
    print(('^1[CoreAC] HTTP API error: %s^7'):format(tostring(err)))
    pcall(respond, res, 500, { error = 'internal_error' })
  end
end)

print(('^2[CoreAC] HTTP API hazir: /%s/status (Authorization: Bearer <coreac_token>)^7'):format(GetCurrentResourceName()))
