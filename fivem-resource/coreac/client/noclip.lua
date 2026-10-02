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
        and CAC.adminTool == nil
        and not (CAC.tpGrace and CAC.tpGrace())
        and not (CAC.fadeRecent and CAC.fadeRecent(3000))
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

    -- KALDIRILDI: "donmuş / çarpışma kapalı / 4 m+ havada ve hız<1" durumunda
    -- 3 sn'de 15 m+ gitme kontrolü. Menü NoClip'lerinin çoğu bu durumların
    -- HİÇBİRİNE uymuyordu (ped donmaz, çarpışma açık, yere yakın uçar) → NoClip
    -- neredeyse hiç yakalanmıyor, hızlı uçuş ise 1 sn'lik teleport kontrolüne
    -- takılıp TELEPORT sebebiyle atılıyordu. Yerini aşağıdaki fiziksel kontrol
    -- aldı.
end)

CoreAC.RegisterDetection("noclip", checkNoclip, 3000)

-- ---------------------------------------------------------------------------
-- NOCLIP — "fizik hızının açıklamadığı sürekli hareket"
--
-- Gerçek her hareket (yürüme, koşma, düşme, yüzme, paraşüt, ragdoll fırlaması)
-- ped'in FİZİK HIZINA (GetEntityVelocity) yansır: yarım saniyede alınan yol ≈
-- hız × süre. NoClip ise koordinatı her karede elle kaydırır; ped saniyede
-- onlarca metre ilerlerken fizik hızı ~0 kalır. Işınlanma bunu TEK örnekte
-- yapar (sonra oyuncu durur) — NoClip ise art arda yapar. Bu yüzden:
--   * her 500 ms'de: alınan yol > 3 m VE > (hız × süre × 2.5 + 2 m) ise şüpheli
--   * art arda 4 şüpheli örnek (~2 sn) ve toplam 15 m+ → NOCLIP
-- Meşru durumlar muaf: araç / araç üstü / bağlı (taşınma, kelepçeli götürülme)
-- / izleme modu / ekran kararması / script ışınlaması / txAdmin aracı.
-- ---------------------------------------------------------------------------
local FL_STEP_MIN   = 3.0
local FL_SLACK      = 2.0
local FL_RATIO      = 2.5
local FL_STREAK     = 4
local FL_TOTAL_MIN  = 15.0

local fl = { pos = nil, t = 0, n = 0, dist = 0.0 }
CAC.noclipSuspectAt = 0

local function flightExempt(ped)
    return CoreAC.isPlayerInVehicle
        or CoreAC.isPedOnVehicle
        or IsEntityAttached(ped)
        or CoreAC.isAttachedToAPlayer
        or CoreAC.isPedRunningRagdollTask
        or GetVehiclePedIsEntering(ped) ~= 0
        or CoreAC.isPedJumpingOutOfVehicle
        or IsCutscenePlaying()
        or IsPlayerSwitchInProgress()
        or CoreAC.isNetworkInSpectatorMode
        or CoreAC.isSpectating
        or (CAC.spectateGrace and CAC.spectateGrace())
        or (CAC.tpGrace and CAC.tpGrace())
        or (CAC.fadeRecent and CAC.fadeRecent(3000))
        or (CAC.adminTool ~= nil)
        or CoreAC.hasTeleported
        or CoreAC.pedType == 28
end

local checkNoclipFlight = LPH_JIT_MAX(function()
    if not CoreAC.Config.Main.AntiNoClip then return end
    local ped = PlayerPedId()
    local pos = GetEntityCoords(ped)
    local now = GetGameTimer()

    if flightExempt(ped) or not fl.pos then
        fl.pos, fl.t, fl.n, fl.dist = pos, now, 0, 0.0
        return
    end

    local dt = (now - fl.t) / 1000.0
    local moved = #(pos - fl.pos)
    fl.pos, fl.t = pos, now
    -- Takılma/alt-tab: arada çok zaman geçtiyse ölçüm anlamsız.
    if dt <= 0.0 or dt > 1.5 then fl.n, fl.dist = 0, 0.0 return end

    local physical = #(GetEntityVelocity(ped)) * dt
    if moved > FL_STEP_MIN and moved > physical * FL_RATIO + FL_SLACK then
        fl.n = fl.n + 1
        fl.dist = fl.dist + moved
        -- Tek örnek bir ışınlanma da olabilir; "uçuş" sayılması için art arda
        -- en az iki açıklanamayan örnek gerekir (teleport.lua bunu okur).
        if fl.n >= 2 then CAC.noclipSuspectAt = now end
    else
        fl.n, fl.dist = 0, 0.0
    end

    if fl.n >= FL_STREAK and fl.dist >= FL_TOTAL_MIN then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_NO_CLIP, {
            reason = "Flight",
            distance = math.floor(fl.dist),
            seconds = math.floor(fl.n * dt * 10) / 10,
        })
        fl.n, fl.dist = 0, 0.0
    end
end)

CoreAC.RegisterDetection("noclipFlight", checkNoclipFlight, 500)

-- (Geliştirici hata ayıklama komutu kaldırıldı: herhangi bir oyuncu F8'den
-- çalıştırıp tespit iç ayrıntılarını görebiliyordu — hile yazarlarına bilgi sızıntısı.)
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
--todo test noclip vehicle
