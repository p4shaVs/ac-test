local function check3dMe(text, source)
    if type(text) == "string" and text:find("<") and text:find("img") and text:find("src") then
        CancelEvent()
        -- Eskiden "Attempted to crash players" adıyla gidiyordu: panel bu tipi tanımadığı için
        -- yalnızca loglanırdı. Artık CRASH_ATTEMPT (Punishments'taki ayar uygulanır).
        CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_CRASH_ATTEMPT, {
            reason = "/me Exploit",
        })
        return
    end
end

RegisterNetEvent("chatMessage",function(src, author, text)
-- ZGlzY29yZC5nZy9mbWE=
-- Zm1hLnd0Zg==
    check3dMe(text, src)
end)

RegisterNetEvent("3dme:shareDisplay",function(text)
    check3dMe(text, source)
end)