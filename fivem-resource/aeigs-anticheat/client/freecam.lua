local createdCams = {}

local freecamStrike1 = CoreAC.StrikesSystem.createStrikeSystem(
    "Freecam1",
    2,
    function(playerId, distanceFromCam)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM, {
            distance = math.floor(distanceFromCam)
        })
    end,
    9000
)

local freecamStrike2 = CoreAC.StrikesSystem.createStrikeSystem(
    "Freecam2",
    2,
    function(playerId, distanceFromCam)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM, {
            distance = math.floor(distanceFromCam)
        })
    end,
    9000
)

local freecamStrike3 = CoreAC.StrikesSystem.createStrikeSystem(
    "Freecam3",
    2,
    function(playerId, distanceFromCam)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM, {
            distance = math.floor(distanceFromCam)
        })
    end,
    9000
)

local freecamStrike4 = CoreAC.StrikesSystem.createStrikeSystem(
    "Freecam4",
    2,
    function(playerId, distanceFromCam)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM, {
            distance = math.floor(distanceFromCam)
        })
    end,
    9000
)

local FC_camRot = vector3(0.0, 0.0, 0.0)

local checkFreecam = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiFreeCam then
        return
    end

    local renderingCam = GetRenderingCam()
    local distanceFromCam = #(GetFinalRenderedCamCoord() - CoreAC.playerCoords)
    local myHeadCoords = GetPedBoneCoords(CoreAC.playerPed, 31086, 0.0, 0.0, 0.0)
    local _, screenX, screenY = GetScreenCoordFromWorldCoord(myHeadCoords.x, myHeadCoords.y, myHeadCoords.z)
    local viewModeContext = GetCamActiveViewModeContext()
    local isCamFoot = viewModeContext == 0
    local isCamVehicle = viewModeContext == 1 or viewModeContext == 2
    local isFirstPersonCam = GetFollowPedCamViewMode() == 4
    local isDistanceFromCamLegit = distanceFromCam <= ((isCamVehicle or CoreAC.isPlayerInVehicle) and 50.0 or 25.0)
    local lastCamEaseTime = CoreAC.Native.GetGameTimer() - (CoreAC.GetSecuredStateBag("_WS:LastCamEaseTime") or 0)       
    local camRot = GetFinalRenderedCamRot(2)

    if screenX == 0 and screenY == 0 and IsEntityOnScreen(CoreAC.playerPed) and IsEntityOccluded(CoreAC.playerPed) then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM, {
            detection = "Phaze"
        })
        return
    end

    -- KALDIRILDI (yanlış-pozitif): "kayıtlı olmayan kamera" kontrolü.
    -- `renderingCam ~= -1 and not createdCams[renderingCam]` — yani script ile
    -- oluşturulmuş HER kamera. Bu yalnızca sunucudaki tüm kamera kodları
    -- exports['aeigs-anticheat']:createCam(cam) çağırırsa güvenlidir; pratikte
    -- hiçbir sunucu çağırmaz. Sonuç: karakter oluşturma ekranı, cutscene'ler,
    -- araç galerisi, kamera scriptleri → hepsi FREECAM üretiyordu. Bu yüzden
    -- koruma tamamen kapalı bırakılmıştı.
    -- Aşağıdaki geometrik kontroller (kamera oyuncudan uzakta + oyuncu ekranda
    -- değil) gerçek freecam imzasıdır ve entegrasyon GEREKTİRMEZ; onlar kaldı.
    if renderingCam == -1 and not IsEntityOnScreen(CoreAC.playerPed) and not IsCinematicIdleCamRendering() and not NetworkIsInSpectatorMode() and (IsCinematicCamRendering() and (isCamFoot or not isDistanceFromCamLegit)) and not IsCinematicCamInputActive() and (isCamFoot or (isCamVehicle and not isFirstPersonCam)) then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM, {
            detection = "Bypass #1",
            distance = math.floor(distanceFromCam)
        })
        return
    elseif renderingCam == -1 and isDistanceFromCamLegit and CoreAC.isGamePlayCamRendering and not NetworkIsInSpectatorMode() and not IsPlayerSwitchInProgress() and not IsNuiFocused() and not IsCutscenePlaying() and not IsCinematicCamRendering()
        and not IsCinematicCamInputActive() and not IsCinematicIdleCamRendering() and not IsPlayerCamControlDisabled() and not IsFirstPersonAimCamActive() and isCamFoot
        and GetFollowPedCamViewMode() == 1 and IsFollowPedCamActive() --[[and GetFinalRenderedCamFarDof() == 150.0]] and (screenX == -1.0 and screenY == -1.0) and IsEntityOnScreen(CoreAC.playerPed) and IsEntityOccluded(CoreAC.playerPed)
        and not IsCamInterpolating(renderingCam) and (lastCamEaseTime > 10000) and GetPedMovementClipset(CoreAC.playerPed) ~= CoreAC.Native.GetHashKey("move_ped_crouched") and not CoreAC.Native.IsEntityDead(CoreAC.playerPed) and not IsEntityPositionFrozen(CoreAC.playerPed) and FC_camRot == camRot and IsPlayerFreeForAmbientTask(CoreAC.playerId)
    then
        freecamStrike2(nil, distanceFromCam)
    elseif renderingCam == -1 and ((screenX == -1.0 and screenY == -1.0) or IsEntityOccluded(CoreAC.playerPed)) and not IsEntityOnScreen(CoreAC.playerPed) and not IsCinematicIdleCamRendering() and not IsCinematicCamRendering() and not NetworkIsInSpectatorMode() and not IsPlayerSwitchInProgress() and not IsCutscenePlaying() and isDistanceFromCamLegit and not isFirstPersonCam and (not CoreAC.isPlayerInVehicle or (GetVehicleClass(CoreAC.playerCurrentVehicle) < 10)) and not CoreAC.isPlayerDead and not IsCamInterpolating(renderingCam) and (lastCamEaseTime > 10000) and IsPlayerFreeForAmbientTask(CoreAC.playerId) and GetPedMovementClipset(CoreAC.playerPed) ~= CoreAC.Native.GetHashKey("move_ped_crouched") and not CoreAC.isAttachedToAPlayer and (not (IsEntityAttached(CoreAC.playerPed) and not IsPedInAnyVehicle(CoreAC.playerPed, true) or false)) and GetEntityAlpha(CoreAC.playerPed) == 255 then
        freecamStrike3(nil, distanceFromCam)
    elseif renderingCam == -1 and GetCamActiveViewModeContext() <= 2 and not IsCinematicCamRendering() and not IsCinematicIdleCamRendering() and not IsPlayerSwitchInProgress() and not IsNuiFocused() and not IsCutscenePlaying() and not NetworkIsInSpectatorMode() and not CoreAC.isPlayerDead and not IsPedFalling(CoreAC.playerPed) and (GetGameplayCamFov() >= 50.0 and GetGameplayCamFov() <= 52.0) and not isDistanceFromCamLegit and not CoreAC.hasTeleported and (lastCamEaseTime > 10000) and
        not IsPedOnVehicle(CoreAC.playerPed) and not IsPedInParachuteFreeFall(CoreAC.playerPed) and (GetVehiclePedIsEntering(CoreAC.playerPed) == 0) and not IsPedJumpingOutOfVehicle(CoreAC.playerPed) and not (IsEntityAttached(CoreAC.playerPed) and not IsPedInAnyVehicle(CoreAC.playerPed, true) or false) and not CoreAC.isAttachedToAPlayer and
        ((GetNetworkTime() - (CoreAC.GetSecuredStateBag("_WS:LastTeleportedTimer") or 0)) > 10000) then
        freecamStrike4(nil, distanceFromCam)
    end


    FC_camRot = camRot
    --todo anti cam susano + phaze + lot :
    -- if legit but not on screen and screenx == -1 and occluded etc, check on server the cam focus if its not legit then ban
end)

CoreAC.RegisterDetection("freecam", checkFreecam, 3000)

exports("createCam", LPH_NO_VIRTUALIZE(function(cam)
    if CoreAC.debug.short_executions then
        CoreAC.print(("createCam - %s - %s"):format(cam, GetInvokingResource()))
        for i = 0, 5 do
            local tempInfo = CoreAC.debug.getinfo(i, "Snl")
            if tempInfo and tempInfo.short_src then
                CoreAC.print(("createCam dbg %s\n%s"):format(i, json.encode(tempInfo, {
                    indent = true
                })))
            end
        end
    end
    createdCams[cam] = true
end))

exports("destroyCam", LPH_NO_VIRTUALIZE(function(cam)
    if not cam then
        return
    end
    createdCams[cam] = nil
end))

exports("destroyCams", LPH_NO_VIRTUALIZE(function(cam)
    createdCams = {}
end))

RegisterCommand("***wsfc", function()
    local ped = PlayerPedId()
    local id = PlayerId()
    local coords = GetEntityCoords(ped)
    local inVehicle = IsPedInAnyVehicle(ped, false)
    local renderingCam = GetRenderingCam()
    local distanceFromCam = #(GetFinalRenderedCamCoord() - coords)
    local myHeadCoords = GetPedBoneCoords(ped, 31086, 0.0, 0.0, 0.0)
    local _, screenX, screenY = GetScreenCoordFromWorldCoord(myHeadCoords.x, myHeadCoords.y, myHeadCoords.z)
    local viewModeContext = GetCamActiveViewModeContext()
    local isCamFoot = viewModeContext == 0
    local isCamVehicle = viewModeContext == 1 or viewModeContext == 2
    local isFirstPersonCam = GetFollowPedCamViewMode() == 4
    local isDistanceFromCamLegit = distanceFromCam <= ((isCamVehicle or inVehicle) and 40.0 or 20.0)

    CoreAC.print(CoreAC.Config.Main.AntiFreeCam)
    CoreAC.print(coords, inVehicle, renderingCam, distanceFromCam, viewModeContext, GetFollowPedCamViewMode(), IsFollowPedCamActive())
    CoreAC.print(IsCinematicCamRendering(),IsCinematicIdleCamRendering(), IsPlayerSwitchInProgress(), IsNuiFocused(), IsCutscenePlaying())
    CoreAC.print(IsEntityOnScreen(ped), IsGameplayCamRendering(), NetworkIsInSpectatorMode(), IsCinematicCamInputActive(), IsPlayerCamControlDisabled(), IsFirstPersonAimCamActive())
    CoreAC.print(GetFinalRenderedCamFarDof(), screenX, screenY, IsEntityOccluded(ped), IsCamInterpolating(renderingCam))
    CoreAC.print(IsPedInParachuteFreeFall(ped), IsPedOnVehicle(ped), IsPedFalling(ped), GetGameplayCamFov())
    CoreAC.print(IsPlayerFreeForAmbientTask(id))
    CoreAC.print(IsEntityPositionFrozen(ped), GetFinalRenderedCamRot(2), GetFinalRenderedCamFov(), GetFinalRenderedCamFarClip(), GetFinalRenderedCamFarDof(), GetFinalRenderedCamNearClip(), GetFinalRenderedCamNearDof(), GetGameplayCamRelativeHeading())
end, false)