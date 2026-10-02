-- aimsync.lua — sunucu taraflı Silent Aim kontrolü için nişan örneği.
--
-- Sunucu (server/protection.lua) bir mermi isabetini, atıcının O ATIŞ
-- anındaki kamera yönüyle karşılaştırır. Örnek yalnızca ateşli silahla
-- ATEŞ EDİLEN karede alınır (sabit aralıklı değil): hızlı "flick" atışlarda
-- 100-150 ms önceki yön kullanılsaydı meşru oyuncu sapmış görünürdü.
--
-- Eskiden bu veriyi yalnızca devre dışı client/detections/silentaim.lua
-- gönderiyordu → sunucudaki "Anti Silent Aim" kuralı panelde AÇIK görünse de
-- hiç çalışmıyordu. Üstelik o dosya ateş ederken HER KAREDE gönderiyordu
-- (60/sn) ve sunucunun 20/sn sınırına takılıp örneklerin çoğu düşüyordu.
--
-- Yalnızca: yayayken + hitscan ateşli silah (tabanca/SMG/tüfek/MG/keskin/
-- pompalı). Patlayıcı, fırlatılan, yakın dövüş ve araç silahlarında nişan
-- yönü isabetle ilişkili değildir → hiç örnek gönderilmez.
--
-- Örnekle birlikte iki bayrak gider (sunucu hafif silent-aim kademesinde kullanır):
--   bit 0  gamepad kullanılıyor (yardımlı nişan isabeti ışının biraz dışına çeker)
--   bit 1  siperde (körlemesine ateşte mermi kamera yönüne gitmez)
-- Bayraklar yalnızca eşiği gevşetir ya da bir isabeti dışarıda bırakır; sunucu
-- aşikâr silent aim (35°+) için bunlara bakmaz.

local HITSCAN = CoreAC.HITSCAN_CLASSES
local MIN_GAP = 80   -- ms — iki örnek arası en kısa süre (~12/sn tavan)

-- Vanilla silah tablodan, eklenti silah (weapon_browning vb.) oyunun silah
-- grubundan sınıflanır. Eskiden eklenti silahlarla HİÇ örnek gönderilmiyordu;
-- GUN PVP sunucularında silent aim kontrolü bu yüzden tamamen körlemişti.
-- Sunucu da aynı sınıflamayı kullanır (server/combat_guard.lua).
local classCache = {}
local function weaponClass(w)
  local c = classCache[w]
  if c == nil then
    c = CoreAC.GetWeaponClass(w) or CoreAC.WeaponClassFromGroup(GetWeapontypeGroup(w)) or false
    classCache[w] = c
  end
  return c or nil
end

--- Gamepad mi? (IsUsingKeyboardAndMouse yoksa fare+klavye varsayılır.)
local function usingPad()
  if IsUsingKeyboardAndMouse then return not IsUsingKeyboardAndMouse(0) end
  return false
end

local function camForward()
  local r = GetFinalRenderedCamRot(2)
  local zr, xr = math.rad(r.z), math.rad(r.x)
  local c = math.abs(math.cos(xr))
  return -math.sin(zr) * c, math.cos(zr) * c, math.sin(xr)
end

CreateThread(function()
  local lastSent = 0
  while true do
    local ped = PlayerPedId()
    local cls = weaponClass(GetSelectedPedWeapon(ped))
    if cls and HITSCAN[cls] and not IsPedInAnyVehicle(ped, false) and CAC.rule('anti_silent_aim', true) then
      if IsPedShooting(ped) then
        local now = GetGameTimer()
        if now - lastSent >= MIN_GAP then
          lastSent = now
          local cam = GetFinalRenderedCamCoord()
          local fx, fy, fz = camForward()
          local flags = (usingPad() and 1 or 0) + (IsPedInCover(ped, false) and 2 or 0)
          TriggerServerEvent('coreac:aim', cam.x, cam.y, cam.z, fx, fy, fz, flags)
        end
      end
      Wait(0)
    else
      Wait(250)
    end
  end
end)
