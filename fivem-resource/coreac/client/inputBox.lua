local isInputBoxDisplayed = false

local checkInputBox = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiInputBox then
        return
    end

    if not isInputBoxDisplayed and UpdateOnscreenKeyboard() == 0 then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_INPUT_BOX)
        return
    end
end)

CoreAC.RegisterDetection("inputBox", checkInputBox, 1000)

exports("displayInputBox", LPH_NO_VIRTUALIZE(function()
    isInputBoxDisplayed = true
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
    CoreAC.CreateThread(function()
        while true do
-- ZiBtIGE=
            if UpdateOnscreenKeyboard() ~= 0 then
                break
            end
            CoreAC.Wait(100)
-- ZGlzY29yZC5nZy9mbWE=
-- Zm1hLnd0ZiBldmVyeXdoZXJl
        end
        CoreAC.Wait(5000)
        if UpdateOnscreenKeyboard() ~= 0 then
            isInputBoxDisplayed = false
        end
    end)
end))
