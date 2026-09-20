-- menu_detect.lua — Hile menüsü (dolaylı) tespiti — SADECE ZAYIF SİNYAL
--
-- ÖNEMLİ: Bu dosya TEK BAŞINA kick/ban ATMAZ (severity her zaman LOW).
-- Ürettiği sinyaller zayıftır (lag, düşük donanım gibi masum sebeplerle de
-- tetiklenebilir) — bu yüzden sadece server/threat_engine.lua'daki merkezi
-- skora düşük ağırlıkla eklenir. Otomatik kick/ban kararı, godmode/aimbot
-- gibi güçlü sinyallerle BİRLİKTE biriken skor eşiği aştığında verilir.
--
-- NOT: Aeigs.report() kullanılır (Aeigs.threatSignal DEĞİL) — threatSignal
-- SUNUCU tarafı bir fonksiyondur, client'tan doğrudan çağrılamaz (FiveM'de
-- client/server ayrı Lua ortamlarıdır). Aeigs.report ağ üzerinden sunucuya
-- gider; sunucudaki merkezi köprü (main.lua) bunu threat_engine'e besler.

local knownGlobalMarkers = {
  -- Gerçek/doğrulanmış imzaları buraya ekle (ör. bilinen bir hile menüsünün
  -- global değişken adı). Tahmini/yanlış isim EKLEME — ya hiç yakalamaz ya
  -- da masum bir resource'un aynı adı kullanması durumunda yanlış işaretler.
  -- Varsayılan olarak BOŞTUR (dürüst placeholder) — bu yüzden bu kontrol
  -- şu an hiçbir şey yakalamaz, siz doldurana kadar zararsızdır.
}

local function scanGlobalMarkers()
  for _, marker in ipairs(knownGlobalMarkers) do
    if _G[marker] ~= nil then
      return marker
    end
  end
  return nil
end

local frametimeStrike = Aeigs.strike(5, 30000)
local lastTick = GetGameTimer()

CreateThread(function()
  while true do
    Wait(1000)
    if Aeigs.rule('anti_cheat_menu', true) and Aeigs.active() then
      local marker = scanGlobalMarkers()
      if marker then
        Aeigs.report('CHEAT_MENU_SUSPECTED', 'LOW', { reason = 'global_marker', marker = marker }, 60000)
      end

      -- Script thread'imizin zamanlaması ciddi şekilde sekiyorsa (planlanan
      -- 1000ms yerine 1500ms+) bu ağır hitch/loading OLABİLECEĞİ gibi bazı
      -- injection/hook teknikleri de script zamanlamasını bozabilir. Tek
      -- başına ÇOK zayıf bir sinyal (5 kez/30sn ister), asla ban atmaz.
      local now = GetGameTimer()
      local dt = now - lastTick
      lastTick = now
      if dt > 1500 then
        if frametimeStrike:hit() then
          Aeigs.report('CHEAT_MENU_SUSPECTED', 'LOW', { reason = 'frametime_spike', dt = dt }, 30000)
        end
      end
    else
      lastTick = GetGameTimer()
      Wait(2000)
    end
  end
end)
