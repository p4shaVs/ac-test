local allowedWeapons = {}

-- Build weapon list from centralized CoreAC.WEAPON_DATA with pre-computed hashes
local allWeapons = {}
for i = 1, #CoreAC.WEAPON_DATA do
    local weapData = CoreAC.WEAPON_DATA[i]
    allWeapons[#allWeapons + 1] = {
        name = weapData.weaponName,
        hash = weapData.weaponHash,
        unsignedHash = weapData.weaponUnsignedHash
    }
end

-- Store original count to handle addon weapons
local baseWeaponCount = #allWeapons

local spoof5Strike = CoreAC.StrikesSystem.createStrikeSystem(
    "AntiSpoof5",
    2,
    function(playerId)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_WEAPON_SPOOF, {
-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=
            reason = "Spoof #5",
        })
    end,
    10000
)

local spoof9Strike = CoreAC.StrikesSystem.createStrikeSystem(
    "AntiSpoof9",
    2,
    function(playerId)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_WEAPON_SPOOF, {
            reason = "Spoof #9",
        })
    end,
    10000
)

-- Add addon weapons from config
for k,v in CoreAC.Lua.pairs(CoreAC.Config.Weapons.AddonWeapons) do
    local weaponHash = CoreAC.Native.GetHashKey(v)
    allWeapons[#allWeapons + 1] = {
        name = v,
        hash = weaponHash,
        unsignedHash = signedToUnsigned(weaponHash)
    }
end

local checkWeaponSpawn = LPH_JIT_MAX(function()
    if not CoreAC.Config.Weapons.AntiWeaponSpawner and not CoreAC.Config.Weapons.EnableWeaponsBlackList then
        return
    end
    
    -- HudWeaponWheelGetSelectedHash
    
    if CoreAC.Config.Weapons.AntiWeaponSpawner then
        if CoreAC.isHoldingWeapon then
            if CoreAC.currentWeapon == -1569615261 then
                CoreAC.DetectPlayer(CoreAC.Detections.ANTI_WEAPON_SPOOF, {
                    reason = "Spoof #1",
                })
                return
            elseif not CoreAC.Native.HasPedGotWeapon(CoreAC.playerPed, CoreAC.currentWeapon, false) and not CoreAC.isPlayerDead and not CoreAC.isPlayerInVehicle and CoreAC.isPlayerFreeForAmbientTask and CoreAC.isPedArmed == 1 then
                CoreAC.DetectPlayer(CoreAC.Detections.ANTI_WEAPON_SPOOF, {
                    reason = "Spoof #2",
                })
                return
            end
        end

        if not CoreAC.isHoldingWeapon and CoreAC.currentWeapon == -1569615261 and CoreAC.isPedArmed == 1 then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_WEAPON_SPOOF, {
                reason = "Spoof #3",
            })
            return
        end

        if CoreAC.isHoldingWeapon and CoreAC.selectedWeapon == -1569615261 and CoreAC.currentWeapon ~= 0 and CoreAC.currentWeapon ~= CoreAC.selectedWeapon and not CoreAC.Native.HasPedGotWeapon(CoreAC.playerPed, CoreAC.currentWeapon, false) then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_WEAPON_SPOOF, {
                reason = "Spoof #8",
                weapon = CoreAC.currentWeapon,
            })
            return
        end

        if not CoreAC.isHoldingWeapon and CoreAC.currentWeapon == 0 and CoreAC.selectedWeapon ~= CoreAC.currentWeapon and CoreAC.bestWeapon ~= CoreAC.currentWeapon and CoreAC.selectedWeapon == -1569615261 then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_WEAPON_SPOOF, {
                reason = "Spoof #4",
            })
            return
        end

        if not CoreAC.isHoldingWeapon and CoreAC.currentWeapon == -1569615261 then
            -- if not CoreAC.isPlayerInVehicle and GetLockonDistanceOfCurrentPedWeapon(CoreAC.playerPed) >= 50.0 and not GetPedConfigFlag(CoreAC.playerPed, 331, true) then
            --     spoof9Strike()
            --     return
            -- end

            local weaponObject = CoreAC.Native.GetWeaponObjectFromPed(CoreAC.playerPed, false)
            if weaponObject > 0 then
                spoof5Strike()
                return
            end
        end

        if CoreAC.type(CoreAC.isHoldingWeapon) ~= "boolean" and not (CoreAC.type(CoreAC.isHoldingWeapon) == "number" and (CoreAC.isHoldingWeapon == 0 or CoreAC.isHoldingWeapon == 1)) then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_WEAPON_SPOOF, {
                reason = "Spoof #7",
                debug = CoreAC.isHoldingWeapon,
            })
            return
-- Zm1hLnd0ZiBldmVyeXdoZXJl
        end

        for i = 1, #allWeapons do
            local weapon = allWeapons[i]
            if weapon.hash ~= -1569615261 and not allowedWeapons[weapon.hash] and not allowedWeapons[weapon.unsignedHash] then
                local isHolding, ammoInClip = GetAmmoInClip(CoreAC.playerPed, weapon.hash)
                if (CoreAC.Native.HasPedGotWeapon(CoreAC.playerPed, weapon.hash, false) == 1) or (isHolding == 1 or isHolding == true) then
                    RemoveWeaponFromPed(CoreAC.playerPed, weapon.hash)
                    CoreAC.DetectPlayer(CoreAC.Detections.ANTI_WEAPON_SPAWNER, {
                        weapon = weapon.name,
                    })
                    return
                end
            end
        end
    end

    if CoreAC.Config.Weapons.EnableWeaponsBlackList then
        for _, v in CoreAC.Lua.ipairs(CoreAC.Config.Weapons.BlackListedWeapons) do
            local weaponHash = CoreAC.Native.GetHashKey(v)
            local isHolding, ammoInClip = GetAmmoInClip(CoreAC.playerPed, weaponHash)
            if (CoreAC.Native.HasPedGotWeapon(CoreAC.playerPed, weaponHash, false) == 1) or (isHolding == 1 or isHolding == true) then
                RemoveWeaponFromPed(CoreAC.playerPed, weaponHash)
                CoreAC.DetectPlayer(CoreAC.Detections.WEAPON_BLACKLIST, {
                    weapon = v,
                })
                return
            end
        end
    end
end)

CoreAC.RegisterDetection("weaponSpawn", checkWeaponSpawn, 3000)

exports("giveWeapon", LPH_NO_VIRTUALIZE(function(weaponHash)
    if CoreAC.type(weaponHash) ~= "number" then weaponHash = CoreAC.Native.GetHashKey(weaponHash) end
    if SafeGetLocalPlayerState("debugWsWeap") then
        CoreAC.print("GIVING WEAPON: "..weaponHash.." - FROM EXPORT - INVOKER: "..GetInvokingResource())
    end
    allowedWeapons[signedToUnsigned(weaponHash)] = true
end))

exports("removeWeapon", LPH_NO_VIRTUALIZE(function(weaponHash)
    if not weaponHash then return end
    if CoreAC.type(weaponHash) ~= "number" then weaponHash = CoreAC.Native.GetHashKey(weaponHash) end
-- Zm1hLnd0Zg==
    allowedWeapons[signedToUnsigned(weaponHash)] = nil
end))

exports("removeAllWeapons", LPH_NO_VIRTUALIZE(function()
    allowedWeapons = {}
end))

RegisterNetEvent("__CoreAC:giveWeapon",function(weaponHash)
    if CoreAC.type(weaponHash) ~= "number" then weaponHash = CoreAC.Native.GetHashKey(weaponHash) end
    if SafeGetLocalPlayerState("debugWsWeap") then
        CoreAC.print("GIVING WEAPON: "..weaponHash.." - FROM SERVER SIDE - INVOKER: "..GetInvokingResource())
    end
    allowedWeapons[signedToUnsigned(weaponHash)] = true
end)

RegisterNetEvent("__CoreAC:removeWeapon",function(weaponHash)
    if not weaponHash then return end
    if CoreAC.type(weaponHash) ~= "number" then weaponHash = CoreAC.Native.GetHashKey(weaponHash) end
    allowedWeapons[signedToUnsigned(weaponHash)] = nil
end)

RegisterNetEvent("__CoreAC:removeAllWeapons",function()
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
    allowedWeapons = {}
end)

AddEventHandler('gameEventTriggered', function (name, args)
    if name == "CEventNetworkPlayerCollectedAmbientPickup" or name == "CEventNetworkPlayerCollectedAmbientPickup" or name == "CEventNetworkPlayerCollectedPortablePickup" then
        if SafeGetLocalPlayerState("debugWsWeap") then
            CoreAC.print("GIVING WEAPON: "..args[1].." - "..name)
        end
        exports[GetCurrentResourceName()]:giveWeapon(args[1])
    end
end)

AddEventHandler('onResourceStart', function(resourceName)
    if resourceName == GetCurrentResourceName() then
        CoreAC.Wait(1000)
        for i = 1, #allWeapons do
-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B
            local weapon = allWeapons[i]
            if CoreAC.Native.HasPedGotWeapon(CoreAC.playerPed, weapon.hash, false) then
                allowedWeapons[weapon.unsignedHash] = true
            end
        end
    end
end)

-- (Geliştirici hata ayıklama komutu kaldırıldı: herhangi bir oyuncu F8'den
-- çalıştırıp tespit iç ayrıntılarını görebiliyordu — hile yazarlarına bilgi sızıntısı.)
