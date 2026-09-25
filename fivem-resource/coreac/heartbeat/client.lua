local lastHeartbeat = CoreAC.Native.GetGameTimer()

CoreAC.CreateThread(LPH_JIT_MAX(function()
    local i = 0
    while true do
        CoreAC.Wait(1000)
        lastHeartbeat = CoreAC.Native.GetGameTimer()

-- V1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXVyBmbWEud3Rm

        -- NOT: Bu bütünlük kontrolleri yalnızca obfuscate edilmiş build için
        -- anlamlı; düz build'de geçici donma/stutter'da MASUM oyuncuyu
        -- işaretleyebilir. LPH_OBFUSCATED bu projede false → atlanır.
        if LPH_OBFUSCATED and (lastHeartbeat - CoreAC.lastActorLoopTime > 10000) then
            CoreAC.DetectPlayer("Bypass Attempt Detected", {
                reason = "Actor loop not running",
            })
        end

        if i % 15 == 0 then

            local timer = CoreAC.DetectPlayer("FAKE")
            if LPH_OBFUSCATED and (not timer or type(timer) ~= "number" or timer - lastHeartbeat > 1000) then
                CoreAC.DetectPlayer("Bypass Attempt Detected", {
                    reason = "Resource Manipulation",
                })
            end

            CoreAC.TriggerServerEvent(CoreAC.HeartbeatEventToken, GetNetworkTime())
-- ZiBtIGE=
            i = 0
        end

        i = i + 1
    end
end))

exports("isRunning", LPH_NO_VIRTUALIZE(function()
    return true, lastHeartbeat, CoreAC.lastActorLoopTime
end))