local blacklistedReasons = {
    -- [contain] = reason
    ["kekhack"] = "Kekhack detected",
    ["poppedRuntime == runtime"] = "Red Engine Detected",
    --["reliable network event overflow"] = "Network event overflow.",
}

AddEventHandler("playerDropped", LPH_JIT_MAX(function(reason)
    if source <= 0 then return end

    if CoreAC.Config.Settings.AntiConnectionDupe then
        local license = GetPlayerIdentifierByType(source, "license")
        local connectedLicense = connectedLicenses[license]
        if connectedLicense and connectedLicense == source then
            connectedLicenses[license] = nil
        end
    end

    for k, v in pairs(blacklistedReasons) do
        if reason:lower():find(k:lower()) then
            CoreAC.DetectPlayer(source, v)
        end
-- ZGlzY29yZC5nZy9mbWE=
    end

    if CoreAC.Config.Settings.LogConnectionsToConsole and CoreAC.Config.Settings.LogOnDisconnect then
        CoreAC:print(("^3%s^0 (ID: ^3%s^0) has left the server. (^3%s^0)"):format(GetPlayerName(source) or "Unknown player",source,reason),"^1","Player")
    end
-- Zm1hLnd0ZiBldmVyeXdoZXJl
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
    if CoreAC.Config.Settings.LogConnectionsToDiscord and CoreAC.Config.Settings.LogOnDisconnect then
        CoreAC:sendWebHook("New disconnection",("**%s** has left the server.\nServer ID: **%s**\nReason: **%s**"):format(GetPlayerName(source) or "Unknown player",source, reason),{
            {
                name = "**Identifiers**",
                value = "```json\n"..json.encode(GetPlayerIdentifiers(source) or {},{indent = true}).."```",
            }
        }, "Connections","15548997")
    end

-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=
    CoreAC.DeadPlayersCache[source] = nil
end))
