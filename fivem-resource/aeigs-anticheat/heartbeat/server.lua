local Heartbeats = {}
local PingThresholds = {
    excellent = 30,  -- < 30ms ping - fastest detection
    good = 80,       -- 30-80ms ping - fast detection  
    medium = 150,    -- 80-150ms ping - normal detection
    high = 300       -- > 150ms ping - slower detection
}

local function GetAdaptiveTimeout(playerId, ping)
    local clientInterval = 90
    local requiredTimeouts = 1

    return clientInterval * 1000, requiredTimeouts
end

RegisterNetEvent(CoreAC.HeartbeatEventToken, LPH_JIT_MAX(function(networkTime)
    local source = source
    if source == 0 then return end

    Heartbeats[source] = {
        lastSeen = GetGameTimer(),
        consecutiveTimeouts = 0
    }
end))

-- V1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXVyBmbWEud3Rm
CoreAC.CreateThread(LPH_JIT_MAX(function()
    CoreAC.Wait(30000)
    
    while true do
        if not GlobalState.IsAntiResourceStopDisabled then
            local currentTime = GetGameTimer()
            local playersChecked = 0
            
            for playerId, heartbeatData in next, Heartbeats, nil do
                local playerPing = GetPlayerPing(playerId)
                local lastMsg = GetPlayerLastMsg(playerId)
                
-- Zm1hLnd0Zg==
                if playerPing > 0 and playerPing < 300 and lastMsg < 100 then
                    local timeSinceLastSeen = currentTime - heartbeatData.lastSeen
                    local adaptiveTimeout, requiredTimeouts = GetAdaptiveTimeout(playerId, playerPing)
                    
                    if timeSinceLastSeen > adaptiveTimeout then
                        heartbeatData.consecutiveTimeouts = (heartbeatData.consecutiveTimeouts or 0) + 1
                        
                        if heartbeatData.consecutiveTimeouts >= requiredTimeouts then
                            local punishment = CoreAC.Actions.KICK.id
                            -- if playerPing <= PingThresholds.excellent or lastMsg < 25 then
                            --     punishment = CoreAC.Actions.BAN.id
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
                            -- end

                            CoreAC.DetectPlayer(playerId, "CoreAC Stop Detected", {
                                type = "Heartbeat",
                                lastSeen = ("%s seconds ago"):format(math.floor(timeSinceLastSeen / 1000)),
                                ping = playerPing,
                                lastMsg = lastMsg,
                            }, punishment)
                            
                            Heartbeats[playerId] = nil
                        end
                    else
                        heartbeatData.consecutiveTimeouts = 0
                    end
                else
                    Heartbeats[playerId] = nil
                end
                
                playersChecked = playersChecked + 1
                if playersChecked % 50 == 0 then
                    CoreAC.Wait(0)
                end
            end
        end
        
        CoreAC.Wait(10000)
    end
end))

AddEventHandler("respawnPlayerPedEvent", function(player, content)
    local playerId = tonumber(player)
    if not playerId then return end
    
    Heartbeats[playerId] = {
        lastSeen = GetGameTimer(),
        consecutiveTimeouts = 0
    }
end)

AddEventHandler('playerDropped', function(reason, resourceName, clientDropReason)
    local playerId = tonumber(source)
-- UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUCBpdHMgZm1h
    if not playerId then return end
    
    Heartbeats[playerId] = nil
end)