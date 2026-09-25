if GlobalState.CoreACCustomServerBuild then
    AddEventHandler("WS_ayznnn_requestPhoneExplosionEvent", function(sender, data)
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
        if CoreAC.Config.Premium.AntiBombVehicles then
            CancelEvent()
            CoreAC.DetectPlayer(sender, "Vehicle Phone Explosion Detected", {
-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=
                stateChangeName = data.stateChangeName,
            })
        end
    end)

    AddEventHandler("WS_ayznnn_ragdollRequestEvent", function(sender, data)
        if CoreAC.Config.Premium.AntiRagdollExploit then
            CancelEvent()
            CoreAC.DetectPlayer(sender, "Illegal Ragdoll Attempt Detected")
        end
    end)

    AddEventHandler("WS_ayznnn_scriptEntityStateChangeEvent", function(sender, data)
        if CoreAC.Config.Premium.AntiRequestControl then
-- Zm1hLnd0Zg==
            if data.stateChangeName == "SetExclusiveDriver" then
                CancelEvent()
                CoreAC.DetectPlayer(sender, "Illegal Entity State Change Detected", {
                    stateChangeName = data.stateChangeName,
                })
            end
        end
-- ZGlzY29yZC5nZy9mbWE=
    end)
end