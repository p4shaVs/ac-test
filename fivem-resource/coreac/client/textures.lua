local allowedTextures = {}

-- KALDIRILDI (yanlış-pozitif): "commonmenu", "commonmenutu", "mpleaderboard",
-- "mpinventory", "mplobby", "shared" — bunlar GTA'nın KENDİ menü doku
-- sözlükleri. NativeUI/NativeUILua, vMenu, qb-menu, ox_lib ve daha onlarca
-- MEŞRU menü kaynağı bunları yükler. Aşağıdaki "önceden yüklüyse izin ver"
-- taraması yalnızca AC açılışında çalıştığı için, menüsünü ilk açılışta
-- yükleyen her script masum oyuncuya ANTI_LUA_MENU (→ KICK) yedirir.
-- Liste artık YALNIZCA hile menülerine özgü, çakışma ihtimali olmayan
-- doku adlarını içerir.
local blackListedTextures = {
    "__REAPER18__",
    "John",
    "darkside",
    "dopatest",
    "fm",
    "fs12",
    "fs1",
    "fs22",
    "fs32",
    "fs62",
    "hugeware2",
    "hugeware",
    "fs6",
    "fs7",
    "fs72",
    "aafov",
    "wave",
    "VallMenu",
    "meow2",
    "deadline",
    "ISMMENU",
    "MedusaBannerGif",
    "absolute",
    "absolute",
    "absolute",
    "absolute2",
    "absolute2",
    "absolute2",
    "absolute3",
    "absolute3",
    "absolute4",
    "HydroMenu",
    "John",
    "darkside",
    "ISMMENU",
    "dopatest",
    "wave",
    "wave1",
    "meow2",
    "adb831a7fdd83d_Guest_d1e2a309ce7591dff86",
    "hugev_gif_DSGUHSDGISDG",
    "32909fjj2kfk2e",
    "rampage_tr_main",
    "rampage_tr_animated",
    -- KALDIRILDI: "shopui_title_graphics_franklin" — vanilla GTA dokusu,
    -- meşru mağaza/kıyafet arayüzleri yükler.
    "MenyooExtras",
    "kekhack_fivem_premium",
    "burrito_bus",
    "burrito_menu"
}

CoreAC.CreateThread(function()
    for _,texture in CoreAC.Lua.ipairs(blackListedTextures) do
        SetStreamedTextureDictAsNoLongerNeeded(texture)
        if HasStreamedTextureDictLoaded(texture) then
            allowedTextures[texture:lower()] = true
        end
    end
end)

local checkTextures = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiLuaMenu then
        return
    end
    
    for _, v in CoreAC.Lua.pairs(blackListedTextures) do
        local textureDict = v:lower()
        if not allowedTextures[textureDict] and HasStreamedTextureDictLoaded(textureDict) then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_LUA_MENU, {
                textureDict = textureDict,
            })
            return
        end
    end
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm

    -- Bilinen hile araçlarının bıraktığı statebag imzaları.
    -- KALDIRILDI: SafeGetLocalPlayerState("ShowMenu") ~= nil — "ShowMenu" son
    -- derece genel bir isim; meşru bir script böyle bir state set ederse bu
    -- kontrol doğrudan BYPASS_ATTEMPT (= BAN seviyesi) üretiyordu.
    if SafeGetLocalPlayerState("FiveEyeDT") == false
        or SafeGetLocalPlayerState("bypassNoClip") == true
        or SafeGetLocalPlayerState("bypassAntiGodMode") == true
        or SafeGetLocalPlayerState("createdExplosion") == true
        or SafeGetLocalPlayerState("ayznnnMenu") ~= nil
        or SafeGetLocalPlayerState("tonperelechauveMenu") ~= nil
    then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_BYPASS_ATTEMPT, {
            reason = "Blacklisted state",
        })
        return
    end
end)

-- ZGlzY29yZC5nZy9mbWE=
-- UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUCBpdHMgZm1h
CoreAC.RegisterDetection("textures", checkTextures, 10000)

exports("allowTexture", LPH_NO_VIRTUALIZE(function(textureDict)
    if not textureDict then return end
    textureDict = CoreAC.tostring(textureDict):lower()
    allowedTextures[textureDict] = true
end))

AddEventHandler('onResourceStart', function(resourceName)
    --todo le shared en c# + enlever ca
    if resourceName:lower():find('vmenu') then
        allowedTextures["commonmenu"] = true
        allowedTextures["commonmenutu"] = true
        allowedTextures["mpleaderboard"] = true
        allowedTextures["mpinventory"] = true
        allowedTextures["shared"] = true
    end
end)