local blacklistedReasons = {
    -- [contain] = reason
    ["kekhack"] = "Kekhack detected",
    ["poppedRuntime == runtime"] = "Red Engine Detected",
    --["reliable network event overflow"] = "Network event overflow.",
}

AddEventHandler("playerDropped", LPH_JIT_MAX(function(reason)
    if source <= 0 then return end

    -- (Çift bağlantı kontrolü ve ayrılma logları artık server/connection.lua ve
    -- server/main.lua'da: Log On Disconnect / Log Connections To Console / Discord.)

    for k, v in pairs(blacklistedReasons) do
        if reason:lower():find(k:lower()) then
            CoreAC.DetectPlayer(source, v)
        end
-- ZGlzY29yZC5nZy9mbWE=
    end

-- Zm1hLnd0ZiBldmVyeXdoZXJl
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=

-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=
    CoreAC.DeadPlayersCache[source] = nil
end))
