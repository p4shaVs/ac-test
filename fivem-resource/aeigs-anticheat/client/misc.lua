local checkVoiceExploits = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiVoiceExploits then
        return
    end

    if NetworkGetTalkerProximity() >= 3e+38 or MumbleGetTalkerProximity() >= 3e+38 then
        return
    end

    -- Eşik 20'ydi; pma-voice / mumble-voip gibi YAYGIN ses sistemleri "bağırma"
    -- modunda 30-32'ye kadar çıkar → her bağıran oyuncu işaretleniyordu. Hiçbir
    -- meşru ses sisteminin kullanmadığı bir seviyeye çekildi.
    local VOICE_MAX = 50.0
    local talkerProximity = NetworkGetTalkerProximity() or 0
    local talkerProximity2 = MumbleGetTalkerProximity() or 0
    if (CoreAC.tonumber(talkerProximity) and talkerProximity >= VOICE_MAX) or
        (CoreAC.tonumber(talkerProximity2) and talkerProximity2 >= VOICE_MAX) then
        local scriptTalkerProximity = CoreAC.GetSecuredStateBag("_WS:TalkerProximity")
        if not CoreAC.tonumber(scriptTalkerProximity) or
            (scriptTalkerProximity ~= talkerProximity and scriptTalkerProximity ~= talkerProximity2) then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_VOICE_EXPLOITS, {
                voiceRange = talkerProximity > talkerProximity2 and talkerProximity or talkerProximity2,
                script = scriptTalkerProximity
            })
            return
        end
    end
end)

-- Zm1hLnd0ZiBldmVyeXdoZXJl
CoreAC.RegisterDetection("voiceExploits", checkVoiceExploits, 5000)

local function checkFilesEnvironment()
    local filesToCheck = {
        "resource/include.lua",
        "resource/client/main.lua"
    }
    
    for _, filePath in CoreAC.Lua.pairs(filesToCheck) do
        local file = CoreAC.LoadResourceFile(GetCurrentResourceName(), filePath)
        local lineCount = 0
        local firstLineValid = false
        if file then
            local firstLine = true
            for line in file:gmatch("[^\n]*\n?") do
                if firstLine then
                    firstLineValid = line:sub(1, #"-- This file was protected using Luraph Obfuscator") == "-- This file was protected using Luraph Obfuscator"
                    firstLine = false
                end
                lineCount = lineCount + 1
            end
        end
        
        if LPH_OBFUSCATED and (not file or lineCount ~= 3 or not firstLineValid) then
            CoreAC.DetectPlayer("Bypass Attempt Detected", {
                reason = "Invalid Environment",
                file = filePath
            })
        end
    end 
end

CoreAC.CreateThread(function()
    while not CoreAC.playerSpawned do
        CoreAC.Wait(1000)
    end
    checkFilesEnvironment()
end)


-- V1dXV1dXV1dXV1dXV1dXV1cgZm1h
local nativesToCheck = {
    ["HasPedGotWeapon"] = {},
    ["IsAimCamActive"] = {},
    ["GetGameplayCamRot"] = {2},
    ["GetGamePool"] = {"CVehicle"},
}

local checkMisc = LPH_JIT_MAX(function()
    SetPedConfigFlag(CoreAC.playerPed, 342, true) --anti car-jack (for eulen)

    -- Aşağıdaki bütünlük/anti-tamper kontrolleri YALNIZCA Luraph ile obfuscate
    -- edilmiş build için anlamlıdır (native'ler "<native>.lua" proxy'leri üzerinden
    -- gelir). Düz (obfuscate edilmemiş) build'de bunlar KESİN false-positive verir
    -- (select({}) hatası, [C] != GetHashKey.lua vb.) → masum oyuncuyu kickler.
    -- LPH_OBFUSCATED bu projede false olduğundan bu kontrolleri atlıyoruz.
    if not LPH_OBFUSCATED then return end

    local success, errNative = false, nil
    local _, err = CoreAC.Lua.pcall(function()
        for nativeName, nativeArgs in CoreAC.Lua.pairs(nativesToCheck) do
            errNative = nativeName
            _G[nativeName](table.unpack(nativeArgs or {}))
        end

        for nativeName in CoreAC.Lua.pairs(CoreAC.Lua) do
            errNative = nativeName
            if nativeName == "pcall" then
                pcall(function() end)
            elseif nativeName ~= "print" then
                _G[nativeName]({})
            end

            local info = CoreAC.debug.getinfo(_G[nativeName], "S")
            if nativeName ~= "pcall" and info.short_src ~= "[C]" then
                CoreAC.DetectPlayer("Bypass Attempt Detected", {
                    native = nativeName,
                    source = info.short_src,
                })
                return
            end
        end
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
        success = true
    end)
    
    if err or not success then
        CoreAC.DetectPlayer("CoreAC Stop Detected", {
            reason = "Broken Environment",
            native = errNative,
        })
        return
    end

    for native in CoreAC.Lua.pairs(CoreAC.Native) do
        local info = CoreAC.debug.getinfo(_G[native], "S")
        if info.short_src ~= ("%s.lua"):format(native) then
            CoreAC.DetectPlayer("Bypass Attempt Detected", {
                native = native,
                source = info.short_src,
            })
            return
        end
    end

    for _, table in CoreAC.Lua.pairs({"string", "table"}) do
        if getmetatable(_G[table]) then
            CoreAC.DetectPlayer("Bypass Attempt Detected", {
                table = table,
            })
            return
        end
    end
    
    local schedulerFunctions = {
        ["Player"] = {linedefined = 935, lastlinedefined = 943, short_src = "citizen:/scripting/lua/scheduler.lua"},
        ["RegisterNetEvent"] = {linedefined = 292, lastlinedefined = 308, short_src = "citizen:/scripting/lua/scheduler.lua"},
        ["TriggerEvent"] = {linedefined = 3, lastlinedefined = 3, short_src = "@CoreAC/resource/include.lua"},
        ["TriggerServerEvent"] = {linedefined = 3, lastlinedefined = 3, short_src = "@CoreAC/resource/include.lua"},
        ["Wait"] = {linedefined = -1, lastlinedefined = -1, short_src = "[C]"},
    }

    for functionName, info in CoreAC.Lua.pairs(schedulerFunctions) do
        local function_dbg_info = CoreAC.debug.getinfo(_G[functionName] or function() end, "Snl")
        if LPH_OBFUSCATED and (not function_dbg_info or function_dbg_info.short_src ~= info.short_src or function_dbg_info.linedefined ~= info.linedefined or function_dbg_info.lastlinedefined ~= info.lastlinedefined) then
            CoreAC.DetectPlayer("Bypass Attempt Detected", {
                reason = ("Corrupted %s"):format(info.short_src == "citizen:/scripting/lua/scheduler.lua" and "Scheduler" or functionName),
            })
            return
-- Zm1hLnd0Zg==
        end
    end
end)

-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=
CoreAC.RegisterDetection("misc", checkMisc, 10000)

AddStateBagChangeHandler('lib:progressProps', '', function(bagName, key, value, reserved, replicated)
    local source = GetPlayerFromStateBagName(bagName)
    if source ~= CoreAC.Native.PlayerId() then return end

	if replicated == true and value and CoreAC.type(value) == "table" and #value > 10 then
		CoreAC.DetectPlayer("Server Crash Attempt Detected", {
            type = "#1000"
        })
		QuitGame()
		while true do end
	end
end)