-- Core Shield Anti-Cheat — oyun içi yönetici: /ac komutları + görsel yönetim
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
  revive = '/ac revive [id]',
  tp = '/ac tp [id]',
  bring = '/ac bring [id]',
  freeze = '/ac freeze [id] on|off',
  announce = '/ac announce [message]',
  screenshot = '/ac ss [id]',
}

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
RegisterNetEvent('aeigs:perms', function(list)
  myPerms = {}
  for _, p in ipairs(list or {}) do myPerms[p] = true end
end)

RegisterNetEvent('aeigs:notify', function(msg) notify(msg) end)

-- /ac id sonucu — kendi identifier'larını gösterir (panele admin eklemek için).
-- Konsola da basılır ki F8'den kopyalanabilsin.
RegisterNetEvent('aeigs:whoami', function(info)
  info = info or {}
  local lines = { '~b~— Your identifiers —' }
  lines[#lines + 1] = '~w~license: ~y~' .. tostring(info.license or 'n/a')
  lines[#lines + 1] = '~w~discord: ~y~' .. tostring(info.discord or 'not linked')
  lines[#lines + 1] = '~w~steam:   ~y~' .. tostring(info.steam or 'not running')
  lines[#lines + 1] = info.isAdmin and ('~g~You ARE an admin (' .. tostring(info.role or '?') .. ').') or '~r~Not an admin yet — add one of the above on the web panel.'
  notify(table.concat(lines, '\n'))
  print('[Core Shield] Your identifiers (add one on the web panel → Admins):')
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
    if Aeigs and Aeigs.markTp then Aeigs.markTp() end
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
    if not spectating and Aeigs and Aeigs.markSpectate then Aeigs.markSpectate(false) end
  end)
  if menuOpen then SendNUIMessage({ type = 'spectate', on = false }) end
  notify('~b~Spectate stopped.')
end

local function requestStopSpectate()
  if not spectating then return end
  -- Eski konuma dönmek bir ışınlanma → sunucudan muafiyet iste; sunucu
  -- 'spectate' iznini doğrulayınca aeigs:spectateReturn ile döneriz.
  TriggerServerEvent('aeigs:spectateEnd')
  stopToken = stopToken + 1
  local token = stopToken
  CreateThread(function()
    Wait(3000)
    if spectating and stopToken == token then endSpectateLocal(false) end
  end)
end

RegisterNetEvent('aeigs:spectateReturn', function()
  if spectating then endSpectateLocal(true) end
end)

RegisterNetEvent('aeigs:spectate', function(targetId, x, y, z)
  local tid = tonumber(targetId) or 0
  if tid == 0 then requestStopSpectate() return end

  local ped = PlayerPedId()
  if not spectating then
    local c = GetEntityCoords(ped)
    spectateReturn = { x = c.x, y = c.y, z = c.z }
  end
  spectating = true
  if Aeigs and Aeigs.markTp then Aeigs.markTp() end
  if Aeigs and Aeigs.markSpectate then Aeigs.markSpectate(true) end   -- yetkili izleme muaf
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
  TriggerServerEvent('aeigs:requestPerms')
  Wait(150)
  local cmd = args[1]
  if not cmd then
    local lines = { '~b~— Core Shield Admin —' }
    local any = false
    for perm, help in pairs(PERM_HELP) do
      if has(perm) then lines[#lines + 1] = '~w~' .. help; any = true end
    end
    if any then lines[#lines + 1] = '~w~/' .. (Config.AdminMenuCommand or 'acmenu') .. ' — full admin panel' end
    lines[#lines + 1] = '~w~/' .. (Config.AdminCommand or 'ac') .. ' id — show your identifiers'
    if not any then lines[#lines + 1] = '~r~You have no admin permissions. Use "/ac id" to get the identifier to add on the web panel.' end
    notify(table.concat(lines, '\n'))
    return
  end

  if cmd == 'id' or cmd == 'whoami' then
    TriggerServerEvent('aeigs:whoami')
    return
  end

  local id = tonumber(args[2])
  if cmd == 'kick' and has('kick') then
    TriggerServerEvent('aeigs:adminAction', 'kick', id, table.concat(args, ' ', 3))
  elseif cmd == 'ban' and has('ban') then
    TriggerServerEvent('aeigs:adminAction', 'ban', id, table.concat(args, ' ', 3))
  elseif cmd == 'warn' and has('warn') then
    TriggerServerEvent('aeigs:adminAction', 'warn', id, table.concat(args, ' ', 3))
  elseif cmd == 'revive' and has('revive') then
    TriggerServerEvent('aeigs:adminAction', 'revive', id)
  elseif cmd == 'tp' and has('tp') then
    TriggerServerEvent('aeigs:adminAction', 'tp', id)
  elseif cmd == 'bring' and has('bring') then
    TriggerServerEvent('aeigs:adminAction', 'bring', id)
  elseif cmd == 'spectate' and has('spectate') then
    if id == 0 or id == nil then requestStopSpectate()   -- sunucuya gitmez: yerel durdur
    else TriggerServerEvent('aeigs:adminAction', 'spectate', id) end
  elseif cmd == 'freeze' and has('freeze') then
    TriggerServerEvent('aeigs:adminAction', 'freeze', id, args[3] or 'on')
  elseif cmd == 'announce' and has('announce') then
    TriggerServerEvent('aeigs:adminAction', 'announce', nil, table.concat(args, ' ', 2))
  elseif cmd == 'ss' and has('screenshot') then
    TriggerServerEvent('aeigs:adminAction', 'screenshot', id)
  else
    notify('~r~Unknown command, or you lack permission.')
  end
end, false)

-- İzinler değişince menüyü baştan iste
CreateThread(function()
  Wait(3000)
  TriggerServerEvent('aeigs:requestPerms')
end)

-- ---------------------------------------------------------------------------
-- Aksiyon alıcıları — sunucudan tetiklenir; hepsi YALNIZCA yerel oyuncuya
-- uygulanır. Bunlar için ayrı bir "local trigger" koruması GEREKMEZ: kendini
-- iyileştirmek/dondurmak istismar değildir, ışınlanma/spectate muafiyeti ise
-- sunucu tarafında Aeigs.grantTp/grantRevive ile verilir (hileci client
-- event'ini uydursa da sunucu muafiyetini alamaz → sunucu tespiti yakalar).
-- ---------------------------------------------------------------------------
RegisterNetEvent('aeigs:revive', function()
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

RegisterNetEvent('aeigs:freeze', function(state)
  local ped = PlayerPedId()
  FreezeEntityPosition(ped, state == true)
  notify(state and '~b~You have been frozen.' or '~b~You have been unfrozen.')
end)

RegisterNetEvent('aeigs:teleport', function(x, y, z)
  if Aeigs and Aeigs.markTp then Aeigs.markTp() end  -- yetkili ışınlama → tespit muaf
  local ped = PlayerPedId()
  SetEntityCoords(ped, x + 0.0, y + 0.0, z + 1.0, false, false, false, false)
  notify('~b~You have been teleported.')
end)

RegisterNetEvent('aeigs:heal', function()
  local ped = PlayerPedId()
  SetEntityHealth(ped, GetEntityMaxHealth(ped))
  ClearPedBloodDamage(ped)
  ResetPedVisibleDamage(ped)
  ClearPedLastWeaponDamage(ped)
  notify('~g~You were healed by an admin.')
end)

RegisterNetEvent('aeigs:armor', function()
  SetPedArmour(PlayerPedId(), 100)
  notify('~b~You received armor.')
end)

-- Yakındaki araçları temizle + takılmayı kurtar (yalnızca bu client'ın sahip
-- olduğu ağ-entity'leri silinir; başkasının/haritanın nesnesi etkilenmez).
RegisterNetEvent('aeigs:resetEntities', function()
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

-- NUI bindirmeler (menü kapalıyken de görünür — SetNuiFocus GEREKMEZ, sadece
-- görsel katman). Client/main.lua'daki genel NUI değil, admin menüsünün kendi
-- sayfası bunları çizer.
RegisterNetEvent('aeigs:dm', function(from, message)
  SendNUIMessage({ type = 'dm', from = tostring(from or 'Admin'), message = tostring(message or '') })
end)

RegisterNetEvent('aeigs:announceBanner', function(message, from)
  SendNUIMessage({ type = 'announce', message = tostring(message or ''), from = tostring(from or '') })
  PlaySoundFrontend(-1, 'CHECKPOINT_PERFECT', 'HUD_MINI_GAME_SOUNDSET', true)
end)

-- ---------------------------------------------------------------------------
-- Görsel yönetim paneli (NUI)
--   * Yalnızca izinli adminlere açılır.
--   * Sadece arayüz: aksiyonlar 'aeigs:adminAction', veri istekleri
--     'aeigs:menuData' / 'aeigs:menuPlayer' / 'aeigs:menuUnban' ile sunucuya
--     gider ve orada AYRICA izin + oran kontrolünden geçer.
-- ---------------------------------------------------------------------------
local function permArray()
  local arr = {}
  for perm, on in pairs(myPerms) do if on then arr[#arr + 1] = perm end end
  return arr
end

RegisterNetEvent('aeigs:playerList', function(list)
  lastPlayers = list or {}
  if menuOpen then SendNUIMessage({ type = 'players', players = lastPlayers }) end
end)

RegisterNetEvent('aeigs:menuData', function(tab, rows, ok)
  if menuOpen then SendNUIMessage({ type = 'tab', tab = tab, rows = rows or {}, ok = ok == true }) end
end)

RegisterNetEvent('aeigs:menuPlayer', function(live, profile)
  if menuOpen then SendNUIMessage({ type = 'player', live = live, profile = profile }) end
end)

RegisterNetEvent('aeigs:menuResult', function(action, ok)
  if menuOpen then SendNUIMessage({ type = 'result', action = action, ok = ok == true }) end
end)

local function openMenu()
  TriggerServerEvent('aeigs:requestPerms')
  TriggerServerEvent('aeigs:requestPlayers')
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
  RegisterKeyMapping(Config.AdminMenuCommand or 'acmenu', 'Core Shield — Admin Panel', 'keyboard', Config.AdminMenuKey)
end

RegisterNUICallback('action', function(data, cb)
  if data and type(data.action) == 'string' then
    local tid = data.targetId and tonumber(data.targetId) or nil
    TriggerServerEvent('aeigs:adminAction', data.action, tid, data.arg)
  end
  cb('ok')
end)

RegisterNUICallback('refresh', function(_, cb)
  TriggerServerEvent('aeigs:requestPlayers')
  cb('ok')
end)

RegisterNUICallback('fetchTab', function(data, cb)
  if data and type(data.tab) == 'string' then
    TriggerServerEvent('aeigs:menuData', data.tab, type(data.q) == 'string' and data.q or nil)
  end
  cb('ok')
end)

RegisterNUICallback('playerDetail', function(data, cb)
  if data and data.id then TriggerServerEvent('aeigs:menuPlayer', tonumber(data.id)) end
  cb('ok')
end)

RegisterNUICallback('unban', function(data, cb)
  if data and data.banId then TriggerServerEvent('aeigs:menuUnban', tostring(data.banId)) end
  cb('ok')
end)

RegisterNUICallback('stopSpectate', function(_, cb)
  requestStopSpectate()
  cb('ok')
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
