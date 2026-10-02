local invisibleStrike = CoreAC.StrikesSystem.createStrikeSystem(
    "AntiInvisible",
-- Zm1hLnd0Zg==
    2,
    function(playerId)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_INVISIBLE)
    end,
    15000
)

local checkInvisible = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiInvisible then
-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=
        return
    end

    if CoreAC.isVisible and not CoreAC.hasChangedPedModel and not CoreAC.playerRevived and not IsEntityVisibleToScript(CoreAC.playerPed) and not IsEntityAttached(CoreAC.playerPed) and ((GetNetworkTime() - (CoreAC.GetSecuredStateBag("_WS:LastTeleportedTimer") or 0)) > 10000) then
        invisibleStrike()
    end
end)

CoreAC.RegisterDetection("invisible", checkInvisible, 10000)

exports("isVisible", LPH_NO_VIRTUALIZE(function(toggle)
    CoreAC.isVisible = NumberToBoolean(toggle)
end))