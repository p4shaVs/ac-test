local resourceNumber = 0

-- Bu iki tablo aşağıdaki handler'larda global olarak okunuyor ama HİÇBİR YERDE
-- ilklendirilmiyordu: statebag replikasyonu gelmeden bir resource start/stop
-- olursa `serverResources[name]` "attempt to index a nil value" ile patlıyordu.
-- GlobalState'ten senkron başlangıç + boş tablo güvencesi.
clientResources = clientResources or (GlobalState.CoreAC_ClientResources and json.decode(GlobalState.CoreAC_ClientResources)) or {}
serverResources = serverResources or (GlobalState.CoreAC_ServerResources and json.decode(GlobalState.CoreAC_ServerResources)) or {}

local IsAntiResourceStopDisabled = false
local resourceStopDisableTimeout = 0
local restartingResources = {}
local function tempDisableAntiResourceStop()
    resourceStopDisableTimeout = CoreAC.Native.GetGameTimer() + 30000
    if not IsAntiResourceStopDisabled then
        IsAntiResourceStopDisabled = true
        CoreAC.CreateThread(function()
            while CoreAC.Native.GetGameTimer() < resourceStopDisableTimeout do
                CoreAC.Wait(100)
            end
            IsAntiResourceStopDisabled = false
            resourceStopDisableTimeout = 0
            restartingResources = {}
        end)
    end
end
-- ---------------------------------------------------------------------------
-- Guard çalışmaya hazır mı? FALSE-POSITIVE KALKANI — sırayla:
--   1) Client tarafı geçici duraklattı mı (sunucudan NewResourcesData geldi).
--      NOT: bu yerel bayrak eskiden HİÇ okunmuyordu (koşullar GlobalState'e
--      bakıyordu) — yani client tarafı duraklatma ölüydü. Artık okunuyor.
--   2) Sunucu geçici duraklattı mı (meşru restart dalgası).
--   3) Resource yüklenmesinin ilk JOIN_GRACE'i geçti mi (girişte her şey start eder).
--   4) EN KRİTİĞİ: sunucu resource listesi gerçekten replike oldu mu. Liste boşsa
--      "not serverResources[x]" HER resource için doğru olur ve tüm oyuncular
--      toplu halde "enjeksiyon" sanılıp kicklenirdi. Gerçek bir sunucuda onlarca
--      resource vardır; 10'dan azsa liste henüz güvenilir değildir → işaretleme.
-- ---------------------------------------------------------------------------
local JOIN_GRACE = 60000
local guardStartedAt = CoreAC.Native.GetGameTimer()
local function guardReady()
    if IsAntiResourceStopDisabled then return false end
    if GlobalState.CoreAC_ResourceGuardPaused then return false end
    if (CoreAC.Native.GetGameTimer() - guardStartedAt) < JOIN_GRACE then return false end
    local n = 0
    for _ in pairs(serverResources or {}) do
        n = n + 1
        if n >= 10 then return true end
    end
    return false
end

RegisterNetEvent("__CoreAC:NewResourcesData", function(resourceName, cRs, sRs)
    if GetInvokingResource() ~= nil then return end
    clientResources = json.decode(cRs)
    serverResources = json.decode(sRs)
    restartingResources[resourceName] = true
    tempDisableAntiResourceStop()
end)

AddStateBagChangeHandler('CoreAC_ClientResources', 'global', function(bagName, key, value, reserved, replicated)
    clientResources = json.decode(value)
end)

AddStateBagChangeHandler('CoreAC_ServerResources', 'global', function(bagName, key, value, reserved, replicated)
    serverResources = json.decode(value)
-- ZGlzY29yZC5nZy9mbWE=
end)

AddEventHandler("onClientResourceStart", function(resourceName)
    CoreAC.Wait(5000)
    if CoreAC.Config.Main.AntiResourceInjection and guardReady() and not restartingResources[resourceName] and not serverResources[resourceName] then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_RESOURCE_INJECTION, {
            event = "onClientResourceStart",
            resource = resourceName,
        })
    end
    resourceNumber = GetNumResources()
end)

AddEventHandler('onResourceStart', function(resourceName)
    if GetInvokingResource() ~= nil then return end
    
    CoreAC.Wait(5000)
    if CoreAC.Config.Main.AntiResourceInjection and guardReady() and not restartingResources[resourceName] and not serverResources[resourceName] then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_RESOURCE_INJECTION, {
            event = "onResourceStart",
            resource = resourceName,
        })
    end
    resourceNumber = GetNumResources()
end)

AddEventHandler('onResourceStarting', function(resourceName)
    if GetInvokingResource() ~= nil then return end
    
    CoreAC.Wait(5000)
    if CoreAC.Config.Main.AntiResourceInjection and guardReady() and not restartingResources[resourceName] and not serverResources[resourceName] then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_RESOURCE_INJECTION, {
            event = "onResourceStarting",
            resource = resourceName,
        })
    end
    resourceNumber = GetNumResources()
end)

AddEventHandler("onResourceStop", function(resourceName)
    if GetInvokingResource() ~= nil then return end

    CoreAC.Wait(5000)
    if CoreAC.Config.Main.AntiResourceStop and guardReady() and not restartingResources[resourceName] and serverResources[resourceName] then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_RESOURCE_STOP, {
            event = "onResourceStop",
            resource = resourceName,
        })
    end
    resourceNumber = GetNumResources()
end)

AddEventHandler('onClientResourceStop', function (resourceName)
    if GetInvokingResource() ~= nil then return end
    
    CoreAC.Wait(5000)
    if CoreAC.Config.Main.AntiResourceStop and guardReady() and not restartingResources[resourceName] and serverResources[resourceName] then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_RESOURCE_STOP, {
            event = "onClientResourceStop",
            resource = resourceName,
        })
    end
    resourceNumber = GetNumResources()
end)

CoreAC.CreateThread(function()
    resourceNumber = GetNumResources()

    while true do
        CoreAC.Wait(10000)

        if CoreAC.Config.Main.AntiResourceInjection then
            if resourceNumber ~= GetNumResources() then
                for i = 0, GetNumResources() - 1 do
                    local resourceName = GetResourceByFindIndex(i)
                    if guardReady() and not restartingResources[resourceName] and not serverResources[resourceName] then
                        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_RESOURCE_INJECTION, {
                            resource = resourceName,
                        })
                        return
                    end
                end
            end
        end

        if CoreAC.Config.Main.AntiResourceStop then
            local resourceCount = 0
            for resourceName, v in CoreAC.Lua.pairs(clientResources) do
                if v == true and resourceName ~= "_cfx_internal" then
                    if guardReady() and not restartingResources[resourceName] then
                        local isAlive, lastHeartbeat = false, 0
                        local _,err = CoreAC.Lua.pcall(function()
                            isAlive, lastHeartbeat = exports[resourceName]:IsAlive()
                        end)
                        if err or not isAlive then
                            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_RESOURCE_STOP, {
                                reason = "Resource is not running",
                                resourceName = resourceName,
                            })
                        elseif isAlive then
                            if CoreAC.type(lastHeartbeat) ~= "number" or lastHeartbeat <= 0 or (CoreAC.Native.GetGameTimer() - lastHeartbeat > 5000) then
                                CoreAC.DetectPlayer(CoreAC.Detections.ANTI_RESOURCE_STOP, {
                                    reason = "Suspended",
                                    resourceName = resourceName,
                                })
                                return
                            end
                        end
                    end
                end
                
                resourceCount = resourceCount + 1
                if resourceCount % 5 == 0 then
                    CoreAC.Wait(10)
                end
            end
        end
    end
end)
