-- =============================================================================
-- server/crash_guard.lua — ANTI-CRASH: hilecinin BAŞKA oyuncuları çökertmesini engeller.
--
-- Lua menüleri oyuncu çökertmek için birkaç bilinen yol kullanır. Hepsi sunucudan
-- geçen ağ olayları olduğu için sunucu bunları kurbana ULAŞMADAN iptal edebilir:
--
--   1) ÇÖKERTEN MODELLER (anti_crash_models) — yüklenince istemciyi çökerten LOD
--      iskelet ped'leri (slod_*) ve bilinen çökertme objeleri. entityCreating'de
--      oluşum iptal edilir. slod_* hiçbir meşru script'in kullanmadığı modellerdir:
--      ilk denemede raporlanır; objelerde 10 sn'de 2 deneme gerekir.
--
--   2) OYUNCUYA YAPIŞTIRMA (anti_crash_attach) — başka bir oyuncunun ped'ine araç
--      veya ped yapıştırmak (araç kafaya, ped yığını) ya da 3+ obje yapıştırmak.
--      Sunucu 2 sn'de bir tarar, yapıştırılanı siler. Oyuncunun KENDİ yarattığı
--      eşya (telefon, kutu, kendi bisikleti) ve oyuncu ped'leri (taşıma/sürükleme
--      script'leri) asla dokunulmaz.
--
--   3) SEL KALKANI (anti_crash_flood) — tek oyuncudan 2 sn'de 60+ script entity'si,
--      2 sn'de 25+ parçacık efekti, 3 sn'de 25+ mermi/roket: fazlası iptal edilir.
--      Ölçek 50'nin üstündeki parçacık (hiçbir meşru efekt bu boyutta değildir)
--      her zaman iptal edilir.
--
--   4) ÇÖKERTME OLAYLARI (anti_crash_events) — başka oyuncuların ped'ine 10 sn'de
--      6'dan fazla script görevi (görev seli = kilitleme/çökertme), telefon
--      patlatma isteği ve oy ile atma (kick vote). Son ikisini FiveM'de hiçbir
--      meşru script kullanmaz.
--
-- Koruma (iptal / silme) her durumda yapılır; ceza kararı panelin Punishments
-- ayarına bağlıdır (CRASH_ATTEMPT: kesin, ENTITY_FLOOD: güçlü sinyal).
-- Safe Scripts listesindeki resource'ların yarattığı entity'ler hiç sayılmaz.
-- =============================================================================

local function ruleOn(key) return CAC.getRules()[key] == true end
local function now() return GetGameTimer() end

local function report(src, dtype, severity, details)
  if not src or src <= 0 or not GetPlayerName(src) then return end
  TriggerEvent('coreac:serverReport', src, dtype, severity, details)
end

--- Bu entity'yi güvenilen bir resource mu yarattı? (Safe Guard → Safe Scripts)
local function fromSafeScript(entity)
  local creator = GetEntityScript and GetEntityScript(entity)
  return creator and creator ~= '' and CAC.isSafeScript and CAC.isSafeScript(creator) or false
end

--- Kayan pencere sayacı: penceredeki olay sayısını döndürür.
local function bump(store, key, windowMs)
  local t = now()
  local list = {}
  for _, at in ipairs(store[key] or {}) do
    if t - at < windowMs then list[#list + 1] = at end
  end
  list[#list + 1] = t
  store[key] = list
  return #list
end

-- ---------------------------------------------------------------------------
-- 1) ÇÖKERTEN MODELLER
-- ---------------------------------------------------------------------------
local CRASH_PEDS, CRASH_OBJECTS = {}, {}
for _, name in ipairs({ 'slod_human', 'slod_large_quadped', 'slod_small_quadped' }) do
  CRASH_PEDS[signedToUnsigned(GetHashKey(name))] = name
end
-- Yalnızca çökertmede kullanılan objeler. Dev "trol" objeleri (dönme dolap, yel
-- değirmeni…) burada DEĞİL: bazı harita script'leri onları meşru olarak yaratır;
-- onlar Models sayfasındaki "Troll & giant props" paketiyle isteğe bağlı engellenir.
for _, name in ipairs({ 'prop_fnclink_05crnr1', 'xs_prop_hamburgher_wl', 'xs_prop_plastic_bottle_wl' }) do
  CRASH_OBJECTS[signedToUnsigned(GetHashKey(name))] = name
end
CoreAC.CrashModels = { peds = CRASH_PEDS, objects = CRASH_OBJECTS }

local modelTries = {}   -- [src] = { zamanlar }

-- ---------------------------------------------------------------------------
-- 3) SEL KALKANI — sayaçlar ve kilitler
-- ---------------------------------------------------------------------------
local ENTITY_BURST, ENTITY_WINDOW = 60, 2000
local PTFX_BURST, PTFX_WINDOW = 25, 2000
local PROJ_BURST, PROJ_WINDOW = 25, 3000
local LOCK_MS = 5000
local PTFX_MAX_SCALE = 50.0

local spawns, ptfx, projs = {}, {}, {}
local locked = {}       -- ["kind:src"] = kilit bitişi

--- Sel kontrolü: eşik aşıldıysa kısa bir kilit başlatır ve İLK aşımda rapor eder.
--- Döner: true = bu olay iptal edilmeli.
local function floodGate(kind, store, src, limit, windowMs, details)
  local key = kind .. ':' .. src
  local t = now()
  if (locked[key] or 0) > t then return true end
  if bump(store, src, windowMs) <= limit then return false end
  locked[key] = t + LOCK_MS
  store[src] = nil
  details.kind = kind
  details.limit = limit
  details.windowMs = windowMs
  report(src, 'ENTITY_FLOOD', 'HIGH', details)
  return true
end

AddEventHandler('entityCreating', function(entity)
  local owner = NetworkGetEntityOwner(entity)
  if not owner or owner <= 0 or fromSafeScript(entity) then return end
  local model = signedToUnsigned(GetEntityModel(entity))
  local etype = GetEntityType(entity)

  if ruleOn('anti_crash_models') then
    if etype == 1 and CRASH_PEDS[model] then
      CancelEvent()
      report(owner, 'CRASH_ATTEMPT', 'CRITICAL', { source = 'crash_model', model = CRASH_PEDS[model] })
      return
    end
    if CRASH_OBJECTS[model] then
      CancelEvent()
      if bump(modelTries, owner, 10000) >= 2 then
        modelTries[owner] = nil
        report(owner, 'CRASH_ATTEMPT', 'CRITICAL', { source = 'crash_model', model = CRASH_OBJECTS[model] })
      end
      return
    end
  end

  -- Yalnızca script/görev entity'leri sayılır (trafik ve yayalar sayılmaz).
  if ruleOn('anti_crash_flood') and GetEntityPopulationType(entity) == 7 then
    if floodGate('entities', spawns, owner, ENTITY_BURST, ENTITY_WINDOW, { model = model }) then
      CancelEvent()
    end
  end
end)

AddEventHandler('ptFxEvent', function(sender, data)
  local src = tonumber(sender)
  if not src or not ruleOn('anti_crash_flood') then return end
  local scale = type(data) == 'table' and tonumber(data.scale) or nil
  if scale and scale > PTFX_MAX_SCALE then
    CancelEvent()
    report(src, 'CRASH_ATTEMPT', 'CRITICAL', { source = 'oversized_particle', scale = math.floor(scale) })
    return
  end
  if floodGate('particles', ptfx, src, PTFX_BURST, PTFX_WINDOW, {}) then CancelEvent() end
end)

AddEventHandler('startProjectileEvent', function(sender, data)
  local src = tonumber(sender)
  if not src or not ruleOn('anti_crash_flood') then return end
  if floodGate('projectiles', projs, src, PROJ_BURST, PROJ_WINDOW, {
    weapon = type(data) == 'table' and data.weaponHash or nil,
  }) then
    CancelEvent()
  end
end)

-- ---------------------------------------------------------------------------
-- 4) ÇÖKERTME OLAYLARI
-- ---------------------------------------------------------------------------
local TASK_LIMIT, TASK_WINDOW = 6, 10000
local tasks = {}

--- Ağ id'si başka bir oyuncunun ped'i mi (gönderenin değil)? Döner: kurban id'si.
local function otherPlayersPed(netId, sender)
  local ped = netId and NetworkGetEntityFromNetworkId(netId)
  if not ped or ped == 0 or not DoesEntityExist(ped) then return nil end
  if GetEntityType(ped) ~= 1 or not IsPedAPlayer(ped) then return nil end
  local owner = NetworkGetEntityOwner(ped)
  if owner and owner > 0 and owner ~= sender then return owner end
  return nil
end

AddEventHandler('givePedScriptedTaskEvent', function(sender, data)
  local src = tonumber(sender)
  if not src or not ruleOn('anti_crash_events') or type(data) ~= 'table' then return end
  local victim = otherPlayersPed(data.entityNetId, src)
  if not victim then return end
  local key = 'tasks:' .. src
  if (locked[key] or 0) > now() then CancelEvent(); return end
  if bump(tasks, src, TASK_WINDOW) > TASK_LIMIT then
    CancelEvent()
    locked[key] = now() + LOCK_MS
    tasks[src] = nil
    report(src, 'ENTITY_FLOOD', 'HIGH', {
      kind = 'ped_tasks', target = GetPlayerName(victim) or victim, task = data.taskId, limit = TASK_LIMIT,
    })
  end
end)

AddEventHandler('requestPhoneExplosionEvent', function(sender, data)
  local src = tonumber(sender)
  if not src or not ruleOn('anti_crash_events') then return end
  CancelEvent()
  report(src, 'CRASH_ATTEMPT', 'CRITICAL', { source = 'phone_explosion' })
end)

local kickVotes = {}
AddEventHandler('kickVotesEvent', function(sender, data)
  local src = tonumber(sender)
  if not src or not ruleOn('anti_crash_events') then return end
  CancelEvent()
  if bump(kickVotes, src, 30000) == 1 then
    report(src, 'EVENT_EXPLOIT', 'HIGH', { source = 'kick_votes' })
  end
end)

-- ---------------------------------------------------------------------------
-- 2) OYUNCUYA YAPIŞTIRMA — periyodik tarama
-- ---------------------------------------------------------------------------
local ATTACH_SCAN_MS = 2000
local ATTACH_OBJECTS = 3

local function scanAttachments()
  -- [ "owner:victim" ] = { objeler }
  local objectsOn = {}
  local function check(list, kind)
    for _, e in ipairs(list or {}) do
      local parent = GetEntityAttachedTo(e)
      if parent and parent ~= 0 and DoesEntityExist(parent) and GetEntityType(parent) == 1 and IsPedAPlayer(parent)
          and not (kind == 'ped' and IsPedAPlayer(e)) then
        local victim = NetworkGetEntityOwner(parent)
        local owner = NetworkGetEntityOwner(e)
        if owner and owner > 0 and victim and victim > 0 and owner ~= victim and not fromSafeScript(e) then
          if kind == 'object' then
            local k = owner .. ':' .. victim
            objectsOn[k] = objectsOn[k] or { owner = owner, victim = victim, list = {} }
            table.insert(objectsOn[k].list, e)
          else
            DeleteEntity(e)
            report(owner, 'CRASH_ATTEMPT', 'CRITICAL', {
              source = 'attached_to_player', kind = kind, model = signedToUnsigned(GetEntityModel(e)),
              target = GetPlayerName(victim) or victim,
            })
          end
        end
      end
    end
  end
  check(GetAllVehicles and GetAllVehicles() or {}, 'vehicle')
  check(GetAllPeds and GetAllPeds() or {}, 'ped')
  check(GetAllObjects and GetAllObjects() or {}, 'object')

  for _, g in pairs(objectsOn) do
    if #g.list >= ATTACH_OBJECTS then
      for _, e in ipairs(g.list) do DeleteEntity(e) end
      report(g.owner, 'ENTITY_FLOOD', 'HIGH', {
        kind = 'attached_props', count = #g.list, target = GetPlayerName(g.victim) or g.victim,
      })
    end
  end
end

CreateThread(function()
  while true do
    Wait(ATTACH_SCAN_MS)
    if ruleOn('anti_crash_attach') then
      local ok, err = pcall(scanAttachments)
      if not ok then CAC.log('ERROR', 'anticheat', 'crash_guard attach scan: ' .. tostring(err)) end
    end
  end
end)

AddEventHandler('playerDropped', function()
  local s = source
  spawns[s], ptfx[s], projs[s], tasks[s], modelTries[s], kickVotes[s] = nil, nil, nil, nil, nil, nil
  for key in pairs(locked) do
    if key:match(':' .. s .. '$') then locked[key] = nil end
  end
end)

print('^2[CoreAC] Anti-crash guard yuklendi.^7')
