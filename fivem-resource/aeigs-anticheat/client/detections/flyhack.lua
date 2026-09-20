-- flyhack.lua — Fly Hack / Havada Asılı Kalma (DÜZELTİLMİŞ)
--
-- DEĞİŞİKLİKLER:
--   - Superjump muafiyeti eklendi: GTA'da bazı job/event scriptleri oyuncuya
--     geçici yüksek zıplama verir, bunlar flyhack gibi görünüyordu
--   - Yükseklik eşiği 1.5 → 2.2 (merdiven üstü, yüksek nesne kenarı FP atmasın)
--   - Tick sayısı 12 → 15 (2.4sn → 3.0sn) — daha güvenli eşik
--   - Aşırı yüksek irtifa kontrolü eklendi: 200m+ yükseklikte 1 tick'te ban
--     (noclip ile yukarı çıkan hilekar bunu atlıyordu)
--   - vz toleransı -1.0 → -0.5 (yerçekimi daha hassas yakalanıyor)

local ticks     = 0
local TICK_MAX  = 15      -- 200ms × 15 = 3.0sn
local MIN_H     = 2.2     -- metre — bu altı "yerde" sayılır
local INSTA_H   = 200.0   -- bu yükseklikte anında flag

CreateThread(function()
  while true do
    Wait(200)
    if Aeigs.rule('anti_superjump', true) and Aeigs.active() then
      local S   = Aeigs.S
      local vz  = (S.vel and S.vel.z) or 0.0
      local h   = S.height or 0.0

      local airborne = S.ped and h > MIN_H

      local legit = not S.ped
        or S.inVeh
        or S.parachute > 0
        or (S.ped and IsPedInParachuteFreeFall(S.ped))
        or S.climbing
        or S.swimming
        or S.dead
        or S.ragdoll
        or S.attached
        or S.frozen
        or (S.ped and IsPedDoingBeastJump(S.ped))
        or Aeigs.spawnGuard and Aeigs.spawnGuard(5000)
        or Aeigs.tpGrace    and Aeigs.tpGrace()

      -- Anında ban: 200m+ irtifa, hiçbir meşru sebep yok
      if S.ped and h > INSTA_H and not legit then
        ticks = 0
        Aeigs.report('FLYHACK', 'CRITICAL', {
          source = 'extreme_altitude',
          height = math.floor(h),
          vz     = math.floor(vz * 100) / 100,
        })
      -- Normal: 3sn boyunca yerçekimsiz uçuş
      elseif S.ped and airborne and not legit and vz > -0.5 then
        ticks = ticks + 1
      else
        ticks = 0
      end

      if ticks >= TICK_MAX then
        ticks = 0
        Aeigs.report('FLYHACK', 'CRITICAL', {
          source = 'sustained_flight',
          vz     = math.floor(vz * 100) / 100,
          height = math.floor(h),
        })
      end
    else
      ticks = 0
    end
  end
end)
