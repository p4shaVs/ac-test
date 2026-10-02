-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B
local speedHackStrike = CoreAC.StrikesSystem.createStrikeSystem(
    "AntiSpeedHack",
    2,
    function(playerId, action, speed)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SPEED_HACK, {
            action = action,
            speed = speed,
        })
    end,
    5000
)

local checkSpeedHack = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiSpeedHack then
        return
    end
    
    if (
            not CoreAC.isPlayerInVehicle and
            not CoreAC.isPedOnVehicle and
            not CoreAC.isPedRunningRagdollTask and
            not CoreAC.isAttachedToAPlayer and
            CoreAC.isPlayerFreeForAmbientTask and
            not IsPlayerUnderground() and
            not CoreAC.isPedJumpingOutOfVehicle and
            not CoreAC.isPedRunningMeleeTask and
            not CoreAC.isPedDiving and
            not CoreAC.Native.GetPedConfigFlag(CoreAC.playerPed, 148, true) and
            not CoreAC.Native.GetPedConfigFlag(CoreAC.playerPed, 147, true) and
            (CoreAC.pedType ~= 28) and
            not CoreAC.isSpectating
        )
            or CoreAC.isPedClimbing
    then
        local maxSpeed = 14.0
        local action = "Default"
        
        if CoreAC.isEntityInAir then
            if CoreAC.isPedFalling or IsPedInParachuteFreeFall(CoreAC.playerPed) or GetPedParachuteState(CoreAC.playerPed) > 0 then
                maxSpeed = 60.0
                action = "Falling"
            end
        else
            if CoreAC.isPlayerUnderWater or CoreAC.isPlayerSwimming then
                maxSpeed = 18.0
                action = "Swimming"
            elseif CoreAC.isPlayerSprinting then
                maxSpeed = 14.0
                action = "Sprinting"
            elseif CoreAC.isPedClimbing then
                maxSpeed = 14.0
                action = "Climbing"
            end
        end

        if CoreAC.playerSpeed > maxSpeed then
            speedHackStrike(nil, action, CoreAC.playerSpeed)
        end
    end
end)

-- ZCBpIHMgYyBvIHIgZCAuIGdnIC8gZm1h
CoreAC.RegisterDetection("speedHack", checkSpeedHack, 2000)
