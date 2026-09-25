local createdCams = {}

local freecamStrike1 = CoreAC.StrikesSystem.createStrikeSystem(
    "Freecam1",
    2,
    function(playerId, distanceFromCam)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM_WEAK, {
            distance = math.floor(distanceFromCam)
        })
    end,
    9000
)

local freecamStrike2 = CoreAC.StrikesSystem.createStrikeSystem(
    "Freecam2",
    2,
    function(playerId, distanceFromCam)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM_WEAK, {
            distance = math.floor(distanceFromCam)
        })
    end,
    9000
)

local freecamStrike3 = CoreAC.StrikesSystem.createStrikeSystem(
    "Freecam3",
    2,
    function(playerId, distanceFromCam)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM_WEAK, {
            distance = math.floor(distanceFromCam)
        })
    end,
    9000
)

local freecamStrike4 = CoreAC.StrikesSystem.createStrikeSystem(
    "Freecam4",
    2,
    function(playerId, distanceFromCam)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM_WEAK, {
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
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM_WEAK, {
            detection = "Phaze"
        })
        return
    end

    -- KALDIRILDI (yanlış-pozitif): "kayıtlı olmayan kamera" kontrolü.
    -- `renderingCam ~= -1 and not createdCams[renderingCam]` — yani script ile
    -- oluşturulmuş HER kamera. Bu yalnızca sunucudaki tüm kamera kodları
    -- exports['coreac']:createCam(cam) çağırırsa güvenlidir; pratikte
    -- hiçbir sunucu çağırmaz. Sonuç: karakter oluşturma ekranı, cutscene'ler,
    -- araç galerisi, kamera scriptleri → hepsi FREECAM üretiyordu. Bu yüzden
    -- koruma tamamen kapalı bırakılmıştı.
    -- Aşağıdaki geometrik kontroller (kamera oyuncudan uzakta + oyuncu ekranda
    -- değil) gerçek freecam imzasıdır ve entegrasyon GEREKTİRMEZ; onlar kaldı.
    if renderingCam == -1 and not IsEntityOnScreen(CoreAC.playerPed) and not IsCinematicIdleCamRendering() and not NetworkIsInSpectatorMode() and (IsCinematicCamRendering() and (isCamFoot or not isDistanceFromCamLegit)) and not IsCinematicCamInputActive() and (isCamFoot or (isCamVehicle and not isFirstPersonCam)) then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM_WEAK, {
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

-- ---------------------------------------------------------------------------
-- FREECAM — "Script Cam" (asıl tespit, FREECAM tipi)
--
-- Menü freecam'lerinin neredeyse hepsi bir SCRIPT KAMERASI açıp onu WASD ile
-- uçurur. Yukarıdaki eski kontrollerin tamamı yalnızca script kamerası YOKKEN
-- (renderingCam == -1) çalıştığı için bu en yaygın freecam türü hiç
-- yakalanmıyordu.
--
-- Meşru script kameraları (karakter oluşturma, spawn seçimi, kıyafet/araç
-- galerisi, cutscene, ev dekorasyonu) ya oyuncu kontrolünü kapatır ya NUI
-- odağı açar ya da oyuncunun yakınında kalır. Bu yüzden:
--   * kamera oyuncudan SC_DIST (80 m) uzakta,
--   * oyuncu kontrolü AÇIK, NUI odağı / duraklatma menüsü YOK,
--   * cutscene / player switch / izleme modu / ekran kararması / txAdmin aracı
--     / ölü-yaralı DEĞİL,
--   * art arda SC_SAMPLES ölçüm (~6 sn) sürmeli.
-- Not: sunucunda "drone" gibi uzaktan kamera scripti varsa Actions'ta FreeCam'i
-- Log'a çek.
-- ---------------------------------------------------------------------------
local SC_DIST    = 80.0
local SC_SAMPLES = 3
local scStreak   = 0

local checkScriptCam = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiFreeCam then return end
    local cam = GetRenderingCam()
    if cam == -1 then scStreak = 0 return end

    local ped = PlayerPedId()
    local dist = #(GetFinalRenderedCamCoord() - GetEntityCoords(ped))
    local legit = IsNuiFocused()
        or IsPauseMenuActive()
        or not IsPlayerControlOn(PlayerId())
        or IsCutscenePlaying()
        or IsPlayerSwitchInProgress()
        or NetworkIsInSpectatorMode()
        or CoreAC.isSpectating
        or CoreAC.isPlayerDead
        or (CAC.spectateGrace and CAC.spectateGrace())
        or (CAC.fadeRecent and CAC.fadeRecent(5000))
        or (CAC.adminTool ~= nil)
        or (CAC.isDowned and CAC.isDowned())

    if dist > SC_DIST and not legit then
        scStreak = scStreak + 1
        if scStreak >= SC_SAMPLES then
            scStreak = 0
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_FREE_CAM, {
                detection = "Script Cam",
                distance = math.floor(dist),
            })
        end
    else
        scStreak = 0
    end
end)

CoreAC.RegisterDetection("freecamScript", checkScriptCam, 2000)

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

-- (Geliştirici hata ayıklama komutu kaldırıldı: herhangi bir oyuncu F8'den
-- çalıştırıp tespit iç ayrıntılarını görebiliyordu — hile yazarlarına bilgi sızıntısı.)