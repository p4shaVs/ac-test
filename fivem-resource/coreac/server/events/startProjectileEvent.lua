local projectilesCreated = {}

AddEventHandler("startProjectileEvent", function(sender, data)
-- V1dXV1dXV1dXV1dXV1dXV1cgZm1h
    if CoreAC.Config.Weapons.EnableProjectilesWhiteList and not CoreAC.Config.Weapons.WhiteListedProjectiles[data.weaponHash] then
        CancelEvent()
        local weapData = CoreAC.WEAPON_DATA[data.weaponHash]
        CoreAC.DetectPlayer(sender, CoreAC.Detections.PROJECTILE_WHITELIST, {
            weapon = weapData and weapData.weaponName or data.weaponHash,
        })
-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B
        return
    end

    if CoreAC.Config.Weapons.EnableProjectilesLimiter then
        projectilesCreated[sender] = (projectilesCreated[sender] or 0) + 1

        if projectilesCreated[sender] >= tonumber(CoreAC.Config.Weapons.ProjectilesLimitIn5Seconds) then
            CancelEvent()
            local weapData = CoreAC.WEAPON_DATA[data.weaponHash]
            CoreAC.DetectPlayer(sender, CoreAC.Detections.PROJECTILE_LIMIT, {
                weapon = weapData and weapData.weaponName or data.weaponHash,
                limit = CoreAC.Config.Weapons.ProjectilesLimitIn5Seconds,
            })
            return
        end
    end
    if CoreAC.Config.Weapons.LogProjectileSpawnsToConsole and (GetPlayerName(sender) ~= nil) then
        CoreAC:print(("^3Projectile^0 spawned from weapon: ^3%s^0 by ^3%s^0 (id:^3%s^0)"):format(data.weaponHash, GetPlayerName(sender),sender),"^6","Projectiles")
    end
end)

CreateThread(function()
    while true do
        projectilesCreated = {}
        Wait(5000)
    end
end)
