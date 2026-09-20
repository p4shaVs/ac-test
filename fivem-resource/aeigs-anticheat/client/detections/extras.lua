-- extras.lua — Freecam / Spectate / Infinite Stamina / Model change / Invisible
-- Hepsi RAPOR (otomatik ban YOK) — client'ta yanlış-pozitif riski nedeniyle.
CreateThread(function()
  local sprintStart = 0
  local lastModel, modelTimes = nil, {}
  while true do
    Wait(1000)
    local S = Aeigs.S
    if not S.ped or not Aeigs.active() then goto cont end

    -- Yetkisiz spectate (yönetici izni muaf)
    if Aeigs.rule('anti_spectate', true) and NetworkIsInSpectatorMode() and not Aeigs.spectateGrace() then
      Aeigs.report('SPECTATE', 'HIGH', {})
    end

    -- Freecam: kamera peddan >25m uzakta
    if Aeigs.rule('anti_freecam', true) and not S.inVeh and not S.cutscene and not S.dead then
      local d = #(GetGameplayCamCoord() - S.coords)
      if d > 25.0 then Aeigs.report('FREECAM', 'HIGH', { dist = math.floor(d) }) end
    end

    -- Infinite stamina: kesintisiz 45 sn koşu
    if Aeigs.rule('anti_infinite_stamina', true) then
      if IsPedSprinting(S.ped) then
        if sprintStart == 0 then sprintStart = GetGameTimer() end
        if GetGameTimer() - sprintStart > 45000 then sprintStart = 0; Aeigs.report('INFINITE_STAMINA', 'HIGH', {}) end
      else sprintStart = 0 end
    end

    -- Model değişimi: 30 sn'de >3 değişim
    if Aeigs.rule('anti_model_change', false) then
      local m = GetEntityModel(S.ped)
      if lastModel and m ~= lastModel then
        modelTimes[#modelTimes + 1] = GetGameTimer()
        local cnt = 0
        for i = #modelTimes, 1, -1 do if GetGameTimer() - modelTimes[i] < 30000 then cnt = cnt + 1 else break end end
        if cnt > 3 then modelTimes = {}; Aeigs.report('MODEL_CHANGE', 'HIGH', {}) end
      end
      lastModel = m
    end

    -- Invisible
    if Aeigs.rule('anti_invisibility', false) and not IsEntityVisible(S.ped) and not S.dead and not S.inVeh then
      Aeigs.report('INVISIBLE', 'HIGH', {})
    end

    -- Prop disguise: oyuncu ped'i insan DEĞİL (obje/hayvan/araç modeline
    -- bürünme exploit'i — "prop hunt" tarzı gizlenme). Aynı kurala bağlı
    -- (anti_model_change), rapor-only.
    if Aeigs.rule('anti_model_change', false) and not IsPedHuman(S.ped) and not S.dead then
      Aeigs.report('PROP_DISGUISE', 'HIGH', { model = GetEntityModel(S.ped) })
    end

    ::cont::
  end
end)
