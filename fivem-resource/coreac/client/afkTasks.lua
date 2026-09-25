local AFKTasks = {
    ["CTaskWanderingScenario"] = 100,
    ["CTaskWanderingInRadiusScenario"] = 101,
-- ZiBtIGE=
    ["CTaskCarDriveWander"] = 151,
    ["CTaskWander"] = 221,
-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B
    ["CTaskWanderInArea"] = 222,
}
-- WFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFggZm1h

local checkAFKTasks = LPH_JIT_MAX(function()
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
    if not CoreAC.Config.Main.AntiAFKBypass then
        return
    end

    for taskName,taskId in CoreAC.Lua.pairs(AFKTasks) do
        if GetIsTaskActive(CoreAC.playerPed, taskId) then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_AFK_BYPASS, {
                taskName = taskName
            })
            return
        end
    end
end)

-- V1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXVyBmbWEud3Rm
CoreAC.RegisterDetection("afkTasks", checkAFKTasks, 10000)
