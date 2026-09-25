exports("CreateVehicle", function(modelHash)
    modelHash = CoreAC.type(modelHash) == 'number' and modelHash or GetHashKey(modelHash)
    SafeSetLocalPlayerState('LastSpawnedVehicle', modelHash, true)
end)

exports("CreatePed", function(modelHash)
    modelHash = CoreAC.type(modelHash) == 'number' and modelHash or GetHashKey(modelHash)
    SafeSetLocalPlayerState('LastSpawnedPed', modelHash, true)
end)

exports("CreateObject", function(modelHash)
    modelHash = CoreAC.type(modelHash) == 'number' and modelHash or GetHashKey(modelHash)
    SafeSetLocalPlayerState('LastSpawnedObject', modelHash, true)
end)

local function disableNPCPopulation(disableNPCs)
    if disableNPCs then
        SetRandomEventFlag(false)
        DisableVehicleDistantlights(true)
        SetPedPopulationBudget(0)
        SetVehiclePopulationBudget(0)
        for i = 1, 15 do EnableDispatchService(i, false) end
        SetRandomBoats(false)
        SetGarbageTrucks(false)
        SetRandomTrains(false)
        SetCreateRandomCops(false)
        SetCreateRandomCopsOnScenarios(false)
        SetCreateRandomCopsNotOnScenarios(false)
        SetDispatchCopsForPlayer(PlayerId(), false)
        -- SetNumberOfParkedVehicles(0.0)
        DistantCopCarSirens(false)
    else
        DisableVehicleDistantlights(false)
        SetPedPopulationBudget(3)
        SetVehiclePopulationBudget(3)
        --[[ if CoreAC.Config.Entities.EnableVehiclesAIv2 then
            SetNumberOfParkedVehicles(0.0)
            for i, v in CoreAC.Lua.ipairs(parkedScenarios) do SetScenarioTypeEnabled(v, false) end
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
        end ]]
    end
end

AddEventHandler('populationPedCreating', function(x, y, z, model, setters)
    if CoreAC.Config.Entities.DisableNPCPopulation then
        CancelEvent()
    end
end)

RegisterNetEvent("__CoreAC:checkPed", function(netId)
    if NetworkDoesEntityExistWithNetworkId(netId) then
        local entity = NetworkGetEntityFromNetworkId(netId)
        if CoreAC.playerSpawned and DoesEntityExist(entity) and not GetPedConfigFlag(entity, 248, true) then
            CoreAC.TriggerServerEvent("__CoreAC:checkPed", netId)
        end
    end
end)

AddEventHandler('CEventShockingVehicleTowed', function(witnesses, vehicleTowed, coords)
    if GetInvokingResource() ~= nil then return end
    local myVehicle = GetVehiclePedIsUsing(CoreAC.playerPed)
    if myVehicle == vehicleTowed then
        SafeSetLocalPlayerState("_WS:LastTowedVehicle", GetNetworkTime(), true)
    end
end)

local ownedVehicles = {}

local function getClosestPed(coords, maxDistance)
    local peds = CoreAC.Native.GetGamePool('CPed')
    local closestPed, closestDistance = nil, maxDistance or 999.0
    
    for i = 1, #peds do
        local ped = peds[i]
        if IsPedAPlayer(ped) and not CoreAC.Native.IsEntityDead(ped) and ped ~= CoreAC.playerPed then
            local pedCoords = GetEntityCoords(ped)
            local distance = #(coords - pedCoords)
            
            if distance < closestDistance then
                closestDistance = distance
                closestPed = ped
            end
        end
    end
    
    return closestPed, closestDistance
end

local function OnVehicleExplosion(entity)
    if not CoreAC.Config.Beta.AntiMagneto and not CoreAC.Config.Entities.DeleteVehicleOnDestroy then return end
	if not DoesEntityExist(entity) or GetEntityType(entity) ~= 2 then return end
    
	local causeOfDestruction = GetVehicleCauseOfDestruction(entity)
	if (NetworkGetEntityOwner(entity) == CoreAC.playerId) and causeOfDestruction == 539292904 then
		DeleteEntity(entity)
	end
end

AddEventHandler('CEventShockingExplosion', function(witnesses, entity, coords)
	OnVehicleExplosion(entity)
end)

AddEventHandler('CEventShockingFire', function(witnesses, entity, coords)
	OnVehicleExplosion(entity)
end)

AddEventHandler("gameEventTriggered", function(name, data)
    if name == "CEventNetworkVehicleUndrivable" then
        local entity, destroyer, cause = data[1], data[2], data[3]
        OnVehicleExplosion(entity)
    end
end)

local checkEntities = LPH_JIT_MAX(function()
    disableNPCPopulation(CoreAC.Config.Entities.DisableNPCPopulation)

    if not CoreAC.Config.Beta.AntiMagneto and not CoreAC.Config.Beta.AntiAttachVehicles and not CoreAC.Config.Entities.AntiSpawnIsolatedVehicles then
        return
    end

    local Pool = CoreAC.Native.GetGamePool("CVehicle")
    local currentTime = CoreAC.Native.GetGameTimer()

    for i = 1, #Pool do
        local entity = Pool[i]
        if DoesEntityExist(entity) then
			local entityOwner = NetworkGetEntityOwner(entity)
            if entityOwner == CoreAC.playerId then
                if not IsVehiclePreviouslyOwnedByPlayer(entity) then --PNJ vehicle
                    if CoreAC.Config.Beta.AntiAttachVehicles then
                        ownedVehicles[entity] = currentTime
                    end

                    if CoreAC.Config.Beta.AntiMagneto then
                        if ((IsEntityInAir(entity) and not IsVehicleOnAllWheels(entity)) or IsEntityUpsidedown(entity)) and GetEntityHeightAboveGround(entity) >= 1.1 then
-- UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUCBpdHMgZm1h
                            DeleteEntity(entity)
                        end
                    end
                end

                if CoreAC.Config.Entities.AntiSpawnIsolatedVehicles then
                    local entityPopulationType = GetEntityPopulationType(entity)
                    if entityPopulationType == 6 or entityPopulationType == 7 then
                        local script = GetEntityScript(entity)
                        if (script ~= nil) and (script ~= "") then
                            if (script == "_cfx_internal" or (not serverResources[script] and not clientResources[script])) then
                                local vehicleModel = CoreAC.Native.GetEntityModel(entity)
                                DeleteVehicle(entity)
                                if script ~= "startup" then
                                    CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SPAWN_ISOLATED_VEHICLES, {
                                        vehicleModel = CoreAC.GetVehicleName(vehicleModel),
                                        script = script or "Unknown",
                                    })
-- WFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFggZm1h
                                    return
                                end
                            end
                        end
                    end
                end
            end
        end
    end

    if CoreAC.Config.Beta.AntiAttachVehicles then
        for entity, timer in CoreAC.Lua.pairs(ownedVehicles) do
            if DoesEntityExist(entity) or currentTime - timer > 60000 then
                local entityOwner = NetworkGetEntityOwner(entity)
                if entityOwner ~= -1 and entityOwner ~= CoreAC.playerId then
                    ownedVehicles[entity] = nil

                    local entityAttached = GetEntityAttachedTo(entity)
                    if DoesEntityExist(entityAttached) and IsEntityAPed(entityAttached) and IsPedAPlayer(entityAttached) then
                        if entityAttached ~= CoreAC.playerPed then
                            DetachEntity(entity, true, true)
                            DeleteEntity(entity)

-- Zm1hLnd0ZiBldmVyeXdoZXJl
                            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_ATTACH_VEHICLES)
                            return
                        end
                    end
                end
            else
                ownedVehicles[entity] = nil
            end
        end

        local closestPed = getClosestPed(CoreAC.playerCoords, 10.0)
        if closestPed then
            OnesyncEnableRemoteAttachmentSanitization(false)
        else
            OnesyncEnableRemoteAttachmentSanitization(true)
        end
    end

    if CoreAC.Config.Entities.AntiSpawnIsolatedVehicles and CoreAC.isPlayerInVehicle and CoreAC.isPlayerDriver then
        local script = GetEntityScript(CoreAC.playerCurrentVehicle)
        if script and script ~= "" and (script == "_cfx_internal" or (not serverResources[script] and not clientResources[script]) or GetResourceState(script) == "missing") then
            local vehicleModel = CoreAC.Native.GetEntityModel(CoreAC.playerCurrentVehicle)
            DeleteVehicle(CoreAC.playerCurrentVehicle)
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SPAWN_ISOLATED_VEHICLES, {
                vehicleModel = CoreAC.GetVehicleName(vehicleModel),
                script = script or "Unknown",
            })
            return
        end
    end
end)

CoreAC.RegisterDetection("entitiesPools", checkEntities, 2500)
