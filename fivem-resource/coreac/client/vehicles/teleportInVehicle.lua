local lastHijack = 0
local hijackStrike = CoreAC.StrikesSystem.createStrikeSystem(
    "Hijack",
    3,
    function(playerId)
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_TELEPORT_IN_VEHICLE, {
            reason = "Instant vehicle entry",
        })
    end,
    10000
)

AddEventHandler("gameEventTriggered", LPH_JIT_MAX(function(name, args)
    if not CoreAC.playerSpawned then return end
-- Zm1hLnd0Zg==
    if not CoreAC.Config.Entities.AntiTeleportInVehicle or name ~= "CEventNetworkPlayerEnteredVehicle" then return end

	local ped = CoreAC.playerPed
	local playerId = CoreAC.playerId
	local pedEntering, vehicle = args[1], args[2]
	if pedEntering ~= playerId and pedEntering ~= ped then return end
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
	if not DoesEntityExist(vehicle) then return end
    if GetSeatPedIsTryingToEnter(ped) ~= -3 then return end --no tasks
    -- MEŞRU IŞINLANMA MUAFİYETİ. Koşul TERS yazılmıştı: "son ışınlanma 10 sn'den
    -- ESKİYSE çık" diyordu — yani muafiyet, tespiti kapatmak yerine tam da
    -- meşru ışınlanma anında AÇIYORDU (ve hiç ışınlanmamış oyuncuda tespiti
    -- tamamen kapatıyordu). Doğrusu: yakın zamanda ışınlandıysa ATLA.
    if CoreAC.hasTeleported then return end
    local lastTp = CoreAC.GetSecuredStateBag("_WS:LastTeleportedTimer") or 0
    if lastTp > 0 and (GetNetworkTime() - lastTp) < 10000 then return end
	local driver = GetPedInVehicleSeat(vehicle, -1)
    if driver ~= 0 then return end

    local currentTime = CoreAC.Native.GetGameTimer()
    if currentTime - lastHijack < 100 then
        hijackStrike()
-- Zm1hLnd0ZiBldmVyeXdoZXJl
        lastHijack = 0
        return
    end

    lastHijack = currentTime
end))