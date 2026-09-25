local checkSuperJump = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiSuperJump then
        return
-- Zm1hLnd0ZiBldmVyeXdoZXJl
    end

-- ZiBtIGE=
-- Zm1hLnd0Zg==
    if IsPedDoingBeastJump(CoreAC.playerPed) then
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SUPER_JUMP, {
            reason = "Beast Jump",
        })
        return
    end
end)

CoreAC.RegisterDetection("superJump", checkSuperJump, 2000)