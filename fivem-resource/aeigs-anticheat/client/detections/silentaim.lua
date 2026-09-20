-- silentaim.lua — Silent Aim / Magic Bullet (DÜZELTİLMİŞ)
--
-- SORUN: Önceki versiyonda aim verisi sabit 150ms'de bir gönderiliyordu.
-- Ama weaponDamageEvent ANİ gelir — sunucu elinde 150ms öncesinin aim
-- verisini tutuyordu. Silah ateşlenirken kamera döndürülürse (silent aim'in
-- tam yaptığı şey) sunucu yanlış yönü kontrol ediyordu → tespit kaçıyordu.
--
-- DÜZELTİLMİŞ MANTIK:
--   - Normal durumda 150ms (network yükü düşük tutulur)
--   - Silah ateşlenirken her frame (0ms Wait) → sunucu her zaman taze veri alır
--   - Son ateş zamanı da sunucuya gönderiliyor, sunucu bunu senkronizasyon için kullanabilir

local lastShotTime = 0
local SHOT_GRACE   = 300  -- ateşten sonra 300ms daha sık gönder

local function camForward()
  local r   = GetGameplayCamRot(2)
  local zr  = math.rad(r.z)
  local xr  = math.rad(r.x)
  local num = math.abs(math.cos(xr))
  return vector3(-math.sin(zr) * num, math.cos(zr) * num, math.sin(xr))
end

CreateThread(function()
  while true do
    local S = Aeigs.S
    if S.ped
      and Aeigs.rule('anti_silent_aim', true)
      and S.weapon ~= GetHashKey("weapon_unarmed")
      and not S.dead
    then
      local cp  = GetGameplayCamCoord()
      local fw  = camForward()
      local now = GetGameTimer()

      -- Ateş anı takibi
      if IsPedShooting(S.ped) then
        lastShotTime = now
      end

      local shooting = IsPedShooting(S.ped) or (now - lastShotTime) < SHOT_GRACE

      -- FIX: sunucu tarafının weaponDamageEvent ile senkronize olması için
      -- ateş anında/hemen sonrasında taze veri gönder
      TriggerServerEvent('aeigs:aim',
        cp.x, cp.y, cp.z,
        fw.x, fw.y, fw.z,
        shooting  -- sunucu bu flag'i önceliklendirme için kullanabilir
      )

      if shooting then
        Wait(0)    -- ateş anında her frame gönder
      else
        Wait(150)  -- normal durumda 150ms
      end
    else
      Wait(700)
    end
  end
end)
