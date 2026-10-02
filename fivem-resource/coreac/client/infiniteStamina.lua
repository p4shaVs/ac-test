local resettedStamina = false
local ST_oldStateValid = false

local isValidStaminaState = LPH_JIT_MAX(function()
    local _, stamina = StatGetInt(CoreAC.Native.GetHashKey("MP0_STAMINA"), -1)
    -- İŞLEM ÖNCELİĞİ HATASI: `(stamina or 0 <= 90)` aslında `stamina or true`
    -- demekti (Lua `<=` operatörünü `or`dan önce değerlendirir) → şart HER ZAMAN
    -- doğruydu ve stamina istatistiği hiç filtrelemiyordu.
    return ((stamina or 0) <= 90) and
        CoreAC.isPlayerSprinting and
        CoreAC.playerStamina <= 0.06 and
        not CoreAC.isPlayerInVehicle and
        not CoreAC.isPedFalling and
        not IsPedInParachuteFreeFall(CoreAC.playerPed) and
-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B
        not CoreAC.isPedJumpingOutOfVehicle and
        not CoreAC.isPedRunningRagdollTask and
        CoreAC.isPlayerFreeForAmbientTask and
        CoreAC.pedType ~= 28
end)

local checkInfiniteStamina = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiInfiniteStamina then
        return
-- Zm1hLnd0Zg==
    end

    local currentStateValid = isValidStaminaState() 
    if
        not resettedStamina and
        currentStateValid and
        ST_oldStateValid
    then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_INFINITE_STAMINA)
    end

    ST_oldStateValid = currentStateValid
end)

CoreAC.RegisterDetection("infiniteStamina", checkInfiniteStamina, 2000)

local expiresResetStamina = 0
exports("resettedStamina", LPH_NO_VIRTUALIZE(function()
    local timer = CoreAC.Native.GetGameTimer()
    if timer > expiresResetStamina - 2000 then
        expiresResetStamina = timer + 10000
        if not resettedStamina then
            resettedStamina = true
            CoreAC.CreateThread(function()
                while CoreAC.Native.GetGameTimer() < expiresResetStamina do CoreAC.Wait(100) end
                resettedStamina = false
            end)
        end
    end
end))
