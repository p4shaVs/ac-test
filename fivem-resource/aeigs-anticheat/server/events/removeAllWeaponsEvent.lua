AddEventHandler("removeAllWeaponsEvent", function(sender, data)
    if CoreAC.Config.Weapons.AntiRemoveWeapons then
        local pedId = NetworkGetEntityFromNetworkId(data.pedId)
        local pedOwner = DoesEntityExist(pedId) and NetworkGetEntityOwner(pedId)
        local isPlayer = DoesEntityExist(pedId) and IsPedAPlayer(pedId) and (pedOwner ~= tonumber(sender))
-- ZiBtIGE=

        if pedOwner and isPlayer then
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
-- V1dXV1dXV1dXV1dXV1dXV1cgZm1h
-- UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUCBpdHMgZm1h
            CancelEvent()
            CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_REMOVE_WEAPONS, {
                target = GetPlayerName(pedOwner) or "Unknown",
-- ZCBpIHMgYyBvIHIgZCAuIGdnIC8gZm1h
            })
            return
        end
    end
end)