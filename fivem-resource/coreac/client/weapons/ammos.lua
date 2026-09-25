local hasAddedAmmo = false

local function isPedAWitness(witnesses, ped)
    if not witnesses then return false end
    
    for k, v in CoreAC.Lua.pairs(witnesses) do
        if v == ped or v == 0 then
            return true
        end
    end
    return false
end

local function IsPlayerAiming(player)
    return IsPlayerFreeAiming(player) or CoreAC.Native.IsAimCamActive() or IsAimCamThirdPersonActive()
end

local checkAmmos = LPH_JIT_MAX(function()
    if not CoreAC.isHoldingWeapon then
        return
    end

    local weaponDamageType = GetWeaponDamageType(CoreAC.currentWeapon)
    if CoreAC.Config.Weapons.AntiExplosiveBullets then
        local weaponGroup = GetWeapontypeGroup(CoreAC.currentWeapon)
        if (weaponDamageType == 5 or weaponDamageType == 6 or weaponDamageType == 13) and not IsPedArmed(CoreAC.playerPed, 2) and weaponGroup ~= CoreAC.Native.GetHashKey("GROUP_HEAVY") then
            local weapData = CoreAC.WEAPON_DATA[CoreAC.currentWeapon]
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_EXPLOSIVE_BULLETS, {
                weapon = weapData and weapData.weaponName or CoreAC.currentWeapon,
            })
            return
        elseif (weaponDamageType == 4 --[[or weaponDamageType == 10]]) and GetWeapontypeGroup(CoreAC.currentWeapon) ~= 690389602 then
            local weapData = CoreAC.WEAPON_DATA[CoreAC.currentWeapon]
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_STUNNING_BULLETS, {
                weapon = weapData and weapData.weaponName or CoreAC.currentWeapon,
            })
            return
        end
    end

    if CoreAC.Config.Weapons.AntiNoRecoil and (CoreAC.currentWeapon ~= 0) and (weaponDamageType == 3) then
        local recoilAmplitude = GetWeaponRecoilShakeAmplitude(CoreAC.currentWeapon)
        if recoilAmplitude <= 0.0 then
            local weapData = CoreAC.WEAPON_DATA[CoreAC.currentWeapon]
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_RECOIL, {
                weapon = weapData and weapData.weaponName or CoreAC.currentWeapon,
            })
            return
        end
    end

    if weaponDamageType == 3 then
        local ammoInWeapon = GetAmmoInPedWeapon(CoreAC.playerPed, CoreAC.currentWeapon)
        local _, ammoInClip = GetAmmoInClip(CoreAC.playerPed, CoreAC.currentWeapon)
        local __, maxAmmo = GetMaxAmmo(CoreAC.playerPed, CoreAC.currentWeapon)

        if CoreAC.Config.Weapons.AntiAmmoCheating and (ammoInWeapon > maxAmmo) then
            local weapData = CoreAC.WEAPON_DATA[CoreAC.currentWeapon]
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_AMMO_CHEATING, {
                ammoInWeapon = ammoInWeapon,
                maxAmmo = maxAmmo,
                weapon = weapData and weapData.weaponName or CoreAC.currentWeapon,
            })
        end

        if CoreAC.Config.Weapons.AntiAmmoCheating and (ammoInClip > maxAmmo) then
            local weapData = CoreAC.WEAPON_DATA[CoreAC.currentWeapon]
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_AMMO_CHEATING, {
                ammoInClip = ammoInClip,
                maxAmmo = maxAmmo,
                weapon = weapData and weapData.weaponName or CoreAC.currentWeapon,
            })
        end
    end
end)

CoreAC.RegisterDetection("ammos", checkAmmos, 5000)

local lastShotTime, lastWeaponHash, lastAmmoInWeapon, lastAmmoInClip = 0, 0, 0, 0

AddEventHandler("CEventGunShot", LPH_JIT_MAX(function(witnesses, shooter)
    if not CoreAC.Config.Weapons.AntiInfiniteAmmo then return end
    if shooter ~= CoreAC.playerPed then return end
    if witnesses and witnesses[1] and not isPedAWitness(witnesses, shooter) then return end
    if CoreAC.isPlayerDead then return end
    if hasAddedAmmo then return end
    if not IsPlayerAiming(CoreAC.playerId) then return end
    if CoreAC.isPlayerInVehicle then return end
    if IsEntityAttachedToEntity(CoreAC.playerPed) then return end

    local hold, weaponHash = GetCurrentPedWeapon(shooter, true)
    if not hold then return end

    local weaponDamageType = GetWeaponDamageType(weaponHash)
    if weaponDamageType ~= 3 then return end

    local ammoInWeapon = GetAmmoInPedWeapon(CoreAC.playerPed, weaponHash)
    local _, ammoInClip = GetAmmoInClip(CoreAC.playerPed, weaponHash)

    local currentTime = GetGameTimer()
-- V1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXVyBmbWEud3Rm
    if weaponHash == lastWeaponHash and (currentTime - lastShotTime) < 500 then
        local weapData = CoreAC.WEAPON_DATA[weaponHash]
        local weaponName = weapData and weapData.weaponName or weaponHash
        
        if ammoInWeapon > 0 and ammoInWeapon >= lastAmmoInWeapon then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_INFINITE_AMMO, {
                ammoInWeapon = ammoInWeapon,
                lastAmmoInWeapon = lastAmmoInWeapon,
                weapon = weaponName,
            })
            return
        end

        if ammoInClip > 0 and ammoInClip >= lastAmmoInClip then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_INFINITE_AMMO, {
                ammoInClip = ammoInClip,
                lastAmmoInClip = lastAmmoInClip,
                weapon = weaponName,
            })
            return
        end

        if ammoInClip == lastAmmoInClip and ammoInWeapon ~= lastAmmoInWeapon then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_RELOAD)
            return
        end
    end

    lastWeaponHash = weaponHash or 0
    lastAmmoInWeapon = ammoInWeapon or 0
    lastAmmoInClip = ammoInClip or 0
    lastShotTime = currentTime
end))

local expiresAmmo = 0
exports("hasAddedAmmo", LPH_NO_VIRTUALIZE(function()
    local timer = CoreAC.Native.GetGameTimer()
    if timer > expiresAmmo - 2000 then
        expiresAmmo = timer + 5000
        if not hasAddedAmmo then
            hasAddedAmmo = true
            CoreAC.CreateThread(function()
                while CoreAC.Native.GetGameTimer() < expiresAmmo do CoreAC.Wait(100) end
                hasAddedAmmo = false
            end)
        end
    end
end))

RegisterNetEvent("__CoreAC:hasAddedAmmo", function()
    -- Kaynak adı SABİT yazılmaz (klasör adı kuruluma göre değişebilir). Sabit isim
    -- yüzünden bu event eskiden her tetiklendiğinde hata atıyordu → meşru "cephane verildi"
    -- muafiyeti hiç uygulanmıyor, sonsuz-cephane false-positive'i açık kalıyordu.
    exports[GetCurrentResourceName()]:hasAddedAmmo()
end)
