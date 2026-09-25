-- CoreAC Anti-Cheat — sunucu ana betiği
-- Panelle konuşur: heartbeat, oyuncu senkronizasyonu, ban kontrolü,
-- ceza/komut/kaynak kuyruğu tüketimi, log gönderimi.

local ServerConfig = {}         -- heartbeat'ten dönen ayarlar (rules)
local BanList = {}              -- aktif ban listesi (cache)
local LogBuffer = {}            -- gönderilmeyi bekleyen loglar

-- ---------------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------------

local function getIdents(src)
  local t = { license = nil, steam = nil, discord = nil, ip = nil }
  for _, id in ipairs(GetPlayerIdentifiers(src)) do
    if id:sub(1, 8) == 'license:' and not t.license then
      t.license = id
    elseif id:sub(1, 6) == 'steam:' then
      t.steam = id
    elseif id:sub(1, 8) == 'discord:' then
      t.discord = id
    elseif id:sub(1, 3) == 'ip:' then
      t.ip = id:sub(4)
    end
  end
  if not t.ip then t.ip = GetPlayerEndpoint(src) end
  return t
end

local function findByLicense(license)
  if not license then return nil end
  for _, src in ipairs(GetPlayers()) do
    if getIdents(src).license == license then return src end
  end
  return nil
end

function CAC.log(level, source, message)
  LogBuffer[#LogBuffer + 1] = { level = level or 'INFO', source = source or 'server', message = tostring(message) }
end

function CAC.getRules()
  return ServerConfig.rules or {}
end

--- Log-Only (deneme) modu açık mı? Panel → Configuration → Settings.
--- /detections akışı bunu web tarafında zaten uyguluyor; bu yardımcı,
--- KENDİ kararını veren yollar (kara liste zorlaması gibi) da moda uysun diye
--- var. Aksi halde "asla kick/ban atma" sözü verilirken kara liste ban atardı.
function CAC.isLogOnly()
  local ac = ServerConfig and ServerConfig.ac
  return not not (ac and ac.Settings and ac.Settings.LogOnly == true)
end

--- Panel'deki "Event Log" (canlı oyun-olayı akışı) açık mı? (server/event_log.lua)
function CAC.eventLogEnabled()
  return not not (ServerConfig and ServerConfig.eventLogEnabled == true)
end

-- ---------------------------------------------------------------------------
-- Kendi network event'lerimiz için oran sınırlayıcı (sertleştirme).
-- Amaç: bir hilecinin coreac:report/coreac:aim/coreac:pos gibi event'lerimizi
-- spam edip anti-cheat'in kendisini (ve panel API'sini) yorması/DoS etmesini
-- önlemek. Aşan istekler sessizce (hata basmadan) atlanır.
-- ---------------------------------------------------------------------------
local eventBuckets = {}
function CAC.eventLimited(src, name, limit, windowMs)
  local key = tostring(src) .. ':' .. name
  local now = GetGameTimer()
  local b = eventBuckets[key]
  if not b or now > b.reset then
    eventBuckets[key] = { count = 1, reset = now + windowMs }
    return false
  end
  b.count = b.count + 1
  return b.count > limit
end
AddEventHandler('playerDropped', function()
  local s = tostring(source)
  for k in pairs(eventBuckets) do
    if k:sub(1, #s + 1) == s .. ':' then eventBuckets[k] = nil end
  end
end)

-- Diğer modüllerin (live.lua, protection.lua) kullanabilmesi için köprüle.
CAC.getIdents = getIdents
CAC.findByLicense = findByLicense

-- ---------------------------------------------------------------------------
-- OYUNCU OYUNDA MI? (sunucu tarafı spawn kapısı)
--
-- Sunucu taraflı kontroller (zırh, harita dışı, teleport taraması) oyuncuyu
-- ilk gördükleri andan itibaren çalışıyordu — yükleme ekranı ve karakter
-- seçimi dahil. O ekranlarda ped gizli bir konuma taşınır ve değerleri
-- framework yüklenene kadar tutarsızdır → oyuncu daha oyuna girmeden
-- ARMOR_HACK / OUT_OF_BOUNDS yiyordu.
--
-- GÜVENİLİR SİNYAL: framework'ün SUNUCUDA tetiklediği "karakter yüklendi"
-- olayları. Client'ın "oyundayım" demesine burada güvenilmez — hileci bu
-- sinyali göndermeyerek sunucu kontrollerini kendisi için kapatabilirdi.
--   * Framework varsa  → yalnızca sunucu olayı; özelleştirilmiş/yeniden
--     adlandırılmış olaylar yüzünden kontroller sonsuza kadar kapalı kalmasın
--     diye son giriş/çıkıştan NO_SIGNAL_TIMEOUT sonra yine de açılır.
--   * Framework yoksa  → client kapısının ipucu, yoksa girişten 120 sn sonra.
-- ---------------------------------------------------------------------------
local FRAMEWORK_RESOURCES = { 'qb-core', 'qbx_core', 'es_extended', 'ox_core', 'ND_Core' }
local NO_SIGNAL_TIMEOUT = 300000

local joinedAt, loadedAt, unloadedAt, clientReadyAt = {}, {}, {}, {}

local function hasFramework()
  for _, r in ipairs(FRAMEWORK_RESOURCES) do
    if GetResourceState(r) == 'started' then return true end
  end
  return false
end

local function markLoaded(src)
  src = tonumber(src)
  if src and src > 0 then loadedAt[src] = GetGameTimer(); unloadedAt[src] = nil end
end
local function markUnloaded(src)
  src = tonumber(src)
  -- Karakter değişimi: client kapısı da yeniden açılmalı (yeni spawn seçimi).
  if src and src > 0 then loadedAt[src] = nil; unloadedAt[src] = GetGameTimer(); clientReadyAt[src] = nil end
end

AddEventHandler('playerJoining', function() joinedAt[source] = GetGameTimer() end)
AddEventHandler('QBCore:Server:PlayerLoaded', function(Player)
  markLoaded(Player and Player.PlayerData and Player.PlayerData.source)
end)
AddEventHandler('QBCore:Server:OnPlayerUnload', markUnloaded)
AddEventHandler('esx:playerLoaded', function(src) markLoaded(src) end)
AddEventHandler('esx:playerLogout', function(src) markUnloaded(src) end)

-- Framework'süz sunucular için client ipucu (bridge/client.lua spawn kapısı).
RegisterNetEvent('coreac:inGame', function()
  local src = source
  if CAC.noteEvent then CAC.noteEvent(src) end
  if CAC.eventLimited(src, 'inGame', 3, 60000) then return end
  clientReadyAt[src] = clientReadyAt[src] or GetGameTimer()
end)

AddEventHandler('playerDropped', function()
  local s = source
  joinedAt[s], loadedAt[s], unloadedAt[s], clientReadyAt[s] = nil, nil, nil, nil
end)

-- AC oyun sırasında yeniden başlatıldıysa mevcut oyuncular çoktan oyundadır.
CreateThread(function()
  local long_ago = GetGameTimer() - (NO_SIGNAL_TIMEOUT + 60000)
  for _, sid in ipairs(GetPlayers()) do
    joinedAt[tonumber(sid)] = joinedAt[tonumber(sid)] or long_ago
  end
end)

--- Oyuncu karakteriyle oyunda mı ve en az settleMs'dir mi oyunda?
function CAC.isInGame(src, settleMs)
  src = tonumber(src)
  if not src then return false end
  local now = GetGameTimer()
  settleMs = settleMs or 10000

  -- 1) Client'ın spawn kapısı açıldı (framework'ün CLIENT "yüklendi" olayı +
  --    yerleşme süresi — yani spawn noktası SEÇİLDİKTEN sonra). Bu sinyali
  --    erken göndermek hileciye fayda sağlamaz (kontroller yalnızca erken
  --    başlar); göndermemek en fazla aşağıdaki süreler kadar geciktirir.
  if clientReadyAt[src] then return now - clientReadyAt[src] >= settleMs end

  -- 2) Framework'ün SUNUCU olayı geldi ama client sinyali yok. QBCore bu olayı
  --    KARAKTER SEÇİMİNDE atar; ardından spawn-konumu seçim ekranı gelir. Eskiden
  --    15 sn sonra tarama başlıyordu → oyuncu spawn noktasını seçince bu
  --    ışınlanma TELEPORT olarak düşüyordu. Artık en az 90 sn beklenir.
  if loadedAt[src] then return now - loadedAt[src] >= math.max(settleMs, 90000) end

  if hasFramework() then
    local since = math.max(joinedAt[src] or 0, unloadedAt[src] or 0)
    return since > 0 and now - since >= NO_SIGNAL_TIMEOUT
  end
  local since = joinedAt[src]
  return since ~= nil and now - since >= 120000
end

-- ---------------------------------------------------------------------------
-- MEŞRU IŞINLANMA BİLDİRİMİ — üretimdeki 1 NUMARALI yanlış-pozitif kaynağı.
-- İş/ev/garaj/asansör/spawn/admin tp yapan HER script, oyuncuyu taşımadan
-- hemen önce bunu çağırmalı; aksi halde 50 m+ sıçrama TELEPORT/NOCLIP olarak
-- görünür. Sunucu tarafından (klasör adından bağımsız — önerilen):
--     TriggerEvent('coreac:markTeleport', src)
-- Client tarafından:
--     TriggerEvent('coreac:markTeleport')
-- (exports['<CoreAC klasörü>']:markTeleport(...) da çalışır.)
-- ---------------------------------------------------------------------------
function CAC.markTeleport(src)
  src = tonumber(src)
  if not src or src <= 0 or not GetPlayerName(src) then return end
  -- HATA DÜZELTİLDİ: eskiden yalnızca client'a haber veriliyordu. Sunucunun
  -- kendi teleport taraması (server/live.lua) SUNUCU tarafı muafiyete bakar;
  -- bu yüzden entegrasyonu doğru yapmış sunucularda bile her meşru iş/garaj
  -- ışınlanması TELEPORT (varsayılan KICK) olarak işaretleniyordu.
  if CAC.grantTp then CAC.grantTp(src) end
  TriggerClientEvent('coreac:grantTp', src)
end
exports('markTeleport', function(src) CAC.markTeleport(src) end)
AddEventHandler('coreac:markTeleport', function(src) CAC.markTeleport(src or source) end)

function CAC.markRevive(src)
  src = tonumber(src)
  if not src or src <= 0 or not GetPlayerName(src) then return end
  if CAC.grantRevive then CAC.grantRevive(src) end
  TriggerClientEvent('coreac:grantRevive', src)
  TriggerEvent('coreac:revived', src)
end
exports('markRevive', function(src) CAC.markRevive(src) end)
AddEventHandler('coreac:markRevive', function(src) CAC.markRevive(src or source) end)

-- Ürün "Aeigs" adıyla dağıtılırken yazılmış entegrasyonlar bozulmasın:
-- eski olay adları yeni işlevlere yönlendirilir. (Yalnızca sunucu-içi
-- AddEventHandler — client'lar bunları tetikleyemez.)
AddEventHandler('aeigs:markTeleport', function(src) CAC.markTeleport(src or source) end)
AddEventHandler('aeigs:markRevive', function(src) CAC.markRevive(src or source) end)

-- ---------------------------------------------------------------------------
-- Heartbeat — sunucuyu çevrimiçi tutar, ayarları (rules) alır
-- ---------------------------------------------------------------------------

local function heartbeat()
  CAC.request('/heartbeat', 'POST', {
    acVersion = Config.AcVersion,
    maxSlots = GetConvarInt('sv_maxclients', 48),
    onlineCount = #GetPlayers(),
  }, function(ok, data)
    if ok and data and data.config then
      ServerConfig = data.config
      -- Client tespitleri (silah/ammo/noclip vb.) kuralları bilsin diye yayınla.
      TriggerClientEvent('coreac:rules', -1, ServerConfig.rules or {})
      -- Panelden yönetilen "Protected Events" honeypot listesi (client/events.lua).
      TriggerClientEvent('coreac:protectedEvents', -1, ServerConfig.protectedEvents or {})
      -- Tam CoreAC config (panel Configuration sayfası) — CoreAC.Config'e uygula.
      if ServerConfig.ac and CAC.applyAcConfig then
        CAC.applyAcConfig(ServerConfig.ac)
      end
    end
  end)
end

-- Konsoldaki "ac reload" komutu (server/commands.lua) config'i hemen çeker.
CAC.heartbeat = heartbeat

-- Yeni bağlanan client mevcut kuralları ister.
RegisterNetEvent('coreac:requestRules', function()
  if CAC.noteEvent then CAC.noteEvent(source) end
  TriggerClientEvent('coreac:rules', source, ServerConfig.rules or {})
  TriggerClientEvent('coreac:protectedEvents', source, ServerConfig.protectedEvents or {})
end)

-- ---------------------------------------------------------------------------
-- Oyuncu senkronizasyonu — license / steam / discord / ip / isim
-- ---------------------------------------------------------------------------

local function syncPlayers()
  local players = {}
  for _, src in ipairs(GetPlayers()) do
    local ids = getIdents(src)
    players[#players + 1] = {
      name = GetPlayerName(src) or ('Player#' .. src),
      license = ids.license,
      steam = ids.steam,
      discord = ids.discord,
      ip = ids.ip,
    }
  end
  CAC.request('/players/sync', 'POST', { players = players }, nil)
end

-- ---------------------------------------------------------------------------
-- Ban listesi — cache + girişte kontrol
-- ---------------------------------------------------------------------------

local function refreshBans()
  CAC.request('/bans', 'GET', nil, function(ok, data)
    if ok and data and data.bans then
      BanList = data.bans
    end
  end)
end

CAC.refreshBans = refreshBans

local function matchBan(ids)
  -- Yalnızca BENZERSİZ kimliklerle eşleştir (license/steam/discord).
  -- IP ile eşleştirme YAPILMAZ: aynı ağdaki/routerdaki masum oyuncular yanlışlıkla
  -- banlanmasın ("banlar karışıyor" sorununun başlıca sebebi buydu).
  for _, b in ipairs(BanList) do
    if (b.license and b.license == ids.license)
        or (b.steam and b.steam == ids.steam)
        or (b.discord and b.discord == ids.discord) then
      return b
    end
  end
  return nil
end

--- Bir oyuncu (kaynak id) ban listesinde mi? bridge/server.lua'daki
--- CoreAC.IsPlayerBanned köprüsü bunu kullanır.
function CAC.isBanned(src)
  src = tonumber(src)
  if not src or not GetPlayerName(src) then return false end
  return matchBan(getIdents(src)) ~= nil
end

-- ---------------------------------------------------------------------------
-- LOGO — iki kaynak: (1) Config.BrandLogoUrl (public URL), (2) resource içine
-- konan logo.png/logo.jpg → açılışta base64 data URI'ye çevrilip karta gömülür
-- (dış host gerekmez). Data URI'yi bir kez üretip saklıyoruz.
-- ---------------------------------------------------------------------------
local b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local function base64(data)
  return ((data:gsub('.', function(x)
    local r, byte = '', x:byte()
    for i = 8, 1, -1 do r = r .. (byte % 2 ^ i - byte % 2 ^ (i - 1) > 0 and '1' or '0') end
    return r
  end) .. '0000'):gsub('%d%d%d?%d?%d?%d?', function(x)
    if #x < 6 then return '' end
    local c = 0
    for i = 1, 6 do c = c + (x:sub(i, i) == '1' and 2 ^ (6 - i) or 0) end
    return b64chars:sub(c + 1, c + 1)
  end) .. ({ '', '==', '=' })[#data % 3 + 1])
end

local logoDataUri = nil
CreateThread(function()
  local res = GetCurrentResourceName()
  local candidates = { { 'logo.png', 'image/png' }, { 'logo.jpg', 'image/jpeg' }, { 'logo.jpeg', 'image/jpeg' } }
  for _, c in ipairs(candidates) do
    local raw = LoadResourceFile(res, c[1])
    if raw and #raw > 0 then
      logoDataUri = ('data:%s;base64,%s'):format(c[2], base64(raw))
      print(('^2[CoreAC] Logo loaded (%s, %d KB) — embedded in the connection card.^7'):format(c[1], math.floor(#raw / 1024)))
      break
    end
  end
end)

--- Kartta kullanılacak logo URL'i: önce panelden verilen public URL, yoksa
--- resource içine gömülü logo (data URI). İkisi de yoksa nil (logosuz kart).
local function logoUrl()
  if Config.BrandLogoUrl and Config.BrandLogoUrl ~= '' then return Config.BrandLogoUrl end
  return logoDataUri
end

-- CoreAC markalı bağlanma kartı (logo + durum metni + opsiyonel Ban ID).
local function brandCard(status, tone, banId)
  local body = {}
  local logo = logoUrl()
  if logo then
    body[#body + 1] = { type = 'Image', url = logo, size = 'Large', horizontalAlignment = 'Center' }
  end
  body[#body + 1] = {
    type = 'TextBlock', text = (Config.BrandName or 'CoreAC') .. ' Anti-Cheat',
    weight = 'Bolder', size = 'ExtraLarge', horizontalAlignment = 'Center', wrap = true,
  }
  body[#body + 1] = {
    type = 'TextBlock', text = status or '', horizontalAlignment = 'Center', wrap = true,
    spacing = 'Medium', size = 'Medium',
    color = (tone == 'ban') and 'Attention' or 'Accent',
  }
  if banId and banId ~= '' then
    body[#body + 1] = {
      type = 'TextBlock', text = 'Ban ID: ' .. tostring(banId),
      horizontalAlignment = 'Center', weight = 'Bolder', size = 'Large',
      spacing = 'Small', color = 'Warning',
    }
  end
  return json.encode({
    ['$schema'] = 'http://adaptivecards.io/schemas/adaptive-card.json',
    type = 'AdaptiveCard', version = '1.5', body = body,
  })
end

AddEventHandler('playerConnecting', function(name, setKickReason, deferrals)
  local src = source
  deferrals.defer()
  Wait(0)
  -- Kısa görsel "kontrol ediliyor" adımı
  deferrals.presentCard(brandCard('Verifying your connection…', 'accent'))
  Wait(1200)

  local ids = getIdents(src)
  local ban = matchBan(ids)
  if ban then
    -- Logo + "yasaklandınız" + Ban ID (SEBEP YAZILMAZ — loglardan bakılır).
    -- done() çağrılmaz: oyuncu kartta kalır, giriş engellenir.
    deferrals.presentCard(brandCard('You are banned from this server.', 'ban', ban.code))
    CAC.log('WARN', 'connect', ('Blocked banned connection: %s (Ban ID: %s)'):format(name, ban.code or '-'))
    return
  end

  -- Ağ itibarı (global ban ağı): yerel ban yoksa panele sor. Kararı (LOG/KICK)
  -- panel, bu sunucunun kendi politikasından üretir; burada sadece uygularız.
  -- HATAYA-DAYANIKLI: panel yavaş/erişilemez ise engelleme YAPILMAZ (fail-open),
  -- panel sorunu yüzünden meşru oyuncunun girişi asla kapanmaz.
  do
    local netDone, netResp = false, nil
    CAC.request('/network/check', 'POST', {
      license = ids.license, steam = ids.steam, discord = ids.discord, playerName = name,
    }, function(okk, data)
      netResp = (okk and data) or nil
      netDone = true
    end)
    local waited = 0
    while not netDone and waited < 3000 do Wait(100); waited = waited + 100 end
    if netResp and netResp.flagged and netResp.action == 'KICK' then
      deferrals.presentCard(brandCard('You are blocked by the anti-cheat network.', 'ban'))
      CAC.log('WARN', 'connect', ('Network-blocked connection: %s (owners: %s)')
        :format(name, tostring(netResp.distinctOwners or '?')))
      return
    end
  end

  deferrals.done()
  CAC.log('INFO', 'connect', ('%s is connecting'):format(name))
  -- Oyuncu tam katıldıktan sonra listeyi hemen güncelle (panelde anında görünsün)
  CreateThread(function()
    Wait(4000)
    pcall(syncPlayers)
  end)
end)

AddEventHandler('playerDropped', function(reason)
  local src = source
  CAC.log('INFO', 'disconnect', ('%s left (%s)'):format(GetPlayerName(src) or src, reason or ''))
  -- Ayrılınca listeyi hemen güncelle (panelden düşsün)
  CreateThread(function()
    Wait(1500)
    pcall(syncPlayers)
  end)
end)

-- ---------------------------------------------------------------------------
-- Ceza kuyruğu — panelden gelen WARN / KICK / BAN / UNBAN
-- ---------------------------------------------------------------------------

local function applyAction(a)
  local src = findByLicense(a.identifiers and a.identifiers.license or nil)
  if a.type == 'WARN' then
    if src then
      TriggerClientEvent('chat:addMessage', src, {
        color = { 255, 200, 0 },
        args = { '[CoreAC]', ('Warning: %s'):format(a.reason or '') },
      })
    end
  elseif a.type == 'KICK' then
    if src then DropPlayer(src, '[CoreAC] You have been kicked from this server.') end
  elseif a.type == 'BAN' then
    if src then
      DropPlayer(src, ('[CoreAC] You are banned from this server. | Ban ID: %s'):format(a.banCode or '—'))
    end
    refreshBans()
  elseif a.type == 'UNBAN' then
    refreshBans()
  end
end

local function pollActions()
  CAC.request('/actions/pending', 'GET', nil, function(ok, data)
    if not ok or not data or not data.actions then return end
    local ids = {}
    for _, a in ipairs(data.actions) do
      local success = pcall(applyAction, a)
      if success then ids[#ids + 1] = a.id end
    end
    if #ids > 0 then
      CAC.request('/actions/ack', 'POST', { actionIds = ids }, nil)
    end
  end)
end

-- ---------------------------------------------------------------------------
-- Konsol komut kuyruğu — panelden gelen komutlar + kaynak start/stop/restart
-- ---------------------------------------------------------------------------

local function pollCommands()
  CAC.request('/commands/pending', 'GET', nil, function(ok, data)
    if not ok or not data or not data.commands then return end
    local ids = {}
    for _, c in ipairs(data.commands) do
      CAC.log('INFO', 'console', ('> %s'):format(c.command))
      -- "ac …" komutlarının çıktısı bu bayrakla panele de loglanır (commands.lua).
      CAC.commandFromPanel = true
      local success = pcall(ExecuteCommand, c.command)
      CAC.commandFromPanel = false
      if success then ids[#ids + 1] = c.id end
    end
    if #ids > 0 then
      CAC.request('/commands/ack', 'POST', { commandIds = ids }, nil)
    end
  end)
end

-- ---------------------------------------------------------------------------
-- Kaynak (resource) senkronizasyonu
-- ---------------------------------------------------------------------------

local function syncResources()
  local list = {}
  local num = GetNumResources()
  for i = 0, num - 1 do
    local rname = GetResourceByFindIndex(i)
    if rname then
      local state = GetResourceState(rname)
      list[#list + 1] = { name = rname, state = (state == 'started') and 'started' or 'stopped' }
    end
  end
  CAC.request('/resources/sync', 'POST', { resources = list }, nil)
end

-- ---------------------------------------------------------------------------
-- Log gönderimi
-- ---------------------------------------------------------------------------

local function flushLogs()
  if #LogBuffer == 0 then return end
  local batch = {}
  for i = 1, math.min(#LogBuffer, 50) do batch[i] = LogBuffer[i] end
  -- gönderilenleri çıkar
  for _ = 1, #batch do table.remove(LogBuffer, 1) end
  CAC.request('/logs', 'POST', { logs = batch }, nil)
end

-- ---------------------------------------------------------------------------
-- Ban anının kanıtı: gerçek ekran görüntüsü serisi. /detections'ın döndürdüğü
-- screenshotRequestIds'i, oyuncu DropPlayer ile atılmadan ÖNCE client'ın
-- mevcut 'coreac:screenshot' handler'ına (client/main.lua) sırayla tetikler —
-- screenshot-basic kurulu değilse client tarafı sessizce FAILED'a düşer.
-- ---------------------------------------------------------------------------
-- Not: DropPlayer'ı burst BİTENE kadar bekletiyoruz — aksi halde oyuncu
-- ilk kareyi bile alamadan bağlantısı kesilir. onDone, burst sonunda
-- (veya id yok/yüklenemiyorsa hemen) çağrılır.
local function fireScreenshotBurst(src, ids, onDone)
  -- Panel → Configuration → Settings → "Enable Gameplay Recording". Kapalıyken
  -- panel zaten istek açmaz; eski panel sürümüne karşı burada da uygulanır.
  if CoreAC.Config.Settings.EnableGameplayRecord == false then onDone() return end
  local base = (ids and #ids > 0) and CAC.screenshotUploadBase and CAC.screenshotUploadBase() or nil
  if not base then onDone() return end
  CreateThread(function()
    for _, rid in ipairs(ids) do
      if not GetPlayerName(src) then break end
      -- HATA DÜZELTİLDİ: yükleme adresine ?rid= eklenmiyordu. Upload ucu rid'siz
      -- isteği 400 ile reddettiği için otomatik ban anındaki kanıt görüntülerinin
      -- HİÇBİRİ kaydedilmiyordu (panelde "kanıt yok" görünüyordu).
      if CAC.issueShot then CAC.issueShot(rid, src) end
      TriggerClientEvent('coreac:screenshot', src, base .. '?rid=' .. rid, rid, nil)
      Wait(400)
    end
    onDone()
  end)
end

-- ---------------------------------------------------------------------------
-- Aynı oyuncu + aynı tespit tipi için 20 sn'de bir rapor. Örn. godmode'lu bir
-- oyuncu sürekli vuruluyorsa sunucu kontrolü her birkaç isabette tetiklenir ve
-- panele saniyede bir kayıt düşüyordu. Cezayı etkilemez: ilk rapor ceza
-- verdiyse oyuncu zaten atılmıştır; yalnızca log verdiyse tekrarlar da log olurdu.
-- ---------------------------------------------------------------------------
local reportGate = {}
local function reportAllowed(src, dtype)
  local key = tostring(src) .. ':' .. tostring(dtype)
  local now = GetGameTimer()
  if reportGate[key] and now - reportGate[key] < 20000 then return false end
  reportGate[key] = now
  return true
end
AddEventHandler('playerDropped', function()
  local prefix = tostring(source) .. ':'
  for k in pairs(reportGate) do
    if k:sub(1, #prefix) == prefix then reportGate[k] = nil end
  end
end)

-- ---------------------------------------------------------------------------
-- Client tespit köprüsü — client 'coreac:report' ile bildirir → API'ye yaz
-- ---------------------------------------------------------------------------

RegisterNetEvent('coreac:report', function(dtype, severity, details)
  local src = source
  if Config.DetectionsEnabled == false then return end  -- tespitler geçici kapalı
  if CAC.eventLimited(src, 'report', 30, 10000) then return end
  if not reportAllowed(src, CoreAC.NormalizeDetection(dtype)) then return end
  local ids = getIdents(src)
  local pname = GetPlayerName(src) or ('Player#' .. src)
  -- origin='client': rapor oyuncunun KENDİ oyun istemcisinden geldi. Hile
  -- istemcisi o süreci kontrol ettiği için bu raporlar panelde asla "kesin"
  -- sayılmaz — en fazla KICK'e kadar çıkabilir (bkz. detection-actions.ts).
  CAC.request('/detections', 'POST', {
    type = tostring(dtype or 'UNKNOWN'),
    severity = tostring(severity or 'MEDIUM'),
    playerName = pname,
    license = ids.license,
    origin = 'client',
    details = type(details) == 'table' and details or { info = tostring(details or '') },
  }, function(ok, data)
    if not (ok and data and GetPlayerName(src)) then return end
    -- Oyundaki yetkili yöneticilere anlık uyarı (server/live.lua).
    if CAC.notifyStaff then CAC.notifyStaff(src, dtype, data.action, data.label) end
    -- Aksiyon (LOG/KICK/BAN) panelden tespit tipi bazında seçilir; karar
    -- web API'sinde verilir (server.config.actions), burada uygulanır.
    if data.banned then
      fireScreenshotBurst(src, data.screenshotRequestIds, function()
        if GetPlayerName(src) then
          DropPlayer(src, ('[CoreAC] You are banned from this server. | Ban ID: %s'):format(data.banCode or '—'))
        end
      end)
      refreshBans()
    elseif data.kicked then
      DropPlayer(src, '[CoreAC] You have been kicked from this server.')
    end
  end)
end)

-- ---------------------------------------------------------------------------
-- CoreAC modülleri server-taraflı tespit köprüsü (bridge/server.lua'dan gelir)
-- ---------------------------------------------------------------------------
AddEventHandler('coreac:serverReport', function(src, dtype, severity, details)
  src = tonumber(src)
  if not src or src <= 0 then return end
  if Config.DetectionsEnabled == false then return end  -- tespitler geçici kapalı
  if not GetPlayerName(src) then return end
  if CAC.eventLimited(src, 'serverReport', 30, 10000) then return end
  if not reportAllowed(src, dtype) then return end
  local ids = getIdents(src)
  local pname = GetPlayerName(src) or ('Player#' .. src)
  -- origin='server': tespiti sunucu kendi gözlemiyle üretti (godmode_guard,
  -- silent aim açısı, blacklist, entityCreating…). Yalnızca bu raporlar ban
  -- seviyesine çıkabilir.
  -- İSTİSNA: sunucu modülü yalnızca client'ın verdiği bir kararı iletiyorsa
  -- (ör. spoofed bullets doğrulamasında "silah elimde değil" cevabı) details
  -- içinde __origin='client' işaretler; o rapor client kaynaklı sayılır.
  local det = type(details) == 'table' and details or { info = tostring(details or '') }
  local origin = 'server'
  if det.__origin == 'client' then origin = 'client' end
  det.__origin = nil
  CAC.request('/detections', 'POST', {
    type = tostring(dtype or 'UNKNOWN'),
    severity = tostring(severity or 'MEDIUM'),
    playerName = pname,
    license = ids.license,
    origin = origin,
    details = det,
  }, function(ok, data)
    if not (ok and data and GetPlayerName(src)) then return end
    -- Oyundaki yetkili yöneticilere anlık uyarı (server/live.lua).
    if CAC.notifyStaff then CAC.notifyStaff(src, dtype, data.action, data.label) end
    if data.banned then
      fireScreenshotBurst(src, data.screenshotRequestIds, function()
        if GetPlayerName(src) then
          DropPlayer(src, ('[CoreAC] You are banned from this server. | Ban ID: %s'):format(data.banCode or '—'))
        end
      end)
      refreshBans()
    elseif data.kicked then
      DropPlayer(src, '[CoreAC] You have been kicked from this server.')
    end
  end)
end)

-- ---------------------------------------------------------------------------
-- Döngüler
-- ---------------------------------------------------------------------------

CreateThread(function()
  if not Config.Token or Config.Token == '' then
    print('^1[CoreAC] WARNING: coreac_token is not set. Add your server token to server.cfg.^7')
    return
  end
  if CoreAC and CoreAC.drawLogo then CoreAC:drawLogo() end
  print('^2[CoreAC] Anti-cheat started. Connecting to the panel...^7')
  if Config.DetectionsEnabled == false then
    print('^3[CoreAC] NOTE: detections are currently OFF. Enable them with set coreac_detections "true".^7')
  end
  refreshBans()
  heartbeat()
  syncResources()

  local function loop(interval, fn)
    CreateThread(function()
      while true do
        Wait(interval * 1000)
        pcall(fn)
      end
    end)
  end

  loop(Config.HeartbeatInterval, heartbeat)
  loop(Config.PlayerSyncInterval, syncPlayers)
  loop(Config.ActionPollInterval, pollActions)
  loop(Config.ActionPollInterval, pollCommands)
  loop(Config.BanRefreshInterval, refreshBans)
  loop(Config.ResourceSyncInterval, syncResources)
  loop(Config.LogFlushInterval, flushLogs)
end)
