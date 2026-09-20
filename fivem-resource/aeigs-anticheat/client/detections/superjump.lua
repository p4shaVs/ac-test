-- superjump.lua — Super Jump (Beast Jump native ile kesin tespit)
-- IsPedDoingBeastJump: super-jump yeteneği aktifken true; normal oyuncu asla
-- yapmaz (script vermedikçe). Ayrıca aşırı dikey hız yedek sinyal.
local strike = Aeigs.strike(2, 6000)

CreateThread(function()
  while true do
    Wait(500)
    if Aeigs.rule('anti_superjump', true) and Aeigs.active() then
      local S = Aeigs.S
      if S.ped and not S.inVeh and not S.ragdoll then
        local beast = IsPedDoingBeastJump(S.ped)
        local vz = (S.vel and S.vel.z) or 0.0
        if beast or (S.jumping and vz > 12.0) then
          if strike:hit() then
            Aeigs.report('SUPER_JUMP', 'CRITICAL', { beast = beast, vz = math.floor(vz) })
          end
        end
      end
    end
  end
end)
