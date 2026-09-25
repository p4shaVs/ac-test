-- main.lua — CoreAC Anti-Cheat, client (DÜZELTİLMİŞ)
-- (Tespitler client/detections/*.lua içindedir. Bu dosya tespit YAPMAZ.)
--
-- DEĞİŞİKLİKLER:
--   - coreac:collState Wait(250) → Wait(100): sunucunun teleport taraması
--     1sn'de bir çalışıyor. 250ms'de sinyal gönderilince sunucu önce davranıp
--     noclip'i "TELEPORT" diye etiketliyordu. 100ms ile artık sunucudan önce geliriz.
--   - underground tespiti genişletildi: zemin altına girme (noclip'in duvar/zemin
--     geçişi) daha geniş threshold ile yakalanıyor (-0.6 → -0.3)
--   - collState event'e "underground" bilgisi ayrı gönderiliyor ki sunucu
--     noclip ile teleport'u daha iyi ayırt edebilsin

local function currentActivity(ped)
  if IsPedInAnyVehicle(ped, false) then return 'driving'     end
  if IsPedSwimming(ped)            then return 'swimming'    end
  if GetPedParachuteState(ped) > 0 then return 'parachuting' end
  if IsPedShooting(ped)            then return 'shooting'    end
  if IsPedRagdoll(ped)             then return 'ragdoll'     end
  if IsPedFalling(ped)             then return 'falling'     end
  if GetEntitySpeed(ped) > 1.0     then return 'walking'     end
  return 'idle'
end

-- Canlı konum / can / kalkan
CreateThread(function()
  while true do
    Wait((Config.PositionInterval or 3) * 1000)
    local ped = PlayerPedId()
    local c   = GetEntityCoords(ped)
    TriggerServerEvent('coreac:pos', {
      x        = c.x,
      y        = c.y,
      z        = c.z,
      heading  = GetEntityHeading(ped),
      health   = GetEntityHealth(ped),
      armor    = GetPedArmour(ped),
      activity = currentActivity(ped),
    })
  end
end)

-- Collision / noclip sinyali
-- FIX: Wait(250) → Wait(100) — sunucu teleport taramasından önce gelsin
-- FIX: underground eşiği -0.6 → -0.3 — daha hassas zemin altı tespiti
-- FIX: collisionDisabled ve underground ayrı gönderiliyor (sunucu ayırt edebilsin)
CreateThread(function()
  while true do
    Wait(100)  -- FIX: 250'den 100'e düşürüldü
    local ped              = PlayerPedId()
    local height           = GetEntityHeightAboveGround(ped)
    local collisionDisabled = GetEntityCollisionDisabled(ped)

    -- FIX: eşik -0.6 → -0.3 (daha hassas)
    local underground = height ~= nil
      and height < -0.3
      and not IsPedFalling(ped)
      and not IsPedRagdoll(ped)
      and not IsPedInAnyVehicle(ped, false)

    -- FIX: sunucuya collision ve underground ayrı bildirildi
    -- Sunucu: collision=true → noclip şüphesi
    --         underground=true → noclip şüphesi (teleport değil)
    --         her ikisi false → temiz
    TriggerServerEvent('coreac:collState', collisionDisabled, underground)
  end
end)

-- İzleme / ekran görüntüsü
--
-- İki sağlayıcı desteklenir, bu sırayla:
--   1) screencapture    — screenshot-basic'in bakımı süren halefi. İmza:
--                         requestScreenshotUpload(url, field, options, cb)
--   2) screenshot-basic — eski sürüm. İmza: requestScreenshotUpload(url, field, cb)
-- NOT: citizenfx/screenshot-basic KAYNAK reposu sunucuda yarn+webpack build'i
-- ister; iki kez ensure edilirse iki yarn aynı anda çalışıp kilitlenir ve
-- sunucu açılışı zaman aşımına düşer. screencapture bu yüzden tercih edilir.
local function screenshotProvider()
  if GetResourceState('screencapture') == 'started' then return 'screencapture' end
  if GetResourceState('screenshot-basic') == 'started' then return 'screenshot-basic' end
  return nil
end

RegisterNetEvent('coreac:screenshot', function(uploadUrl, reqId, adminId)
  local provider = screenshotProvider()
  if not provider then
    -- SESSİZCE değil: bu en sık kırık olan nokta, F8/konsolda görünür olsun.
    print('^1[CoreAC] A screenshot was requested but neither "screencapture" nor "screenshot-basic" is running.^7')
    TriggerServerEvent('coreac:screenshotResult', reqId, nil)
    return
  end

  local function onUploaded(data)
    local url = nil
    local body = type(data) == 'string' and data or nil
    local parsed = type(data) == 'table' and data or nil
    if body then
      local decOk, dec = pcall(json.decode, body)
      if decOk then parsed = dec end
    end
    if type(parsed) == 'table' then
      url = parsed.url
        or (parsed.files and parsed.files[1])
        or (parsed.data and parsed.data.url)
    end
    if not url then
      print(('^1[CoreAC] %s returned an unexpected upload response: %s^7'):format(provider, tostring(body or data)))
    end
    TriggerServerEvent('coreac:screenshotResult', reqId, url)
  end

  local ok, err = pcall(function()
    local field = Config.ScreenshotField or 'files[]'
    if provider == 'screencapture' then
      exports['screencapture']:requestScreenshotUpload(uploadUrl, field, { encoding = 'jpg' }, onUploaded)
    else
      exports['screenshot-basic']:requestScreenshotUpload(uploadUrl, field, onUploaded)
    end
  end)
  if not ok then
    print(('^1[CoreAC] %s call failed: %s^7'):format(provider, tostring(err)))
    TriggerServerEvent('coreac:screenshotResult', reqId, nil)
  end
end)
