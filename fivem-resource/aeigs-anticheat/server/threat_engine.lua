-- threat_engine.lua — Merkezi tehdit puanlama (cross-signal korelasyon)
--
-- AMAÇ: Tüm tespit modüllerinin (godmode, aimbot, noclip, silent aim, hatta
-- zayıf/rapor-only sinyaller) ürettiği raporları TEK bir oyuncu bazlı "tehdit
-- skoru" altında birleştirmek. Tek zayıf sinyal (ör. "hile menüsü şüphesi")
-- ASLA otomatik ban atmaz; ama BAĞIMSIZ KATEGORİLERDEN sinyal birikirse
-- (aimbot + noclip + menü şüphesi aynı oyuncuda kısa sürede), skor hızla
-- eşiği aşar ve TEHDİT SKORU KENDİ BAŞINA (her tekil modül henüz kendi
-- eşiğine ulaşmamış olsa bile) ban/kick tetikleyebilir.
--
-- ENTEGRASYON (ÖNEMLİ — orijinal tasarımdaki hata burada düzeltildi):
-- Bu dosya kendi DropPlayer/ban akışını KURMAZ. Skor eşiği aşınca mevcut
-- 'aeigs:serverReport' köprüsünü (type='THREAT_SCORE') tetikler — böylece
-- ban kararı web API'sindeki ayarlanabilir Aksiyonlar sistemine (LOG/KICK/
-- BAN), whitelist kontrolüne ve gerçek Ban veritabanı kaydına (ban kodu
-- dahil) TABİ olur; ayrı, kayıtsız bir "gölge ban" sistemi OLUŞTURMAZ.
--
-- KALICI KİMLİK: session id (`source`) oyuncu her bağlandığında değişir.
-- Kick sonrası tekrar giren hileci sıfırdan başlamasın diye skoru
-- license identifier'a göre saklıyoruz.

local scores = {}     -- [license] = { score, lastDecay, history = {} }
local vidToLic = {}   -- [vid] = license  (session -> kalıcı kimlik eşlemesi)

-- Tip (+ reason) bazlı ağırlıklar. GODMODE/AIMBOT/SILENT_AIM/NOCLIP gibi
-- zaten server-authoritative ve kendi başına güçlü olan tipler yüksek
-- ağırlıklı; RAPID_FIRE/WALLBANG/NO_RECOIL gibi rapor-only/yumuşak sinyaller
-- düşük ağırlıklı — tek başlarına ASLA anlamlı bir skora ulaşamazlar, sadece
-- başka güçlü bir sinyalle BİRLİKTE anlam kazanırlar.
local WEIGHTS = {
  GODMODE               = { pool_not_dropping = 60, flags = 20 },
  AIMBOT                = { snap = 35, sustained_lock = 45 },
  SILENT_AIM            = { confirm1 = 50, confirm2 = 30 },
  CHEAT_MENU_SUSPECTED  = { global_marker = 20, frametime_spike = 6 },
  NOCLIP                = { default = 45 },
  VEHICLE_NOCLIP        = { default = 40 },
  FLYHACK               = { default = 45 },
  TELEPORT              = { default = 40 },
  OUT_OF_BOUNDS         = { default = 45 },
  SUPER_JUMP            = { default = 40 },
  SPEED_HACK            = { default = 35 },
  VEHICLE_SPEED         = { default = 35 },
  VEHICLE_GODMODE       = { default = 50 },
  GIVE_ALL_WEAPONS      = { default = 50 },
  ARMOR_HACK            = { default = 45 },
  DAMAGE_MULTIPLIER     = { default = 35 },
  EXPLOSIVE_BULLETS     = { default = 35 },
  INFINITE_AMMO         = { default = 30 },
  NO_RELOAD             = { default = 30 },
  RAPID_FIRE            = { default = 8 },
  WALLBANG              = { default = 10 },
  NO_RECOIL             = { default = 8 },
  NO_FALL_DAMAGE        = { default = 10 },
  ARMOR_REGEN           = { default = 10 },
  INSTANT_REPAIR        = { default = 8 },
  RECONNECT_SPAM        = { default = 5 },
  FREECAM               = { default = 10 },
  SPECTATE              = { default = 10 },
  INVISIBLE             = { default = 15 },
  MODEL_CHANGE          = { default = 10 },
  PROP_DISGUISE         = { default = 12 },
}

local DECAY_PER_MIN = Config.ThreatDecayPerMin or 10
local THRESH_KICK    = Config.ThreatKickAt or 60
local THRESH_BAN     = Config.ThreatBanAt or 100

local function getLicense(vid)
  if vidToLic[vid] then return vidToLic[vid] end
  for _, id in ipairs(GetPlayerIdentifiers(vid)) do
    if id:sub(1, 8) == 'license:' then
      vidToLic[vid] = id
      return id
    end
  end
  vidToLic[vid] = 'session:' .. tostring(vid)
  return vidToLic[vid]
end

local function getScore(lic)
  if not scores[lic] then
    scores[lic] = { score = 0, lastDecay = GetGameTimer(), history = {} }
  end
  return scores[lic]
end

local function decay(t)
  local now = GetGameTimer()
  local mins = (now - t.lastDecay) / 60000
  if mins > 0 then
    t.score = math.max(0, t.score - mins * DECAY_PER_MIN)
    t.lastDecay = now
    if t.kickSent and t.score < THRESH_KICK then t.kickSent = false end
  end
end

--- Bir raporun "reason" anahtarını (ağırlık tablosunda arama için) çıkarır.
local function reasonOf(details)
  if type(details) ~= 'table' then return 'default' end
  if details.reason then return tostring(details.reason) end
  if details.source then return tostring(details.source) end
  if details.confirm then return 'confirm' .. tostring(details.confirm) end
  return 'default'
end

--- ANA GİRİŞ NOKTASI — sunucu taraflı bridge'ler (main.lua/protection.lua)
--- her rapor geldiğinde bunu çağırır. Client'tan DOĞRUDAN ÇAĞRILAMAZ
--- (client ve server ayrı Lua ortamlarıdır) — bu yüzden entegrasyon
--- yalnızca server-side rapor köprülerinde yapılmalıdır.
function Aeigs.threatSignal(vid, dtype, details)
  vid = tonumber(vid)
  if not vid then return end
  local lic = getLicense(vid)
  local t = getScore(lic)
  decay(t)

  local reason = reasonOf(details)
  local catWeights = WEIGHTS[dtype]
  local w = (catWeights and (catWeights[reason] or catWeights.default)) or 15
  t.score = t.score + w

  table.insert(t.history, { type = dtype, reason = reason, ts = GetGameTimer() })
  if #t.history > 20 then table.remove(t.history, 1) end

  -- Cross-signal bonus: farklı TİPLERDEN sinyal birikmesi (tek modülün kendi
  -- içinde tekrar tetiklenmesi değil) ekstra ağırlık alır.
  local distinctTypes = {}
  for _, h in ipairs(t.history) do distinctTypes[h.type] = true end
  local distinctCount = 0
  for _ in pairs(distinctTypes) do distinctCount = distinctCount + 1 end
  if distinctCount >= 2 then
    t.score = t.score + (distinctCount - 1) * 15
  end

  if t.score >= THRESH_BAN then
    local score = math.floor(t.score)
    scores[lic] = nil
    TriggerEvent('aeigs:serverReport', vid, 'THREAT_SCORE', 'CRITICAL', { score = score, signals = #t.history })
  elseif t.score >= THRESH_KICK and not t.kickSent then
    -- Skoru SIFIRLAMIYORUZ — kick sonrası tekrar girerse kaldığı yerden
    -- devam eder, "kick ye -> tekrar bağlan -> sıfırdan başla" döngüsü kapanır.
    -- (severity HIGH → web API bunu en fazla KICK'e çevirir, asla direkt ban atmaz.)
    -- t.kickSent skor tekrar eşiğin altına düşene kadar tekrar tetiklenmeyi önler.
    t.kickSent = true
    TriggerEvent('aeigs:serverReport', vid, 'THREAT_SCORE', 'HIGH', { score = math.floor(t.score), signals = #t.history })
  end
end

AddEventHandler('playerDropped', function()
  vidToLic[source] = nil   -- session eşlemesi silinir, ama scores[lic] KALIR
end)
