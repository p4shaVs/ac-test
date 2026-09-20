-- Core Shield Anti-Cheat — client çekirdeği (paylaşılan durum + yardımcılar)
-- Tüm tespit modülleri (client/detections/*.lua) bunu kullanır.
-- Amaç: tek yerde durum önbelleği + rapor + kural + strike + legit-muafiyet
-- + "ped değişti" (multichar/respawn) tespiti + ban-anı replay tamponu.

Aeigs = Aeigs or {}
Aeigs.Rules = Aeigs.Rules or {}

RegisterNetEvent('aeigs:rules', function(r)
  if type(r) == 'table' then Aeigs.Rules = r end
end)
CreateThread(function() Wait(2500); TriggerServerEvent('aeigs:requestRules') end)

--- Kural açık mı? (kural gelmediyse def)
function Aeigs.rule(key, def)
  local v = Aeigs.Rules[key]
  if v == nil then return def end
  return v == true
end

-- ---------------------------------------------------------------------------
-- Ban-anı REPLAY tamponu — CRITICAL bir tespit atıldığında son ~8 sn'lik
-- durum web panelde "neden banlandık" izlenebilsin diye rapora eklenir.
-- ---------------------------------------------------------------------------
local REPLAY_MAX = 32   -- 32 * 250ms ≈ 8 sn
local replayBuf = {}

local function pushReplay(S)
  if not S.ped then return end
  replayBuf[#replayBuf + 1] = {
    t = GetGameTimer(),
    x = math.floor(S.coords.x * 10) / 10, y = math.floor(S.coords.y * 10) / 10, z = math.floor(S.coords.z * 10) / 10,
    speed = math.floor(S.speed * 10) / 10, vz = math.floor((S.vel and S.vel.z or 0) * 100) / 100,
    hp = S.health, armor = S.armor, coll = S.collisionOff, inVeh = S.inVeh,
  }
  if #replayBuf > REPLAY_MAX then table.remove(replayBuf, 1) end
end

--- Şu ana kadarki replay tamponunun bir kopyasını döndürür (raporla birlikte gider).
function Aeigs.dumpReplay()
  local out = {}
  for i = 1, #replayBuf do out[i] = replayBuf[i] end
  return out
end

--- Tespiti sunucuya raporla (throttle ile). severity CRITICAL → oto-ban akışı;
--- CRITICAL raporlara otomatik replay tamponu eklenir.
local lastReport = {}
function Aeigs.report(dtype, severity, details, throttle)
  -- Tespitler geçici kapalıysa hiçbir rapor gönderme (yeni altyapı testi).
  if Config and Config.DetectionsEnabled == false then return end
  local now = GetGameTimer()
  throttle = throttle or 15000
  if lastReport[dtype] and now - lastReport[dtype] < throttle then return end
  lastReport[dtype] = now
  details = details or {}
  if severity == 'CRITICAL' and type(details) == 'table' then
    details.replay = Aeigs.dumpReplay()
  end
  TriggerServerEvent('aeigs:report', dtype, severity or 'HIGH', details)
end

-- ---------------------------------------------------------------------------
-- Legit aksiyon muafiyeti (spawn / admin tp / revive) — yanlış-pozitif önler
-- Diğer resource'lar da exports ile işaretleyebilir (anti-false + kontrollü bypass)
-- ---------------------------------------------------------------------------
Aeigs.grace = { tp = 0, revive = 0, spectate = 0, spawn = GetGameTimer() + 30000 }
function Aeigs.markTp()
  Aeigs.grace.tp = GetGameTimer() + 10000
  -- CoreAC modülleri (teleport/noclip/invisible/freecam) legit ışınlanmayı bu
  -- statebag'den anlar. Bizim grace'imizle senkron tut ki meşru tp'de false-ban
  -- atmasınlar (spawn, admin tp, job tp — hepsi markTp'den geçer).
  if CoreAC and CoreAC.SetSecuredStateBag then
    CoreAC.SetSecuredStateBag('_WS:LastTeleportedTimer', GetNetworkTime(), false)
  end
end
function Aeigs.markRevive() Aeigs.grace.revive = GetGameTimer() + 10000 end
function Aeigs.markSpectate(on)
  Aeigs.grace.spectate = on and (GetGameTimer() + 3600000) or 0
  -- CoreAC modülü (client/spectate.lua) kendi bayrağına bakıyor. Bunu senkron
  -- tutmazsak KENDİ yönetici izleme modumuz (/ac spectate) yöneticiyi
  -- ANTI_SPECTATE ile işaretliyordu.
  if CoreAC then CoreAC.isSpectating = (on == true) end
end
function Aeigs.spawnGuard() return GetGameTimer() < Aeigs.grace.spawn end
function Aeigs.tpGrace() return GetGameTimer() < Aeigs.grace.tp end
function Aeigs.reviveGrace() return GetGameTimer() < Aeigs.grace.revive end
function Aeigs.spectateGrace() return GetGameTimer() < Aeigs.grace.spectate end

exports('markTeleport', function() Aeigs.markTp() end)  -- legit tp yapan scriptler çağırır
exports('markRevive', function() Aeigs.markRevive() end)

--- Oyuncu (yeniden) spawn oldu: menü/multichar/ölüp-dirilme/karakter değişimi.
--- HER durumda çağrılır — framework'e bağlı değildir (aşağıdaki ped-değişim
--- taramasından tetiklenir). Tüm tespitleri geçici olarak durdurur ve
--- SUNUCUYA bildirir ki teleport taraması eski konumla kıyaslama yapıp
--- "multichar/respawn = TELEPORT ban" hatasına düşmesin.
local function onRespawn()
  Aeigs.spawned = true
  Aeigs.grace.spawn = GetGameTimer() + 10000
  Aeigs.markTp()
  Aeigs.markRevive()
  replayBuf = {}
  -- Ped handle'ı değişti = multichar / kıyafet / respawn. CoreAC modülleri
  -- (pedModel.lua) bunu "meşru model değişimi" olarak işaretlesin.
  TriggerEvent('aeigs:pedChanged')
  TriggerServerEvent('aeigs:respawnAnchor')
end
Aeigs.onRespawn = onRespawn

Aeigs.spawned = false
AddEventHandler('playerSpawned', onRespawn)
CreateThread(function()
  while not Aeigs.spawned do
    Wait(500)
    if NetworkIsSessionStarted() then
      local ped = PlayerPedId()
      if ped and ped ~= 0 and DoesEntityExist(ped) and not IsEntityDead(ped) and GetEntityHealth(ped) > 0 then
        onRespawn()
      end
    end
  end
end)

--- Tespitler yalnızca oyuncu gerçekten oyundayken ve spawn muafiyeti bittikten sonra çalışır.
function Aeigs.active() return Aeigs.spawned and not Aeigs.spawnGuard() end
RegisterNetEvent('aeigs:grantTp', function() Aeigs.markTp() end)  -- sunucu admin tp
RegisterNetEvent('aeigs:grantRevive', function() Aeigs.markRevive() end)

-- ---------------------------------------------------------------------------
-- Strike sistemi — tek fluke ban atmasın; N vuruş / pencere içinde tetikler
-- ---------------------------------------------------------------------------
function Aeigs.strike(needed, windowMs)
  return {
    n = 0, last = 0, needed = needed or 2, window = windowMs or 10000,
    hit = function(self)
      local t = GetGameTimer()
      if t - self.last > self.window then self.n = 0 end
      self.last = t
      self.n = self.n + 1
      if self.n >= self.needed then self.n = 0; return true end
      return false
    end,
    resetStrike = function(self) self.n = 0 end,
  }
end

-- ---------------------------------------------------------------------------
-- Paylaşılan durum önbelleği (200 ms) — natives tek yerde okunur.
-- Ped HANDLE'ı değiştiğinde (multichar / respawn / yeni ped) otomatik
-- onRespawn() tetiklenir — framework'e bağlı olmadan çalışır.
-- ---------------------------------------------------------------------------
local S = {}
Aeigs.S = S
local lastPed = nil

CreateThread(function()
  while true do
    local ped = PlayerPedId()
    if lastPed ~= nil and ped ~= lastPed then
      onRespawn()
    end
    lastPed = ped

    S.ped = ped
    S.id = PlayerId()
    S.coords = GetEntityCoords(ped)
    S.height = GetEntityHeightAboveGround(ped)
    S.speed = GetEntitySpeed(ped)
    S.vel = GetEntityVelocity(ped)
    S.inVeh = IsPedInAnyVehicle(ped, false)
    S.veh = S.inVeh and GetVehiclePedIsIn(ped, false) or 0
    S.driver = S.veh ~= 0 and GetPedInVehicleSeat(S.veh, -1) == ped
    S.vehSpeed = S.veh ~= 0 and GetEntitySpeed(S.veh) or 0.0
    S.falling = IsPedFalling(ped)
    S.ragdoll = IsPedRagdoll(ped)
    S.swimming = IsPedSwimming(ped)
    S.climbing = IsPedClimbing(ped)
    S.jumping = IsPedJumping(ped)
    S.parachute = GetPedParachuteState(ped)
    S.dead = IsPedDeadOrDying(ped, true)
    S.cutscene = IsCutscenePlaying()
    S.invincible = GetPlayerInvincible(S.id)
    S.frozen = IsEntityPositionFrozen(ped)
    S.collisionOff = GetEntityCollisionDisabled(ped)
    S.attached = IsEntityAttached(ped)
    S.armor = GetPedArmour(ped)
    S.health = GetEntityHealth(ped)
    S.maxHealth = GetEntityMaxHealth(ped)
    S.weapon = GetSelectedPedWeapon(ped)

    if Aeigs.active() then pushReplay(S) end

    Wait(200)
  end
end)

-- Weapon blacklist listesi (silahlar core'da tutulur; detections/weapons kullanır)
Aeigs.WeaponBlacklist = {}
RegisterNetEvent('aeigs:weaponBlacklist', function(list)
  local m = {}
  for _, w in ipairs(list or {}) do m[w.hash] = w.action end
  Aeigs.WeaponBlacklist = m
end)
CreateThread(function() Wait(2600); TriggerServerEvent('aeigs:requestWeaponBlacklist') end)

-- ---------------------------------------------------------------------------
-- CANLILIK (liveness) sinyali — server-authoritative ANTI-TAMPER.
-- En büyük açık: client tespitleri obfuscate değil, hileci resource'u durdurup/
-- etkisizleştirip hepsini kapatabilir. Bu ping her ~10 sn kesintisiz gider;
-- kesilirse sunucu (server/liveness_guard.lua) "AC devre dışı bırakıldı" olarak
-- işaretler. DetectionsEnabled'dan BAĞIMSIZDIR (tespit değil, canlılık kanıtı) —
-- test modunda da akmaya devam eder; aksiyonu server tarafında verilir.
CreateThread(function()
  while true do
    Wait(10000)
    if NetworkIsSessionStarted() then
      TriggerServerEvent('aeigs:alive')
    end
  end
end)

-- ---------------------------------------------------------------------------
-- ANTI-TAMPER CHALLENGE — canlılık sinyalinin TAKLİT EDİLEMEZ hali.
--
-- Yalnızca 'aeigs:alive' dinlemek zayıftı: hileci client AC'yi tamamen kapatıp
-- kendi kodundan TriggerServerEvent('aeigs:alive') spam'leyerek "yaşıyorum"
-- taklidi yapabiliyordu. Sunucu artık rastgele bir sayı gönderiyor ve client'ın
-- CoreAC.SolveChallenge dönüşümünü aynen üretmesini bekliyor. AC'yi söken
-- hileci bu dönüşümü de yeniden üretmek zorunda (obfuscate build'de çok zor).
--
-- Cevap veremeyen/yanlış cevaplayan oyuncu, sunucudaki FP kalkanlarından
-- (ping, warmup, üst üste 3 başarısızlık, whitelist) sonra AC_TAMPER olur.
-- ---------------------------------------------------------------------------
RegisterNetEvent('aeigs:challenge', function(nonce)
  if not CoreAC or not CoreAC.SolveChallenge then return end
  TriggerServerEvent('aeigs:challengeReply', nonce, CoreAC.SolveChallenge(nonce))
end)

print('^2[Core Shield] client core loaded^7')
