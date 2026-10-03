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
-- Panelden yönetilen "Protected Events" listesi ARTIK OYUNCULARA GÖNDERİLMEZ.
-- Eskiden liste her client'a yollanıyordu: olay döken (dump) bir hileci hangi
-- olayların TUZAK olduğunu okuyup onlardan kaçınabiliyordu. Tuzaklar yalnızca
-- sunucuda kurulur (server/entity_guard.lua) — hile menüsü bu olayları zaten
-- TriggerServerEvent ile yollar.
-- ---------------------------------------------------------------------------
