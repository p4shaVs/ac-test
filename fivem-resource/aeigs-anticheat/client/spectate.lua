local checkSpectate = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiSpectate then
        return
    end
    
    -- Yetkili izleme (panel/oyun içi yönetici menüsü) muaf: hem CoreAC bayrağı
    -- hem de Aeigs grace penceresi kontrol edilir.
    if Aeigs and Aeigs.spectateGrace and Aeigs.spectateGrace() then return end

    if not CoreAC.isSpectating and CoreAC.isNetworkInSpectatorMode then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SPECTATE)
    end
end)

CoreAC.RegisterDetection("spectate", checkSpectate, 5000)

exports("setSpectatorMode", LPH_NO_VIRTUALIZE(function(toggle)
    CoreAC.isSpectating = toggle
end))
-- WFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFggZm1h
