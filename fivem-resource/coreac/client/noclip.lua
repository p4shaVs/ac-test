local NC_oldCoords, NC_oldSpeed, NC_oldStateValid = vector3(0, 0, 0), 0.0, false

local noclipHeightBypass = CoreAC.StrikesSystem.createStrikeSystem(
-- b3JpZ2luYWwgb3duZXIgb2YgdGhpcyBzb3VyY2UgaXMgRk1B
    "AntiNoClipHeightBypass",
    3,
    function(playerId, diffHeight)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_CLIP, {
            reason = "Bypass #2",
            debug = diffHeight,
        })
    end,
    10000
)

local noclipVehicleBypass = CoreAC.StrikesSystem.createStrikeSystem(
    "AntiNoClipVehicleBypass",
    2,
    function(playerId)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_CLIP, {
            reason = "Bypass #3",
        })
    end,
    10000
)

local noclipFallBypass = CoreAC.StrikesSystem.createStrikeSystem(
-- ZGlzY29yZC5nZy9mbWE=
    "AntiNoClipFallBypass",
    3,
    function(playerId)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_CLIP, {
            reason = "Bypass #4",
        })
    end,
    10000
)

local function isValidNoclipState()
    return (not CoreAC.isPlayerInVehicle or (CoreAC.isPlayerDriver and CoreAC.isPlayerInVehicle and not CoreAC.isPlayerDead and CoreAC.vehicleSpeed < 3 and IsVehicleStopped(CoreAC.playerCurrentVehicle) and (not IsVehicleOnAllWheels(CoreAC.playerCurrentVehicle) or IsEntityPositionFrozen(CoreAC.playerCurrentVehicle) or GetEntityCollisionDisabled(CoreAC.playerCurrentVehicle)))) and
        not CoreAC.isPedOnVehicle and
        (not CoreAC.isPedFalling or (CoreAC.isPedFalling and CoreAC.playerSpeed == 0.0)) and
        not (IsEntityAttached(CoreAC.playerPed) and not CoreAC.isPlayerInVehicle or false) and
        not CoreAC.isAttachedToAPlayer and
        not IsCutscenePlaying() and
        -- Yetkili izleme: admin ped'i hedefin üstünde DONDURULUR (düşüp ölmesin).
        -- Donmuş + havada ped aşağıdaki koşula uyar; bayrak yalnızca sunucu
        -- onaylı yoldan (CAC.markSpectate / setSpectatorMode export) açılır.
        not CoreAC.isSpectating and
        CoreAC.pedType ~= 28 and
        (IsEntityPositionFrozen(CoreAC.playerPed) or GetEntityCollisionDisabled(CoreAC.playerPed) or (CoreAC.playerHeight > 4.0 and CoreAC.playerSpeed < 1)) and
        (GetVehiclePedIsEntering(CoreAC.playerPed) == 0) and
        not CoreAC.hasTeleported and
        not IsPedInParachuteFreeFall(CoreAC.playerPed) and
        not CoreAC.isPedJumpingOutOfVehicle and
        #(CoreAC.playerCoords - vector3(0, 0, 0)) > 100
end

local checkNoclip = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiNoClip then return end

    -- KALDIRILDI: "height bypass" kontrolü GetGroundZFor_3dCoord'a dayanıyordu
    -- (yer yüklenmemişse/eğimli zeminde güvenilmez döner) ve eşik 0.002 gibi
    -- absürt derecede sıktı → normal oyunda sürekli FALSE-POSITIVE. Asıl
    -- çarpışma-tabanlı NoClip kontrolü (aşağıda) ve Bypass #1 korunuyor;
    -- ayrıca server tarafı da yedek NoClip taraması yapıyor.

    -- Araç bypass'ı: önbellek 250 ms'ye kadar bayat olabiliyor; araç o arada
    -- stream-out olduysa "araçtayım ama araç yok" durumu MEŞRU olarak oluşur.
    -- Bu yüzden karar anında native'leri TAZE okuyoruz (eski hâli masum
    -- oyuncuda strike topluyordu).
    do
        local ped = PlayerPedId()
        local veh = GetVehiclePedIsIn(ped, false)
        if veh ~= 0 and not DoesEntityExist(veh) and not GetPedConfigFlag(ped, 62, true) then
            noclipVehicleBypass()
        end
    end

    -- "Fall bypass": amaç, noclip yüzünden DÜŞME durumunda takılı kalmış ama
    -- fiilen DÜŞMEYEN ped'i yakalamak.
    -- ESKİ HÂLİ SADECE `isPedFalling` bakıyordu → paraşütle atlayan, uzun
    -- mesafe düşen, uçaktan atlayan HER oyuncu 6 sn içinde 3 strike toplayıp
    -- NOCLIP yiyordu. Doğru ayırt edici: gerçek düşüşte dikey hız hızla artar;
    -- noclip'te ped "düşüyor" görünür ama yerinde durur.
    if CoreAC.isPedFalling
        and not IsPedInParachuteFreeFall(CoreAC.playerPed)
        and GetPedParachuteState(CoreAC.playerPed) <= 0
        and not CoreAC.isPedRagdoll
        and not CoreAC.isPedRunningRagdollTask
        and not CoreAC.isPlayerInVehicle
        and not CoreAC.hasTeleported
    then
        local vel = CoreAC.playerVelocity or vector3(0, 0, 0)
        -- Serbest düşüşte |vz| birkaç saniyede 10+ m/s olur. 0.5'in altı ve
        -- yatay hız da yoksa → fiziksel olarak imkânsız "havada asılı düşüş".
        if math.abs(vel.z) < 0.5 and CoreAC.playerSpeed < 0.5 then
            noclipFallBypass()
        end
    end

    local entityAttached = CoreAC.Native.GetEntityAttachedTo(CoreAC.playerPed)
    if entityAttached > 0 and IsEntityPositionFrozen(CoreAC.playerPed) and (#(CoreAC.playerCoords - CoreAC.Native.GetEntityCoords(entityAttached)) == 0) and (NetworkGetNetworkIdFromEntity(entityAttached) == NetworkGetNetworkIdFromEntity(CoreAC.playerPed)) then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_CLIP, {
            reason = "Bypass #1",
        })
-- V1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXVyBmbWEud3Rm
        return
    end

    local currentStateValid = isValidNoclipState()
    if NC_oldStateValid and currentStateValid and
        (NC_oldSpeed == CoreAC.playerSpeed or ((CoreAC.playerSpeed < 1.2) and (NC_oldSpeed < 1.2))) and
        #(NC_oldCoords - CoreAC.playerCoords) > 15 and
        ((GetNetworkTime() - (CoreAC.GetSecuredStateBag("_WS:LastTeleportedTimer") or 0)) > 10000)
    then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_CLIP)
    end

    NC_oldCoords = CoreAC.playerCoords
    NC_oldSpeed = CoreAC.playerSpeed
    NC_oldStateValid = currentStateValid
end)

CoreAC.RegisterDetection("noclip", checkNoclip, 3000)

-- (Geliştirici hata ayıklama komutu kaldırıldı: herhangi bir oyuncu F8'den
-- çalıştırıp tespit iç ayrıntılarını görebiliyordu — hile yazarlarına bilgi sızıntısı.)
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
--todo test noclip vehicle
