-- noclip.lua — NoClip, BAŞTAN YAZILDI: HIZLI + İKİ BAĞIMSIZ SİNYAL
--
-- ESKİ SORUN: Tek sinyale (çarpışma kapalı) bakıyordu, 500ms×4 tik (~2 sn)
-- gerektiriyordu. Bu hem YAVAŞTI hem de bazı hileleri KAÇIRIYORDU: bazı
-- noclip'ler çarpışma bayrağını (GetEntityCollisionDisabled) hiç set etmeden
-- doğrudan koordinat/hız ile oyuncuyu hareket ettiriyor. Bu durumda tespit
-- hiç tetiklenmiyor VE sunucunun ayrı çalışan teleport taraması (1 sn'de bir,
-- daha hızlı) araya girip yanlış sebeple (TELEPORT) banlıyordu.
--
-- YENİ TASARIM: Aeigs.S zaten 200ms'de bir güncelleniyor; biz de 200ms'de bir
-- kontrol ediyoruz (Wait(500) değil). İKİ BAĞIMSIZ sinyalden biri 3 tik
-- (~600ms) kesintisiz sürerse ban — toplamda eskisinden ~3 kat hızlı:
--
--   SİNYAL A — çarpışma kapalı + hareket (klasik noclip).
--   SİNYAL B — zeminin ALTINDA/geçersiz yükseklikte hareket: oyuncu ayakta,
--     düşmüyor/ragdoll/yüzme/tırmanma/paraşüt değil ama GetEntityHeightAboveGround
--     belirgin şekilde NEGATİF (zeminin altında). Bu FİZİKSEL OLARAK İMKÂNSIZ
--     — normal oyunda asla olmaz. Çarpışma bayrağını hiç set etmeyen,
--     doğrudan koordinat oynayan noclip çeşitlerini de yakalar.
--
-- Hızlı sonuç sunucuya da hemen ulaşsın diye Aeigs.report zaten throttle'lı;
-- ayrıca client/main.lua'daki aeigs:collState sinyali de hızlandırıldı ki
-- sunucunun teleport taraması bunu "TELEPORT" diye yanlış etiketlemesin.

local ticksA, ticksB, ticksV = 0, 0, 0

CreateThread(function()
  while true do
    Wait(200)
    if Aeigs.rule('anti_noclip', true) and Aeigs.active() and not Aeigs.tpGrace() then
      local S = Aeigs.S
      if not S.ped then ticksA, ticksB, ticksV = 0, 0, 0; goto cont end

      local vz = (S.vel and S.vel.z) or 0.0
      local dropping = S.falling or vz < -2.0
      local baseSafe = not S.inVeh and not S.dead and not S.ragdoll
        and not S.climbing and not S.jumping and not S.swimming
        and S.parachute <= 0 and not IsPedInParachuteFreeFall(S.ped)
        and not S.frozen

      -- SİNYAL A: çarpışma kapalı + hareket ediyor + düşmüyor (yaya)
      if baseSafe and S.collisionOff and S.speed > 1.5 and not dropping then
        ticksA = ticksA + 1
      else
        ticksA = 0
      end

      -- SİNYAL B: zeminin altında (fiziksel olarak imkânsız) + düşmüyor
      if baseSafe and S.height and S.height < -0.6 and not dropping then
        ticksB = ticksB + 1
      else
        ticksB = 0
      end

      -- SİNYAL V: ARAÇ noclip — sürücüsü/yolcusu olduğun araç çarpışması
      -- kapalıyken hareket ediyor (duvar/dağ içinden araçla geçme).
      if S.inVeh and S.veh ~= 0 and GetEntityCollisionDisabled(S.veh) and S.vehSpeed > 1.5 then
        ticksV = ticksV + 1
      else
        ticksV = 0
      end

      if ticksA >= 3 then
        ticksA, ticksB, ticksV = 0, 0, 0
        Aeigs.report('NOCLIP', 'CRITICAL', { source = 'collision' })
      elseif ticksB >= 3 then
        ticksA, ticksB, ticksV = 0, 0, 0
        Aeigs.report('NOCLIP', 'CRITICAL', { source = 'underground' })
      elseif ticksV >= 3 then
        ticksA, ticksB, ticksV = 0, 0, 0
        Aeigs.report('VEHICLE_NOCLIP', 'CRITICAL', { source = 'vehicle_collision' })
      end
      ::cont::
    else
      ticksA, ticksB, ticksV = 0, 0, 0
    end
  end
end)
