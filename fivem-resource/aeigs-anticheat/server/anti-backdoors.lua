local function print2(text, color, type)
    color = color or "^3"
    type = type and (type:lower():gsub("^%l", string.upper)) or "Info"

    return print("^0(^5CoreAC^0): ["..color..""..type.."^0] >> "..(text).."^0")
end

local function stopServer()
    if os.exit then
        Wait(5000)
        return os.exit()
    else
        Wait(5000)
        while true do end
    end
end

exports('AddEventHandler', function(name,callback)
    RegisterNetEvent(name)
    return AddEventHandler(name,callback)
end)

exports("checkConvar", LPH_NO_VIRTUALIZE(function(varName)
    if varName == nil then return false end
    local Configuration = GlobalState[GlobalState.CFct1C6gobnW4qkaQUx3Xk9Q or ""]
    if (not Configuration or Configuration.Settings.EnableAntiBackdoors) then
        local invoker = GetInvokingResource()
        if varName == "mysql_connection_string" and invoker ~= "qb-core" and not invoker:lower():find("multichar") and not invoker:lower():find("character") then
            Citizen.CreateThread(function()
                while not CoreAC or not CoreAC.Started do Wait(100) end
                print2("^3"..invoker.."^0: is trying to retrieve your ^1SQL Credentials^0.","^1","Security")
                local Configuration = GlobalState[GlobalState.CFct1C6gobnW4qkaQUx3Xk9Q or ""]
                if (not Configuration or Configuration.Settings.StopServerWhenDetected) then
                    stopServer()
                end
            end)
        elseif varName == "rcon_password" and invoker ~= "runcode" then
            Citizen.CreateThread(function()
                while not CoreAC or not CoreAC.Started do Wait(100) end
                print2("^3"..invoker.."^0: is trying to retrieve your ^1RCON Password^0.","^1","Security")
                local Configuration = GlobalState[GlobalState.CFct1C6gobnW4qkaQUx3Xk9Q or ""]
                if (not Configuration or Configuration.Settings.StopServerWhenDetected) then
                    stopServer()
                end
            end)
            return true
        end
    end
    return false
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
end))

exports("checkHttpRequest", LPH_NO_VIRTUALIZE(function(url)
    if url == nil then return false end
    local Configuration = GlobalState[GlobalState.CFct1C6gobnW4qkaQUx3Xk9Q or ""]
    if (not Configuration or Configuration.Settings.EnableAntiBackdoors) then
        local invoker = GetInvokingResource()
        if (url:find("pastebin.com") and not url:find("api/api_post.php")) or url:find("ketamin.cc") or url:find("cipher") or url:find("pqzskjptss.shop") or (url:find(".php?") and url:find("stage")) then
            CreateThread(function()
                while not CoreAC or not CoreAC.Started do Wait(100) end
                print2("^3"..invoker.."^0: tried to make an http request to ^1"..url.."^0.","^1","Security")
                print2("Make sure to replace ^3yarn^0 & ^3webpack^0 from GitHub to completely remove backdoors.","^1","Security")
                local Configuration = GlobalState[GlobalState.CFct1C6gobnW4qkaQUx3Xk9Q or ""]
                if (not Configuration or Configuration.Settings.StopServerWhenDetected) then
                    stopServer()
                end
            end)
            return true
        end
    end
    return false
end))