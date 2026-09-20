local checkNightVisions = LPH_JIT_MAX(function()
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
    if not CoreAC.Config.Main.AntiNightVisions then
        return
-- V1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXVyBmbWEud3Rm
    end

-- UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUCBpdHMgZm1h
    if not IsPedInAnyHeli(CoreAC.playerPed) and CoreAC.isGamePlayCamRendering then
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
        if GetUsingseethrough() then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NIGHT_VISIONS, {
                mode = "Thermal",
            })
            return
        elseif GetUsingnightvision() then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NIGHT_VISIONS)
            return
        end
    end
end)

CoreAC.RegisterDetection("nightVisions", checkNightVisions, 10000)-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B
