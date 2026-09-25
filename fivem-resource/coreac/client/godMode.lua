-- ---------------------------------------------------------------------------
-- GODMODE (client bayrakları) — YANLIŞ-POZİTİF DÜZELTMESİ
--
-- Eski kontrol "GetPlayerInvincible true" (ya da GetEntityCanBeDamaged false /
-- mermi-yakın dövüş korumaları) görünce 2 örnekte raporluyordu. Bu bayrakları
-- hilelerle AYNI native'lerle MEŞRU scriptler de koyar:
--   * qb-adminmenu godmode ve "developer mode" → SetPlayerInvincible her karede
--   * qb-ambulancejob yerde yatan oyuncu, txAdmin godmode/noclip, spawn
--     koruması, güvenli bölge (greenzone), cutscene/iç mekân yükleme...
-- shared.js'deki "bunu bir script yaptı" kancası yalnızca bu resource'un
-- içinde çalıştığı için AC bunları hileden ayıramıyor ve oyuncu hiçbir şey
-- yapmazken "durduk yere" GODMODE düşüyordu (girişte kick dahil).
--
-- Artık bayrak TEK BAŞINA tespit değildir. Rapor için hepsi gerekir:
--   * dokunulmazlık bayrağı kesintisiz IMMUNE_MIN_MS sürmeli,
--   * oyuncu bu sırada AKTİF ÇATIŞMADA olmalı (son COMBAT_MS içinde ateş
--     etti ya da yakın dövüşe girdi) — godmode hilecisi çatışmaya girer;
--     boşta duran, yerde yatan ya da güvenli bölgedeki oyuncu girmez,
--   * framework yaralı/ölü durumu, txAdmin modu, donmuş/görünmez ped, araç,
--     cutscene, ekran kararması gibi meşru dokunulmazlık hâlleri dışında.
-- Asıl (kandırılamaz) godmode tespiti sunucudadır: server/godmode_guard.lua
-- vurulan oyuncunun can+zırh havuzunun düşmediğini ölçer.
-- ---------------------------------------------------------------------------
local IMMUNE_MIN_MS = 6000
local COMBAT_MS     = 15000
local immuneSince   = nil

-- Can/zırh istatistik ihlali: art arda iki kontrolde sürmeli (bkz. aşağı).
local healthStatsStrike = CoreAC.StrikesSystem.createStrikeSystem(
    "HealthStats",
    2,
    function(_, info)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_OVERRIDE_HEALTH_STATS, info)
    end,
    8000
)

local checkGodMode = LPH_JIT_MAX(function()
    if CoreAC.hasChangedPedModel or CoreAC.playerRevived or CoreAC.pedType == 28 then
        return
    end

    -- KALDIRILDI: eski AntiInfiniteRefill testi her 3 sn'de oyuncunun canını
    -- fiilen 2 düşürüp geri veriyordu (SetEntityHealth) — QBCore/ESX can/
    -- metabolizma scriptleriyle yarışıp HP titremesi + FALSE-POSITIVE üretiyordu.
    -- Godmode/sonsuz-can zaten server-authoritative godmode_guard.lua ile
    -- (kandırılamaz biçimde) yakalanıyor; client'ta cana müdahaleye gerek yok.

    if CoreAC.Config.Main.AntiOverrideHealthStats then
        -- YANLIŞ-POZİTİF DÜZELTMESİ. Eski kontrol "can > max can + 5" veya
        -- "zırh > 100" görünce TEK ÖRNEKTE rapor ediyordu. İkisi de meşru olarak
        -- oluşur:
        --   * Model değişiminde (karakter seçimi, kıyafet, respawn) max can
        --     modele göre 100/175/200 olabilir; framework can değerini max'tan
        --     ÖNCE 200'e çeker → kısa süre "can > max" görünür.
        --   * Sunucu SetPlayerMaxArmour ile zırh sınırını 100'ün üstüne çıkarabilir.
        -- Hile imzası ise büyük ve kalıcıdır (can 1000+, zırh 200+). Bu yüzden:
        --   * can eşiği: max(kendi max canı, 200) + 50
        --   * zırh eşiği: max(oyuncunun max zırhı, 100) + 5
        --   * art arda iki kontrolde (≈3 sn arayla) sürmeli.
        local maxHp = (CoreAC.playerMaxHealth and CoreAC.playerMaxHealth > 0) and CoreAC.playerMaxHealth or 200
        local hpCap = math.max(maxHp, 200) + 50
        local maxArmour = math.max(GetPlayerMaxArmour(PlayerId()) or 100, 100)

        if CoreAC.playerHealth > hpCap then
            healthStatsStrike(nil, {
                health = ("%s/%s HP"):format(CoreAC.playerHealth, maxHp),
            })
            return
        elseif CoreAC.playerArmour > maxArmour + 5 then
            healthStatsStrike(nil, {
                armor = ("%s/%s"):format(CoreAC.playerArmour, maxArmour),
            })
            return
        end
    end

    -- Hangi dokunulmazlık bayrağı açık? (panel: Anti Invincibility /
    -- Anti Damage Immunity)
    local flag = nil
    if CoreAC.Config.Main.AntiInvincible then
        if CoreAC.playerInvincible or CoreAC.playerInvincible2 then
            flag = "Invincible"
        elseif not CoreAC.entityCanBeDamaged then
            flag = "Not Damagable"
        end
    end
    if not flag and CoreAC.Config.Main.AntiNoCombatDamages then
        local _, bulletProof, _, _, _, meleeProof = GetEntityProofs(CoreAC.playerPed)
        -- Çıkış parametreleri build'e göre 1/0 ya da true/false döner.
        if bulletProof == 1 or bulletProof == true then
            flag = "Bullet Proof"
        elseif meleeProof == 1 or meleeProof == true then
            flag = "Melee Proof"
        end
    end

    local ped = CoreAC.playerPed
    local legit = CoreAC.isPlayerDead
        or CoreAC.isPlayerInVehicle
        or CoreAC.isPedRunningRagdollTask
        or IsEntityPositionFrozen(ped)
        or not IsEntityVisible(ped)
        or not IsPlayerControlOn(PlayerId())
        or IsCutscenePlaying()
        or CoreAC.isNetworkInSpectatorMode
        or CoreAC.isSpectating
        or (CAC.adminTool ~= nil)
        or (CAC.fadeRecent and CAC.fadeRecent(5000))
        or (CAC.tpGrace and CAC.tpGrace())
        or (CAC.reviveGrace and CAC.reviveGrace())
        or (CAC.isDowned and CAC.isDowned())

    if not flag or legit then
        immuneSince = nil
        return
    end

    local now = GetGameTimer()
    immuneSince = immuneSince or now
    if now - immuneSince >= IMMUNE_MIN_MS and CAC.inCombat and CAC.inCombat(COMBAT_MS) then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_INVINCIBLE, {
            type = flag,
            immuneForMs = now - immuneSince,
            inCombat = true,
        })
        immuneSince = now  -- sonraki rapor en erken IMMUNE_MIN_MS sonra (+ rapor throttle'ı)
    end
end)

CoreAC.RegisterDetection("godMode", checkGodMode, 3000)

local expiresHealthRefill = 0
exports("healthRefilled", LPH_NO_VIRTUALIZE(function()
    local timer = CoreAC.Native.GetGameTimer()
    if timer > expiresHealthRefill - 2000 then
        expiresHealthRefill = timer + 5000
        if not CoreAC.healthRefilled then
            CoreAC.healthRefilled = true
            CoreAC.CreateThread(function()
                while CoreAC.Native.GetGameTimer() < expiresHealthRefill do CoreAC.Wait(100) end
                CoreAC.healthRefilled = false
            end)
        end
    end
end))

local expiresPlayerRevived = 0
exports("playerRevived", LPH_NO_VIRTUALIZE(function()
    local timer = CoreAC.Native.GetGameTimer()
    if timer > expiresPlayerRevived - 2000 then
        expiresPlayerRevived = timer + 10000
        if not CoreAC.playerRevived then
            CoreAC.playerRevived = true
            CoreAC.CreateThread(function()
                while CoreAC.Native.GetGameTimer() < expiresPlayerRevived do CoreAC.Wait(100) end
                CoreAC.playerRevived = false
            end)
        end
    end
-- V1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXVyBmbWEud3Rm
end))

exports("proofsEnabled", LPH_NO_VIRTUALIZE(function(toggle)
    CoreAC.proofsEnabled = NumberToBoolean(toggle)
end))

exports("canBeDamaged", LPH_NO_VIRTUALIZE(function(toggle)
    CoreAC.canBeDamaged = NumberToBoolean(toggle)
end))

exports("isInvincible", LPH_NO_VIRTUALIZE(function(toggle)
    CoreAC.isInvincible = NumberToBoolean(toggle)
end))

RegisterNetEvent("__CoreAC:isInvincible",function(toggle)
    CoreAC.isInvincible = toggle
end)

-- local function runImprovedGodmodeTest()
--     if not CoreAC.playerSpawned or CoreAC.isPlayerDead or CoreAC.hasChangedPedModel or CoreAC.playerRevived or not CoreAC.canBeDamaged or CoreAC.isInvincible or CoreAC.proofsEnabled then
--         return false
--     end
    
--     local ped = PlayerPedId()
--     local healthBefore = GetEntityHealth(ped)
--     local armorBefore = GetPedArmour(ped)
--     local totalHealthBefore = healthBefore + armorBefore
--     local chestPos = GetPedBoneCoords(ped, 0, 0.0, 0.0, 0.0)    
--     local startPos = chestPos + vector3(0.0, -0.5, 0.0)
--     local expectedDamage = 30

--     if totalHealthBefore <= 150 then
--         return false
--     end

--     ShootSingleBulletBetweenCoords(
--         startPos,
--         chestPos,
--         expectedDamage,
--         true,
--         GetHashKey("WEAPON_SNSPISTOL"),
--         0,
--         false,
--         true,
--         999.0
--     )
    
--     Wait(5)
    
--     local healthAfter = GetEntityHealth(ped)
--     local armorAfter = GetPedArmour(ped)
--     local totalHealthAfter = healthAfter + armorAfter
--     local damageTaken = totalHealthBefore - totalHealthAfter
    
--     SetEntityHealth(ped, healthBefore)
--     SetPedArmour(ped, armorBefore)
    
--     ClearPedBloodDamage(ped)
--     ClearPedEnvDirt(ped)
--     ClearPedDamageDecalByZone(ped, 10, "ALL")
--     RemoveParticleFxInRange(GetEntityCoords(ped), 1.0)

--     CreateThread(function()
--         for i = 1, 100 do
--             Wait(10)
--             RemoveDecalsInRange(GetEntityCoords(ped), 5.0)
--         end
--     end)
    
--     local result = {
--         healthBefore = healthBefore,
--         healthAfter = healthAfter,
--         armorBefore = armorBefore,
--         armorAfter = armorAfter,
--         damageTaken = damageTaken,
--         expectedDamage = expectedDamage,
--         godModeDetected = false,
--         damageReductionDetected = false
--     }
    
--     if damageTaken <= 0 then
--         result.godModeDetected = true
--     elseif damageTaken < expectedDamage - 2 then
--         result.damageReductionDetected = true
--     end
    
--     return result
-- end

-- CoreAC.CreateThread(function()
--     while not CoreAC.playerSpawned do CoreAC.Wait(100) end
--     while true do
--         CoreAC.Wait(30000)
        
--         if CoreAC.Config.Main.AntiInvincible then

--             local result = runImprovedGodmodeTest()
--             if result and result.godModeDetected then
--                 CoreAC.DetectPlayer(CoreAC.Detections.ANTI_INVINCIBLE, {
--                     type = "Damage Immunity",
--                 })
--             elseif result and result.damageReductionDetected then
--                 CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_COMBAT_DAMAGES, {
--                     type = "Damage Reduction",
--                 })
--             end
--         end
--     end
-- end)