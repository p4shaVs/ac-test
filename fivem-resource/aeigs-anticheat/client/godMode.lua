local godModeStrike = CoreAC.StrikesSystem.createStrikeSystem(
    "GodMode",
    2,
    function(playerId)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_INVINCIBLE, {
            type = "Invincible",
        })
    end,
    10000
)

local godModeStrike2 = CoreAC.StrikesSystem.createStrikeSystem(
    "GodMode2",
    2,
    function(playerId)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_INVINCIBLE, {
            type = "Not Damagable",
        })
    end,
    10000
)

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

    if CoreAC.Config.Main.AntiNoCombatDamages and not CoreAC.proofsEnabled and not CoreAC.isPlayerDead and not CoreAC.hasChangedPedModel then
        local a, bulletProof, b , c , d , meleeProof , e , f , g = GetEntityProofs(CoreAC.playerPed)
        if (bulletProof == 1) then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_COMBAT_DAMAGES, {
                type = "Bullet Proof",
            })
            return
        elseif (meleeProof == 1)  then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_COMBAT_DAMAGES, {
                type = "Melee Proof",
            })
            return
        end
    end

    if CoreAC.Config.Main.AntiInvincible and not CoreAC.isPlayerDead and not IsEntityPositionFrozen(CoreAC.playerPed) and not IsPlayerCamControlDisabled(CoreAC.playerPed) and not CoreAC.isPedRunningRagdollTask then
        if not CoreAC.isPlayerDead and not IsEntityPositionFrozen(CoreAC.playerPed) and not IsPlayerCamControlDisabled(CoreAC.playerPed) and not CoreAC.isPedRunningRagdollTask and not CoreAC.isInvincible and (CoreAC.playerInvincible or CoreAC.playerInvincible2) and not CoreAC.hasChangedPedModel then
            godModeStrike()
        end
        if not CoreAC.isPlayerDead and not IsEntityPositionFrozen(CoreAC.playerPed) and not IsPlayerCamControlDisabled(CoreAC.playerPed) and not CoreAC.isPedRunningRagdollTask and not CoreAC.isInvincible and CoreAC.canBeDamaged and not CoreAC.entityCanBeDamaged and not CoreAC.hasChangedPedModel then
            godModeStrike2()
        end

        -- KALDIRILDI: GetPedConfigFlag(ped, 6) "bulletproof vest" doğrudan-ban'ı
        -- güvenilmezdi (flag birçok legit durumda set olabiliyor) ve strike'sız
        -- anında raporluyordu → false-positive. Godmode zaten strike'lı native
        -- bayrak kontrolü + server godmode_guard ile kapsanıyor.
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