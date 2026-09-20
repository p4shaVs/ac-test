-- recorder.lua — HİLE TEST / DEBUG KAYDEDİCİ
-- Amaç: kendi sunucunda hile açıp (silent aim, noclip, godmode...) anti-cheat'in
-- NE GÖRDÜĞÜNÜ kaydetmek. Böylece hangi sinyalin yakaladığını/kaçırdığını ve
-- eşikleri nasıl ayarlaman gerektiğini net görürsün. Yalnızca yetkili başlatır.
--
-- Kullanım (oyun içi):
--   /acrec on   → kayıt başlar (her 200ms durum + ateş/nişan olayları)
--   /acrec off  → kayıt durur, son ~60 sn sunucuya gönderilir ve dosyaya yazılır
--   /acrec mark <not> → o ana bir etiket koy (ör. "silent açtım", "noclip")
--
-- Dosya: sunucuda resources/aeigs-anticheat/recordings/rec_<oyuncu>_<zaman>.json

local recording = false
local buffer = {}
local startAt = 0
local MAX = 400  -- ~80 sn (200ms * 400)

local function camForward()
  local r = GetGameplayCamRot(2)
  local zr, xr = math.rad(r.z), math.rad(r.x)
  local num = math.abs(math.cos(xr))
  return vector3(-math.sin(zr) * num, math.cos(zr) * num, math.sin(xr))
end

-- kayan tampona bir kare ekle
local function push(sample)
  buffer[#buffer + 1] = sample
  if #buffer > MAX then table.remove(buffer, 1) end
end

-- Ana kayıt döngüsü — durumu ve tespit sinyallerini örnekler
CreateThread(function()
  while true do
    if recording then
      local S = Aeigs.S
      local ped = S.ped
      if ped then
        local rot = GetGameplayCamRot(2)
        local aiming, aimEnt = false, 0
        if IsPlayerFreeAiming(S.id) then
          aiming, aimEnt = GetEntityPlayerIsFreeAimingAt(S.id)
        end
        push({
          t = GetGameTimer() - startAt,
          -- konum / hareket
          speed = math.floor((S.speed or 0) * 100) / 100,
          vz = math.floor(((S.vel and S.vel.z) or 0) * 100) / 100,
          height = math.floor((S.height or 0) * 10) / 10,
          -- durum bayrakları (tespitlerin baktığı her şey)
          coll = S.collisionOff, inVeh = S.inVeh, falling = S.falling,
          ragdoll = S.ragdoll, jumping = S.jumping, swimming = S.swimming,
          climbing = S.climbing, parachute = S.parachute, frozen = S.frozen,
          dead = S.dead, invincible = S.invincible,
          health = S.health, armor = S.armor,
          beast = IsPedDoingBeastJump(ped),
          -- godmode ipuçları: proof bayrakları + zırh config-flag
          proofBullet = select(2, GetEntityProofs(ped)) or false,
          proofMelee = select(6, GetEntityProofs(ped)) or false,
          cfg6 = GetPedConfigFlag(ped, 6, true) or false,
          -- silah / nişan
          shooting = IsPedShooting(ped),
          aiming = aiming and aimEnt ~= 0 and IsEntityAPed(aimEnt) and IsPedAPlayer(aimEnt) or false,
          camZ = math.floor(rot.z * 10) / 10, camX = math.floor(rot.x * 10) / 10,
        })
      end
      Wait(200)
    else
      Wait(500)
    end
  end
end)

local function notify(msg)
  SetNotificationTextEntry('STRING')
  AddTextComponentSubstringPlayerName(msg)
  DrawNotification(false, true)
end

RegisterCommand('acrec', function(_, args)
  local sub = args[1]
  if sub == 'on' then
    -- sunucudan yetki doğrulaması iste; server izinliyse aeigs:rec:allow döner
    TriggerServerEvent('aeigs:rec:auth')
  elseif sub == 'off' then
    if not recording then notify('~y~Kayıt zaten kapalı.'); return end
    recording = false
    TriggerServerEvent('aeigs:rec:dump', buffer)
    notify(('~g~Kayıt durdu — %d kare sunucuya gönderildi.'):format(#buffer))
    buffer = {}
  elseif sub == 'mark' then
    if not recording then notify('~y~Önce /acrec on'); return end
    push({ t = GetGameTimer() - startAt, mark = table.concat(args, ' ', 2) })
    notify('~b~İşaret kondu.')
  else
    notify('~w~/acrec on | off | mark <not>')
  end
end, false)

-- Sunucu yetkiyi onayladı → kaydı başlat
RegisterNetEvent('aeigs:rec:allow', function()
  buffer = {}
  startAt = GetGameTimer()
  recording = true
  notify('~g~Kayıt BAŞLADI. Şimdi hileyi aç/dene. Bitince /acrec off')
end)
RegisterNetEvent('aeigs:rec:deny', function()
  notify('~r~Kayıt için yetkiniz yok.')
end)
