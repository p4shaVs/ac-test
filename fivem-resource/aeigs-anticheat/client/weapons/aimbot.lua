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

local silentAimConfig = {
    maxTrajectoryDeviation = 2.0,     -- Max meters between expected hit and actual hit
    maxScreenDeviation = 70,         -- Max pixels between crosshair and hit point (increased)
    
    minDetectionDistance = 4.0,       -- Minimum distance to perform checks
    maxDetectionDistance = 250.0,     -- Maximum distance to check
    
    shotValidityWindow = 50,         -- ms after shot to consider impact valid
    
    minShotsForPattern = 3,           -- Minimum shots to detect patterns
    
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
    shotData = nil, -- Store camera data when shot is fired
    screenCenter = { x = 0, y = 0 },
    
    lastCameraRotation = nil,
    lastMovementTime = 0,
    mouseVelocity = 0,

    recentHits = {},
    totalSuspiciousShots = 0,
}

local function detectRapidMouseMovement(currentRotation)
    local currentTime = CoreAC.Native.GetGameTimer()
    silentAimData.mouseVelocity = 0
    if silentAimData.lastCameraRotation then
        local timeDelta = currentTime - silentAimData.lastMovementTime
        if timeDelta > 0 and timeDelta < 500 then -- Within 500ms
            local rotationDelta = #(currentRotation - silentAimData.lastCameraRotation)
            silentAimData.mouseVelocity = rotationDelta / (timeDelta / 1000) -- degrees per second
        end
    end
    
    silentAimData.lastCameraRotation = currentRotation
    silentAimData.lastMovementTime = currentTime
    
    return silentAimData.mouseVelocity
end


local calculateExpectedHitPoint = LPH_NO_VIRTUALIZE(function(shotData, impactDistance)
    if not shotData or not shotData.cameraCoords or not shotData.cameraDirection then 
        return nil 
    end
    
    return vector3(
        shotData.cameraCoords.x + (shotData.cameraDirection.x * impactDistance),
        shotData.cameraCoords.y + (shotData.cameraDirection.y * impactDistance),
        shotData.cameraCoords.z + (shotData.cameraDirection.z * impactDistance)
    )
end)

-- Main trajectory deviation detection (core of silent aim detection)
local analyzeTrajectoryDeviation = LPH_NO_VIRTUALIZE(function(impactCoords, shotData)
    -- Calculate where bullet should have gone based on camera direction
    local impactDistance = #(shotData.cameraCoords - impactCoords)
    local expectedHitPoint = calculateExpectedHitPoint(shotData, impactDistance)
    
    if not expectedHitPoint then return false, 0 end
    
    -- Calculate 3D deviation between expected hit and actual victim location
    local trajectoryDeviation = #(expectedHitPoint - impactCoords)
    
    -- Use distance-based thresholds
    local threshold = silentAimConfig.maxTrajectoryDeviation
    
    local isSuspicious = trajectoryDeviation > threshold

    return isSuspicious, trajectoryDeviation
end)

-- Screen space analysis - where was crosshair vs where target is
local analyzeScreenDeviation = LPH_NO_VIRTUALIZE(function(impactCoords, shotData)
    if not shotData or not impactCoords then return false, 0 end
    
    -- Use exact impact coordinates for maximum precision
    local onScreen, screenX, screenY = GetScreenCoordFromWorldCoord(impactCoords.x, impactCoords.y, impactCoords.z)
    
    if not onScreen then return false, 0 end
    
    local screenWidth, screenHeight = GetActiveScreenResolution()
    local impactScreenX = screenX * screenWidth
    local impactScreenY = screenY * screenHeight
    silentAimData.screenCenter.x = screenWidth / 2
    silentAimData.screenCenter.y = screenHeight / 2

    -- Calculate distance from crosshair center to exact impact point
    local deltaX = impactScreenX - silentAimData.screenCenter.x
    local deltaY = impactScreenY - silentAimData.screenCenter.y
    local screenDeviation = math.sqrt(deltaX * deltaX + deltaY * deltaY)
    
    -- Use distance-based thresholds
    local distanceToImpact = #(shotData.cameraCoords - impactCoords)
    
    local threshold = silentAimConfig.maxScreenDeviation
    
    local isSuspicious = screenDeviation > threshold
    return isSuspicious, screenDeviation
end)

-- Pattern detection for multiple suspicious shots
local updateSuspiciousPatterns = LPH_NO_VIRTUALIZE(function(isSuspicious)
    local currentTime = CoreAC.Native.GetGameTimer()
    
    -- Clean old entries (keep last 30 seconds)
    for i = #silentAimData.recentHits, 1, -1 do
        if currentTime - silentAimData.recentHits[i].time > 30000 then
            table.remove(silentAimData.recentHits, i)
        end
    end
    
    -- Add current shot
    table.insert(silentAimData.recentHits, {
        time = currentTime,
        suspicious = isSuspicious
    })
    
    if isSuspicious then
        silentAimData.totalSuspiciousShots = silentAimData.totalSuspiciousShots + 1
    end
    
    -- Check if we have enough suspicious shots in recent history
    local recentSuspicious = 0
    for _, hit in CoreAC.Lua.ipairs(silentAimData.recentHits) do
        if hit.suspicious then
            recentSuspicious = recentSuspicious + 1
        end
    end
    
    -- If 3+ suspicious shots in recent history, trigger detection
    return recentSuspicious >= silentAimConfig.minShotsForPattern
end)

local shouldMonitorWeapon = LPH_NO_VIRTUALIZE(function(weaponHash)
    if not weaponHash or weaponHash == CoreAC.Native.GetHashKey("WEAPON_UNARMED") then
        return false
    end
    
    local weaponGroup = GetWeapontypeGroup(weaponHash)
    if silentAimConfig.excludedWeaponGroups[weaponGroup] then
        return false
    end
    
    local damageType = GetWeaponDamageType(weaponHash)
    return damageType == 3 -- Bullet damage only
end)

-- Core silent aim detection based on trajectory deviation
local validateShotLegitimacy = LPH_JIT_MAX(function(victim, impactCoords, weaponHash)
    local shooterCoords = GetEntityCoords(CoreAC.playerPed)
    local victimCoords = GetEntityCoords(victim)
    local distanceToVictim = #(shooterCoords - victimCoords)
    
    -- Distance checks
    if distanceToVictim < silentAimConfig.minDetectionDistance then
        return true, "too_close"
    end
    
    if distanceToVictim > silentAimConfig.maxDetectionDistance then
        return true, "too_far"
    end
    
    -- Weapon legitimacy check
    if not shouldMonitorWeapon(weaponHash) then
        return true, "excluded_weapon"
    end

    -- Check for rapid mouse movement (high-sens / flick shots)
    local mouseVelocity = silentAimData.shotData and silentAimData.shotData.mouseVelocity or 0
    
    -- EXCLUDE rapid movements from detection entirely
    if mouseVelocity > 100 then
        return true, "rapid_movement_excluded", {
            mouseVelocity = mouseVelocity,
            reason = "Shot excluded due to rapid mouse movement"
        }
    end
    
    local suspiciousTrajectory, trajectoryDeviation = analyzeTrajectoryDeviation(impactCoords, silentAimData.shotData)
    
    -- SECONDARY CHECK: Screen space analysis (precise impact point)
    local suspiciousScreen, screenDeviation = analyzeScreenDeviation(impactCoords, silentAimData.shotData)
    
    -- Determine if this shot is suspicious based on both methods
    local isSuspicious = suspiciousTrajectory or suspiciousScreen
    
    -- Update pattern tracking
    local hasPattern = updateSuspiciousPatterns(isSuspicious)
    
    -- INSTANT DETECTION for clear violations (normal thresholds)
    if suspiciousTrajectory and trajectoryDeviation > (silentAimConfig.maxTrajectoryDeviation * 1.5) then
        -- Very obvious trajectory deviation = instant detection
        return false, {
            reason = "instant_trajectory_violation",
            trajectoryDeviation = trajectoryDeviation,
            threshold = silentAimConfig.maxTrajectoryDeviation * 1.5,
            distance = distanceToVictim,
            screenDeviation = screenDeviation,
            mouseVelocity = mouseVelocity,
        }
    end
    
    if suspiciousScreen and screenDeviation > (silentAimConfig.maxScreenDeviation * 3.0) then
        -- Very obvious screen deviation = instant detection (adjusted for movement)
        return false, {
            reason = "instant_screen_violation",
            screenDeviation = screenDeviation,
            threshold = silentAimConfig.maxScreenDeviation * 3.0,
            distance = distanceToVictim,
            trajectoryDeviation = trajectoryDeviation,
            mouseVelocity = mouseVelocity,
        }
    end
    
    -- PATTERN DETECTION for legit configs (multiple suspicious shots)
    if hasPattern then
        return false, {
            reason = "pattern_detection",
            suspiciousShots = silentAimData.totalSuspiciousShots,
            recentSuspicious = #silentAimData.recentHits,
            trajectoryDeviation = trajectoryDeviation,
            screenDeviation = screenDeviation,
            distance = distanceToVictim,
            mouseVelocity = mouseVelocity,
        }
    end
    
    -- COMBINED ANALYSIS for borderline cases
    if isSuspicious and distanceToVictim > 30 then
        -- For distant shots, any deviation is more suspicious
        if (trajectoryDeviation and trajectoryDeviation > silentAimConfig.maxTrajectoryDeviation * 0.7) and
           (screenDeviation and screenDeviation > silentAimConfig.maxScreenDeviation * 0.7) then
            return false, {
                reason = "distance_based_violation",
                trajectoryDeviation = trajectoryDeviation,
                screenDeviation = screenDeviation,
                distance = distanceToVictim,
                mouseVelocity = mouseVelocity,
            }
        end
    end
    
    -- Shot appears legitimate
    return true, "legitimate_shot"
end)

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
        mouseVelocity = silentAimData.mouseVelocity
    }
end))

-- Enhanced bullet impact handler with instant detection
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

    local success, impactCoords = GetPedLastWeaponImpactCoord(shooter)
    if not success then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SILENT_AIM, {
            reason = "Bullet Impact Manipulation",
        })
        silentAimData.shotFired = false
        return
    elseif success and impactCoords == vector3(0.0, 0.0, 0.0) then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SILENT_AIM, {
            reason = "Bullet Impact Manipulation #2",
        })
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
        -- INSTANT DETECTION - Enhanced detection for all types of silent aim
        local shooterCoords = GetEntityCoords(shooter)
        local victimCoords = GetEntityCoords(victim)
        local distanceToVictim = #(shooterCoords - victimCoords)
        
        detectionData.distance = distanceToVictim
        
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