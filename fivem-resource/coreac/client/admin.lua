-- CoreAC Anti-Cheat — oyun içi yönetici: /ac komutları + görsel yönetim
-- paneli (NUI) + aksiyon alıcıları.
-- İzinler webden verilir; sunucu her aksiyonda ve her veri isteğinde izni
-- AYRICA doğrular (client yalnızca arayüzdür).

local myPerms = {}

-- Menü / izleme durumu dosyanın başında: izleme kodu menüye mesaj atabilsin.
local menuOpen = false
local lastPlayers = {}
local spectating = false
local spectateReturn = nil   -- izlemeden önceki konum { x, y, z }
local stopToken = 0

local PERM_HELP = {
  kick = '/ac kick [id] [reason]',
  ban = '/ac ban [id] [reason]',
  warn = '/ac warn [id] [reason]',
  spectate = '/ac spectate [id]  (0 = stop)',
  revive = '/ac revive [id]  ·  /ac repair [id]',
  tp = '/ac tp [id]  ·  /ac tpm (to waypoint)',
  bring = '/ac bring [id]',
  freeze = '/ac freeze [id] on|off',
  announce = '/ac announce [message]',
  screenshot = '/ac ss [id]',
  disarm = '/ac disarm [id]',
  mute = '/ac mute [id] on|off',
  reset = '/ac wipe [id]  (delete their spawns)',
}

-- Menü tercihleri (bu oyuncunun bilgisayarında saklanır — KVP).
--   alerts: 'actions' (yalnızca kick/ban) | 'all' | 'off'
local alertMode = GetResourceKvpString('coreac_alerts') or 'actions'
if alertMode ~= 'all' and alertMode ~= 'off' then alertMode = 'actions' end
local tagsOn = false

local function notify(msg)
  SetNotificationTextEntry('STRING')
  AddTextComponentSubstringPlayerName(msg)
  DrawNotification(false, true)
end

local function has(perm) return myPerms[perm] == true end

-- Bu alıcılar YALNIZCA sunucudan (ağdan) gelmeli. Yerel TriggerEvent ile
-- tetiklenirse (enjekte kod) GetInvokingResource() dolu gelir → yok say.
-- Aksi halde hileci kendine ışınlanma/izleme muafiyeti verebilirdi.
local function fromServer() return GetInvokingResource() == nil end

-- Sunucudan izinler geldi
RegisterNetEvent('coreac:perms', function(list)
  myPerms = {}
  for _, p in ipairs(list or {}) do myPerms[p] = true end
end)

RegisterNetEvent('coreac:notify', function(msg) notify(msg) end)

-- /ac id sonucu — kendi identifier'larını gösterir (panele admin eklemek için).
-- Konsola da basılır ki F8'den kopyalanabilsin.
RegisterNetEvent('coreac:whoami', function(info)
  info = info or {}
  local lines = { '~b~— Your identifiers —' }
  lines[#lines + 1] = '~w~license: ~y~' .. tostring(info.license or 'n/a')
  lines[#lines + 1] = '~w~discord: ~y~' .. tostring(info.discord or 'not linked')
  lines[#lines + 1] = '~w~steam:   ~y~' .. tostring(info.steam or 'not running')
  lines[#lines + 1] = info.isAdmin and ('~g~You ARE an admin (' .. tostring(info.role or '?') .. ').') or '~r~Not an admin yet — add one of the above on the web panel.'
  notify(table.concat(lines, '\n'))
  print('[CoreAC] Your identifiers (add one on the web panel → Admins):')
  print('  license: ' .. tostring(info.license or 'n/a'))
  print('  discord: ' .. tostring(info.discord or 'not linked to FiveM'))
  print('  steam:   ' .. tostring(info.steam or 'Steam not running'))
end)

-- ---------------------------------------------------------------------------
-- İzleme (spectate)
--
-- Eskiden: admin hedefin 30 m üstüne ışınlanıp orada bırakılıyordu → DÜŞÜP
-- ölüyordu; "/ac spectate 0" ise sunucu id 0'ı "çevrimiçi değil" diye reddettiği
-- için izlemeyi HİÇ bitiremiyordu. Artık:
--   * ped izleme boyunca dondurulur (noclip.lua bu durumu isSpectating ile muaf tutar),
--   * hedef uzaktaysa akışa girmesi beklenir,
--   * bitince sunucudan ışınlanma muafiyeti alınıp ESKİ KONUMA dönülür.
-- ---------------------------------------------------------------------------
local function endSpectateLocal(restore)
  local ped = PlayerPedId()
  NetworkSetInSpectatorMode(false, ped)
  FreezeEntityPosition(ped, false)
  if restore and spectateReturn then
    if CAC and CAC.markTp then CAC.markTp() end
    SetEntityCoords(ped, spectateReturn.x, spectateReturn.y, spectateReturn.z, false, false, false, false)
  elseif not restore then
    -- Sunucu cevap vermedi: bulunduğu yerin altındaki zemine indir (dikey ~30 m,
    -- teleport eşiğinin altında) — 30 m'den düşüp ölmesin.
    local c = GetEntityCoords(ped)
    local found, gz = GetGroundZFor_3dCoord(c.x, c.y, c.z, false)
    if found then SetEntityCoords(ped, c.x, c.y, gz + 0.5, false, false, false, false) end
  end
  spectateReturn = nil
  spectating = false
  -- İzleme bayrağını hemen düşürmeyiz: spectate.lua önbelleklenmiş
  -- "spectator mode" değerini birkaç sn geç görebilir → yöneticiyi yanlışlıkla
  -- ANTI_SPECTATE ile işaretlerdi.
  CreateThread(function()
    Wait(3000)
    if not spectating and CAC and CAC.markSpectate then CAC.markSpectate(false) end
  end)
  if menuOpen then SendNUIMessage({ type = 'spectate', on = false }) end
  notify('~b~Spectate stopped.')
end

local function requestStopSpectate()
  if not spectating then return end
  -- Eski konuma dönmek bir ışınlanma → sunucudan muafiyet iste; sunucu
  -- 'spectate' iznini doğrulayınca coreac:spectateReturn ile döneriz.
  TriggerServerEvent('coreac:spectateEnd')
  stopToken = stopToken + 1
  local token = stopToken
  CreateThread(function()
    Wait(3000)
    if spectating and stopToken == token then endSpectateLocal(false) end
  end)
end

RegisterNetEvent('coreac:spectateReturn', function()
  if spectating then endSpectateLocal(true) end
end)

RegisterNetEvent('coreac:spectate', function(targetId, x, y, z)
  local tid = tonumber(targetId) or 0
  if tid == 0 then requestStopSpectate() return end

  local ped = PlayerPedId()
  if not spectating then
    local c = GetEntityCoords(ped)
    spectateReturn = { x = c.x, y = c.y, z = c.z }
  end
  spectating = true
  if CAC and CAC.markTp then CAC.markTp() end
  if CAC and CAC.markSpectate then CAC.markSpectate(true) end   -- yetkili izleme muaf
  SetEntityCoords(ped, x + 0.0, y + 0.0, z + 30.0, false, false, false, false)
  FreezeEntityPosition(ped, true)

  CreateThread(function()
    local tped, tries = 0, 0
    repeat
      Wait(100)
      tries = tries + 1
      local pl = GetPlayerFromServerId(tid)
      tped = (pl and pl ~= -1) and GetPlayerPed(pl) or 0
    until (tped ~= 0 and DoesEntityExist(tped)) or tries >= 50 or not spectating
    if not spectating then return end
    if tped ~= 0 and DoesEntityExist(tped) then
      NetworkSetInSpectatorMode(true, tped)
      notify('~b~Spectating — stop it from the menu or with /ac spectate 0.')
      if menuOpen then SendNUIMessage({ type = 'spectate', on = true, target = tid }) end
    else
      notify('~r~Could not load that player for spectating.')
      requestStopSpectate()
    end
  end)
end)

-- ---------------------------------------------------------------------------
-- /ac komutları (metin tabanlı — NUI'siz yedek)
-- ---------------------------------------------------------------------------
RegisterCommand(Config.AdminCommand or 'ac', function(_, args)
  TriggerServerEvent('coreac:requestPerms')
  Wait(150)
  local cmd = args[1]
  if not cmd then
    local lines = { '~b~— CoreAC Admin —' }
    local any = false
    for perm, help in pairs(PERM_HELP) do
      if has(perm) then lines[#lines + 1] = '~w~' .. help; any = true end
    end
    if any then lines[#lines + 1] = '~w~/' .. (Config.AdminMenuCommand or 'cac') .. ' — full admin panel' end
    lines[#lines + 1] = '~w~/' .. (Config.AdminCommand or 'ac') .. ' id — show your identifiers'
    if not any then lines[#lines + 1] = '~r~You have no admin permissions. Use "/ac id" to get the identifier to add on the web panel.' end
    notify(table.concat(lines, '\n'))
    return
  end

  if cmd == 'id' or cmd == 'whoami' then
    TriggerServerEvent('coreac:whoami')
    return
  end

  local id = tonumber(args[2])
  if cmd == 'kick' and has('kick') then
    TriggerServerEvent('coreac:adminAction', 'kick', id, table.concat(args, ' ', 3))
  elseif cmd == 'ban' and has('ban') then
    TriggerServerEvent('coreac:adminAction', 'ban', id, table.concat(args, ' ', 3))
  elseif cmd == 'warn' and has('warn') then
    TriggerServerEvent('coreac:adminAction', 'warn', id, table.concat(args, ' ', 3))
  elseif cmd == 'revive' and has('revive') then
    TriggerServerEvent('coreac:adminAction', 'revive', id)
  elseif cmd == 'tp' and has('tp') then
    TriggerServerEvent('coreac:adminAction', 'tp', id)
  elseif cmd == 'bring' and has('bring') then
    TriggerServerEvent('coreac:adminAction', 'bring', id)
  elseif cmd == 'spectate' and has('spectate') then
    if id == 0 or id == nil then requestStopSpectate()   -- sunucuya gitmez: yerel durdur
    else TriggerServerEvent('coreac:adminAction', 'spectate', id) end
  elseif cmd == 'freeze' and has('freeze') then
    TriggerServerEvent('coreac:adminAction', 'freeze', id, args[3] or 'on')
  elseif cmd == 'announce' and has('announce') then
    TriggerServerEvent('coreac:adminAction', 'announce', nil, table.concat(args, ' ', 2))
  elseif cmd == 'ss' and has('screenshot') then
    TriggerServerEvent('coreac:adminAction', 'screenshot', id)
  elseif cmd == 'tpm' and has('tp') then
    TriggerServerEvent('coreac:adminAction', 'tpm', nil)
  elseif cmd == 'repair' and has('revive') then
    TriggerServerEvent('coreac:adminAction', 'repair', id)
  elseif cmd == 'disarm' and has('disarm') then
    TriggerServerEvent('coreac:adminAction', 'disarm', id)
  elseif cmd == 'mute' and has('mute') then
    TriggerServerEvent('coreac:adminAction', 'mute', id, args[3] == 'off' and 'off' or 'on')
  elseif cmd == 'wipe' and has('reset') then
    TriggerServerEvent('coreac:adminAction', 'wipe', id)
  else
    notify('~r~Unknown command, or you lack permission.')
  end
end, false)

-- İzinler değişince menüyü baştan iste
CreateThread(function()
  Wait(3000)
  TriggerServerEvent('coreac:requestPerms')
end)

-- ---------------------------------------------------------------------------
-- Aksiyon alıcıları — sunucudan tetiklenir; hepsi YALNIZCA yerel oyuncuya
-- uygulanır. Bunlar için ayrı bir "local trigger" koruması GEREKMEZ: kendini
-- iyileştirmek/dondurmak istismar değildir, ışınlanma/spectate muafiyeti ise
-- sunucu tarafında CAC.grantTp/grantRevive ile verilir (hileci client
-- event'ini uydursa da sunucu muafiyetini alamaz → sunucu tespiti yakalar).
-- ---------------------------------------------------------------------------
RegisterNetEvent('coreac:revive', function()
  local pid = PlayerId()
  local ped = PlayerPedId()
  local c = GetEntityCoords(ped)
  if IsEntityDead(ped) or GetEntityHealth(ped) <= 0 then
    NetworkResurrectLocalPlayer(c.x, c.y, c.z, GetEntityHeading(ped), true, false)
    ped = PlayerPedId()  -- resurrect ped'i değiştirebilir
  end
  SetPlayerInvincible(pid, false)
  SetEntityHealth(ped, GetEntityMaxHealth(ped))
  ClearPedBloodDamage(ped)
  ResetPedVisibleDamage(ped)
  ClearPedTasksImmediately(ped)
  notify('~g~You have been revived.')
end)

RegisterNetEvent('coreac:freeze', function(state)
  local ped = PlayerPedId()
  FreezeEntityPosition(ped, state == true)
  notify(state and '~b~You have been frozen.' or '~b~You have been unfrozen.')
end)

RegisterNetEvent('coreac:teleport', function(x, y, z)
  if CAC and CAC.markTp then CAC.markTp() end  -- yetkili ışınlama → tespit muaf
  local ped = PlayerPedId()
  SetEntityCoords(ped, x + 0.0, y + 0.0, z + 1.0, false, false, false, false)
  notify('~b~You have been teleported.')
end)

RegisterNetEvent('coreac:heal', function()
  local ped = PlayerPedId()
  SetEntityHealth(ped, GetEntityMaxHealth(ped))
  ClearPedBloodDamage(ped)
  ResetPedVisibleDamage(ped)
  ClearPedLastWeaponDamage(ped)
  notify('~g~You were healed by an admin.')
end)

RegisterNetEvent('coreac:armor', function()
  SetPedArmour(PlayerPedId(), 100)
  notify('~b~You received armor.')
end)

-- Yakındaki araçları temizle + takılmayı kurtar (yalnızca bu client'ın sahip
-- olduğu ağ-entity'leri silinir; başkasının/haritanın nesnesi etkilenmez).
RegisterNetEvent('coreac:resetEntities', function()
  local ped = PlayerPedId()
  local here = GetEntityCoords(ped)
  local cur = GetVehiclePedIsIn(ped, false)
  for _, veh in ipairs(GetGamePool('CVehicle')) do
    if veh and DoesEntityExist(veh) and (veh == cur or #(GetEntityCoords(veh) - here) < 8.0) then
      if veh == cur then TaskWarpPedOutOfVehicle(ped, veh, 16); Wait(20) end
      SetEntityAsMissionEntity(veh, true, true)
      DeleteVehicle(veh)
    end
  end
  ClearPedTasksImmediately(ped)
  ClearPedBloodDamage(ped)
end)

-- Yönetici bu oyuncunun aracını tamir etti. Sunucu önce "revive" muafiyeti
-- verir (anlık-onarım kaydı düşmesin). Araçta değilse, 10 m içindeki son
-- bindiği araç onarılır.
RegisterNetEvent('coreac:repairVehicle', function()
  local ped = PlayerPedId()
  local veh = GetVehiclePedIsIn(ped, false)
  if veh == 0 then
    local last = GetVehiclePedIsIn(ped, true)
    if last ~= 0 and DoesEntityExist(last) and #(GetEntityCoords(last) - GetEntityCoords(ped)) < 10.0 then veh = last end
  end
  if veh == 0 or not DoesEntityExist(veh) then return end
  SetVehicleFixed(veh)
  SetVehicleDeformationFixed(veh)
  SetVehicleEngineHealth(veh, 1000.0)
  SetVehicleBodyHealth(veh, 1000.0)
  SetVehiclePetrolTankHealth(veh, 1000.0)
  SetVehicleDirtLevel(veh, 0.0)
  SetVehicleUndriveable(veh, false)
  notify('~g~An admin repaired your vehicle.')
end)

-- Silahlar sunucuda alındı (RemoveAllPedWeapons). Client'taki silah-spawn
-- modülünün izinli listesi de sıfırlanır ki geri verilen meşru silah "izinsiz"
-- sayılmasın.
RegisterNetEvent('coreac:disarm', function()
  RemoveAllPedWeapons(PlayerPedId(), true)
  pcall(function() exports[GetCurrentResourceName()]:removeAllWeapons() end)
  notify('~b~An admin removed your weapons.')
end)

-- Haritadaki işarete ışınlanma. Sunucu muafiyeti (grantTp) bu olaydan ÖNCE
-- verilmiştir; client muafiyeti burada açılır. Zemin, yukarıdan aşağı
-- taranarak bulunur (en fazla ~2 sn).
RegisterNetEvent('coreac:tpWaypoint', function()
  local blip = GetFirstBlipInfoId(8)
  if not DoesBlipExist(blip) then
    notify('~r~Set a waypoint on the map first.')
    return
  end
  local c = GetBlipInfoIdCoord(blip)
  if CAC and CAC.markTp then CAC.markTp() end
  local ped = PlayerPedId()
  local ent = ped
  local veh = GetVehiclePedIsIn(ped, false)
  if veh ~= 0 and GetPedInVehicleSeat(veh, -1) == ped then ent = veh end
  FreezeEntityPosition(ent, true)
  local groundZ
  for h = 950.0, -50.0, -25.0 do
    SetEntityCoordsNoOffset(ent, c.x, c.y, h, false, false, false)
    RequestCollisionAtCoord(c.x, c.y, h)
    Wait(50)
    local found, z = GetGroundZFor_3dCoord(c.x, c.y, h + 1.0, false)
    if found then groundZ = z break end
  end
  SetEntityCoordsNoOffset(ent, c.x, c.y, (groundZ or 150.0) + 1.0, false, false, false)
  FreezeEntityPosition(ent, false)
  notify(groundZ and '~b~Teleported to your waypoint.' or '~y~Teleported — ground not found, dropped you from above.')
end)

-- Canlı tespit uyarısı (sunucu yalnızca "logs" izni olan yöneticilere yollar).
RegisterNetEvent('coreac:acAlert', function(a)
  if type(a) ~= 'table' or alertMode == 'off' then return end
  if alertMode == 'actions' and a.action ~= 'KICK' and a.action ~= 'BAN' then return end
  SendNUIMessage({ type = 'acAlert', alert = {
    id = tonumber(a.id) or 0, name = tostring(a.name or '?'),
    label = tostring(a.label or a.type or '?'), action = tostring(a.action or 'LOG'),
  } })
  PlaySoundFrontend(-1, 'ATM_WINDOW', 'HUD_FRONTEND_DEFAULT_SOUNDSET', true)
end)

-- Oyuncu etiketleri — yakındaki oyuncuların sunucu ID'si, adı ve canı
-- (izleme izni olan yöneticiler için; yalnızca görsel katman).
local function drawTag(x, y, z, text, dist)
  local onScreen, sx, sy = World3dToScreen2d(x, y, z)
  if not onScreen then return end
  local scale = math.max(0.24, 0.42 - dist * 0.004)
  SetTextFont(4)
  SetTextScale(0.0, scale)
  SetTextColour(255, 255, 255, 230)
  SetTextOutline()
  SetTextCentre(true)
  BeginTextCommandDisplayText('STRING')
  AddTextComponentSubstringPlayerName(text)
  EndTextCommandDisplayText(sx, sy)
end

CreateThread(function()
  while true do
    if tagsOn and has('spectate') then
      local me = PlayerPedId()
      local myPos = GetEntityCoords(me)
      for _, pid in ipairs(GetActivePlayers()) do
        local tped = GetPlayerPed(pid)
        if tped ~= me and DoesEntityExist(tped) then
          local p = GetEntityCoords(tped)
          local d = #(p - myPos)
          if d < 90.0 then
            -- Oyuncu adı saldırganın kontrolünde: GTA metin kodlarını (~r~ vb.) sök.
            local nm = (GetPlayerName(pid) or '?'):gsub('~', '')
            local hp = math.max(0, GetEntityHealth(tped) - 100)
            drawTag(p.x, p.y, p.z + 1.05, ('[%d] %s  ~c~%d HP'):format(GetPlayerServerId(pid), nm, hp), d)
          end
        end
      end
      Wait(0)
    else
      Wait(400)
    end
  end
end)

-- NUI bindirmeler (menü kapalıyken de görünür — SetNuiFocus GEREKMEZ, sadece
-- görsel katman). Client/main.lua'daki genel NUI değil, admin menüsünün kendi
-- sayfası bunları çizer.
RegisterNetEvent('coreac:dm', function(from, message)
  SendNUIMessage({ type = 'dm', from = tostring(from or 'Admin'), message = tostring(message or '') })
end)

-- Uyarı: duyuru gibi ekranın üst ortasında (sarı), sesli.
RegisterNetEvent('coreac:warned', function(reason, from)
  SendNUIMessage({ type = 'warn', message = tostring(reason or ''), from = tostring(from or '') })
  PlaySoundFrontend(-1, 'CHECKPOINT_MISSED', 'HUD_MINI_GAME_SOUNDSET', true)
end)

RegisterNetEvent('coreac:announceBanner', function(message, from)
  SendNUIMessage({ type = 'announce', message = tostring(message or ''), from = tostring(from or '') })
  PlaySoundFrontend(-1, 'CHECKPOINT_PERFECT', 'HUD_MINI_GAME_SOUNDSET', true)
end)

-- ---------------------------------------------------------------------------
-- Görsel yönetim paneli (NUI)
--   * Yalnızca izinli adminlere açılır.
--   * Sadece arayüz: aksiyonlar 'coreac:adminAction', veri istekleri
--     'coreac:menuData' / 'coreac:menuPlayer' / 'coreac:menuUnban' ile sunucuya
--     gider ve orada AYRICA izin + oran kontrolünden geçer.
-- ---------------------------------------------------------------------------
local function permArray()
  local arr = {}
  for perm, on in pairs(myPerms) do if on then arr[#arr + 1] = perm end end
  return arr
end

RegisterNetEvent('coreac:playerList', function(list)
  lastPlayers = list or {}
  if menuOpen then SendNUIMessage({ type = 'players', players = lastPlayers }) end
end)

RegisterNetEvent('coreac:menuData', function(tab, rows, ok)
  if menuOpen then SendNUIMessage({ type = 'tab', tab = tab, rows = rows or {}, ok = ok == true }) end
end)

RegisterNetEvent('coreac:menuPlayer', function(live, profile)
  if menuOpen then SendNUIMessage({ type = 'player', live = live, profile = profile }) end
end)

RegisterNetEvent('coreac:menuResult', function(action, ok)
  if menuOpen then SendNUIMessage({ type = 'result', action = action, ok = ok == true }) end
end)

local function openMenu()
  TriggerServerEvent('coreac:requestPerms')
  TriggerServerEvent('coreac:requestPlayers')
  Wait(220)  -- izinler + roster gelsin
  local perms = permArray()
  if #perms == 0 then
    notify('~r~You have no admin permissions.')
    return
  end
  menuOpen = true
  SetNuiFocus(true, true)
  SendNUIMessage({
    type = 'open',
    resource = GetCurrentResourceName(),
    brand = Config.BrandName or 'CoreAC',
    perms = perms,
    players = lastPlayers,
    selfId = GetPlayerServerId(PlayerId()),
    spectating = spectating,
    alertMode = alertMode,
    tags = tagsOn,
    -- NUI odaktayken oyun tuş eşlemesi çalışmaz; aynı tuşla kapatabilmek için
    -- NUI'nin kendisi dinler.
    menuKey = Config.AdminMenuKey or '',
  })
end

local function shutMenu()
  menuOpen = false
  SetNuiFocus(false, false)
end

RegisterCommand(Config.AdminMenuCommand or 'acmenu', function()
  if menuOpen then return end
  CreateThread(openMenu)
end, false)

if Config.AdminMenuKey and Config.AdminMenuKey ~= '' then
  RegisterKeyMapping(Config.AdminMenuCommand or 'acmenu', 'CoreAC — Admin Panel', 'keyboard', Config.AdminMenuKey)
end

RegisterNUICallback('action', function(data, cb)
  if data and type(data.action) == 'string' then
    local tid = data.targetId and tonumber(data.targetId) or nil
    TriggerServerEvent('coreac:adminAction', data.action, tid, data.arg)
  end
  cb('ok')
end)

RegisterNUICallback('refresh', function(_, cb)
  TriggerServerEvent('coreac:requestPlayers')
  cb('ok')
end)

RegisterNUICallback('fetchTab', function(data, cb)
  if data and type(data.tab) == 'string' then
    TriggerServerEvent('coreac:menuData', data.tab, type(data.q) == 'string' and data.q or nil)
  end
  cb('ok')
end)

RegisterNUICallback('playerDetail', function(data, cb)
  if data and data.id then TriggerServerEvent('coreac:menuPlayer', tonumber(data.id)) end
  cb('ok')
end)

RegisterNUICallback('unban', function(data, cb)
  if data and data.banId then TriggerServerEvent('coreac:menuUnban', tostring(data.banId)) end
  cb('ok')
end)

RegisterNUICallback('stopSpectate', function(_, cb)
  requestStopSpectate()
  cb('ok')
end)

RegisterNUICallback('setAlertMode', function(data, cb)
  local m = data and data.mode
  if m == 'all' or m == 'actions' or m == 'off' then
    alertMode = m
    SetResourceKvp('coreac_alerts', m)
  end
  cb({ mode = alertMode })
end)

RegisterNUICallback('setTags', function(data, cb)
  tagsOn = (data and data.on == true and has('spectate')) or false
  cb({ on = tagsOn })
end)

-- Yöneticinin kendi konumu (kopyalamak için — blacklist bölgesi, ışınlama
-- noktası vb. ayarlarken işe yarar).
RegisterNUICallback('coords', function(_, cb)
  local ped = PlayerPedId()
  local c = GetEntityCoords(ped)
  cb({ x = c.x, y = c.y, z = c.z, h = GetEntityHeading(ped) })
end)

RegisterNUICallback('close', function(_, cb)
  shutMenu()
  cb('ok')
end)

-- Kaynak durdurulursa (restart) odak ve donmuş ped'de takılı kalınmasın.
AddEventHandler('onResourceStop', function(res)
  if res ~= GetCurrentResourceName() then return end
  if menuOpen then SetNuiFocus(false, false) end
  if spectating then
    NetworkSetInSpectatorMode(false, PlayerPedId())
    FreezeEntityPosition(PlayerPedId(), false)
  end
end)
