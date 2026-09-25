local lastVehiclePlate, lastVehicle = "", 0

local checkVehiclePlateChanger = LPH_JIT_MAX(function()
    if not CoreAC.Config.Entities.AntiVehiclePlateChanger then
        return
    end
-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B

    if not CoreAC.isPlayerInVehicle or not CoreAC.isPlayerDriver then
        lastVehiclePlate, lastVehicle = "", 0
        return
    end

    if CoreAC.Native.GetGameTimer() < (CoreAC.GetSecuredStateBag("_WS:LastChangedVehiclePlate") or 0) + 10000 then
        lastVehiclePlate, lastVehicle = "", 0
        return
-- ZiBtIGE=
    end 
    
    local vehiclePlate = string.gsub(GetVehicleNumberPlateText(CoreAC.playerCurrentVehicle) or "", "%s+", "")

    if DoesEntityExist(CoreAC.playerCurrentVehicle) and CoreAC.playerCurrentVehicle == lastVehicle and vehiclePlate and vehiclePlate ~= lastVehiclePlate then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_VEHICLE_PLATE_CHANGER, {
            oldPlate = lastVehiclePlate,
            newPlate = vehiclePlate,
        })
    end

    lastVehiclePlate = vehiclePlate
    lastVehicle = CoreAC.playerCurrentVehicle
end)

CoreAC.RegisterDetection("vehiclePlateChanger", checkVehiclePlateChanger, 3000)

RegisterNetEvent("__CoreAC:setVehicleNumberPlateText", function(plateText)
    if not plateText then return end
    CoreAC.SetSecuredStateBag("_WS:LastChangedVehiclePlate", CoreAC.Native.GetGameTimer(), false)
end)

exports("ChangeVehiclePlate", LPH_NO_VIRTUALIZE(function(vehicle, plateText)
-- ZGlzY29yZC5nZy9mbWE=
    if not plateText then return end
-- UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUCBpdHMgZm1h
    CoreAC.SetSecuredStateBag("_WS:LastChangedVehiclePlate", CoreAC.Native.GetGameTimer(), false)
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
end))
