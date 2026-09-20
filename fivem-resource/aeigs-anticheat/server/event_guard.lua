-- =============================================================================
-- Anti Event Flood — sunucu-taraflı net-event spam koruması.
--
-- FiveM'de "her net-event'i yakalayan" evrensel bir sunucu hook'u YOKTUR ve
-- diğer resource'ların event'lerini global override ile sarmak (invasive) hem
-- kırılgan hem false-positive kaynağıdır — YAPILMAZ. Bunun yerine, kendi
-- anti-cheat KONTROL event'lerimizi izleriz: bir client bunları meşru hızın çok
-- ötesinde spam'lerse (crash/exploit aracı ya da ele geçmiş client), yakalarız.
--
-- FALSE-POSITIVE'e karşı titiz:
--   * Sadece SEYREK olması gereken kontrol event'leri sayılır. Atış-başına
--     (weaponHit/aim), pozisyon (pos) ve OYUN event'leri (weaponDamage/explosion
--     — minigun saniyede ~50 event üretir) ASLA sayılmaz.
--   * Giriş anındaki istek patlaması (requestRules/perms vb.) 15 sn in-game
--     grace ile atlanır.
--   * Admin/whitelist muaf.
--   * Yalnızca EVENT_EXPLOIT (strong → en fazla KICK) raporlanır — ASLA ban.
-- =============================================================================

Aeigs = Aeigs or {}

local COUNT_WINDOW    = 2000   -- ms
local FLOOD_LIMIT     = 30     -- >30 kontrol event'i / 2 sn (aynı src) = flood
local REPORT_COOLDOWN = 10000  -- ms — aynı oyuncuyu spam-raporlama
local SPAWN_GRACE     = 15000  -- ms — giriş/spawn süresince sayma

local function ruleOn(key)
  local r = Aeigs.getRules and Aeigs.getRules() or {}
  return r[key] == true
end

local buckets    = {}  -- [src] = { count, reset }
local lastReport = {}  -- [src] = gameTimer

--- Bir client kontrol event'i geldiğinde çağrılır (event handler'larının başında).
function Aeigs.noteEvent(src)
  src = tonumber(src)
  if not src or src <= 0 then return end
  if not ruleOn('anti_event_flood') then return end
  -- Muafiyetler: admin/whitelist ve giriş/spawn grace.
  if Aeigs.isWhitelisted and Aeigs.isWhitelisted(src) then return end
  if Aeigs.isInGame and not Aeigs.isInGame(src, SPAWN_GRACE) then return end

  local now = GetGameTimer()
  local b = buckets[src]
  if not b or now > b.reset then
    buckets[src] = { count = 1, reset = now + COUNT_WINDOW }
    return
  end
  b.count = b.count + 1
  if b.count > FLOOD_LIMIT then
    local lr = lastReport[src]
    if not lr or (now - lr) > REPORT_COOLDOWN then
      lastReport[src] = now
      TriggerEvent('aeigs:serverReport', src, 'EVENT_EXPLOIT', 'HIGH', {
        rate = b.count, windowMs = COUNT_WINDOW,
      })
    end
  end
end

AddEventHandler('playerDropped', function()
  local s = source
  buckets[s] = nil
  lastReport[s] = nil
end)
