local createdAIVehicles = {}
local createdAIPeds = {}

local playersWhitelistedHashes = {}
local serverWhitelistedHashes = {}
local alreadySpawnedEntities = {}

local entitiesCreated = {
    Vehicles = {},
    Peds = {},
    Objects = {},
}

local invalidEntitySpawn = CoreAC.StrikesSystem.createStrikeSystem("InvalidEntitySpawn", 3,
    function(playerId, entityModel, entityType, entityPopType, spawnedAge, spawnedAgeServer, firstOwner, noLongerNeeded,
             beenOwnedByPlayer)
        local detection = CoreAC.Detections.ANTI_SPAWN_VEHICLES
        if entityType == 2 then
            detection = CoreAC.Detections.ANTI_SPAWN_VEHICLES
        elseif entityType == 1 then
            detection = CoreAC.Detections.ANTI_SPAWN_PEDS
        elseif entityType == 3 then
            detection = CoreAC.Detections.ANTI_SPAWN_OBJECTS
        end

        CoreAC.DetectPlayer(playerId, detection, {
            entityModel = entityModel,
            entityPopType = entityPopType,
            spawnedAge = spawnedAge,
            spawnedAgeServer = spawnedAgeServer,
            owner = playerId,
            firstOwner = firstOwner,
            noLongerNeeded = noLongerNeeded,
            beenOwnedByPlayer = beenOwnedByPlayer,
        })
    end, 5000)

AddEventHandler("entityCreating", LPH_JIT_MAX(function(entity)
    -- requirements check
    if not DoesEntityExist(entity) then
        CancelEvent()
        return
    end

    local firstOwner = NetworkGetFirstEntityOwner(entity)
    local source = NetworkGetEntityOwner(entity)
    if not source or firstOwner ~= source then
        CancelEvent()
        return
    end

    local entityType = GetEntityType(entity)
    -- local entityNetType = GetNetTypeFromEntity(entity) --introduced in b16636
    -- enum eNetObjEntityType
    -- {
    --     Automobile = 0,
    --     Bike = 1,
    --     Boat = 2,
    --     Door = 3,
    --     Heli = 4,
    --     Object = 5,
    --     Ped = 6,
    --     Pickup = 7,
    --     PickupPlacement = 8,
    --     Plane = 9,
    --     Submarine = 10,
    --     Player = 11,
    --     Trailer = 12,
    --     Train = 13
    -- };

    local entityPopType = GetEntityPopulationType(entity)

    local isVehicle = entityType == 2
    local isPed = entityType == 1
    local isObject = entityType == 3
    local isPickup = entityType == 0

    local isAIEntity = ((isVehicle and entityPopType ~= 4) or isPed) and (entityPopType ~= 6 and entityPopType ~= 7)
    local isNonNeededEntity = ((isVehicle or isPed) and (entityPopType == 5))

    if (isVehicle or isPed) and entityPopType == 0 then
        CancelEvent()
        return
    end

    if ((isPed or isVehicle) and (isAIEntity and not isNonNeededEntity)) then return end

    -- Oyuncu daha oyuna girmediyse (yükleme / karakter seçimi / apartman
    -- yükleme) hiçbir spawn tespiti/limiti çalışmaz. QBCore interior, apartman
    -- ve envanter scriptleri giriş anında onlarca script-obje basar; bu, spawn
    -- limitlerini tetikleyip oyuncuyu daha oyuna girmeden kickleyebiliyordu.
    if Aeigs and Aeigs.isInGame and not Aeigs.isInGame(source, 15000) then return end

    local entityModel = GetEntityModel(entity)
    if entityModel == 0 and entityType ~= 0 then
        CancelEvent()
        return
    end

    if (isObject) or (isPickup) or (isPed and not isAIEntity) or (isVehicle and not isAIEntity) or (CoreAC.Config.Entities.DisableNPCPopulation and not isObject and isNonNeededEntity) then
        local playerName = GetPlayerName(source) or "unk"

        if isPickup then
            if CoreAC.Config.Entities.LogObjectSpawnsToConsole then
                CoreAC:print(("^3Pickup^0 spawned: by ^3%s^0 (id:^3%s^0)"):format(playerName, source), "^6",
                    "Entities")
            end

            if CoreAC.Config.Entities.AntiPickupSpawn then
                CancelEvent()
                CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_PICKUP_SPAWN, {
                    entityModel = entityModel,
                })
                return
            end
        elseif isObject then
            if CoreAC.Config.Entities.LogObjectSpawnsToConsole then
                CoreAC:print(
                    ("^3Object^0 spawned: ^3%s^0 by ^3%s^0 (id:^3%s^0)"):format(entityModel, playerName, source), "^6",
                    "Entities")
            end

            if (CoreAC.Config.Entities.PreBlackListedObjects[entityModel] or (CoreAC.Config.Entities.EnableObjectsBlackList and CoreAC.Config.Entities.BlackListedObjects[entityModel])) and not CoreAC.Config.Entities.WhiteListedObjects[entityModel] then
                CancelEvent()
                CoreAC.DetectPlayer(source, CoreAC.Detections.OBJECT_BLACKLIST, {
                    objectModel = entityModel,
                })
                return
            end

            if CoreAC.Config.Entities.EnableObjectsWhiteList and not CoreAC.Config.Entities.WhiteListedObjects[entityModel] then
                CancelEvent()
                CoreAC.DetectPlayer(source, CoreAC.Detections.OBJECT_WHITELIST, {
                    objectModel = entityModel,
                })
                return
            end

            if CoreAC.Config.Entities.EnableObjectsLimiter then
                if not entitiesCreated["Objects"][source] then
                    entitiesCreated["Objects"][source] = { SpawnedCount = 0, SpawnedEntities = {} }
                end

                entitiesCreated["Objects"][source].SpawnedCount = entitiesCreated["Objects"][source].SpawnedCount +
                    1
                table.insert(entitiesCreated["Objects"][source].SpawnedEntities, entity)
                if #entitiesCreated["Objects"][source].SpawnedEntities > 1 then
                    for k, v in ipairs(entitiesCreated["Objects"][source].SpawnedEntities) do
                        if not DoesEntityExist(v) then
                            table.remove(entitiesCreated["Objects"][source].SpawnedEntities, k)
                            entitiesCreated["Objects"][source].SpawnedCount = entitiesCreated["Objects"][source]
                                .SpawnedCount - 1
                        end
                    end
                end

                if entitiesCreated["Objects"][source].SpawnedCount >= tonumber(CoreAC.Config.Entities.ObjectsLimitIn5Seconds) then
                    for k, v in pairs(entitiesCreated["Objects"][source].SpawnedEntities) do
                        if DoesEntityExist(v) then DeleteEntity(v) end
                    end
                    CancelEvent()
                    CoreAC.DetectPlayer(source, CoreAC.Detections.OBJECT_LIMIT, {
                        objectModel = entityModel,
                        spawnedCount = entitiesCreated["Objects"][source].SpawnedCount,
                    })
                    return
                end
            end
        elseif isPed then
            if CoreAC.Config.Entities.LogPedSpawnsToConsole then
                CoreAC:print(
                    ("^3Ped^0 spawned: ^3%s^0 by ^3%s^0 (id:^3%s^0)"):format(entityModel, playerName, source), "^6",
                    "Entities")
            end

            if (CoreAC.Config.Entities.EnablePedsBlackList and CoreAC.Config.Entities.BlackListedPeds[entityModel]) and not CoreAC.Config.Entities.WhiteListedPeds[entityModel] then
                CancelEvent()
                CoreAC.DetectPlayer(source, CoreAC.Detections.PED_BLACKLIST, {
                    pedModel = entityModel,
                })
                return
            end

            if CoreAC.Config.Entities.EnablePedsWhiteList and not CoreAC.Config.Entities.WhiteListedPeds[entityModel] then
                CancelEvent()
                CoreAC.DetectPlayer(source, CoreAC.Detections.PED_WHITELIST, {
                    pedModel = entityModel,
                })
                return
            end

            if CoreAC.Config.Entities.EnablePedsLimiter then
                if not entitiesCreated["Peds"][source] then
                    entitiesCreated["Peds"][source] = { SpawnedCount = 0, SpawnedEntities = {} }
                end

                entitiesCreated["Peds"][source].SpawnedCount = entitiesCreated["Peds"][source].SpawnedCount +
                    1
                table.insert(entitiesCreated["Peds"][source].SpawnedEntities, entity)
                if #entitiesCreated["Peds"][source].SpawnedEntities > 1 then
                    for k, v in ipairs(entitiesCreated["Peds"][source].SpawnedEntities) do
                        if not DoesEntityExist(v) then
                            table.remove(entitiesCreated["Peds"][source].SpawnedEntities, k)
                            entitiesCreated["Peds"][source].SpawnedCount = entitiesCreated["Peds"][source].SpawnedCount -
                                1
                        end
                    end
                end

                if entitiesCreated["Peds"][source].SpawnedCount >= tonumber(CoreAC.Config.Entities.PedsLimitIn5Seconds) then
                    for k, v in pairs(entitiesCreated["Peds"][source].SpawnedEntities) do
                        if DoesEntityExist(v) then DeleteEntity(v) end
                    end
                    CancelEvent()
                    CoreAC.DetectPlayer(source, CoreAC.Detections.PED_LIMIT, {
                        pedModel = entityModel,
                        spawnedCount = entitiesCreated["Peds"][source].SpawnedCount,
                    })
                    return
                end
            end
        elseif isVehicle then
            if CoreAC.Config.Entities.LogVehicleSpawnsToConsole then
                CoreAC:print(
                    ("^3Vehicle^0 spawned: ^3%s^0 by ^3%s^0 (id:^3%s^0)"):format(
                        CoreAC.GetVehicleName(entityModel),
                        playerName, source), "^6",
                    "Entities")
            end

            if CoreAC.Config.Entities.EnableVehiclesBlackList and CoreAC.Config.Entities.BlackListedVehicles[entityModel] == true then
                CancelEvent()
                CoreAC.DetectPlayer(source, CoreAC.Detections.VEHICLE_BLACKLIST, {
                    vehicle = CoreAC.GetVehicleName(entityModel),
                })
                return
            end

            if CoreAC.Config.Entities.EnableVehiclesWhiteList and not CoreAC.Config.Entities.WhiteListedVehicles[entityModel] then
                CancelEvent()
                CoreAC.DetectPlayer(source, CoreAC.Detections.VEHICLE_WHITELIST, {
                    vehicle = CoreAC.GetVehicleName(entityModel),
                })
                return
            end

            if CoreAC.Config.Entities.EnableVehiclesLimiter then
                if not entitiesCreated["Vehicles"][source] then
                    entitiesCreated["Vehicles"][source] = { SpawnedCount = 0, SpawnedEntities = {} }
                end

                entitiesCreated["Vehicles"][source].SpawnedCount = entitiesCreated["Vehicles"][source].SpawnedCount +
                    1
                table.insert(entitiesCreated["Vehicles"][source].SpawnedEntities, entity)
                if #entitiesCreated["Vehicles"][source].SpawnedEntities > 1 then
                    for k, v in ipairs(entitiesCreated["Vehicles"][source].SpawnedEntities) do
                        if not DoesEntityExist(v) then
                            table.remove(entitiesCreated["Vehicles"][source].SpawnedEntities, k)
                            entitiesCreated["Vehicles"][source].SpawnedCount = entitiesCreated["Vehicles"][source]
                                .SpawnedCount - 1
                        end
                    end
                end

                if entitiesCreated["Vehicles"][source].SpawnedCount >= tonumber(CoreAC.Config.Entities.VehiclesLimitIn5Seconds) then
                    for k, v in pairs(entitiesCreated["Vehicles"][source].SpawnedEntities) do
                        if DoesEntityExist(v) then DeleteEntity(v) end
                    end
                    CancelEvent()
                    CoreAC.DetectPlayer(source, CoreAC.Detections.VEHICLE_LIMIT, {
                        vehicle = CoreAC.GetVehicleName(entityModel),
                        spawnedCount = entitiesCreated["Vehicles"][source].SpawnedCount,
                    })
                    return
                end
            end

            if CoreAC.Config.Entities.AntiThrowVehicles then
                local entitySpeed = #(GetEntityVelocity(entity) - vector3(0, 0, 0))
                if (entitySpeed >= 40) then
                    CancelEvent()
                    CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_THROW_VEHICLES, {
                        vehicle = CoreAC.GetVehicleName(entityModel),
                        vehicleSpeed = entitySpeed,
                    })
                    return
                end

                Wait(100)

                if not DoesEntityExist(entity) then return end

                entitySpeed = #(GetEntityVelocity(entity) - vector3(0, 0, 0))
                if (entitySpeed >= 100) then
                    DeleteEntity(entity)
                    CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_THROW_VEHICLES, {
                        vehicle = CoreAC.GetVehicleName(entityModel),
                        vehicleSpeed = entitySpeed,
                    })
                    return
                end

                Wait(300)

                if not DoesEntityExist(entity) then return end

                entitySpeed = #(GetEntityVelocity(entity) - vector3(0, 0, 0))
                if entitySpeed >= 24 and entitySpeed <= 26 then
                    DeleteEntity(entity)
                    CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_THROW_VEHICLES, {
                        vehicle = CoreAC.GetVehicleName(entityModel),
                        vehicleSpeed = entitySpeed,
                    })
                    return
                end
            end
        end

        if (isVehicle and CoreAC.Config.Entities.EnableVehiclesAI) or (isPed and CoreAC.Config.Entities.EnablePedsAI and not CoreAC.Config.Entities.WhiteListedPeds[entityModel]) or (isObject and CoreAC.Config.Entities.EnableObjectsAI and not CoreAC.Config.Entities.WhiteListedObjects[entityModel]) then
            local timer = GetGameTimer()
            local lastSpawned = playersWhitelistedHashes[source] and (playersWhitelistedHashes[source][entityModel] or 0) or
            0
            local lastSpawnedServer = serverWhitelistedHashes[entityModel] or 0
            local spawnedAge = timer - lastSpawned
            local spawnedAgeServer = timer - lastSpawnedServer
            local alreadySpawned = alreadySpawnedEntities[entityModel]

            if spawnedAge > 30000 and spawnedAgeServer > 30000 and lastSpawned ~= -1 then
                CancelEvent()

                if alreadySpawned then
                    invalidEntitySpawn(source, entityModel, entityType, entityPopType, spawnedAge, spawnedAgeServer,
                        NetworkGetFirstEntityOwner(entity), HasEntityBeenMarkedAsNoLongerNeeded(entity),
                        HasVehicleBeenOwnedByPlayer(entity))
                    return
                end

                if isVehicle then
                    CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_SPAWN_VEHICLES, {
                        vehicle = CoreAC.GetVehicleName(entityModel),
                        entityPopType = entityPopType,
                        spawnedAge = spawnedAge,
                        spawnedAgeServer = spawnedAgeServer,
                        owner = source,
                        firstOwner = NetworkGetFirstEntityOwner(entity),
                        noLongerNeeded = HasEntityBeenMarkedAsNoLongerNeeded(entity),
                        beenOwnedByPlayer = HasVehicleBeenOwnedByPlayer(entity),
                    })
                elseif isPed then
                    CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_SPAWN_PEDS, {
                        pedModel = entityModel,
                        entityPopType = entityPopType,
                        spawnedAge = spawnedAge,
                        spawnedAgeServer = spawnedAgeServer,
                        owner = source,
                        firstOwner = NetworkGetFirstEntityOwner(entity),
                        noLongerNeeded = HasEntityBeenMarkedAsNoLongerNeeded(entity),
                    })
                elseif isObject then
                    CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_SPAWN_OBJECTS, {
                        objectModel = entityModel,
                        entityPopType = entityPopType,
                        spawnedAge = spawnedAge,
                        spawnedAgeServer = spawnedAgeServer,
                        owner = source,
                        firstOwner = NetworkGetFirstEntityOwner(entity),
                        noLongerNeeded = HasEntityBeenMarkedAsNoLongerNeeded(entity),
                    })
                end
            elseif spawnedAge > 5000 and spawnedAgeServer > 1000 and lastSpawned ~= -1 then
                CoreAC:print(("Potential malicious entity spawn: ^3%s^0 by ^3%s^0 (id:^3%s^0)"):format(
                        (entityModel), GetPlayerName(source) or "unk", source), "^1",
                    "Entity Warning")
                CancelEvent()
            end
        end

        -- CoreAC.SendLog("ENTITY_CREATE", source, {
        --     entityModel = entityModel,
        --     entityType = (isVehicle and "Vehicle" or isPed and "Ped" or isObject and "Object" or isPickup and "Pickup") or "Unknown",
-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B
        -- })
    elseif (isVehicle and isNonNeededEntity and (CoreAC.Config.Entities.EnableVehiclesAIv2 or CoreAC.Config.Entities.EnableVehiclesBlackList) and HasEntityBeenMarkedAsNoLongerNeeded(entity) and (HasVehicleBeenOwnedByPlayer(entity) == 1 or GetVehicleType(entity) == "train")) then
        local entitySpeed = #(GetEntityVelocity(entity) - vector3(0, 0, 0))

        if CoreAC.Config.Entities.EnableVehiclesBlackList and CoreAC.Config.Entities.BlackListedVehicles[entityModel] == true then
            -- todo check si scenarios ca enleve les autobus, si oui, on desactive scenarios h24 + on ban ici
            -- DeleteEntity(entity)
            CancelEvent()
            CoreAC.DetectPlayer(source, CoreAC.Detections.VEHICLE_BLACKLIST, {
                vehicle = CoreAC.GetVehicleName(entityModel),
                popType = entityPopType,
            })
            return
        end

        if CoreAC.Config.Entities.AntiThrowVehicles then
            if (entitySpeed >= 50) then
                CancelEvent()
                CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_THROW_VEHICLES, {
                    vehicle = CoreAC.GetVehicleName(entityModel),
                    speed = math.floor(entitySpeed),
                })
                return
            end
        end

        if CoreAC.Config.Entities.EnableVehiclesAIv2 then
            CoreAC:print(
                ("^1Badly spawned Vehicle^0: ^3%s^0 by ^3%s^0 (id:^3%s^0)"):format(
                    (CoreAC.GetVehicleName(entityModel)), GetPlayerName(source) or "unk",
                    source), "^1",
                "Entity Warning")
            CancelEvent()
            return
        end
    elseif (CoreAC.Config.Entities.EnableVehiclesAIv2 and isVehicle and isAIEntity and isNonNeededEntity and HasEntityBeenMarkedAsNoLongerNeeded(entity) and not HasVehicleBeenOwnedByPlayer(entity) and GetEntitySpeed(entity) == 0 and not GetIsVehicleEngineRunning(entity) and GetVehicleDoorLockStatus(entity) == 0 and (#(GetEntityCoords(entity) - GetEntityCoords(GetPlayerPed(source))) < 3.0)) then
        CoreAC:print(
            ("^1Potential malicious vehicle spawn^0: ^3%s^0 by ^3%s^0 (id:^3%s^0)"):format(
                (CoreAC.GetVehicleName(entityModel)), GetPlayerName(source) or "unk",
                source), "^1",
            "Entity Warning")
        CancelEvent()
    elseif isPed and isNonNeededEntity and HasEntityBeenMarkedAsNoLongerNeeded(entity) and CoreAC.Config.Entities.EnablePedsAIv2 then
        local pedTask = GetPedSpecificTaskType(entity, 0)
        if pedTask == 531 then
            Citizen.Wait(100)
            if not DoesEntityExist(entity) then return end
            pedTask = GetPedSpecificTaskType(entity, 0)
        end

        if pedTask == 38 then return end

        local pedTask2 = GetPedSpecificTaskType(entity, 1)
        local pedWeapon = GetCurrentPedWeapon(entity)
        local isAnimal = pedWeapon == -100946242 or pedWeapon ~= -1569615261 --armes a feu ca met animal

        if pedTask == 1.0 and (pedTask2 == 531 or pedTask2 == 343 or pedTask2 == 1.0 or (pedTask2 == 221 and isAnimal)) then
            CoreAC:print(
                ("^1Badly spawned Ped^0: ^3%s^0 by ^3%s^0 (id:^3%s^0)"):format(entityModel, playerName, source), "^1",
                "Entity Warning")
            DeleteEntity(entity)
            CancelEvent()
            return
        elseif pedTask == 531 and not isAnimal or pedWeapon == 0 then
            --ca delete des vrai ped desfois qui sont pas animal
            DeleteEntity(entity)
            CancelEvent()
            return
        end

        -- if (not playerState[tostring(entityModel)] or lastSpawned > 60000) then
        --     --todo check si ya encore des voitures pnj qui passe ici, sinon on peut ban instant
        --     --todo cote client avec l'event creationnpc on peut check si c pas pnj, ban nstant
        --     TriggerClientEvent("__CoreAC:checkPed", source, NetworkGetNetworkIdFromEntity(entity))
        -- end
    end
end))

CreateThread(function()
    while true do
        entitiesCreated = {
            Vehicles = {},
            Peds = {},
            Objects = {},
        }
        Wait(5000)
    end
end)

function CoreAC.DeleteOwnedEntities(netId)
    for _, entityGroup in pairs({ GetAllObjects(), GetAllPeds(), GetAllVehicles() }) do
        for k, entityHandle in pairs(entityGroup) do
            if DoesEntityExist(entityHandle) then
                if (NetworkGetEntityOwner(entityHandle) == netId or NetworkGetFirstEntityOwner(entityHandle) == netId) then
                    DeleteEntity(entityHandle)
-- ZiBtIGE=
                end
            end
        end
    end
end

RegisterNetEvent("__CoreAC:CreateEntity", LPH_JIT_MAX(function(modelHash, functionReference, resourceName)
    if not resourceName or not serverResources[resourceName] then return end
    local modelHash = type(modelHash) == 'number' and modelHash or GetHashKey(modelHash)

    local source = tonumber(source)
    if not playersWhitelistedHashes[source] then playersWhitelistedHashes[source] = {} end
-- ZGlzY29yZC5nZy9mbWE=

    if not alreadySpawnedEntities[modelHash] then alreadySpawnedEntities[modelHash] = true end
    local timer = GetGameTimer()
    if functionReference == "GetClosestObjectOfType" then
        playersWhitelistedHashes[source][modelHash] = -1
        serverWhitelistedHashes[modelHash] = timer
        TriggerClientEvent("_ws:cb", source, modelHash, -1)
    else
        playersWhitelistedHashes[source][modelHash] = timer
        if functionReference ~= "ClonePed" and functionReference ~= "ClonePedEx" then
            serverWhitelistedHashes[modelHash] = timer
        end
        TriggerClientEvent("_ws:cb", source, modelHash, timer)
    end
end))

exports("CreateEntity", LPH_NO_VIRTUALIZE(function(modelHash)
    if not GetInvokingResource() then return end

    local modelHash = type(modelHash) == 'number' and modelHash or GetHashKey(modelHash)
    serverWhitelistedHashes[modelHash] = GetGameTimer()
end))

AddEventHandler("playerDropped", LPH_JIT_MAX(function(reason, resourceName)
    local source = tonumber(source)
    playersWhitelistedHashes[source] = nil
end))

RegisterNetEvent("__CoreAC:checkPed", LPH_JIT_MAX(function(netId)
    local _source = source
    local entity = NetworkGetEntityFromNetworkId(netId)
    local source = NetworkGetFirstEntityOwner(entity)
    if not source or _source ~= source then return end

    if DoesEntityExist(entity) then
        local entityModel = GetEntityModel(entity)

        if CoreAC.Config.Entities.LogPedSpawnsToConsole then
            CoreAC:print(
                ("^1MALICIOUS ^3Ped^0 spawned: ^3%s^0 by ^3%s^0 (id:^3%s^0)"):format(entityModel,
                    GetPlayerName(source) or "unk", source), "^6", "Entities")
        end

        DeleteEntity(entity)

        -- if CoreAC.Config.Entities.EnablePedsWhiteList and not CoreAC.Config.Entities.WhiteListedPeds[entityModel] then
        --     exports[CoreAC.resourceName]:banPlayer(tonumber(source),"Attempted to spawn a blacklisted ped #2","Ped Model: "..entityModel,"Entities")
        --     return
        -- end

        if CoreAC.Config.Entities.EnablePedsAIv2 then
            if createdAIPeds[source] and createdAIPeds[source] >= 5 then
                CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_AI_SPAWN_PEDS, {
                    pedModel = entityModel,
                })
                return
            else
                if not createdAIPeds[source] then
                    createdAIPeds[source] = 0
                    CreateThread(function()
                        Wait(1000)
                        createdAIPeds[source] = nil
                    end)
                else
                    createdAIPeds[source] = createdAIPeds[source] + 1
                end
            end
        end
    end
end))
