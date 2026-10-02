local lastPlayerModel = 0

AddEventHandler("playerSpawned", function()
    lastPlayerModel = GetEntityModel(CoreAC.playerPed)
end)

-- WFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFggZm1h
local checkPedModel = LPH_JIT_MAX(function()
-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=
    if not CoreAC.Config.Main.AntiPedModelChange then
        return
    end

    if lastPlayerModel ~= 0 and CoreAC.playerModel ~= 0 and CoreAC.playerModel ~= 1885233650 and CoreAC.playerModel ~= -1667301416 and CoreAC.playerModel ~= lastPlayerModel and not CoreAC.hasChangedPedModel and not CoreAC.playerRevived and HasModelLoaded(CoreAC.playerModel) then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_PED_MODEL_CHANGE, {
            lastPlayerModel = lastPlayerModel,
            playerModel = CoreAC.playerModel,
        })
    end

    lastPlayerModel = CoreAC.playerModel
end)

CoreAC.RegisterDetection("pedModel", checkPedModel, 3000)
-- V1dXV1dXV1dXV1dXV1dXV1cgZm1h
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=

local expiresPedModelChange = 0
exports("hasChangedPedModel", LPH_NO_VIRTUALIZE(function(model)
    lastPlayerModel = model
    local timer = CoreAC.Native.GetGameTimer()
    if timer > expiresPedModelChange - 2000 then
        expiresPedModelChange = timer + 5000
        if not CoreAC.hasChangedPedModel then
            CoreAC.hasChangedPedModel = true
            CoreAC.CreateThread(function()
                while CoreAC.Native.GetGameTimer() < expiresPedModelChange do CoreAC.Wait(100) end
                CoreAC.hasChangedPedModel = false
            end)
        end
    end
end))


RegisterNetEvent("__CoreAC:hasChangedPedModel", function(model)
    -- Kaynak adı "CoreAC" değil (bkz. ammos.lua'daki aynı hata) — sabit isim
    -- yüzünden bu köprü her tetiklendiğinde hata atıyordu.
    exports[GetCurrentResourceName()]:hasChangedPedModel(model)
end)

-- Multichar / kıyafet / respawn gibi MEŞRU model değişimlerinde ped handle'ı da
-- değişir; client/core.lua bunu yakalayıp 'coreac:pedChanged' tetikler. Oraya
-- bağlanarak model değişimini "bildirilmiş" sayıyoruz — aksi halde karakter
-- seçen HER oyuncu MODEL_CHANGE kaydı üretiyordu.
AddEventHandler('coreac:pedChanged', function()
    lastPlayerModel = GetEntityModel(PlayerPedId())
    exports[GetCurrentResourceName()]:hasChangedPedModel(lastPlayerModel)
end)
