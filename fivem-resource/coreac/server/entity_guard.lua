-- =============================================================================
-- server/entity_guard.lua — trol koruması (sunucu otoriter)
--
--   1) FIRLATILAN ARAÇ ("araç yağmuru", oyunculara araç fırlatıp patlatma)
--   2) SES / MEGAFON TROLÜ (interact-sound ile herkese ya da dev yarıçapa ses)
--   3) SUNUCU TARAFI TUZAK OLAYLAR (executor'ların "exploit" butonları)
--   4) UZUN PENCERE ARAÇ SPAWN SINIRI (5 sn limitinin altında kalan sürekli spawn)
--
-- Tasarım ilkesi: ÖNCE KORU, SONRA KANITLA CEZALANDIR.
--   * Fırlatılan araç kimin olursa olsun hemen silinir (kurban korunur).
--   * Ceza yalnızca aracın sahibi ve oluşturanı aynı oyuncuysa ve kısa sürede
--     tekrarlıyorsa verilir — sahiplik kurbana geçmiş olabilir, o yüzden tek
--     olayla kimse cezalandırılmaz.
-- =============================================================================

CAC = CAC or {}

local function report(src, dtype, details)
  TriggerEvent('coreac:serverReport', src, dtype, 'HIGH', details or {})
end

-- ---------------------------------------------------------------------------
-- 1) FIRLATILAN ARAÇ
--
-- Sürücüsüz bir araç 70 m/s'nin (252 km/h) üstünde yatay/yukarı uçuyorsa
-- fırlatılmıştır: hiçbir fizik olayı (çarpışma, patlama, tren) sürücüsüz aracı
-- bu hızda iki ölçüm boyunca taşımaz. Hariç: son 6 sn'de sürücüsü olan araç
-- (yüksek hızda atlayan oyuncu), hava araçları, tren/römork, bir şeye bağlı
-- araç (çekici, cargobob) ve aşağı düşen araç (uçurumdan düşme).
-- ---------------------------------------------------------------------------
local LAUNCH_SPEED   = 70.0    -- m/s, iki ardışık ölçüm
local HARD_SPEED     = 150.0   -- m/s, tek ölçüm yeter
local DRIVER_GRACE   = 6000    -- ms
local LAUNCH_WINDOW  = 30000   -- ms — bu sürede 2. fırlatma = ceza
local SKIP_TYPES = { heli = true, plane = true, blimp = true, train = true, trailer = true }

local vehHits, lastDriven, launches = {}, {}, {}

local function horizontal(v) return math.sqrt(v.x * v.x + v.y * v.y) end

local function handleLaunched(veh, speed)
  local owner = NetworkGetEntityOwner(veh)
  local okF, first = pcall(NetworkGetFirstEntityOwner, veh)
  local model = GetEntityModel(veh)
  DeleteEntity(veh)
  vehHits[veh], lastDriven[veh] = nil, nil
  CAC.log('WARN', 'entity', ('Deleted a launched vehicle (%d km/h, owner %s)')
    :format(math.floor(speed * 3.6), tostring(owner and GetPlayerName(owner) or owner)))

  owner = tonumber(owner)
  if not owner or owner <= 0 or not GetPlayerName(owner) then return end
  if not okF or tonumber(first) ~= owner then return end   -- aracı bu oyuncu oluşturmamış
  local now = GetGameTimer()
  local rec = launches[owner]
  if not rec or now - rec.t > LAUNCH_WINDOW then rec = { n = 0, t = now } end
  rec.n = rec.n + 1
  launches[owner] = rec
  if rec.n >= 2 then
    launches[owner] = nil
    report(owner, 'THROW_VEHICLE', {
      source = 'server_launch', vehicles = rec.n, kmh = math.floor(speed * 3.6),
      model = CoreAC.GetVehicleName and CoreAC.GetVehicleName(model) or model,
    })
  end
end

CreateThread(function()
  while true do
    Wait(500)
    if CoreAC.Config.Entities.AntiThrowVehicles then
      local now = GetGameTimer()
      local alive = {}
      for _, veh in ipairs(GetAllVehicles()) do
        alive[veh] = true
        local driver = GetPedInVehicleSeat(veh, -1)
        if driver and driver ~= 0 then
          lastDriven[veh] = now
          vehHits[veh] = nil
        else
          local v = GetEntityVelocity(veh)
          local speed = #v
          local descending = v.z < 0 and -v.z >= horizontal(v)
          if speed > LAUNCH_SPEED and not descending and now - (lastDriven[veh] or 0) > DRIVER_GRACE then
            local okT, vtype = pcall(GetVehicleType, veh)
            local okA, att = pcall(GetEntityAttachedTo, veh)
            if not (okT and SKIP_TYPES[vtype]) and not (okA and att and att ~= 0) then
              vehHits[veh] = (vehHits[veh] or 0) + 1
              if vehHits[veh] >= 2 or speed > HARD_SPEED then handleLaunched(veh, speed) end
            end
          else
            vehHits[veh] = nil
          end
        end
      end
      for veh in pairs(lastDriven) do if not alive[veh] then lastDriven[veh] = nil end end
      for veh in pairs(vehHits) do if not alive[veh] then vehHits[veh] = nil end end
    end
  end
end)

-- ---------------------------------------------------------------------------
-- 4) UZUN PENCERE ARAÇ SPAWN SINIRI
-- CoreAC modülünün 5 sn'lik limiti (varsayılan 20) sürekli, düşük tempolu
-- "araç yağmuru"nu kaçırıyordu (5 sn'de 15 araç = dakikada 180). Oyuncunun
-- KENDİ oluşturduğu script araçları (popülasyon tipi 7) dakikada 40'ı geçerse
-- fazlası engellenir ve raporlanır. Garaj/iş scriptleri bunun çok altındadır.
-- ---------------------------------------------------------------------------
local VEH_PER_MINUTE = 40
local vehSpawns = {}  -- src -> { zaman damgaları }

AddEventHandler('entityCreating', function(handle)
  if not CoreAC.Config.Entities.EnableVehiclesLimiter then return end
  if GetEntityType(handle) ~= 2 or GetEntityPopulationType(handle) ~= 7 then return end
  local src = tonumber(NetworkGetEntityOwner(handle))
  if not src or src <= 0 then return end
  local now = GetGameTimer()
  local fresh = {}
  for _, t in ipairs(vehSpawns[src] or {}) do if now - t < 60000 then fresh[#fresh + 1] = t end end
  fresh[#fresh + 1] = now
  vehSpawns[src] = fresh
  if #fresh > VEH_PER_MINUTE then
    CancelEvent()
    if #fresh == VEH_PER_MINUTE + 1 then
      report(src, 'VEHICLE_LIMIT', { source = 'server_minute', perMinute = #fresh })
    end
  end
end)

-- ---------------------------------------------------------------------------
-- 2) SES / MEGAFON TROLÜ — interact-sound
--
-- interact-sound'un sunucu olayları client'ın verdiği parametreye güvenir:
-- hileci "PlayOnAll" ile tüm sunucuya, "PlayWithinDistance" ile kilometrelerce
-- yarıçapa ya da 1.0 üstü ses seviyesiyle (earrape) ses çaldırır. Aynı olayları
-- dinleyip parametreleri denetliyoruz. (Olayı iptal edemeyiz — interact-sound
-- kendi handler'ını yine çalıştırır — bu yüzden koruma: kötüye kullananı hızla
-- tespit edip panelin aksiyonunu uygulamak.)
--
-- Meşru kullanım: kilit/kelepçe/kapı sesleri 1–15 m, ses 0.1–1.0. Tek seferlik
-- "herkese" çalma (ör. alarm) cezalandırılmaz; 60 sn'de ikincisi raporlanır.
-- ---------------------------------------------------------------------------
local SOUND_MAX_DISTANCE = 100.0
local SOUND_HARD_DISTANCE = 500.0
local SOUND_MAX_VOLUME = 1.0
local soundStrikes, soundRate, soundReported = {}, {}, {}

local function soundAbuse(src, why, details)
  local now = GetGameTimer()
  if soundReported[src] and now - soundReported[src] < 30000 then return end
  soundReported[src] = now
  details.reason = why
  report(src, 'SOUND_EXPLOIT', details)
end

local function soundStrike(src, why, details)
  local now = GetGameTimer()
  local fresh = {}
  for _, t in ipairs(soundStrikes[src] or {}) do if now - t < 60000 then fresh[#fresh + 1] = t end end
  fresh[#fresh + 1] = now
  soundStrikes[src] = fresh
  if #fresh >= 2 then soundAbuse(src, why, details) end
end

local function soundEvent(kind, src, a, b, c)
  src = tonumber(src)
  if not src or src <= 0 then return end
  local now = GetGameTimer()

  -- Spam: 10 sn'de 15'ten fazla ses olayı
  local r = soundRate[src]
  if not r or now > r.reset then r = { n = 0, reset = now + 10000 }; soundRate[src] = r end
  r.n = r.n + 1
  if r.n > 15 then soundAbuse(src, 'spam', { event = kind, count = r.n }) return end

  local distance, volume, sound
  if kind == 'PlayWithinDistance' then distance, sound, volume = tonumber(a), b, tonumber(c)
  elseif kind == 'PlayOnOne' then sound, volume = b, tonumber(c)
  else sound, volume = a, tonumber(b) end

  if volume and volume > SOUND_MAX_VOLUME + 0.01 then
    soundAbuse(src, 'volume', { event = kind, volume = volume, sound = tostring(sound) })
  elseif distance and distance > SOUND_HARD_DISTANCE then
    soundAbuse(src, 'radius', { event = kind, distance = math.floor(distance), sound = tostring(sound) })
  elseif distance and distance > SOUND_MAX_DISTANCE then
    soundStrike(src, 'radius', { event = kind, distance = math.floor(distance), sound = tostring(sound) })
  elseif kind == 'PlayOnAll' then
    soundStrike(src, 'everyone', { event = kind, sound = tostring(sound) })
  end
end

for _, kind in ipairs({ 'PlayOnAll', 'PlayWithinDistance', 'PlayOnOne', 'PlayOnSource' }) do
  RegisterNetEvent('InteractSound_SV:' .. kind, function(a, b, c)
    if CoreAC.Config.Main.AntiVoiceExploits then soundEvent(kind, source, a, b, c) end
  end)
end

-- ---------------------------------------------------------------------------
-- 3) SUNUCU TARAFI TUZAK OLAYLAR (honeypot)
--
-- Executor menülerinin "para / iş / hapis exploit" butonları, başka
-- framework'lerin (ESX, vRP…) iş scriptlerinin sunucu olaylarını körlemesine
-- tetikler. Bu olayları dinleyen hiçbir resource'un OLMADIĞI bir sunucuda bir
-- client'ın onları göndermesi yalnızca hile menüsüyle mümkündür.
--
-- YANLIŞ-POZİTİF KORUMASI: olay adı "resource:..." biçimindeyse ve o adla bir
-- resource sunucuda VARSA (durdurulmuş olsa bile) olay tuzak sayılmaz — o
-- resource'un gerçek olayı olabilir. Panelin "Protected Events" listesi de
-- (müşterinin eklediği adlar) aynı kuralla sunucu tarafında dinlenir.
-- Aksiyon: CHEAT_EVENT_HONEYPOT (varsayılan KICK; panelden BAN yapılabilir).
-- ---------------------------------------------------------------------------
local BUILTIN_BAIT = {
  -- bilinen hile menüsü / anti-cheat atlatma adları
  'HCheat:TempDisableDetection', 'adminmenu:allowall', 'antilynx8:crashuser',
  'antilynxr4:crashuser', 'antilynxr4:crashuser1', 'antilynx8r4a:crashuser',
  -- ESX iş/para exploitleri (ESX yoksa hiçbir resource dinlemez)
  'esx_truckerjob:pay', 'esx_godirtyjob:pay', 'esx_pizza:pay', 'esx_garbagejob:pay',
  'esx_ranger:pay', 'esx_gopostaljob:pay', 'esx_banksecurity:pay', 'esx_carthief:pay',
  'esx_fueldelivery:pay', 'esx_slotmachine:sv:2', 'esx_jobs:caution', 'esx_dmvschool:pay',
  'esx_billing:sendBill', 'esx_jailer:sendToJail', 'esx-qalle-jail:jailPlayer',
  'esx_policejob:handcuff', 'esx_mechanicjob:startHarvest', 'esx_drugs:startHarvestWeed',
  -- vRP exploitleri
  'vrp_slotmachine:server:2', 'vRP:setMoney', 'vrp_basic_menu:givemoney',
}

local function resourceExists(name)
  return name ~= nil and name ~= '' and GetResourceState(name) ~= 'missing'
end

--- Olay, sunucudaki bir resource'a ait görünüyor mu? ("resource:olay" adlandırması)
local function ownedByInstalledResource(ev)
  local prefix = ev:match('^([^:]+):')
  if not prefix then return false end
  if resourceExists(prefix) then return true end
  -- ESX'in olay önekleri resource adıyla aynı değildir (esx:..., esx_x:...)
  if prefix == 'esx' or prefix:sub(1, 4) == 'esx_' then
    return resourceExists('es_extended') or resourceExists(prefix)
  end
  if prefix:lower():sub(1, 3) == 'vrp' then return resourceExists('vrp') end
  return false
end

local BLOCKED_PREFIX = { 'coreac:', 'aeigs:', '__cfx', 'txsv:', 'txcl:', 'txAdmin:', 'onResource', 'player' }
local function safeToBait(ev)
  if type(ev) ~= 'string' or #ev < 3 or #ev > 100 then return false end
  for _, p in ipairs(BLOCKED_PREFIX) do
    if ev:sub(1, #p) == p then return false end
  end
  return true
end

local baitActive, baitRegistered = {}, {}

local function onBait(ev, custom)
  local src = tonumber(source)
  if not src or src <= 0 or not baitActive[ev] then return end
  -- Tetiklendiği anda da kontrol: sonradan kurulan bir resource bu olayı sahiplenmiş olabilir.
  if ownedByInstalledResource(ev) then return end
  if CAC.eventLimited(src, 'bait', 5, 10000) then return end
  report(src, 'CHEAT_EVENT_HONEYPOT', { event = ev, side = 'server', custom = custom or nil })
end

local function armBait(ev, custom)
  if not safeToBait(ev) or ownedByInstalledResource(ev) then return false end
  baitActive[ev] = true
  if not baitRegistered[ev] then
    baitRegistered[ev] = true
    RegisterNetEvent(ev, function() onBait(ev, custom) end)
  end
  return true
end

--- Panel "Protected Events" listesi (heartbeat) — server/main.lua çağırır.
local customBait = {}
function CAC.setProtectedServerEvents(list)
  for ev in pairs(customBait) do baitActive[ev] = nil end
  customBait = {}
  if type(list) ~= 'table' then return end
  for _, ev in ipairs(list) do
    if armBait(ev, true) then customBait[ev] = true end
  end
  -- Yerleşik liste panel listesiyle çakışmışsa yeniden aç
  for _, ev in ipairs(BUILTIN_BAIT) do armBait(ev, false) end
end

CreateThread(function()
  Wait(5000)  -- diğer resource'lar başlasın (sahiplik kontrolü için)
  local armed = 0
  for _, ev in ipairs(BUILTIN_BAIT) do if armBait(ev, false) then armed = armed + 1 end end
  print(('^2[CoreAC] Entity/sound guard yuklendi (%d tuzak olay aktif).^7'):format(armed))
end)

AddEventHandler('playerDropped', function()
  local s = source
  launches[s], vehSpawns[s], soundStrikes[s], soundRate[s], soundReported[s] = nil, nil, nil, nil, nil
end)
