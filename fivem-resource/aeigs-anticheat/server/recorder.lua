-- recorder.lua (sunucu) — hile test kayıtlarını dosyaya yazar
-- Client'tan gelen kayıt tamponunu resources/aeigs-anticheat/ KÖK klasörüne
-- aeigs_rec_<oyuncu>_<zaman>.json olarak yazar. Sunucu konsoluna tam yol basar.

local RES = GetCurrentResourceName()

-- Kayıt yetkisi: şimdilik HERKES kayıt yapabilir (test amaçlı).
-- Kısıtlamak istersen burada admin/izin kontrolü ekleyebilirsin.
local function canRecord(src)
  return true
end

RegisterNetEvent('aeigs:rec:auth', function()
  local src = source
  if canRecord(src) then
    TriggerClientEvent('aeigs:rec:allow', src)
    Aeigs.log('INFO', 'recorder', ('%s started a cheat recording'):format(GetPlayerName(src) or src))
  else
    TriggerClientEvent('aeigs:rec:deny', src)
  end
end)

local function sanitize(s)
  return (tostring(s):gsub('[^%w%-_]', '_'))
end

RegisterNetEvent('aeigs:rec:dump', function(frames)
  local src = source
  if not canRecord(src) then return end
  if type(frames) ~= 'table' then return end

  local pname = sanitize(GetPlayerName(src) or ('p' .. src))
  local ts = os.date('%Y%m%d_%H%M%S')
  -- Alt klasör YOK — doğrudan resource kök#üne yaz (SaveResourceFile bazı
  -- sürümlerde alt klasör oluşturmuyor, o yüzden dosya "kaybolmuş" gibi olur).
  local fname = ('aeigs_rec_%s_%s.json'):format(pname, ts)

  local payload = {
    player = GetPlayerName(src),
    serverId = src,
    recordedAt = ts,
    frameCount = #frames,
    frames = frames,
  }

  local ok, encoded = pcall(json.encode, payload)
  if not ok or not encoded then
    Aeigs.log('ERROR', 'recorder', 'JSON encode failed')
    TriggerClientEvent('aeigs:notify', src, '~r~Could not save the recording (encode).')
    return
  end

  local saved = SaveResourceFile(RES, fname, encoded, #encoded)
  local path = ('resources/%s/%s'):format(RES, fname)
  if saved then
    print(('^2[Core Shield] KAYIT YAZILDI → %s (%d kare, %d bayt)^7'):format(path, #frames, #encoded))
    Aeigs.log('INFO', 'recorder', ('Recording: %s (%d frames)'):format(fname, #frames))
    TriggerClientEvent('aeigs:notify', src, ('~g~Recording saved: %s (%d frames)'):format(fname, #frames))
  else
    print(('^1[Core Shield] KAYIT YAZILAMADI → %s (SaveResourceFile false)^7'):format(path))
    TriggerClientEvent('aeigs:notify', src, '~r~Could not save the recording (file).')
  end
end)
