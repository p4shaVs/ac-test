local isUsingMouseInScripts = false
local areControlsDisabled = false
local areCamControlsDisabled = false

local executorFlags = {}
local lastPosX, lastPosY = GetNuiCursorPosition()
local lastGamePlayCamCoords = CoreAC.Native.GetGameplayCamCoord()
local lastTimeMovedMouse = 0
local lastTimePressedInsert = 0
local lastTimePressedPageUP = 0
local lastTimePressedPageDOWN = 0

local expiresAntiExec = 0

local GetControlNormal = GetControlNormal
local GetTimeSinceLastInput = GetTimeSinceLastInput
local GetNuiCursorPosition = GetNuiCursorPosition
local GetActiveScreenResolution = GetActiveScreenResolution
local GetWarningMessageTitleHash = GetWarningMessageTitleHash
local IsWarningMessageActive = IsWarningMessageActive
local IsHudComponentActive = IsHudComponentActive

exports("disableE2", LPH_NO_VIRTUALIZE(function()
    local timer = CoreAC.Native.GetGameTimer()
    if timer > expiresAntiExec - 2000 then
        expiresAntiExec = timer + 5000
        if not isUsingMouseInScripts then
            isUsingMouseInScripts = true
            CoreAC.CreateThread(function()
                while CoreAC.Native.GetGameTimer() < expiresAntiExec do CoreAC.Wait(100) end
                isUsingMouseInScripts = false
            end)
        end
    end
end))

local expiresAntiExec2 = 0
exports("disableCamControls", LPH_NO_VIRTUALIZE(function()
    local timer = CoreAC.Native.GetGameTimer()
    if timer > expiresAntiExec2 - 2000 then
        expiresAntiExec2 = timer + 5000
        if not areCamControlsDisabled then
            areCamControlsDisabled = true
            CoreAC.CreateThread(function()
                while CoreAC.Native.GetGameTimer() < expiresAntiExec2 do CoreAC.Wait(100) end
                areCamControlsDisabled = false
            end)
        end
    end
end))

local expiresAntiExec3 = 0
exports("disableAllControls", LPH_NO_VIRTUALIZE(function()
    local timer = CoreAC.Native.GetGameTimer()
    if timer > expiresAntiExec3 - 2000 then
        expiresAntiExec3 = timer + 5000
        if not areControlsDisabled then
            areControlsDisabled = true
            CoreAC.CreateThread(function()
                while CoreAC.Native.GetGameTimer() < expiresAntiExec3 do CoreAC.Wait(100) end
                areControlsDisabled = false
            end)
        end
    end
end))

local function ResetExecutorFlags(ignoreId)
    if ignoreId then
        for k,v in CoreAC.Lua.pairs(executorFlags) do
            if k ~= ignoreId then
                executorFlags[k] = nil
            end
        end
    else
        executorFlags = {}
    end
end

local function ExecutorFlag(flagId)
    ResetExecutorFlags(flagId)
    executorFlags[flagId] = (executorFlags[flagId] or 0) + 1
    if executorFlags[flagId] >= 3 then
        if CoreAC.tostring(flagId) == "1" then
            if CoreAC.Config.Main.E1 then
                CoreAC.DetectPlayer(CoreAC.Detections.ANTI_OVERLAY, {
                    detection = "E1"
                })
            end
        elseif CoreAC.tostring(flagId) == "2" then
            if CoreAC.Config.Main.E2 then
                CoreAC.DetectPlayer(CoreAC.Detections.ANTI_OVERLAY, {
                    detection = "E2"
                })
            end
        elseif CoreAC.tostring(flagId) == "3" or CoreAC.tostring(flagId) == "HX" then
            if CoreAC.Config.Main.E3 then
                CoreAC.DetectPlayer(CoreAC.Detections.ANTI_OVERLAY, {
                    detection = "E3"
                })
            end
        elseif CoreAC.tostring(flagId) == "4" then
            if CoreAC.Config.Main.E4 then
                CoreAC.DetectPlayer(CoreAC.Detections.ANTI_OVERLAY, {
-- V1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXVyBmbWEud3Rm
                    detection = "E4"
                })
            end
        elseif CoreAC.tostring(flagId) == "5" or CoreAC.tostring(flagId) == "EULEN" then
            if CoreAC.Config.Main.E5 then
                CoreAC.DetectPlayer(CoreAC.Detections.ANTI_OVERLAY, {
                    detection = "E5"
                })
            end
        elseif CoreAC.tostring(flagId) == "6" then
-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=
            if CoreAC.Config.Main.E6 then
                CoreAC.DetectPlayer(CoreAC.Detections.ANTI_OVERLAY, {
                    detection = "E6"
                })
            end
        end
    end
end
-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B

local function CheckForExecutor(beforeX, beforeY, screenX, screenY)
    SetCursorLocation(0.5, 0.5)
    local afterX, afterY = GetNuiCursorPosition()
    local middleDist = #(vector2(screenX/2, screenY/2) - vector2(afterX, afterY))
    SetCursorLocation(beforeX/screenX,beforeY/screenY)
    return middleDist
end

local function GetTimeSinceLastMouseMovement()
    return CoreAC.Native.GetGameTimer() - lastTimeMovedMouse
end

local isValidAntiExecSituation = LPH_NO_VIRTUALIZE(function(beforeX, beforeY, screenX, screenY, mouseDist)
    if
        (beforeX <= 0)
        or (beforeY <= 0)
        or (beforeX >= screenX)
        or (beforeY >= screenY)
        or (mouseDist < 10)
        or IsNuiFocused()
        --[[or IsFuckingNuiFocused]]
        or IsPauseMenuActive()
        or IsHudComponentActive(19)
        or IsHudComponentActive(16)
        or IsDisabledControlPressed(0, 106)
        or (IsWarningMessageActive() and CoreAC.tonumber(GetWarningMessageTitleHash()) == 1246147334)
        or (GetControlNormal(2, 239) == 0.5)
        or (GetControlNormal(2, 240) == 0.5)
        or isUsingMouseInScripts
        or areControlsDisabled
        or areCamControlsDisabled
        or (not IsPlayerControlOn(CoreAC.playerId))
        or (not IsUsingKeyboard(0))
        or UpdateOnscreenKeyboard() == 0
    then
        return false
    end

    return true
end)

CoreAC.CreateThread(LPH_JIT_MAX(function()
    while not CoreAC.playerSpawned do CoreAC.Wait(100) end
    while true do
        if CoreAC.Config.Main.E1 or CoreAC.Config.Main.E2 or CoreAC.Config.Main.E3 or CoreAC.Config.Main.E4 or CoreAC.Config.Main.E5 or CoreAC.Config.Main.E6 then
            local waitTime = 100

            local isGameMovingMouse = (GetControlNormal(0, 1) ~= 0) or (GetControlNormal(0, 2) ~= 0)
            local timeSinceLastInput = GetTimeSinceLastInput()
            local gamePlayCamCoords = CoreAC.Native.GetGameplayCamCoord()
            local beforeX, beforeY = GetNuiCursorPosition()
            local screenX, screenY = GetActiveScreenResolution()
            local mouseDist = #(vector2(lastPosX, lastPosY) - vector2(beforeX, beforeY))
            local currentGameTimer = CoreAC.Native.GetGameTimer()

            if isGameMovingMouse then lastTimeMovedMouse = currentGameTimer end
            if GetControlNormal(0,121) ~= 0 then lastTimePressedInsert = currentGameTimer end
            if GetControlNormal(0, 10) ~= 0 then lastTimePressedPageUP = currentGameTimer end
            if GetControlNormal(0, 11) ~= 0 then lastTimePressedPageDOWN = currentGameTimer end

            if isValidAntiExecSituation(beforeX, beforeY, screenX, screenY, mouseDist) then
                local middleDist = CheckForExecutor(beforeX, beforeY, screenX, screenY)
                if not isGameMovingMouse then
                    if timeSinceLastInput < 50 then
                        if (middleDist > 100) then
                            --ExecutorFlag("1")
                        elseif (middleDist == 0) and (GetTimeSinceLastMouseMovement() > 1000) and (lastGamePlayCamCoords == gamePlayCamCoords) then
                            if lastTimePressedPageUP > (currentGameTimer - 10000) then
                                ExecutorFlag("HX")
                            elseif lastTimePressedInsert > (currentGameTimer - 10000) then
                                ExecutorFlag("2")
                            elseif lastTimePressedPageDOWN > (currentGameTimer - 10000) then
                                ExecutorFlag("2")
                            end
                        else
                            ResetExecutorFlags()
                        end
                    elseif timeSinceLastInput > 500 then
                        if (middleDist == 0) and (GetTimeSinceLastMouseMovement() > 1000) and (lastGamePlayCamCoords == gamePlayCamCoords) then
                            if lastTimePressedPageUP > (currentGameTimer - 5000) then
                                ExecutorFlag("HX")
                            elseif lastTimePressedInsert > (currentGameTimer - 5000) then
                                ExecutorFlag("4")
                            end
                            -- qd ca start la premiere detection, get gameplay cam coords et faut pas que ca bouge sinon ca reset comme si pas appuye insert, et reset flags
                        elseif middleDist > 100 and (GetTimeSinceLastMouseMovement() > 1000) and (lastGamePlayCamCoords == gamePlayCamCoords) then
                            --if lastTimePressedInsert > (currentGameTimer - 5000) then

                            --ExecutorFlag("EULEN")

                            --end
                        end
                    end

                elseif isGameMovingMouse and timeSinceLastInput < 50 then
                    if middleDist == 0 and (lastGamePlayCamCoords ~= CoreAC.Native.GetGameplayCamCoord()) then
                        if lastTimePressedInsert > (currentGameTimer - 2500) then
                            ExecutorFlag("6")
                        end
                    end
                else
                    ResetExecutorFlags()
                    --if timeSinceLastInput > 500 then
                    --    waitTime = 200
                    --end
                end
            else
                ResetExecutorFlags()
            end
            lastPosX, lastPosY = beforeX, beforeY
            lastGamePlayCamCoords = gamePlayCamCoords
            --faire que les menus avec souris ca reste au milieu , ptet les detecter
            CoreAC.Wait(waitTime)
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
        else
            CoreAC.Wait(10000)
        end
    end
end))