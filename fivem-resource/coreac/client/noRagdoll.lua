local noRagdollStrike = CoreAC.StrikesSystem.createStrikeSystem(
    "AntiNoRagdoll",
    3,
    function(playerId)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_RAGDOLL)
    end,
    15000
)

local checkNoRagdoll = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiNoRagdoll then
        return
    end

    -- `CanPedRagdoll()` Lua'da BOOLEAN döner. Eski koşul `~= 1` yazıyordu ve
    -- `true ~= 1` Lua'da HER ZAMAN doğrudur → ilk şart hiçbir şey filtrelemiyor,
    -- kontrol geri kalan guard'lara düşüyor ve normal duran oyuncuyu bile
    -- işaretliyordu. Bu yüzden koruma kapalı bırakılmıştı.
    if not CanPedRagdoll(CoreAC.playerPed) and
        not IsPedRagdoll(CoreAC.playerPed) and
        not IsPedUsingAnyScenario(CoreAC.playerPed) and
        not CoreAC.isPlayerInVehicle and
        CoreAC.isPlayerFreeForAmbientTask and
        not CoreAC.isPlayerDead and
        not CoreAC.isPedJumpingOutOfVehicle and
        not IsPedJacking(CoreAC.playerPed) and
        not CoreAC.isPedRunningRagdollTask and
        not IsEntityPositionFrozen(CoreAC.playerPed) and
        IsPlayerControlOn(CoreAC.playerId) and
        not IsEntityAttached(CoreAC.playerPed) and
        not CoreAC.hasChangedPedModel and
-- Zm1hLnd0ZiBldmVyeXdoZXJl
        not CoreAC.playerRevived and
        not CoreAC.scriptDisabledRagdoll   -- meşru script bildirdiyse muaf
    then
        noRagdollStrike()
    end
end)

CoreAC.RegisterDetection("noRagdoll", checkNoRagdoll, 5000)

-- Ragdoll'u BİLEREK kapatan meşru scriptler (animasyon, taşıma, cutscene)
-- bunu çağırmalı. Eskiden bayrak CoreAC.canPedRagdoll'a yazılıyordu; ama o
-- alan durum önbelleği tarafından her 250 ms'de native değerle EZİLİYORDU,
-- yani export hiçbir işe yaramıyordu. Artık ayrı bir alan.
exports("canRagdoll", LPH_NO_VIRTUALIZE(function(toggle)
    CoreAC.scriptDisabledRagdoll = not NumberToBoolean(toggle)
end))
