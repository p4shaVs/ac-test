-- =============================================================================
-- Aeigs × CoreAC Bridge — Client Side
-- Modules client dosyalarının ihtiyaç duyduğu tüm CoreAC client global'leri
-- =============================================================================

-- Aeigs = client tarafı global (client/core.lua'dan gelir)
Aeigs = Aeigs or {}

-- ---------------------------------------------------------------------------
-- CoreAC.DetectPlayer (Client)
-- Modules client dosyaları (godMode.lua, noclip.lua, vb.) bu fonksiyonu çağırır.
-- İmza: CoreAC.DetectPlayer(reason, details, action, duration)
-- Aeigs.report → TriggerServerEvent('aeigs:report', ...) zinciri üzerinden gider.
-- ---------------------------------------------------------------------------
CoreAC.DetectPlayer = function(reason, details, action, duration)
    local detType = tostring(reason or 'UNKNOWN')
    -- heartbeat/client.lua bütünlük kontrolü CoreAC.DetectPlayer("FAKE") çağırıp
    -- SADECE dönüş değerini (timer) kullanır — bunu tespit OLARAK raporlama.
    if detType == 'FAKE' then return GetGameTimer() end
    -- Düz metin tipleri kanonik panel tipine çevir (bkz. bridge/shared.lua).
    detType = CoreAC.NormalizeDetection(detType)
    local severity = 'HIGH'
    if action == CoreAC.Actions.BAN.id or action == 'BAN' then severity = 'CRITICAL' end
    if action == CoreAC.Actions.KICK.id or action == 'KICK' then severity = 'HIGH' end

    local det = {}
    if type(details) == 'table' then
        det = details
    elseif details ~= nil then
        det = { info = tostring(details) }
    end

    -- Aeigs'in mevcut report sistemi ile gönder
    if Aeigs and Aeigs.report then
        Aeigs.report(detType, severity, det)
    else
        TriggerServerEvent('aeigs:report', detType, severity, det)
    end

    -- Heartbeat fake detection kontrolü (heartbeat/client.lua için)
    return GetGameTimer()
end

-- ---------------------------------------------------------------------------
-- Native Referansları — modules güvenli native erişimi için
-- (misc.lua, noclip.lua, vb. CoreAC.Native.* kullanır)
-- ---------------------------------------------------------------------------
CoreAC.Native = {
    GetGameTimer            = GetGameTimer,
    PlayerId                = PlayerId,
    PlayerPedId             = PlayerPedId,
    GetEntityCoords         = GetEntityCoords,
    GetEntityHealth         = GetEntityHealth,
    GetPedArmour            = GetPedArmour,
    GetEntitySpeed          = GetEntitySpeed,
    GetEntityHeading        = GetEntityHeading,
    GetEntityVelocity       = GetEntityVelocity,
    GetEntityModel          = GetEntityModel,
    GetEntityType           = GetEntityType,
    GetEntityBonePosition_2 = GetEntityBonePosition_2,
    GetPedBoneCoords        = GetPedBoneCoords,
    GetGroundZFor_3dCoord   = GetGroundZFor_3dCoord,
    GetEntityHeightAboveGround = GetEntityHeightAboveGround,
    GetEntityCollisionDisabled = GetEntityCollisionDisabled,
    GetVehiclePedIsIn       = GetVehiclePedIsIn,
    GetVehicleCurrentGear   = GetVehicleCurrentGear,
    GetEntitySubmergedLevel = GetEntitySubmergedLevel,
    NetworkGetEntityOwner   = NetworkGetEntityOwner,
    GetPlayerServerId       = GetPlayerServerId,
    IsPedInAnyVehicle       = IsPedInAnyVehicle,
    IsPedFalling            = IsPedFalling,
    IsPedRagdoll            = IsPedRagdoll,
    IsPedDead               = IsPedDead,
    IsEntityPositionFrozen  = IsEntityPositionFrozen,
    GetPedInVehicleSeat     = GetPedInVehicleSeat,
    HasEntityBeenDamagedByAnyVehicle = HasEntityBeenDamagedByAnyVehicle,
    GetGameplayCamCoord     = GetGameplayCamCoord,
    GetGameplayCamRot       = GetGameplayCamRot,
    GetFinalRenderedCamCoord = GetFinalRenderedCamCoord,
    GetFinalRenderedCamRot  = GetFinalRenderedCamRot,
    GetAimBlendFromPlayerToCoord = GetAimBlendFromPlayerToCoord,
    GetCamCoord             = GetCamCoord,
    GetCamRot               = GetCamRot,
    GetCamFov               = GetCamFov,
    IsCamActive             = IsCamActive,
    GetPlayerPed            = GetPlayerPed,
}

-- Eksik native'ler için fallback: CoreAC.Native.X yoksa gerçek global native'e
-- yönlendir. Böylece modüllerin çağırdığı GetHashKey, IsEntityDead,
-- GetCurrentPedWeapon vb. yukarıda tek tek listelenmese de çalışır.
--
-- HATA DÜZELTİLDİ: eskiden `rawget(_G, k)` kullanılıyordu. FiveM native'leri _G'ye
-- İLK erişimde (lazy) bağlanır; rawget _G'nin __index'ini ATLADIĞI için, YALNIZCA
-- CoreAC.Native.X üzerinden çağrılan ve başka hiçbir yerde global olarak
-- kullanılmayan native'ler (ör. GetCurrentPedWeapon → aimbot.lua) nil dönüyor ve
-- "attempt to call a nil value" ile çöküyordu. `_G[k]` __index'i tetikleyip
-- native'i talep üzerine bağlar. pairs() hâlâ yalnızca yukarıdaki gerçek
-- anahtarları gezer (misc.lua tamper kontrolü — zaten yalnız obfuscate build'de —
-- etkilenmez).
setmetatable(CoreAC.Native, { __index = function(_, k) return _G[k] end })

-- ---------------------------------------------------------------------------
-- Lua Standart Fonksiyon Referansları — misc.lua ve diğerleri için
-- ÖNEMLI: Sadece çağrılabilir (callable) fonksiyonlar buraya giriyor.
-- misc.lua bu tablodaki her entry'yi _G[key]({}) ile çağırıyor;
-- math/string/table gibi tablo objeleri hataya yol açar.
-- ---------------------------------------------------------------------------
CoreAC.Lua = {
    pairs        = pairs,
    ipairs       = ipairs,
    pcall        = pcall,
    xpcall       = xpcall,
    print        = print,
    tostring     = tostring,
    tonumber     = tonumber,
    type         = type,
    select       = select,
    next         = next,
    rawget       = rawget,
    rawset       = rawset,
    setmetatable = setmetatable,
    getmetatable = getmetatable,
    -- NOT: math, string, table intentionally excluded — they are tables, not functions.
    -- misc.lua calls _G[name]({}) for each entry; calling math({}) throws an error.
}

-- math/string/table'a CoreAC.Lua üzerinden erişim için ayrı referanslar
-- (misc.lua bunları döngüde aramaz, sadece kod içinde kullanırsa çalışsın)
CoreAC.math   = math
CoreAC.string = string
CoreAC.table  = table
CoreAC.unpack = table.unpack

-- ---------------------------------------------------------------------------
-- debug referansı — misc.lua getinfo için
-- ---------------------------------------------------------------------------
CoreAC.debug = {
    getinfo = debug.getinfo,
}

-- ---------------------------------------------------------------------------
-- Yardımcı tip fonksiyonları — modules kullanır
-- ---------------------------------------------------------------------------
CoreAC.tonumber = tonumber
CoreAC.type = type
CoreAC.tostring = tostring

-- ---------------------------------------------------------------------------
-- Eksik CoreAC yardımcıları (orijinal pakette utils.lua'daydı, taşınmadı).
-- GÜVENLİ passthrough'lar — false-positive riski yok. heartbeat/client.lua
-- CoreAC.TriggerServerEvent'e muhtaç; olmazsa heartbeat gitmez → server
-- watchdog ~90 sn sonra herkesi "CoreAC Stop Detected" ile atardı.
-- ---------------------------------------------------------------------------
CoreAC.TriggerServerEvent = TriggerServerEvent
CoreAC.playerId           = PlayerId()

function CoreAC.print(msg)
  print(('^5[CoreAC]^7 %s'):format(tostring(msg)))
end

CoreAC.SetSecuredStateBag = function(key, value, replicated)
  LocalPlayer.state:set(key, value, replicated == true)
end

-- Bazı modüller (entities.lua, textures.lua, weaponSpawn.lua) bare global
-- SafeGet/SetLocalPlayerState kullanır (utils.lua'da tanımlıydı, taşınmadı) —
-- yerel oyuncu statebag get/set. Eksik olsa "nil value" hatası verirdi.
function SafeSetLocalPlayerState(key, value, replicated)
  LocalPlayer.state:set(key, value, replicated == true)
end
function SafeGetLocalPlayerState(key)
  return LocalPlayer.state[key]
end

CoreAC.GetVehicleName = function(model)
  return GetDisplayNameFromVehicleModel(model)
end

-- SHA256: orijinalde kriptografik yardımcıydı; burada kullanılmıyorsa zararsız
-- stub. (execution.lua log imzalama için çağırabilir — nil dönmesin diye.)
CoreAC.SHA256 = CoreAC.SHA256 or function(s) return tostring(s or '') end

function NumberToBoolean(val)
    if val == nil then return false end
    if type(val) == 'boolean' then return val end
    return val ~= 0
end

-- ---------------------------------------------------------------------------
-- LoadResourceFile — misc.lua için
-- ---------------------------------------------------------------------------
CoreAC.LoadResourceFile = LoadResourceFile

-- ---------------------------------------------------------------------------
-- StateBag okuma — misc.lua için
-- ---------------------------------------------------------------------------
CoreAC.GetSecuredStateBag = function(key)
    local serverId = GetPlayerServerId(PlayerId())
    local bagName = ('player:%d'):format(serverId)
    return GetStateBagValue(bagName, key)
end

-- ---------------------------------------------------------------------------
-- Oyuncu Durum Önbelleği — tüm modules client dosyaları kullanır
-- Bu thread her 250ms'de oyuncu durumunu günceller; modules dosyaları
-- CoreAC.playerPed, CoreAC.playerCoords, vb. okur.
-- ---------------------------------------------------------------------------
CoreAC.playerPed          = PlayerPedId()
CoreAC.playerCoords       = vector3(0, 0, 0)
CoreAC.playerHealth       = 200
CoreAC.playerMaxHealth    = 200
CoreAC.playerArmour       = 0
CoreAC.playerSpeed        = 0.0
CoreAC.playerHeight       = 0.0
CoreAC.playerHeading      = 0.0
CoreAC.playerVelocity     = vector3(0, 0, 0)
CoreAC.playerModel        = 0
CoreAC.pedType            = 0
CoreAC.isPlayerDead       = false
CoreAC.isPlayerInVehicle  = false
CoreAC.isPlayerDriver     = false
CoreAC.isPedFalling       = false
CoreAC.isPedRagdoll       = false
CoreAC.isPedOnVehicle     = false
CoreAC.vehicleSpeed       = 0.0
CoreAC.playerCurrentVehicle = 0
CoreAC.isAttachedToAPlayer  = false
CoreAC.isPedJumpingOutOfVehicle = false
CoreAC.isPedRunningRagdollTask  = false
CoreAC.playerSpawned      = false

-- Flag'ler (shared.js ve godMode.lua tarafından set edilir)
CoreAC.hasTeleported      = false
CoreAC.hasChangedPedModel = false
CoreAC.playerRevived      = false
CoreAC.healthRefilled     = false
CoreAC.proofsEnabled      = false
CoreAC.canBeDamaged       = true
CoreAC.isInvincible       = false
CoreAC.entityCanBeDamaged = true
CoreAC.playerInvincible   = false
CoreAC.playerInvincible2  = false
CoreAC.isVisible          = true

-- Ek ped/oyuncu durum alanları (orijinal utils.lua state cache'inden — güvenli okumalar)
CoreAC.isPedClimbing            = false
CoreAC.isPedJumping             = false
CoreAC.isPedDiving              = false
CoreAC.isPlayerSwimming         = false
CoreAC.isPlayerUnderWater       = false
CoreAC.isPlayerSprinting        = false
CoreAC.isEntityInAir            = false
CoreAC.canPedRagdoll            = true
CoreAC.isPedRunningMeleeTask    = false
CoreAC.isGamePlayCamRendering   = true
CoreAC.isNetworkInSpectatorMode = false
CoreAC.isPlayerFreeForAmbientTask = true
CoreAC.playerStamina            = 100.0
CoreAC.vehicleModel             = 0

-- Silah durumu (gerçek native'lerle doldurulur — tahmin YOK, false-positive riski yok)
CoreAC.currentWeapon            = 0
CoreAC.selectedWeapon           = 0
CoreAC.bestWeapon               = 0
CoreAC.isHoldingWeapon          = false
CoreAC.isPedArmed               = 0

-- Araç modifier baseline'ları (vehicleSpeed.lua gated=false iken okunmaz; sadece
-- crash-güvenliği için "normal" değerler — bunlar hile göstergesi ÜRETMEZ).
CoreAC.vehicleTopSpeedModifier   = 1.1
CoreAC.vehicleCheatPowerIncrease = 1.1
CoreAC.vehicleGravityAmount      = 25.0

-- Heartbeat için zaman damgası
CoreAC.lastActorLoopTime  = GetGameTimer()

-- ---------------------------------------------------------------------------
-- SPAWN KAPISI — "oyuncu gerçekten oyunda mı?"
--
-- ESKİ HÂLİ: `Wait(5000); CoreAC.playerSpawned = true`. Yani "spawn oldu" =
-- client script'i yüklendikten 5 sn sonra. Bu yüzden TÜM CoreAC client
-- tespitleri yükleme ekranında ve karakter seçiminde (qb-multicharacter vb.)
-- çalışıyordu. O ekranlarda scriptler ped'i dondurur, gizler, ışınlar, modelini
-- değiştirir ve can/zırh atar → oyuncu daha oyuna girmeden ARMOR_HACK /
-- TELEPORT / INVISIBLE / MODEL_CHANGE yiyordu.
--
-- YENİ HÂLİ:
--   * Framework varsa (QBCore, QBox, ESX, ox_core, ND) onun "karakter yüklendi"
--     olayı beklenir; çıkış / karakter değiştirme olayında kapı yeniden KAPANIR.
--   * AC oyun sırasında yeniden başlatıldıysa framework'ün mevcut oturum durumu
--     okunur (olay tekrar gelmez).
--   * Framework yoksa: "normal oynanış" durumu (yükleme ekranı yok, ekran açık,
--     kontrol oyuncuda, script kamerası yok, NUI odağı yok, ped görünür ve
--     serbest) kesintisiz STABLE_MS boyunca sürmeli.
--   * Framework var ama olay adları özelleştirilmişse AC sonsuza kadar kapalı
--     kalmasın diye: FALLBACK_MS sonra generic kontrol de kabul edilir.
--   * Kapı açıldıktan sonra SETTLE_MS daha beklenir (spawn noktasına ışınlama,
--     metadata'dan can/zırh yükleme, kıyafet yükleme).
-- ---------------------------------------------------------------------------
local FRAMEWORKS  = { 'qb-core', 'qbx_core', 'es_extended', 'ox_core', 'ND_Core' }
local SETTLE_MS   = 10000
local STABLE_MS   = 20000
local FALLBACK_MS = 180000

local frameworkLoaded = false
local function onCharacterLoaded() frameworkLoaded = true end
local function onCharacterUnloaded()
    frameworkLoaded = false
    CoreAC.playerSpawned = false
end

for _, ev in ipairs({ 'QBCore:Client:OnPlayerLoaded', 'esx:playerLoaded', 'ox:playerLoaded', 'ND:characterLoaded' }) do
    RegisterNetEvent(ev, onCharacterLoaded)
end
for _, ev in ipairs({ 'QBCore:Client:OnPlayerUnload', 'esx:onPlayerLogout', 'ox:playerLogout', 'ND:characterUnloaded' }) do
    RegisterNetEvent(ev, onCharacterUnloaded)
end

local function detectFramework()
    for _, r in ipairs(FRAMEWORKS) do
        if GetResourceState(r) == 'started' then return r end
    end
    return nil
end

--- AC oyun sırasında restart edildiyse "yüklendi" olayı bir daha gelmez.
local function alreadyLoaded(fw)
    if LocalPlayer.state.isLoggedIn == true then return true end   -- qb-core / qbx_core
    if fw == 'es_extended' then
        local ok, loaded = pcall(function()
            return exports['es_extended']:getSharedObject().IsPlayerLoaded()
        end)
        return ok and loaded == true
    end
    return false
end

local function looksInGameplay()
    local ped = PlayerPedId()
    return ped ~= 0 and DoesEntityExist(ped)
        and not GetIsLoadingScreenActive()
        and IsScreenFadedIn()
        and not IsPlayerSwitchInProgress()
        and IsPlayerControlOn(PlayerId())
        and not IsNuiFocused()
        and GetRenderingCam() == -1
        and IsEntityVisible(ped)
        and not IsEntityPositionFrozen(ped)
        and not IsEntityDead(ped)
end

CreateThread(function()
    Wait(1000)
    local fw = detectFramework()
    if fw and alreadyLoaded(fw) then frameworkLoaded = true end
    local startedAt = GetGameTimer()
    local readySince = nil

    while true do
        Wait(500)
        local now = GetGameTimer()
        local ready
        if fw then
            ready = frameworkLoaded or (now - startedAt > FALLBACK_MS and looksInGameplay())
        else
            ready = CoreAC.playerSpawned or looksInGameplay()
        end

        if ready then
            readySince = readySince or now
            local need = (fw and frameworkLoaded) and SETTLE_MS or STABLE_MS
            if not CoreAC.playerSpawned and now - readySince >= need then
                -- Yükleme ekranındaki konum/model/can değerleriyle kıyaslama
                -- yapılmasın: hareket ve model taban çizgilerini sıfırla.
                if Aeigs and Aeigs.markTp then Aeigs.markTp() end
                if Aeigs and Aeigs.markRevive then Aeigs.markRevive() end
                TriggerEvent('aeigs:pedChanged')
                -- Framework'süz sunucularda sunucuya ipucu (sunucu buna tek başına
                -- güvenmez; bkz. Aeigs.isInGame in server/main.lua).
                TriggerServerEvent('aeigs:inGame')
                CoreAC.playerSpawned = true
            end
        else
            readySince = nil
        end
    end
end)

-- Ana durum güncelleme thread'i
CreateThread(function()
    while true do
        local ped = PlayerPedId()
        CoreAC.playerPed        = ped
        CoreAC.playerCoords     = GetEntityCoords(ped)
        CoreAC.playerHealth     = GetEntityHealth(ped)
        CoreAC.playerMaxHealth  = GetEntityMaxHealth(ped)
        CoreAC.playerArmour     = GetPedArmour(ped)
        CoreAC.playerSpeed      = GetEntitySpeed(ped)
        CoreAC.playerHeading    = GetEntityHeading(ped)
        CoreAC.playerVelocity   = GetEntityVelocity(ped)
        CoreAC.playerHeight     = GetEntityHeightAboveGround(ped)
        CoreAC.playerModel      = GetEntityModel(ped)
        CoreAC.pedType          = GetPedType(ped)
        CoreAC.isPlayerDead     = IsEntityDead(ped) or IsPedDeadOrDying(ped, true)
        CoreAC.isPedFalling     = IsPedFalling(ped)
        CoreAC.isPedRagdoll     = IsPedRagdoll(ped)
        CoreAC.isPedOnVehicle   = IsPedOnVehicle(ped, false)
        CoreAC.isPedRunningRagdollTask = IsPedRunningRagdollTask(ped)
        CoreAC.isPedJumpingOutOfVehicle = IsPedJumpingOutOfVehicle(ped)

        local veh = GetVehiclePedIsIn(ped, false)
        CoreAC.playerCurrentVehicle = veh
        CoreAC.isPlayerInVehicle    = veh ~= 0
        if veh ~= 0 then
            CoreAC.isPlayerDriver  = (GetPedInVehicleSeat(veh, -1) == ped)
            CoreAC.vehicleSpeed    = GetEntitySpeed(veh)
        else
            CoreAC.isPlayerDriver  = false
            CoreAC.vehicleSpeed    = 0.0
        end

        CoreAC.playerInvincible  = GetPlayerInvincible(PlayerId())
        CoreAC.playerInvincible2 = GetPlayerInvincible_2(PlayerId())
        CoreAC.entityCanBeDamaged= GetEntityCanBeDamaged(ped)
        CoreAC.isVisible         = IsEntityVisible(ped)

        -- Attached to player kontrol
        local attached = IsEntityAttached(ped)
        if attached then
            local attachEnt = GetEntityAttachedTo(ped)
            CoreAC.isAttachedToAPlayer = attachEnt ~= 0 and GetEntityType(attachEnt) == 1
        else
            CoreAC.isAttachedToAPlayer = false
        end

        -- Ek durum alanları (güvenli native okumaları)
        CoreAC.isPedClimbing            = IsPedClimbing(ped)
        CoreAC.isPedJumping             = IsPedJumping(ped)
        CoreAC.isPedDiving              = IsPedDiving(ped)
        CoreAC.isPlayerSwimming         = IsPedSwimming(ped)
        CoreAC.isPlayerUnderWater       = IsPedSwimmingUnderWater(ped)
        CoreAC.isPlayerSprinting        = IsPedSprinting(ped)
        CoreAC.isEntityInAir            = IsEntityInAir(ped)
        CoreAC.canPedRagdoll            = CanPedRagdoll(ped)
        CoreAC.isPedRunningMeleeTask    = IsPedRunningMeleeTask and IsPedRunningMeleeTask(ped) or false
        CoreAC.isGamePlayCamRendering   = IsGameplayCamRendering()
        CoreAC.isNetworkInSpectatorMode = NetworkIsInSpectatorMode()
        CoreAC.isPlayerFreeForAmbientTask = IsPlayerFreeForAmbientTask(PlayerId())
        CoreAC.playerStamina            = GetPlayerSprintStaminaRemaining(PlayerId())
        CoreAC.playerId                 = PlayerId()
        if veh ~= 0 then CoreAC.vehicleModel = GetEntityModel(veh) else CoreAC.vehicleModel = 0 end

        -- Silah durumu (gerçek native okumaları)
        CoreAC.isHoldingWeapon = IsPedArmed(ped, 7)
        CoreAC.isPedArmed      = CoreAC.isHoldingWeapon and 1 or 0
        CoreAC.currentWeapon   = GetSelectedPedWeapon(ped)
        CoreAC.selectedWeapon  = CoreAC.currentWeapon
        CoreAC.bestWeapon      = GetBestPedWeapon(ped, false)

        -- Heartbeat zaman damgası güncelle
        CoreAC.lastActorLoopTime = GetGameTimer()

        Wait(250)
    end
end)

-- ---------------------------------------------------------------------------
-- StrikesSystem — modules noclip.lua, godMode.lua, entityCreating.lua vb.
-- Strike sistemi: belirli sayıda "strike" oluşunca callback çalıştırır.
-- ---------------------------------------------------------------------------
CoreAC.StrikesSystem = {}

function CoreAC.StrikesSystem.createStrikeSystem(name, maxStrikes, callback, resetMs)
    local strikes = 0
    local lastStrike = 0
    local resetInterval = resetMs or 10000

    return function(...)
        local now = GetGameTimer()
        if now - lastStrike > resetInterval then
            strikes = 0
        end
        strikes = strikes + 1
        lastStrike = now

        if strikes >= maxStrikes then
            strikes = 0
            if type(callback) == 'function' then
                callback(...)
            end
        end
    end
end

-- ---------------------------------------------------------------------------
-- RegisterDetection — modules'un detection kayıt sistemi
-- CoreAC.RegisterDetection(name, fn, intervalMs) → periyodik döngü
-- ---------------------------------------------------------------------------
local registeredDetections = {}

function CoreAC.RegisterDetection(name, fn, intervalMs)
    if registeredDetections[name] then return end
    registeredDetections[name] = true
    intervalMs = intervalMs or 1000

    CreateThread(function()
        -- Spawn'u bekle
        while not CoreAC.playerSpawned do Wait(500) end
        Wait(math.random(500, 2000))  -- stagger

        while true do
            Wait(intervalMs)
            if CoreAC.playerSpawned and not CoreAC.isPlayerDead then
                local ok, err = pcall(fn)
                if not ok and Config and Config.Debug then
                    print(('[Aeigs-AC] Detection hata [%s]: %s'):format(name, tostring(err)))
                end
            end
        end
    end)
end

-- ---------------------------------------------------------------------------
-- Kural Senkronizasyonu — web panelden gelen kuralları CoreAC.Config'e uygula
-- ---------------------------------------------------------------------------
RegisterNetEvent('aeigs:rules', function(r)
    if type(r) ~= 'table' then return end

    local ruleMap = {
        anti_noclip            = 'AntiNoClip',
        anti_flyhack           = 'AntiFly',
        anti_speedhack         = 'AntiSpeedHack',
        anti_teleport          = 'AntiTeleport',
        anti_superjump         = 'AntiSuperJump',
        anti_vehicle_speed     = 'AntiVehicleSpeed',
        anti_vehicle_noclip    = 'AntiVehicleNoClip',
        anti_aimbot            = 'AntiAimbot',
        anti_silent_aim        = 'AntiSilentAim',
        anti_infinite_ammo     = 'AntiInfiniteAmmo',
        anti_no_reload         = 'AntiNoReload',
        anti_damage_multiplier = 'AntiDamageMultiplier',
        anti_explosive_bullets = 'AntiExplosiveBullets',
        anti_explosion_spam    = 'AntiExplosionSpam',
        anti_godmode           = 'AntiInvincible',
        anti_vehicle_godmode   = 'AntiVehicleGodmode',
        anti_illegal_vehicle   = 'AntiIllegalVehicle',
        anti_illegal_ped       = 'AntiIllegalPed',
        anti_illegal_object    = 'AntiIllegalObject',
        anti_give_all_weapons  = 'AntiGiveAllWeapons',
    }

    for aeigs_key, coreac_key in pairs(ruleMap) do
        if r[aeigs_key] ~= nil then
            CoreAC.Config.Main[coreac_key] = (r[aeigs_key] == true)
        end
    end
end)

-- ---------------------------------------------------------------------------
-- Tam CoreAC config (panel Configuration sayfası) — server bridge yayınlar,
-- burada CoreAC.Config[section][key]'e birebir uygulanır. Client tespit
-- modülleri (CoreAC.Config.* okuyanlar) bu ayarlarla çalışır.
-- ---------------------------------------------------------------------------
RegisterNetEvent('aeigs:acConfig', function(rawAc)
    if type(rawAc) ~= 'table' then return end
    -- Sunucu ham config gönderir; kara/beyaz listeleri burada hash aramasına
    -- çeviriyoruz (modüller bu tabloları hash ile indeksliyor) ve boş beyaz
    -- listeler güvenlik için kapatılıyor. Bkz. bridge/shared.lua.
    local ac = CoreAC.NormalizeAcConfig(rawAc)
    for section, fields in pairs(ac) do
        if type(fields) == 'table' and CoreAC.Config[section] then
            for key, value in pairs(fields) do
                CoreAC.Config[section][key] = value
            end
        end
    end
end)

-- Bağlanınca mevcut config'i iste (heartbeat'i beklemeden)
CreateThread(function()
    Wait(2800)
    TriggerServerEvent('aeigs:requestAcConfig')
end)

-- ---------------------------------------------------------------------------
-- Server'dan gelen CoreAC event'leri
-- ---------------------------------------------------------------------------
RegisterNetEvent('__CoreAC:hasTeleported', function()
    CoreAC.hasTeleported = true
    CreateThread(function()
        Wait(5000)
        CoreAC.hasTeleported = false
    end)
end)

RegisterNetEvent('__CoreAC:hasChangedPedModel', function(model)
    CoreAC.hasChangedPedModel = true
    CreateThread(function()
        Wait(5000)
        CoreAC.hasChangedPedModel = false
    end)
end)

RegisterNetEvent('__CoreAC:isInvincible', function(toggle)
    CoreAC.isInvincible = toggle
end)

RegisterNetEvent('__CoreAC:hasAddedAmmo', function()
    -- ammo eklendi, modules ammo detection için kullanır
end)

print('^2[Aeigs-CoreAC Bridge] Client bridge yuklendi.^7')
