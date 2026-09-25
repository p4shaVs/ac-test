-- vehicleSpeed.lua — araç hız / tork / yerçekimi (handling) modifier hileleri.
--
-- Hile menülerinin "araç hızlandırma" özellikleri motoru doğrudan değiştirir:
--   ModifyVehicleTopSpeed        → üst hız modifier'ı
--   SetVehicleCheatPowerIncrease → tork/güç çarpanı
--   SetVehicleGravityAmount      → yola yapışma / uçurma
-- Değerler bridge/client.lua'da FiveM getter native'lerinden okunur.
--
-- YANLIŞ-POZİTİF TASARIMI:
--   * Eşikler oyunun ve tuning/nitro script'lerinin kullandığı değerlerin çok
--     üstünde tutulur (varsayılan: güç 1.0, yerçekimi 9.8, üst hız -1/0).
--   * Tek örnek yetmez: aynı araçta ardışık PERSIST örnek (≈9 sn) eşiği
--     aşmalı. Nitro gibi kısa patlamalar asla tetiklemez; menülerin kalıcı
--     çarpanı tetikler.
--   * Tip "heuristic" (VEHICLE_SPEED / VEHICLE_HANDLING): panelde yalnızca
--     KAYIT düşer, kimseyi atmaz. Kesin hız hilesi SUNUCUDA ölçülür
--     (server/live.lua — VEHICLE_SPEED_HACK).
--   * Meşru olarak bu değerleri değiştiren script'ler tavanı yükseltebilir:
--     exports['<CoreAC klasörü>']:newCheatPowerIncrease(x) / newTopSpeedModifier(x) / newGravity(x)

local PERSIST = 3

-- Bazı araçlar oyun tarafından yerleşik bir üst-hız modifier'ıyla gelir.
local overridedBoosts = {
    [GetHashKey("sanchez")]  = 18.0,
    [GetHashKey("sanchez2")] = 18.0,
    [GetHashKey("banshee2")] = 20.0,
}

local maxTopSpeedModifier = 60.0  -- +%60'ın üstü
local maxCheatPower       = 3.0   -- 3x tork çarpanının üstü
local maxGravity          = 25.0  -- varsayılan 9.8

local speedStreak, handlingStreak, lastVehicle = 0, 0, 0

local checkVehicleSpeed = LPH_JIT_MAX(function()
    if not CoreAC.Config.Entities.AntiSpeedModifier and not CoreAC.Config.Entities.AntiHandlingModifier then
        return
    end

    if not CoreAC.isPlayerInVehicle or not CoreAC.isPlayerDriver or CoreAC.isSpectating then
        speedStreak, handlingStreak, lastVehicle = 0, 0, 0
        return
    end
    -- Araç değiştiyse seriyi sıfırla (başka araçtaki değer bu aracın değildir).
    if CoreAC.playerCurrentVehicle ~= lastVehicle then
        speedStreak, handlingStreak = 0, 0
        lastVehicle = CoreAC.playerCurrentVehicle
    end

    if CoreAC.Config.Entities.AntiSpeedModifier then
        local builtin = overridedBoosts[CoreAC.vehicleModel] or 0.0
        local topCap = math.max(maxTopSpeedModifier, builtin + 1.0)
        local top = CoreAC.vehicleTopSpeedModifier or -1.0
        local power = CoreAC.vehicleCheatPowerIncrease or 1.0
        if top > topCap or power > maxCheatPower then
            speedStreak = speedStreak + 1
            if speedStreak >= PERSIST then
                speedStreak = 0
                CoreAC.DetectPlayer(CoreAC.Detections.ANTI_SPEED_MODIFIER, {
                    vehicle = CoreAC.GetVehicleName(CoreAC.vehicleModel),
                    topSpeedModifier = math.floor(top * 10) / 10,
                    powerMultiplier = math.floor(power * 10) / 10,
                })
                return
            end
        else
            speedStreak = 0
        end
    end

    if CoreAC.Config.Entities.AntiHandlingModifier then
        local g = CoreAC.vehicleGravityAmount or 9.8
        -- Negatif yerçekimi ("araç uçurma") hiçbir meşru oynanışta olmaz.
        if g > maxGravity or g < 0.0 then
            handlingStreak = handlingStreak + 1
            if handlingStreak >= PERSIST then
                handlingStreak = 0
                CoreAC.DetectPlayer(CoreAC.Detections.ANTI_HANDLING_MODIFIER, {
                    vehicle = CoreAC.GetVehicleName(CoreAC.vehicleModel),
                    gravity = math.floor(g * 10) / 10,
                })
            end
        else
            handlingStreak = 0
        end
    end
end)

CoreAC.RegisterDetection("vehicleSpeed", checkVehicleSpeed, 3000)

-- Entegrasyon: meşru olarak bu değerleri yükselten script'ler tavanı artırır
-- (asla varsayılanın ALTINA indirilemez).
exports("newGravity", LPH_NO_VIRTUALIZE(function(newGravity)
    newGravity = tonumber(newGravity) or 0
    maxGravity = math.max(25.0, newGravity + 1.0)
end))

exports("newCheatPowerIncrease", LPH_NO_VIRTUALIZE(function(newCheatPowerIncrease)
    newCheatPowerIncrease = tonumber(newCheatPowerIncrease) or 0
    maxCheatPower = math.max(3.0, newCheatPowerIncrease + 0.5)
end))

exports("newTopSpeedModifier", LPH_NO_VIRTUALIZE(function(newTopSpeedModifier)
    newTopSpeedModifier = tonumber(newTopSpeedModifier) or 0
    maxTopSpeedModifier = math.max(60.0, newTopSpeedModifier + 5.0)
end))

if not CoreAC.vehicleModifierNativesAvailable then
    print('^3[CoreAC] Vehicle modifier getters are not available on this client build — speed/handling modifier checks stay idle (the server-side vehicle speed check still runs).^7')
end
