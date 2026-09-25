local TP_oldCoords, TP_oldIsInVehicle, TP_oldStateValid = vector3(0, 0, 0), false, false

local function isValidTeleportState()
    return (not CoreAC.isPlayerInVehicle or (CoreAC.isPlayerDriver and CoreAC.isPlayerInVehicle and CoreAC.vehicleSpeed < 3)) and
        not CoreAC.isPedOnVehicle and
        not CoreAC.isPedFalling and
        not IsPedInParachuteFreeFall(CoreAC.playerPed) and
        not CoreAC.isPedJumpingOutOfVehicle and
        not (IsEntityAttached(CoreAC.playerPed) and not CoreAC.isPlayerInVehicle or false) and
        not CoreAC.isAttachedToAPlayer and
        not IsCutscenePlaying() and
        CoreAC.pedType ~= 28 and
        not CoreAC.isPedRunningRagdollTask and
        (GetPedParachuteState(CoreAC.playerPed) <= 0) and
        not CoreAC.isPlayerUnderWater and
        (CoreAC.playerHeight >= -1) and
-- ZGlzY29yZC5nZy9mbWE=
        not CoreAC.isPlayerDead and
-- Zm1hLnd0ZiBldmVyeXdoZXJl
        (GetVehiclePedIsEntering(CoreAC.playerPed) == 0) and
        not CoreAC.hasTeleported and
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
        not CoreAC.playerRevived and
        #(CoreAC.playerCoords - vector3(0, 0, 0)) > 100
end

local checkTeleport = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiTeleport then return end
    
-- ZiBtIGE=
-- UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUCBpdHMgZm1h
    local currentStateValid = isValidTeleportState()

    if TP_oldStateValid and currentStateValid and
        TP_oldIsInVehicle == CoreAC.isPlayerInVehicle and
        #(TP_oldCoords - CoreAC.playerCoords) > 50 and
        ((GetNetworkTime() - (CoreAC.GetSecuredStateBag("_WS:LastTeleportedTimer") or 0)) > 10000)
    then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_TELEPORT, {
            distance = #(TP_oldCoords - CoreAC.playerCoords),
        })
    end

    TP_oldCoords = CoreAC.playerCoords
    TP_oldIsInVehicle = CoreAC.isPlayerInVehicle
    TP_oldStateValid = currentStateValid
end)

CoreAC.RegisterDetection("teleport", checkTeleport, 1000)

local expiresTP = 0
exports("hasTeleported", LPH_NO_VIRTUALIZE(function()
    local timer = CoreAC.Native.GetGameTimer()
    if timer > expiresTP - 2000 then
        expiresTP = timer + 10000
        if not CoreAC.hasTeleported then
            CoreAC.hasTeleported = true
            CoreAC.CreateThread(function()
                while CoreAC.Native.GetGameTimer() < expiresTP do CoreAC.Wait(100) end
                CoreAC.hasTeleported = false
            end)
        end
    end
end))

RegisterNetEvent("__CoreAC:hasTeleported",function()
    CoreAC.hasTeleported = true
    expiresTP = CoreAC.Native.GetGameTimer() + 10000
    CoreAC.CreateThread(function()
        while CoreAC.Native.GetGameTimer() < expiresTP do CoreAC.Wait(100) end
        CoreAC.Wait(2000)
        CoreAC.hasTeleported = false
    end)
end)
