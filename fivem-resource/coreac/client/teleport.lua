local TP_oldCoords, TP_oldIsInVehicle, TP_oldStateValid = vector3(0, 0, 0), false, false
local TP_pending = nil  -- { dist, after } — bir sonraki örnekte sınıflandırılacak sıçrama

local function isValidTeleportState()
    return (not CoreAC.isPlayerInVehicle or (CoreAC.isPlayerDriver and CoreAC.isPlayerInVehicle and CoreAC.vehicleSpeed < 3)) and
        not CoreAC.isPedOnVehicle and
        not CoreAC.isPedFalling and
        not IsPedInParachuteFreeFall(CoreAC.playerPed) and
        not CoreAC.isPedJumpingOutOfVehicle and
        not (IsEntityAttached(CoreAC.playerPed) and not CoreAC.isPlayerInVehicle or false) and
        not CoreAC.isAttachedToAPlayer and
        not IsCutscenePlaying() and
        CoreAC.pedType ~= 28 and
        not CoreAC.isPedRunningRagdollTask and
        (GetPedParachuteState(CoreAC.playerPed) <= 0) and
        not CoreAC.isPlayerUnderWater and
        (CoreAC.playerHeight >= -1) and
-- ZGlzY29yZC5nZy9mbWE=
        not CoreAC.isPlayerDead and
-- Zm1hLnd0ZiBldmVyeXdoZXJl
        (GetVehiclePedIsEntering(CoreAC.playerPed) == 0) and
        not CoreAC.hasTeleported and
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
        not CoreAC.playerRevived and
        #(CoreAC.playerCoords - vector3(0, 0, 0)) > 100
end

local checkTeleport = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiTeleport then return end
    
-- ZiBtIGE=
-- UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUCBpdHMgZm1h
    local currentStateValid = isValidTeleportState()
    local now = GetGameTimer()

    -- Bir önceki saniyede sıçrama görüldüyse şimdi sınıflandır:
    --   * o arada ekran karardı / script ışınlaması bildirildi → meşru, düş
    --   * NoClip kontrolü "açıklanamayan uçuş" gördü ya da ped hâlâ fizik
    --     hızı olmadan ilerliyor → bu bir ışınlanma değil NoClip uçuşu;
    --     rapor noclip.lua'dan NOCLIP olarak gider (eskiden TELEPORT diye
    --     atılıyordu: "noclip açınca teleport banı")
    --   * aksi halde tek seferlik sıçrama → TELEPORT
    if TP_pending then
        local p = TP_pending
        TP_pending = nil
        local legit = CoreAC.hasTeleported or (CAC.tpGrace and CAC.tpGrace())
            or (CAC.fadeRecent and CAC.fadeRecent(4000)) or CAC.adminTool ~= nil
        local stillFlying = #(CoreAC.playerCoords - p.after) > 8.0
            and #(GetEntityVelocity(CoreAC.playerPed)) < 3.0
        local flight = stillFlying or (now - (CAC.noclipSuspectAt or 0)) < 2500
        if not legit and not flight then
            CoreAC.DetectPlayer(CoreAC.Detections.ANTI_TELEPORT, { distance = p.dist })
        end
    end

    if TP_oldStateValid and currentStateValid and
        TP_oldIsInVehicle == CoreAC.isPlayerInVehicle and
        #(TP_oldCoords - CoreAC.playerCoords) > 50 and
        ((GetNetworkTime() - (CoreAC.GetSecuredStateBag("_WS:LastTeleportedTimer") or 0)) > 10000)
        -- QBCore'daki meşru ışınlamaların neredeyse hepsi ekranı karartarak
        -- yapılır (ev/apartman/asansör/hastane/hapis/spawn/tpm). Diğer
        -- resource'ların SetEntityCoords çağrılarını göremediğimiz için
        -- kararma, script ışınlamasının en güvenilir işaretidir.
        and not (CAC.fadeRecent and CAC.fadeRecent(4000))
        and not (CAC.tpGrace and CAC.tpGrace())
        and CAC.adminTool == nil
    then
        TP_pending = {
            dist = math.floor(#(TP_oldCoords - CoreAC.playerCoords)),
            after = CoreAC.playerCoords,
        }
    end

    TP_oldCoords = CoreAC.playerCoords
    TP_oldIsInVehicle = CoreAC.isPlayerInVehicle
    TP_oldStateValid = currentStateValid
end)

CoreAC.RegisterDetection("teleport", checkTeleport, 1000)

local expiresTP = 0
exports("hasTeleported", LPH_NO_VIRTUALIZE(function()
    local timer = CoreAC.Native.GetGameTimer()
    if timer > expiresTP - 2000 then
        expiresTP = timer + 10000
        if not CoreAC.hasTeleported then
            CoreAC.hasTeleported = true
            CoreAC.CreateThread(function()
                while CoreAC.Native.GetGameTimer() < expiresTP do CoreAC.Wait(100) end
                CoreAC.hasTeleported = false
            end)
        end
    end
end))

RegisterNetEvent("__CoreAC:hasTeleported",function()
    CoreAC.hasTeleported = true
    expiresTP = CoreAC.Native.GetGameTimer() + 10000
    CoreAC.CreateThread(function()
        while CoreAC.Native.GetGameTimer() < expiresTP do CoreAC.Wait(100) end
        CoreAC.Wait(2000)
        CoreAC.hasTeleported = false
    end)
end)
