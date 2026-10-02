-- =============================================================================
-- server/telemetry_guard.lua — anti-cheat raporları ile sunucunun gördüğü
-- gerçeği karşılaştırır (STATE_DESYNC).
--
-- NEDEN: executor'lar client tarafındaki anti-cheat'i kör etmek için onun
-- ortamındaki native'leri (GetEntityCoords, GetEntityHealth…) sahte değer
-- döndürecek şekilde değiştirebilir. O zaman client'taki noclip / teleport /
-- godmode kontrolleri hep "temiz" görür. Ama oyuncunun ped'i sunucuya OneSync ile
-- oyun motorunun kendisi tarafından senkronlanır — hile bunu da sahteleyemez
-- (sahtelerse herkes onu yanlış yerde görür). Bu modül, client'ın 3 sn'de bir
-- gönderdiği konum raporunu (client/main.lua → coreac:pos) sunucunun o anda
-- gördüğü ped konumuyla kıyaslar. Sürekli tutarsızlık = anti-cheat'e yalan
-- söyleniyor.
--
-- YANLIŞ-POZİTİF TASARIMI:
--   * Tolerans: 30 m + hız × (1.5 sn + ping). Rapor ile kontrol arasında geçen
--     sürede araçla/uçakla hızla gidilen mesafe her zaman içinde kalır.
--   * Art arda 3 rapor (≈9 sn) tutarsız olmalı; tek bir uyuşmazlık (rapor
--     yolda iken script ışınlaması, kısa ağ takılması) sayılmaz, eşleşen ilk
--     rapor sayacı sıfırlar.
--   * Meşru ışınlanma / revive muafiyeti sürerken (CAC.markTeleport, respawn,
--     revive) hiç sayılmaz.
--   * Oyuncunun ilk 45 sn'si (yükleme, karakter seçimi) ve sunucunun konum
--     bilmediği durumlar (0,0,0 — OneSync kapalı) atlanır.
--   * Trust whitelist'teki oyuncu atlanır; yetkili araçları (txAdmin noclip)
--     staff_tools.lua'daki muafiyet listesindedir.
-- =============================================================================

local function ruleOn(key)
  return CAC.getRules()[key] == true
end

local BASE_TOL_M     = 30.0
local TRAVEL_S       = 1.5
local NEEDED         = 3
local WARMUP_MS      = 45000

local state = {}   -- src -> { first, strikes, samples }

local function round1(n) return math.floor((tonumber(n) or 0) * 10 + 0.5) / 10 end
local function fmt(x, y, z) return ('%.1f, %.1f, %.1f'):format(x, y, z) end

RegisterNetEvent('coreac:pos', function(d)
  local src = source
  if not ruleOn('anti_state_desync') then return end
  if CAC.eventLimited(src, 'posDesync', 10, 2000) then return end
  if type(d) ~= 'table' then return end
  local cx, cy, cz = tonumber(d.x), tonumber(d.y), tonumber(d.z)
  if not (cx and cy and cz) or cx ~= cx or cy ~= cy or cz ~= cz then return end   -- NaN

  local now = GetGameTimer()
  local s = state[src]
  if not s then
    s = { first = now, strikes = 0, samples = {} }
    state[src] = s
  end
  if now - s.first < WARMUP_MS then return end

  local function reset() s.strikes, s.samples = 0, {} end
  if CAC.isWhitelisted and CAC.isWhitelisted(src) then return reset() end
  if (CAC.hasTpGrace and CAC.hasTpGrace(src)) or (CAC.hasReviveGrace and CAC.hasReviveGrace(src)) then return reset() end

  local ped = GetPlayerPed(src)
  if not ped or ped == 0 or not DoesEntityExist(ped) then return end
  local sc = GetEntityCoords(ped)
  if math.abs(sc.x) < 1.0 and math.abs(sc.y) < 1.0 then return end   -- sunucu konumu bilmiyor
  if math.abs(cx) < 1.0 and math.abs(cy) < 1.0 then return end       -- client henüz doğmadı

  local veh = GetVehiclePedIsIn(ped, false)
  local v = GetEntityVelocity((veh and veh ~= 0) and veh or ped)
  local speed = math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  local ping = tonumber(GetPlayerPing(src)) or 0
  local tol = BASE_TOL_M + speed * (TRAVEL_S + ping / 1000)

  local dx, dy, dz = cx - sc.x, cy - sc.y, cz - sc.z
  local dist = math.sqrt(dx * dx + dy * dy + dz * dz)
  if dist <= tol then return reset() end

  s.strikes = s.strikes + 1
  s.samples[#s.samples + 1] = { dist = dist, tol = tol }
  if s.strikes < NEEDED then return end

  local minDist = math.huge
  for _, e in ipairs(s.samples) do if e.dist < minDist then minDist = e.dist end end
  reset()
  TriggerEvent('coreac:serverReport', src, 'STATE_DESYNC', 'HIGH', {
    source        = 'telemetry_mismatch',
    reports       = NEEDED,
    distance      = math.floor(minDist),
    tolerance     = math.floor(tol),
    speed         = round1(speed),
    reportedPos   = fmt(cx, cy, cz),
    serverPos     = fmt(sc.x, sc.y, sc.z),
    -- Can/zırh da kıyaslanır (kanıt için; karar konuma dayanır).
    reportedHealth = tonumber(d.health),
    serverHealth   = GetEntityHealth(ped),
    reportedArmor  = tonumber(d.armor),
    serverArmor    = GetPedArmour(ped),
  })
end)

AddEventHandler('playerDropped', function()
  state[source] = nil
end)
