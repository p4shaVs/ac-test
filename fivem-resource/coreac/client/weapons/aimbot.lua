local degreesToRadians = math.pi / 180

local RotationToDirection = LPH_NO_VIRTUALIZE(function(rotation)
	local radiansZ = rotation.z * degreesToRadians
    local radiansX = rotation.x * degreesToRadians
    local num = math.abs(math.cos(radiansX))
    
    return vector3(
        -math.sin(radiansZ) * num,
        math.cos(radiansZ) * num,
        math.sin(radiansX)
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
    )
end)

-- =========================================================================== --
-- ================= TRUE SILENT AIM DETECTION SYSTEM ==================== --
-- =========================================================================== --

-- YANLIŞ-POZİTİF TASARIMI (bu kontrol, getClosestPed çökmesi yüzünden bugüne
-- kadar hiç çalışmamıştı; açılırken eşikler baştan güvenli kuruldu):
--   * Ölçü AÇI: atış anındaki kamera yönü ile kameradan isabet noktasına
--     giden yön arasındaki sapma. Metre/piksel eşiği mesafeyle büyüyen mermi
--     saçılmasını hile sanıyordu (100 m'de 2° saçılma = 3.5 m).
--   * Yalnızca NİŞAN ALIRKEN (sağ tık / ADS) yapılan atışlar ölçülür; kalçadan
--     ateşte oyunun kendi saçılması büyüktür.
--   * TEK atış asla yetmez: 20 sn içinde oyuncuya isabet eden 4 atış, nişandan
--     6°'den fazla sapmış olmalı. Silent aim hedefe kilitlendiği için her
--     isabette sapar; meşru oyuncu nişan aldığı yere vurur.
--   * Rapor client kaynaklıdır → panelde en fazla KICK. Kesin karar (BAN)
--     sunucunun kendi açı ölçümüne aittir (server/protection.lua).
local silentAimConfig = {
    minDetectionDistance = 4.0,       -- bundan yakın isabetler ölçülmez
    maxDetectionDistance = 250.0,     -- bundan uzak isabetler ölçülmez

    shotValidityWindow = 50,          -- ms: atıştan sonra isabetin geçerli sayıldığı süre

    maxAimOffset = 6.0,               -- derece: nişan ile isabet arası izin verilen sapma
    offsetHitsNeeded = 4,             -- pencere içinde bu kadar sapmış isabet
    offsetWindow = 20000,             -- ms

    excludedWeaponGroups = {
        [GetHashKey("GROUP_SHOTGUN")] = true,
        [GetHashKey("GROUP_SNIPER")] = true,
        [GetHashKey("GROUP_THROWN")] = true,
        [GetHashKey("GROUP_HEAVY")] = true,
        [GetHashKey("GROUP_MELEE")] = true
    },
}

local silentAimData = {
    lastShotTime = 0,
    shotFired = false,
    shotData = nil, -- atış anındaki kamera verisi

    lastCameraRotation = nil,
    lastMovementTime = 0,
    mouseVelocity = 0,

    offsetHits = {},   -- nişandan sapmış isabetlerin zamanları
}

local function detectRapidMouseMovement(currentRotation)
    local currentTime = CoreAC.Native.GetGameTimer()
    silentAimData.mouseVelocity = 0
    if silentAimData.lastCameraRotation then
        local timeDelta = currentTime - silentAimData.lastMovementTime
        if timeDelta > 0 and timeDelta < 500 then
            local rotationDelta = #(currentRotation - silentAimData.lastCameraRotation)
            silentAimData.mouseVelocity = rotationDelta / (timeDelta / 1000) -- derece/sn
        end
    end

    silentAimData.lastCameraRotation = currentRotation
    silentAimData.lastMovementTime = currentTime

    return silentAimData.mouseVelocity
end

--- Atış anındaki nişan yönü ile kameradan isabet noktasına giden yön
--- arasındaki açı (derece).
local aimOffsetDegrees = LPH_NO_VIRTUALIZE(function(impactCoords, shotData)
    local toImpact = impactCoords - shotData.cameraCoords
    local len = #toImpact
    if len < 0.001 then return 0.0 end
    local d = shotData.cameraDirection
    local dot = (d.x * toImpact.x + d.y * toImpact.y + d.z * toImpact.z) / len
    if dot > 1.0 then dot = 1.0 elseif dot < -1.0 then dot = -1.0 end
    return math.deg(math.acos(dot))
end)

--- Sapmış isabeti kaydeder, pencere içindeki sayıyı döndürür.
local function recordOffsetHit(now)
    local fresh = {}
    for _, t in CoreAC.Lua.ipairs(silentAimData.offsetHits) do
        if now - t < silentAimConfig.offsetWindow then fresh[#fresh + 1] = t end
    end
    fresh[#fresh + 1] = now
    silentAimData.offsetHits = fresh
    return #fresh
end

local shouldMonitorWeapon = LPH_NO_VIRTUALIZE(function(weaponHash)
    if not weaponHash or weaponHash == CoreAC.Native.GetHashKey("WEAPON_UNARMED") then
        return false
    end

    local weaponGroup = GetWeapontypeGroup(weaponHash)
    if silentAimConfig.excludedWeaponGroups[weaponGroup] then
        return false
    end

    local damageType = GetWeaponDamageType(weaponHash)
    return damageType == 3 -- yalnızca mermi hasarı
end)

-- İsabetin meşru olup olmadığı. false dönerse ikinci değer rapor ayrıntısıdır.
local validateShotLegitimacy = LPH_JIT_MAX(function(victim, impactCoords, weaponHash)
    local shotData = silentAimData.shotData
    if not shotData then return true, "no_shot_data" end

    local distanceToVictim = #(GetEntityCoords(CoreAC.playerPed) - GetEntityCoords(victim))
    if distanceToVictim < silentAimConfig.minDetectionDistance then return true, "too_close" end
    if distanceToVictim > silentAimConfig.maxDetectionDistance then return true, "too_far" end
    if not shouldMonitorWeapon(weaponHash) then return true, "excluded_weapon" end

    -- Kalçadan ateş: oyunun kendi saçılması büyük, ölçülmez.
    if not shotData.aiming then return true, "hip_fire" end

    -- Hızlı fare hareketi (flick): kamera verisi atıştan hemen önceki kareye ait.
    if (shotData.mouseVelocity or 0) > 100 then return true, "rapid_movement_excluded" end

    local offset = aimOffsetDegrees(impactCoords, shotData)
    if offset <= silentAimConfig.maxAimOffset then return true, "legitimate_shot" end

    local hits = recordOffsetHit(CoreAC.Native.GetGameTimer())
    if hits >= silentAimConfig.offsetHitsNeeded then
        silentAimData.offsetHits = {}
        return false, {
            reason = "aim_offset",
            offsetDeg = math.floor(offset * 10) / 10,
            hits = hits,
            distance = math.floor(distanceToVictim),
        }
    end
    return true, "offset_pending"
end)

-- İsabet noktasına en yakın (canlı, başka) oyuncu ped'i.
-- HATA DÜZELTİLDİ: bu dosya client/entities.lua'daki LOCAL getClosestPed'i
-- çağırıyordu; burada o isim nil olduğundan her mermi çarpmasında handler
-- "attempt to call a nil value" ile çöküyor, client silent aim kontrolü
-- hiç çalışmıyordu.
local function getClosestPed(coords, maxDistance)
    local peds = CoreAC.Native.GetGamePool('CPed')
    local closestPed, closestDistance = nil, maxDistance or 999.0
    for i = 1, #peds do
        local ped = peds[i]
        if ped ~= CoreAC.playerPed and IsPedAPlayer(ped) and not CoreAC.Native.IsEntityDead(ped) then
            local distance = #(coords - GetEntityCoords(ped))
            if distance < closestDistance then
                closestDistance = distance
                closestPed = ped
            end
        end
    end
    return closestPed, closestDistance
end

local function isPedAWitness(witnesses, ped)
    if not witnesses then return false end
    
    for k, v in CoreAC.Lua.pairs(witnesses) do
        if v == ped or v == 0 then
            return true
        end
    end
    return false
end

-- Enhanced gunshot event handler
AddEventHandler("CEventGunShot", LPH_JIT_MAX(function(witnesses, shooter)
    if shooter ~= CoreAC.playerPed then return end
    if CoreAC.Native.IsEntityDead(shooter) then return end
    --if witnesses and witnesses[1] and not isPedAWitness(witnesses, shooter) then return end
    if GetPedParachuteState(shooter) > 0 then return end
    if GetRenderingCam() ~= -1 then return end

    local timer = CoreAC.Native.GetGameTimer()
    if timer - silentAimData.lastShotTime == 0 then
        return
    end

    local hold, weaponHash = CoreAC.Native.GetCurrentPedWeapon(CoreAC.playerPed, true)
    if not hold and (not CoreAC.Native.HasPedGotWeapon(CoreAC.playerPed, weaponHash, false) or weaponHash == -1569615261) and (CoreAC.Native.IsPlayerFreeForAmbientTask(CoreAC.playerId) or not CoreAC.Native.IsAimCamActive()) then
        if CoreAC.Config.Weapons.AntiSpoofedBullets then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SPOOFED_BULLETS, {
                reason = "Invalid Weapon",
                debug = ("%s:%s"):format(hold, weaponHash),
            })
        end
        silentAimData.shotFired = false
        return
    end

    if not CoreAC.Config.Beta.AntiSilentAim then return end
    if not shouldMonitorWeapon(weaponHash) then return end


    -- if not CoreAC.Native.IsAimCamActive() and CoreAC.Native.IsPlayerFreeForAmbientTask(CoreAC.playerId) and not CoreAC.Native.IsPedRunningRagdollTask(CoreAC.playerPed) and not CoreAC.Native.IsPedFalling(CoreAC.playerPed) then
    --     CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SILENT_AIM, {
    --         reason = "Invalid Aim State",
    --     })
    --     silentAimData.shotFired = false
    --     return
    -- end

    silentAimData.lastShotTime = timer
    silentAimData.shotFired = true
    
    -- Store exact camera data at the moment of shooting
    local cameraCoords = CoreAC.Native.GetGameplayCamCoord()
    local cameraRotation = CoreAC.Native.GetGameplayCamRot()
    
    -- Detect if this was a rapid mouse movement / flick shot
    detectRapidMouseMovement(cameraRotation)

    silentAimData.shotData = {
        cameraCoords = cameraCoords,
        cameraRotation = cameraRotation,
        cameraDirection = RotationToDirection(cameraRotation),
        mouseVelocity = silentAimData.mouseVelocity,
        -- Nişan alarak mı (sağ tık / ADS) ateş etti? Kalçadan ateş ölçülmez.
        aiming = CoreAC.Native.IsAimCamActive() or IsPlayerFreeAiming(CoreAC.playerId),
    }
end))

local impactStrike = CoreAC.StrikesSystem.createStrikeSystem("SilentAimImpact", 5, function(kind)
    CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SILENT_AIM, {
        reason = "Bullet Impact Manipulation",
        impact = kind,
    })
end, 30000)

-- Mermi çarpması: isabet, atış anındaki nişanla uyuşuyor mu?
AddEventHandler("CEventGunShotBulletImpact", LPH_JIT_MAX(function(witnesses, shooter)
    if not CoreAC.Config.Beta.AntiSilentAim then return end
    if shooter ~= CoreAC.playerPed then return end
    if not silentAimData.shotFired then return end
    if GetPedParachuteState(shooter) > 0 then return end
    if GetRenderingCam() ~= -1 then return end

    local currentTime = CoreAC.Native.GetGameTimer()
    if currentTime - silentAimData.lastShotTime >= silentAimConfig.shotValidityWindow then 
        silentAimData.shotFired = false
        return 
    end

    if CoreAC.Native.IsPedDeadOrDying(shooter, true) or IsPedRagdoll(shooter) then
        silentAimData.shotFired = false
        return
    end

    -- Verify this was actually a hit
    local hold, weaponHash = CoreAC.Native.GetCurrentPedWeapon(CoreAC.playerPed, true)
    if not hold then
        silentAimData.shotFired = false
        return
    end

    -- Çarpma olayı gelmiş ama merminin çarpma noktası yok/sıfır: mermi
    -- yönlendirmesinin izi olabilir, ama olay sırası da tutmayabilir. Tek
    -- okumaya güvenilmez — 30 sn içinde 5 kez olmalı (impactStrike).
    local success, impactCoords = GetPedLastWeaponImpactCoord(shooter)
    if not success or impactCoords == vector3(0.0, 0.0, 0.0) then
        impactStrike(success and "zero" or "missing")
        silentAimData.shotFired = false
        return
    end

    -- Find victim near impact point
    local victim, victimDistance = getClosestPed(impactCoords, 3.0)
    if not victim or not IsPedAPlayer(victim) or IsPedInAnyVehicle(victim, false) then
        silentAimData.shotFired = false
        return
    end

    -- Check if victim was damaged by our weapon recently
    if not HasEntityBeenDamagedByWeapon(victim, weaponHash, 0) then
        silentAimData.shotFired = false
        return
    end

    local lastDamagedTime = GetTimeOfLastPedWeaponDamage(victim, weaponHash)
    if currentTime - lastDamagedTime > silentAimConfig.shotValidityWindow then 
        silentAimData.shotFired = false
        return
    end

    -- Clear damage markers to prevent duplicate detections
    ClearPedLastWeaponDamage(victim)
    ClearEntityLastWeaponDamage(victim)

    -- if not HasEntityClearLosToEntity(CoreAC.playerPed, victim, 17) and IsEntityOccluded(victim) then
    --     CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SILENT_AIM, {
    --         reason = "magic_bullet",
    --     })
    -- end

    -- Validate shot legitimacy with advanced detection
    local isLegitimate, detectionData = validateShotLegitimacy(victim, impactCoords, weaponHash)

    if not isLegitimate then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SILENT_AIM, detectionData)
    end

    -- Reset shot state
    silentAimData.shotFired = false
end))


CoreAC.CreateThread(LPH_JIT_MAX(function()
    local minDeltaToTrigger = 0.005
    local previousCamRot = CoreAC.Native.GetGameplayCamRot(2)
    local previousCamHeading = GetGameplayCamRelativeHeading()
    local lastFov = GetGameplayCamFov() 
    local lastInput = 0
    local steadyFrames = 0
    local strikeCount = 0
    local lastWeaponBlocked = 0
    local lastInCollision = 0
    local lastChangedWeapon = 0
    local lastWeapon = CoreAC.Native.GetHashKey("WEAPON_UNARMED")

    local aimbotStrike = CoreAC.StrikesSystem.createStrikeSystem(
        "AntiAimBot",
        5,
        function(playerId)
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_AIM_BOT, {
                debug = math.abs(CoreAC.Native.GetGameplayCamRot(2).z - previousCamRot.z),
            })
        end,
        5000
    )

    while true do
        if CoreAC.Config.Weapons.AntiAimBot then
            local weaponHash = CoreAC.Native.GetSelectedPedWeapon(CoreAC.playerPed)
            local wait = 100
            local timer = CoreAC.Native.GetGameTimer()
            
            if CoreAC.Native.IsAimCamActive() and GetPedConfigFlag(CoreAC.playerPed, 78, true) and not IsPedInCover(CoreAC.playerPed, 0) and timer - lastWeaponBlocked > 1000 and timer - lastChangedWeapon > 1000 and timer - lastInCollision > 1000 and
                not (IsGameplayCamShaking() and CoreAC.Native.IsPedInAnyVehicle(CoreAC.playerPed, false)) and
                (not IsGameplayCamShaking() or
-- ZiBtIGE=
                    (GetFollowPedCamViewMode() ~= 4 or
                        not IsPlayerFreeAiming(CoreAC.playerId)
                    )
                ) and IsUsingKeyboard(0) and not IsEntityInAir(CoreAC.playerPed)
            then
                local weaponGroup = GetWeapontypeGroup(weaponHash)
                if weaponGroup ~= -1212426201 and weaponGroup ~= -1569042529 then
                    local camRot = CoreAC.Native.GetGameplayCamRot(2)
                    local camHeading = GetGameplayCamRelativeHeading()
                    local ix = GetDisabledControlNormal(0, 1)
                    local iy = GetDisabledControlNormal(0, 2)
                    local currentFov = GetGameplayCamFov()
                    local fovDiff = math.abs(currentFov - lastFov)

                    -- FOV needs to be stable
                    if fovDiff < 0.05 then
                        steadyFrames = steadyFrames + 1
                    else
                        steadyFrames = 0
                    end

                    if previousCamRot and steadyFrames > 3 then
                        local yawDelta = math.abs(camRot.z - previousCamRot.z)
                        local camHeadingDelta = math.abs(camHeading - previousCamHeading)
                        local input = math.abs(ix) + math.abs(iy)

                        if yawDelta > minDeltaToTrigger and camHeadingDelta == 0.0 and input == 0.0 and lastInput == 0.0 then
                            strikeCount = strikeCount + 1
                        else
                            strikeCount = 0
                        end

                        lastInput = input
                    else
                        strikeCount = 0
                    end

                    if strikeCount >= 10 then
                        aimbotStrike()
                        strikeCount = 0
                    end

                    lastFov = currentFov
                    previousCamRot = camRot
                    previousCamHeading = camHeading
                    wait = 0
                else
                    wait = 1000
                end
            end

            if GetIsTaskActive(CoreAC.playerPed, 299) then
                lastWeaponBlocked = timer
            end

            if #GetCollisionNormalOfLastHitForEntity(CoreAC.playerPed) > 0 then
                lastInCollision = timer
            end
            
            if lastWeapon ~= weaponHash then
                lastChangedWeapon = timer
            end

            lastWeapon = weaponHash

            CoreAC.Wait(wait)
        else
            CoreAC.Wait(10000)
        end
    end
end))