-- speedhack.lua — Speed hack (yaya + araç), durum-duyarlı tavan
-- Yaya koşusu ~7 m/s; 18 m/s imkânsız. Düşme/araç/ragdoll/yüzme/paraşüt/hava
-- hariç → patlama savrulması vb. false vermez. 5 örnek doğrulama.
local footStrike = CAC.strike(5, 5000)

CreateThread(function()
  while true do
    Wait(400)
    if CAC.rule('anti_speedhack', true) and CAC.active() and not CAC.tpGrace() then
      local S = CAC.S
      if S.ped and not S.inVeh and not S.falling and not S.ragdoll
        and S.parachute <= 0 and not S.swimming and not S.climbing
        and not S.jumping and not IsEntityInAir(S.ped) then
        if S.speed > 18.0 then
          if footStrike:hit() then CAC.report('SPEED_HACK', 'CRITICAL', { speed = math.floor(S.speed) }) end
        end
      end
      -- Araç: en hızlı ~60 m/s; 130 m/s = kesin hile
      if S.inVeh and S.veh ~= 0 and S.vehSpeed > 130.0 then
        CAC.report('VEHICLE_SPEED', 'CRITICAL', { speed = math.floor(S.vehSpeed) })
      end
    end
  end
end)
