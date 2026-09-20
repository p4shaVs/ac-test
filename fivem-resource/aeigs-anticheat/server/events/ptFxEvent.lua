local playersWhitelistedParticles = {}

AddEventHandler("ptFxEvent", function(sender, data)
    local source = tonumber(sender)

    if CoreAC.Config.Explosions.LogParticleSpawnsToConsole and (GetPlayerName(source) ~= nil) then
        CoreAC:print(("^3Particle^0 spawned: ^3%s^0 by ^3%s^0 (id:^3%s^0)"):format(data.effectHash, GetPlayerName(source), source),"^6","Particles")
    end

    if CoreAC.Config.Explosions.EnableParticlesWhiteList and data.effectHash ~= nil and data.assetHash ~= nil and not CoreAC.Config.Explosions.WhiteListedParticles[data.effectHash] then
        CancelEvent()
        CoreAC.DetectPlayer(source, CoreAC.Detections.PARTICLE_WHITELIST, {
            particleHash = data.effectHash,
        })
        return
    end
-- ZGlzY29yZC5nZy9mbWE=

    --todo opti this
    if CoreAC.Config.Explosions.DetectParticlesAttachedToEntity then
        local entityNetId = data.entityNetId
        local entity = NetworkGetEntityFromNetworkId(entityNetId)

        if DoesEntityExist(entity) then
            local owner = NetworkGetEntityOwner(entity)
            if owner ~= tonumber(source) then
                CancelEvent()
                CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_PARTICLE_ATTACHED_TO_ENTITY, {
                    particleHash = data.effectHash,
                })
                return
            end
        end
    end

    local scale = tonumber(data.scale)
    if scale ~= nil and scale > tonumber(CoreAC.Config.Explosions.MaxParticleScale) then
        CancelEvent()
        CoreAC.DetectPlayer(source, CoreAC.Detections.PARTICLE_SCALE, {
            particleHash = data.effectHash,
            scale = scale,
        })
        return
    end

    if CoreAC.Config.Explosions.EnableParticlesAI and not CoreAC.Config.Explosions.WhiteListedParticles[data.effectHash] then
        local timer = GetGameTimer()
        local lastSpawned = playersWhitelistedParticles[source] and (playersWhitelistedParticles[source][data.effectHash] or 0) or 0
        local spawnedAge = timer - lastSpawned

        if spawnedAge > 120000 then
            CancelEvent()

            CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_SPAWN_PARTICLE, {
                particleHash = data.effectHash,
            })
            return
        elseif spawnedAge > 5000 then
            CancelEvent()
        end
    end
end)

RegisterNetEvent("__CoreAC:CreateParticle", function(particleHash, functionReference, resourceName)
    if not resourceName or not serverResources[resourceName] then return end
    local particleHash = type(particleHash) == 'number' and particleHash or GetHashKey(particleHash)

    local source = tonumber(source)
    if not playersWhitelistedParticles[source] then playersWhitelistedParticles[source] = {} end

    local timer = GetGameTimer()
    playersWhitelistedParticles[source][particleHash] = timer
    playersWhitelistedParticles[source][signedToUnsigned(particleHash)] = timer
    TriggerClientEvent("_ws:cb", source, particleHash, timer)
end)

AddEventHandler("playerDropped", LPH_JIT_MAX(function(reason, resourceName)
    local source = tonumber(source)
    playersWhitelistedParticles[source] = nil
end))

--todo pr chaque detection le strike/ban/kick/log/none
