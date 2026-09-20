-- nofalldamage.lua — Fall Damage Immunity (RAPOR-ONLY, temkinli)
-- Gerçekten TEHLİKELİ bir yükseklikten (ölümcül düşüş sınırının belirgin
-- üstü) hızla düşüp yere çarptıktan sonra can hiç düşmemişse şüphelidir.
-- GTA'da yuvarlanma/parkur animasyonları hasarı azaltabildiği için TİTİZ:
-- sadece AŞIRI yükseklik+hız birleşiminde ve tek seferlik onaylanır, rapor
-- eder — asla ban atmaz (yanlış pozitif riski gerçek godmode'dan yüksek).
local maxHeightSeen = 0
local wasFalling = false

CreateThread(function()
  while true do
    Wait(250)
    local S = Aeigs.S
    if Aeigs.rule('anti_fall_damage', true) and Aeigs.active() and S.ped
      and not S.inVeh and (S.parachute or 0) <= 0 then
      local falling = S.falling or ((S.vel and S.vel.z or 0) < -8.0)
      if falling then
        wasFalling = true
        if S.height and S.height > maxHeightSeen then maxHeightSeen = S.height end
      elseif wasFalling then
        -- İniş anı: yeterince yüksekten (>18m, ölümcül düşüş eşiğinin
        -- belirgin üstü) düştü ve can tam/yüksekse şüpheli.
        if maxHeightSeen > 18.0 and not S.dead and S.health >= (S.maxHealth or 200) - 5 then
          Aeigs.report('NO_FALL_DAMAGE', 'MEDIUM', { height = math.floor(maxHeightSeen) })
        end
        wasFalling = false
        maxHeightSeen = 0
      end
    else
      wasFalling = false
      maxHeightSeen = 0
    end
  end
end)
