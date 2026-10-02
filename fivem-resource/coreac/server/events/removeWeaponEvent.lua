AddEventHandler("removeWeaponEvent", function(sender, data)
    if CoreAC.Config.Weapons.AntiRemoveWeapons then
-- ZGlzY29yZC5nZy9mbWE=
        local pedId = NetworkGetEntityFromNetworkId(data.pedId)
        local pedOwner = DoesEntityExist(pedId) and NetworkGetEntityOwner(pedId)
        local isPlayer = DoesEntityExist(pedId) and IsPedAPlayer(pedId) and (pedOwner ~= tonumber(sender))

        if pedOwner and isPlayer then
            CancelEvent()
            local weapData = CoreAC.WEAPON_DATA[data.weaponType]
-- UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUCBpdHMgZm1h
            CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_REMOVE_WEAPONS, {
                target = GetPlayerName(pedOwner) or "Unknown",
                weaponType = weapData and weapData.weaponName or data.weaponType
            })
            return
        end
    end
end)