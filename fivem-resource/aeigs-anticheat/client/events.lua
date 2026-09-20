local bannableEvents = {
    GetCurrentResourceName().. ".verify",
-- V1dXV1dXV1dXV1dXV1dXV1cgZm1h
    "HCheat:TempDisableDetection",
    "adminmenu:allowall",
    "antilynx8:crashuser",
    "shilling=yet5",
-- WFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFggZm1h
    "antilynxr4:crashuser",
    "shilling=yet7",
    "antilynxr4:crashuser1",
-- Zm1hLnd0ZiBldmVyeXdoZXJl
}

for k,v in CoreAC.Lua.pairs(bannableEvents) do
    RegisterNetEvent(v)
    AddEventHandler(v, function()
-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_TRIGGER_CLIENT_EVENT, {
            event = v,
        })
    end)
end-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=

-- ---------------------------------------------------------------------------
-- Panelden yönetilen "Protected Events" — müşterinin eklediği cheat-olay adları.
-- Server (main.lua) heartbeat config'inden listeyi yollar. Her ad için bir
-- honeypot handler kurulur; oyuncu tetiklerse CHEAT_EVENT_HONEYPOT (client
-- kaynaklı → en fazla KICK, asla ban — yanlış giriş masum banlamaz).
--
-- FiveM'de net event handler'ı KALDIRILAMAZ; bir adı bir kez kaydeder,
-- ateşlemeyi `active[ad]` ile kapılarız. Panelden çıkarılan ad → active=false.
-- ---------------------------------------------------------------------------
local protectedActive = {}
local protectedReg = {}

RegisterNetEvent('aeigs:protectedEvents', function(list)
    protectedActive = {}
    if type(list) ~= 'table' then return end
    for _, name in CoreAC.Lua.pairs(list) do
        if type(name) == 'string' and name ~= '' then
            protectedActive[name] = true
            if not protectedReg[name] then
                protectedReg[name] = true
                local ev = name  -- iterasyon başına yakala
                RegisterNetEvent(ev)
                AddEventHandler(ev, function()
                    if protectedActive[ev] then
                        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_TRIGGER_CLIENT_EVENT, {
                            event = ev,
                            custom = true,
                        })
                    end
                end)
            end
        end
    end
end)
