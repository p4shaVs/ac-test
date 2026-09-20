local function check3dMe(text, source)
    if type(text) == "string" and text:find("<") and text:find("img") and text:find("src") then
        CancelEvent()
        CoreAC.DetectPlayer(source, "Attempted to crash players", {
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