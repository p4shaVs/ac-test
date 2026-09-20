local scriptGravity = 25.0
local scriptCheatPowerIncrease = 1.1
local scriptTopSpeedModifier = 1.1

local overridedBoosts = {
    [GetHashKey("sanchez")] = 18.0,
    [GetHashKey("sanchez2")] = 18.0,
    [GetHashKey("banshee2")] = 20.0,
}

local checkVehicleSpeed = LPH_JIT_MAX(function()
    if not CoreAC.Config.Entities.AntiSpeedModifier and not CoreAC.Config.Entities.AntiHandlingModifier then
        return
    end

    if not CoreAC.isPlayerInVehicle or not CoreAC.isPlayerDriver then
        return
    end
    
    if CoreAC.Config.Entities.AntiSpeedModifier then
        local override = overridedBoosts[CoreAC.vehicleModel]
        if (override ~= nil and scriptTopSpeedModifier < override and CoreAC.vehicleTopSpeedModifier > override) or (override == nil and CoreAC.vehicleTopSpeedModifier > (scriptTopSpeedModifier + 1)) then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SPEED_MODIFIER, {
                vehicle = CoreAC.GetVehicleName(CoreAC.vehicleModel),
                speedModifier = CoreAC.vehicleTopSpeedModifier,
                script = scriptTopSpeedModifier,
            })
            return
        end

        if math.floor(CoreAC.vehicleCheatPowerIncrease) > math.floor(scriptCheatPowerIncrease) then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SPEED_MODIFIER, {
                vehicle = CoreAC.GetVehicleName(CoreAC.vehicleModel),
                torqueModifier = CoreAC.vehicleCheatPowerIncrease,
                script = scriptCheatPowerIncrease,
            })
            return
        end
-- Zm1hLnd0Zg==
    end

    if CoreAC.Config.Entities.AntiHandlingModifier then
        if math.floor(CoreAC.vehicleGravityAmount) > math.floor(scriptGravity) then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_HANDLING_MODIFIER, {
                vehicle = CoreAC.GetVehicleName(CoreAC.vehicleModel),
                gravityModifier = CoreAC.vehicleGravityAmount,
                script = scriptGravity,
            })
            return
        end
    end
end)

CoreAC.RegisterDetection("vehicleSpeed", checkVehicleSpeed, 3000)

exports("newGravity", LPH_NO_VIRTUALIZE(function(newGravity)
    if newGravity <= 25.0 then
        scriptGravity = 25.0
    else
-- ZCBpIHMgYyBvIHIgZCAuIGdnIC8gZm1h
        scriptGravity = CoreAC.tonumber(string.format("%.1f", newGravity))
    end
end))

exports("newCheatPowerIncrease", LPH_NO_VIRTUALIZE(function(newCheatPowerIncrease)
    if newCheatPowerIncrease <= 1.1 then
        scriptCheatPowerIncrease = 1.1
    else
        scriptCheatPowerIncrease = CoreAC.tonumber(string.format("%.1f", newCheatPowerIncrease))
    end
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
end))

exports("newTopSpeedModifier", LPH_NO_VIRTUALIZE(function(newTopSpeedModifier)
    if newTopSpeedModifier <= 1.1 then
        scriptTopSpeedModifier = 1.1
    else
        scriptTopSpeedModifier = CoreAC.tonumber(string.format("%.1f", newTopSpeedModifier))
    end
end))
