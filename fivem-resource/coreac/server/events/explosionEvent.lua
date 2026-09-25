local explosionsCreated = {}
local projectileExplosions = {
    ["0"] = true,
    ["1"] = true,
    ["2"] = true,
    ["3"] = true,
    ["4"] = true,
    ["19"] = true,
    ["29"] = true,
    ["21"] = true,
    ["22"] = true,
    ["24"] = true,
    ["25"] = true,
    ["32"] = true,
    ["41"] = true,
    ["56"] = true,
    ["57"] = true,
    ["62"] = true,
}

local ignoredExplosionWeaponHashes = {
    ["1945616459"] = true,
    ["4171469727"] = true,
    ["3473446624"] = true,
    ["4026335563"] = true,
    ["1259576109"] = true,
    ["1186503822"] = true,
-- WFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFggZm1h
    ["2669318622"] = true,
    ["3800181289"] = true,
    ["1566990507"] = true,
    ["3450622333"] = true,
    ["3530961278"] = true,
    ["3204302209"] = true,
    ["1638077257"] = true,
    ["1097917585"] = true,
    ["2756787765"] = true,
    ["2144528907"] = true,
    ["1155224728"] = true,
    ["3041872152"] = true,
    ["50118905"] = true,
    ["84788907"] = true,
    ["3959029566"] = true,
}

AddEventHandler("explosionEvent", LPH_JIT_MAX(function(sender, data)
    local source = tonumber(sender)
    local ownerNetId = data.ownerNetId
    local explosionType = data.explosionType
    local weaponHash = data.f164
    local isFromProjectile = data.f240
    local vehicleNetworkId = data.f210 --f208 c pareil
    local explosionName = CoreAC.GetExplosionName(explosionType)

    if CoreAC.Config.Explosions.CancelAllExplosions then
        CancelEvent()
    end

    if data.damageScale <= 0 then return end
    if vehicleNetworkId ~= 0 then return end -- si c la voiture qui a provoque l'explosion
    if data.f190 == true then return end -- si c un explosif collé a un truc
    if data.f240 == true or data.f241 == true or data.f242 == true or data.f243 == true then return end -- si ca vient du monde?
    if explosionType == 11 then return end --Dir_Steam blc

    if CoreAC.Config.Explosions.EnableExplosionsBlackList and CoreAC.Config.Explosions.BlackListedExplosions[explosionType] then
        CancelEvent()
        CoreAC.DetectPlayer(source, CoreAC.Detections.EXPLOSION_BLACKLIST, {
            explosionType = explosionType,
            explosionName = explosionName,
        })
        return
    elseif CoreAC.Config.Explosions.DetectInvisibleExplosions and data.isInvisible then
        CancelEvent()
        CoreAC.DetectPlayer(source, CoreAC.Detections.DETECT_INVISIBLE_EXPLOSIONS, {
            explosionType = explosionType,
            explosionName = explosionName,
        })
        return
    elseif CoreAC.Config.Explosions.DetectInaudibleExplosions and not data.isAudible then
        CancelEvent()
        CoreAC.DetectPlayer(source, CoreAC.Detections.DETECT_INAUDIBLE_EXPLOSIONS, {
            explosionType = explosionType,
            explosionName = explosionName,
        })
-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B
        return
    end

    if CoreAC.Config.Explosions.EnableExplosionsLimiter then
        explosionsCreated[source] = (explosionsCreated[source] or 0) + 1

        if explosionsCreated[source] >= tonumber(CoreAC.Config.Explosions.ExplosionsLimitIn5Seconds) then
            CancelEvent()
            CoreAC.DetectPlayer(source, CoreAC.Detections.EXPLOSION_LIMIT, {
                explosionType = explosionType,
                explosionName = explosionName,
                limit = tonumber(CoreAC.Config.Explosions.ExplosionsLimitIn5Seconds)
            })
            return
        end
    end

    -- ==============================================================================

-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
    if CoreAC.Config.Explosions.LogExplosionSpawnsToConsole and (GetPlayerName(source) ~= nil) then
        CoreAC:print(("^3Explosion^0 spawned: ^3%s^0 by ^3%s^0 (id:^3%s^0)"):format(explosionName, GetPlayerName(source), source),"^6","Explosions")
    end

    -- ==============================================================================

    -- max exp = 127
    if CoreAC.Config.Explosions.EnableExplosionsAI and not ignoredExplosionWeaponHashes[tostring(weaponHash)] then
        if explosionType == 34 then CancelEvent() return end --Gas_Tank jsp pk faux ban, todo

        local isProjectileExplosion = projectileExplosions[tostring(explosionType)]
        if isProjectileExplosion and not isFromProjectile then
            CancelEvent()
            CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_SPAWN_EXPLOSION, {
                explosionType = explosionType,
                explosionName = explosionName,
            })
            return
        end

        if not isProjectileExplosion then
            CancelEvent()
            CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_SPAWN_EXPLOSION, {
                explosionType = explosionType,
                explosionName = explosionName,
            })
            return
        end
    end

    CoreAC.SendLog("EXPLOSION", source, {
        explosionType = explosionType
    })
end))

CreateThread(function()
    while true do
        explosionsCreated = {}
        Wait(5000)
    end
end)

--todo config updated hjandler transform blacklisted explos
