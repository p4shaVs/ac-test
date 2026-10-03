-- =============================================================================
-- client/secure_channel.lua — anti-cheat'in sunucuyla KENDİ güvenli hattı.
--
-- NEDEN: Eskiden AC sunucuya sabit adlı olaylarla konuşuyordu ('coreac:alive',
-- 'coreac:challengeReply', 'coreac:report'). Client dosyasını okuyan (dump eden)
-- hileci bu adları ve challenge formülünü görüp AC'yi kapatıyor, yerine kendi
-- kodundan "yaşıyorum" diyordu. Bir "event blocker" ise AC çalışırken yalnızca
-- tespit raporlarını düşürebiliyordu — sunucu bunu hiç fark etmiyordu.
--
-- ŞİMDİ:
--   * Olay adları her sunucu açılışında RASTGELE (GlobalState.coreac_ch). Dump
--     edilmiş eski adlar işe yaramaz; eski adları kullanan sunucuda tuzaktır.
--   * Sunucu her oyuncuya o oturum için rastgele bir ANAHTAR verir. Her mesaj
--     artan bir sıra numarası (seq) ve anahtarla imzalanır. Sunucu:
--       - imzası tutmayan mesajı (taklit),
--       - atlanan sıra numarasını (yolda düşürülen = engellenen rapor),
--       - AC'nin istemcide ikinci kez başlatılmasını,
--       - hiç başlamayan AC'yi (oyun oynuyor ama el sıkışma yok)
--     AC_TAMPER olarak işaretler (server/secure_channel.lua).
--   * Sunucudan gelmesi gereken kontrol olaylarını (kurallar, config, ışınlama/
--     dirilme izni, admin araçları…) hileci istemcide TriggerEvent ile kendisi
--     tetikleyip tespitleri kapatabiliyordu. Artık yalnızca AĞDAN gelen kabul
--     edilir; yerel tetikleme reddedilir ve raporlanır.
--   * Sunucunun gönderdiği tespit ayarları mühürlenir; bellekte değiştirilirse
--     (enjekte kodla "AntiNoClip = false") raporlanır.
--   * İstemcide çalışan resource listesi ve kayıtlı komutlar sunucuya gider;
--     sunucuda OLMAYAN bir resource (executor'un sahte resource'u) sunucuda
--     doğrulanarak işaretlenir.
--   * Event Shield (opsiyonel, `ac shield install`): korunan resource'ların
--     gönderdiği sunucu olaylarını sayar; sunucu, aldığı olaylarla karşılaştırıp
--     resource'un kendi kodu dışından (executor'dan) tetiklenenleri yakalar.
--
-- Bu dosya diğer AC modüllerinden ÖNCE yüklenir: kullandığı çekirdek fonksiyonlar
-- bir executor onları değiştiremeden yakalanır.
-- =============================================================================

CAC = CAC or {}
CoreAC = CoreAC or {}

-- ---------------------------------------------------------------- orijinaller
local _TSE, _RNE, _AEH, _TE = TriggerServerEvent, RegisterNetEvent, AddEventHandler, TriggerEvent
local Wait, CreateThread = Wait, CreateThread
local GetGameTimer = GetGameTimer
local pairs, ipairs, type, tostring, tonumber = pairs, ipairs, type, tostring, tonumber
local channelSig, channelAnswer = CoreAC.ChannelSig, CoreAC.ChannelAnswer

local SHIELD_FILE = '__shield.lua'   -- korunan resource'lardaki include (server/event_shield.lua)
local MAX_QUEUE = 64

-- ---------------------------------------------------------------- durum
local names            -- { hello, msg, key, chal, pull, put } — sunucunun bu açılıştaki adları
local key              -- { a, b } — bu oturumun anahtarı (yalnızca bu dosyada)
local seq = 0
local queue = {}
local helloNonce
local netKind          -- sunucudan gelen olayların 'source' biçimi (anahtar olayından öğrenilir)
local ticks, actorTicks = 0, 0

-- ---------------------------------------------------------------- olay kaynağı
-- FiveM zamanlayıcısı ağdan gelen olaylarda 'source'u sayıya (65535) çevirir;
-- istemcide TriggerEvent ile yerel tetiklenen olayda 'source' bir metindir ('').
-- Biçim, anahtar olayından (yalnızca sunucu gönderebilir, içinde bizim rastgele
-- sayımızı geri getirir) bir kez öğrenilir; öğrenilene kadar karar verilmez —
-- yanlış bir varsayım tüm oyunculara AC_TAMPER yazdırmasın.
local function kindOf(s)
  if type(s) == 'number' then return 'number' end
  if type(s) == 'string' and s:sub(1, 4) == 'net:' then return 'netstr' end
  return 'local'
end

--- Şu an işlenen olay sunucudan mı geldi? (handler'ın EN BAŞINDA çağrılmalı)
function CAC.fromServer()
  local k = kindOf(source)
  if netKind then return k == netKind end
  return true
end

-- ---------------------------------------------------------------- gönderim
-- Sıra numarası yalnızca gönderim BAŞARILI olursa ilerler: serileştirilemeyen ya da
-- çok büyük bir yük TriggerServerEvent'te hata verirse numara harcanmaz (sunucu bunu
-- "yolda düşürülen mesaj" sanmasın).
local function rawSend(kind, payload)
  local n = seq + 1
  local ok = pcall(_TSE, names.msg, n, kind, channelSig(key, n, kind), payload)
  if ok then seq = n end
  return ok
end

--- Güvenli kanaldan gönder. Anahtar gelene kadar sıraya alınır (sıra numarası
--- gönderim anında verilir, bekleyen mesaj boşluk yaratmaz).
local function send(kind, payload)
  if key and names then
    rawSend(kind, payload)
  else
    if #queue >= MAX_QUEUE then table.remove(queue, 1) end
    queue[#queue + 1] = { kind, payload }
  end
end
CAC.secureSend = send

local function flush()
  local q = queue
  queue = {}
  for _, m in ipairs(q) do rawSend(m[1], m[2]) end
end

-- AC'ye müdahale bulguları (integrity.lua, sahte olaylar, mühür) — sebep başına bir kez.
local tamperSent = {}
function CAC.tamper(details)
  details = type(details) == 'table' and details or { reason = tostring(details) }
  local k = tostring(details.reason) .. '|' .. tostring(details.event or details.hooked or details.key or '')
  if tamperSent[k] then return end
  tamperSent[k] = true
  send('report', { t = 'AC_TAMPER', s = 'HIGH', d = details })
end

-- ---------------------------------------------------------------- kalp atışı sayaçları
-- client/core.lua (200 ms) ve bridge/client.lua (250 ms) döngüleri her turda çağırır.
-- Sunucu, challenge cevaplarıyla gelen sayacın ilerlediğini görür: AC thread'leri
-- dondurulup (Wait kancası) yalnızca olay cevaplayıcısı bırakılırsa sayaç durur.
function CAC.beat() ticks = ticks + 1 end
function CAC.actorBeat() actorTicks = actorTicks + 1 end

-- ---------------------------------------------------------------- sahte kontrol olayları
-- 'coreac:' / '__CoreAC:' ile başlayan ve AĞ olayı olarak kaydedilen her ad yalnızca
-- sunucudan kabul edilir. Bu dosyadan SONRA yüklenen tüm AC modülleri bu sarmalayıcıyı
-- kullanır (yalnızca bu resource'un Lua ortamını etkiler). Tuzak (honeypot) olayları
-- bu öneklerle başlamaz — onların yerel tetiklenmesi zaten yakalanmak içindir.
local GUARDED = {}
local function needsGuard(name)
  return type(name) == 'string' and (name:sub(1, 7) == 'coreac:' or name:sub(1, 9) == '__CoreAC:')
end

local function guard(name, fn)
  return function(...)
    if not CAC.fromServer() then
      CAC.tamper({ reason = 'anti-cheat control event triggered locally (spoofed)', event = name })
      return
    end
    return fn(...)
  end
end

RegisterNetEvent = function(name, fn)
  if needsGuard(name) then
    GUARDED[name] = true
    if type(fn) == 'function' then return _RNE(name, guard(name, fn)) end
  end
  return _RNE(name, fn)
end

AddEventHandler = function(name, fn)
  if GUARDED[name] and type(fn) == 'function' then return _AEH(name, guard(name, fn)) end
  return _AEH(name, fn)
end

--- Başka resource'ların olayları (txAdmin, QBCore admin ışınlaması…) için: yerelde
--- tetiklenirse sessizce yok sayılır (o resource'un kendi kullanımı olabilir).
function CAC.onServerEvent(name, fn)
  return _RNE(name, function(...)
    if not CAC.fromServer() then return end
    return fn(...)
  end)
end

-- ---------------------------------------------------------------- config mührü
-- Sunucudan gelen tespit anahtarları (CoreAC.Config.Main) uygulandıktan sonra
-- mühürlenir. Bunları yalnızca sunucu olayı değiştirir; bellekte başka bir yolla
-- değişmeleri AC'nin içine enjekte edilmiş koddur.
local sealed
local function snapshot(t)
  local o = {}
  for k, v in pairs(t or {}) do
    local tv = type(v)
    if tv == 'boolean' or tv == 'number' or tv == 'string' then o[k] = v end
  end
  return o
end

function CAC.sealConfig()
  if CoreAC.Config and CoreAC.Config.Main then sealed = snapshot(CoreAC.Config.Main) end
end

--- Tek tur mühür kontrolü (testler de çağırır). Döner: değişen anahtar ya da nil.
function CAC.checkSeal()
  if not sealed or not (CoreAC.Config and CoreAC.Config.Main) then return nil end
  for k, v in pairs(sealed) do
    if CoreAC.Config.Main[k] ~= v then
      CAC.tamper({ reason = 'anti-cheat settings changed in memory (injected code)', key = k })
      return k
    end
  end
  return nil
end

-- ---------------------------------------------------------------- resource / komut listesi
local function startedResources()
  local out = {}
  local n = GetNumResources and GetNumResources() or 0
  if type(n) ~= 'number' then return out end
  for i = 0, n - 1 do
    local r = GetResourceByFindIndex(i)
    if type(r) == 'string' and r ~= '' and #r <= 64 and GetResourceState(r) == 'started' then out[#out + 1] = r end
    if #out >= 600 then break end
  end
  table.sort(out)
  return out
end

local function sameList(a, b)
  if not a or #a ~= #b then return false end
  for i = 1, #a do if a[i] ~= b[i] then return false end end
  return true
end

local sentCommands = {}
local function newCommands()
  local ok, list = pcall(GetRegisteredCommands)
  if not ok or type(list) ~= 'table' then return nil end
  local out = {}
  for _, c in ipairs(list) do
    if type(c) == 'table' and type(c.name) == 'string' and type(c.resource) == 'string' and c.resource ~= '' then
      local k = c.resource .. '/' .. c.name
      if not sentCommands[k] then
        sentCommands[k] = true
        out[#out + 1] = { n = c.name:sub(1, 64), r = c.resource:sub(1, 64) }
        if #out >= 200 then break end
      end
    end
  end
  return out
end

-- ---------------------------------------------------------------- Event Shield toplayıcı
-- Korunan resource'ların include'u (__shield.lua) kendi gönderdiği sunucu olaylarını
-- sayar. Burada her saniye aynı tick içinde (1) sayımları çeker, (2) güvenli kanaldan
-- yollarız: sayılan her olay sunucuya bu mesajdan ÖNCE ulaşmıştır, arada sayılmamış
-- bir olay gönderilemez. Sunucu aldığından sayılmayanı = resource'un kendi kodu
-- dışından tetiklenen olayı bulur.
local shielded = {}        -- [resource] = true|false (manifest'inde include var mı)
local shieldAlive = {}     -- include'u "merhaba" demiş resource'lar
local aggN, aggL = {}, {}
local shieldDirty, shieldChanged = false, false

local function isShielded(res)
  if type(res) ~= 'string' or res == '' then return false end
  local v = shielded[res]
  if v ~= nil then return v end
  v = false
  local n = GetNumResourceMetadata and GetNumResourceMetadata(res, 'shared_script') or 0
  if type(n) == 'number' then
    for i = 0, n - 1 do
      if GetResourceMetadata(res, 'shared_script', i) == SHIELD_FILE then v = true break end
    end
  end
  shielded[res] = v
  return v
end

-- Bir resource yeniden başlarsa manifest'i değişmiş olabilir (include eklendi/kaldırıldı).
_AEH('onClientResourceStart', function(res) shielded[res] = nil end)
_AEH('onClientResourceStop', function(res)
  shielded[res] = nil
  if shieldAlive[res] then shieldAlive[res] = nil; shieldChanged = true end
end)

local function onPut(c, l)
  local res = GetInvokingResource()
  if not isShielded(res) then
    -- Yalnızca korunan resource'lar sayım bildirebilir (izole executor kendi
    -- olaylarını "meşru" saydıramaz).
    if res ~= nil and res ~= GetCurrentResourceName() then
      CAC.tamper({ reason = 'fake Event Shield counts sent from outside a protected resource', event = tostring(res) })
    end
    return
  end
  if not shieldAlive[res] then shieldAlive[res] = true; shieldChanged = true end
  for ev, n in pairs(type(c) == 'table' and c or {}) do
    if type(ev) == 'string' and type(n) == 'number' and n > 0 then aggN[ev] = (aggN[ev] or 0) + n; shieldDirty = true end
  end
  for ev, n in pairs(type(l) == 'table' and l or {}) do
    if type(ev) == 'string' and type(n) == 'number' and n > 0 then aggL[ev] = (aggL[ev] or 0) + n; shieldDirty = true end
  end
end

--- Bir tur: çek + gönder (testler de çağırır).
local lastShieldSend = 0
function CAC.shieldFlush(force)
  if not (names and names.pull and key) then return false end
  _TE(names.pull)                       -- include'lar burada, senkron olarak onPut'u çağırır
  local now = GetGameTimer()
  local due = shieldDirty or shieldChanged or (next(shieldAlive) ~= nil and now - lastShieldSend >= 10000)
  if not (due or force) then return false end
  local alive = {}
  for r in pairs(shieldAlive) do alive[#alive + 1] = r end
  table.sort(alive)
  send('tse', { c = aggN, l = aggL, r = alive })
  aggN, aggL, shieldDirty, shieldChanged = {}, {}, false, false
  lastShieldSend = now
  return true
end

-- ---------------------------------------------------------------- el sıkışma
local function onKey(a, b, echo)
  local k = kindOf(source)
  if k == 'local' then
    CAC.tamper({ reason = 'anti-cheat session key forged locally', event = 'key' })
    return
  end
  if key then return end                         -- yeniden gönderim (aynı anahtar)
  if tonumber(echo) ~= helloNonce then return end
  a, b = math.tointeger(tonumber(a)), math.tointeger(tonumber(b))
  if not a or not b then return end
  netKind = k
  key = { a, b }
  flush()
end

local function onChallenge(nonce)
  if kindOf(source) ~= netKind or not key then return end
  send('reply', { n = nonce, a = channelAnswer(key, nonce), t = ticks, at = actorTicks })
end

--- Testler için: kanal kuruldu mu?
function CAC.channelReady() return key ~= nil end

CreateThread(function()
  -- Adlar sunucunun GlobalState'inde; oturum açılınca gelir.
  while true do
    local ch = GlobalState and GlobalState.coreac_ch
    if type(ch) == 'table' and type(ch.hello) == 'string' and type(ch.msg) == 'string' then
      names = ch
      break
    end
    Wait(500)
  end
  _RNE(names.key, onKey)
  _RNE(names.chal, onChallenge)
  if type(names.put) == 'string' then _AEH(names.put, onPut) end

  while not NetworkIsSessionStarted() do Wait(250) end
  helloNonce = math.random(1, 2147483000)
  -- Anahtar gelene kadar 15 sn'de bir tekrar (sunucu, henüz mesaj almadığı bir
  -- oturum için tekrarı yeniden başlatma saymaz).
  while not key do
    _TSE(names.hello, 1, helloNonce)
    local deadline = GetGameTimer() + 15000
    while not key and GetGameTimer() < deadline do Wait(250) end
  end
end)

-- ---------------------------------------------------------------- periyodik işler
-- Canlılık (10 sn) — sayaçlarla birlikte.
CreateThread(function()
  while true do
    Wait(10000)
    if key then send('alive', { t = ticks, at = actorTicks }) end
  end
end)

-- Config mührü (15 sn).
CreateThread(function()
  while true do
    Wait(15000)
    CAC.checkSeal()
  end
end)

-- Resource listesi (60 sn; değişince ya da 5 dk'da bir) ve kayıtlı komutlar (30 sn).
CreateThread(function()
  local lastList, lastListAt = nil, 0
  local n = 0
  while true do
    Wait(30000)
    if key then
      n = n + 1
      local cmds = newCommands()
      if cmds and #cmds > 0 then send('cmds', cmds) end
      if n % 2 == 0 then
        local list = startedResources()
        local now = GetGameTimer()
        if #list > 0 and (not sameList(lastList, list) or now - lastListAt > 300000) then
          send('res', list)
          lastList, lastListAt = list, now
        end
      end
    end
  end
end)

-- Event Shield (1 sn).
CreateThread(function()
  while true do
    Wait(1000)
    CAC.shieldFlush(false)
  end
end)
