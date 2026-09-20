local clientResources = GlobalState.CoreAC_ClientResources and json.decode(GlobalState.CoreAC_ClientResources) or {}
local serverResources = GlobalState.CoreAC_ServerResources and json.decode(GlobalState.CoreAC_ServerResources) or {}

AddStateBagChangeHandler('CoreAC_ClientResources', 'global', function(bagName, key, value, reserved, replicated)
    clientResources = json.decode(value)
end)

AddStateBagChangeHandler('CoreAC_ServerResources', 'global', function(bagName, key, value, reserved, replicated)
    serverResources = json.decode(value)
end)

-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
local function RegisterResources()
    local clientResources = {}
    local serverResources = {}

    for i = 0, GetNumResources() - 1 do
        local resourceName = GetResourceByFindIndex(i)
        if GetResourceState(resourceName) == "started" then
            serverResources[resourceName] = true
            for i = 0, GetNumResourceMetadata(resourceName, "shared_script") - 1 do
                local file = (GetResourceMetadata(resourceName, "shared_script", i) or "none")
                if file == "resource/include.lua" then
                    clientResources[resourceName] = true
                end
            end
        end
    end
    GlobalState.CoreAC_ClientResources = json.encode(clientResources)
    GlobalState.CoreAC_ServerResources = json.encode(serverResources)
end

Citizen.CreateThread(function()
    RegisterResources()
end)

AddEventHandler("onResourceListRefresh", function()
    RegisterResources()
end)

local resourceStopDisableTimeout = 0
-- Meşru bir resource start/stop olduğunda guard'ı 30 sn duraklat (restart
-- dalgasında masum tespit üretmesin).
--
-- HATA DÜZELTİLDİ: eskiden bu fonksiyon GlobalState.IsAntiResourceStopDisabled'ı
-- kullanıyordu. O bayrak düz (obfuscate olmayan) build'de boot'ta 'true'
-- başladığı için "if not <bayrak>" hiç doğru olmuyor, yeniden-açma thread'i
-- ASLA çalışmıyor ve bayrak sonsuza dek 'true' kalıyordu → resource enjeksiyon
-- ve durdurma tespitleri tamamen ölüydü. Artık kendi bayrağını kullanır.
local function tempDisableAntiResourceStop(resourceName, cRs, sRs)
    TriggerClientEvent("__CoreAC:NewResourcesData", -1, resourceName, cRs, sRs)
    resourceStopDisableTimeout = GetGameTimer() + 30000
    if not GlobalState.CoreAC_ResourceGuardPaused then
        GlobalState.CoreAC_ResourceGuardPaused = true
        CreateThread(function()
            while GetGameTimer() < resourceStopDisableTimeout do
                Wait(100)
            end
            GlobalState.CoreAC_ResourceGuardPaused = false
            resourceStopDisableTimeout = 0
        end)
    end
end

AddEventHandler("onResourceStart",function(resourceName)
    if not clientResources[resourceName] then
        for i = 0, GetNumResourceMetadata(resourceName, "shared_script") - 1 do
            local file = (GetResourceMetadata(resourceName, "shared_script", i) or "none")
            if file == "resource/include.lua" then
                clientResources[resourceName] = true
            end
        end
    end
    if not serverResources[resourceName] then
        serverResources[resourceName] = true
    end

    local c, s = json.encode(clientResources), json.encode(serverResources)
    GlobalState.CoreAC_ClientResources = c
    GlobalState.CoreAC_ServerResources = s
    tempDisableAntiResourceStop(resourceName, c, s)
-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=
end)

AddEventHandler("onResourceStop",function(resourceName)
    if clientResources[resourceName] then
        clientResources[resourceName] = nil
    end
    if serverResources[resourceName] then
        serverResources[resourceName] = nil
    end

    local c, s = json.encode(clientResources), json.encode(serverResources)
    GlobalState.CoreAC_ClientResources = c
    GlobalState.CoreAC_ServerResources = s
    tempDisableAntiResourceStop(resourceName, c, s)
end)
