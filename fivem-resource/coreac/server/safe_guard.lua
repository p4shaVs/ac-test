-- =============================================================================
-- server/safe_guard.lua — Panel → Configuration → Settings → Safe Guard
--
-- Kendi script'lerinin yanlış pozitif üretmesini engelleyen muafiyet listeleri:
--
--   Safe Events                       tuzak (honeypot) olay sistemi bu olayları ASLA kurmaz
--   Safe Scripts                      güvenilen resource: yarattığı araç/ped/obje spawn
--                                     kontrollerine girmez, enjeksiyon/backdoor kontrolünde
--                                     işaretlenmez, ışınlama/revive devri uzun tolerans alır
--   Ignored Scripts                   CoreAC'in tamamen dokunmadığı resource: ona atfedilen
--                                     HİÇBİR şey raporlanmaz (Safe'in tüm muafiyetleri + resource
--                                     durdur/başlat tespitleri dahil)
--   Anti Resource Injection Safe List resource-enjeksiyon kontrolünün asla işaretlemeyeceği kaynaklar
--
-- HEPSİ SUNUCUDA KALIR: Settings bölümü oyunculara yayınlanmaz (bridge/shared.lua
-- CoreAC.PublicSettings) — hileci neyin muaf olduğunu okuyamaz. Client kontrolleri
-- (resource enjeksiyonu, tuzak olaylar) raporlarını yine sunucuya gönderir; muafiyet
-- burada, panele gitmeden ÖNCE uygulanır (CAC.safeGuardDrops).
-- =============================================================================

CAC = CAC or {}

local sets = { events = {}, safe = {}, ignored = {}, injection = {} }

--- Bir kaynak yolundan resource adı: "@ox_lib/imports/print/client.lua" → "ox_lib".
--- Düz resource adı aynen döner. Boş/geçersizse nil.
local function resourceKey(v)
  if type(v) ~= 'string' then return nil end
  v = v:gsub('^@', '')
  return v:match('^([^/\\]+)')
end
CAC.resourceKey = resourceKey

local function toSet(list, keyFn)
  local out = {}
  if type(list) ~= 'table' then return out end
  for _, v in ipairs(list) do
    local k = keyFn and keyFn(v) or (type(v) == 'string' and v or nil)
    if k and k ~= '' then out[k] = true end
  end
  return out
end

--- Panelden yeni config geldiğinde çağrılır (bridge/server.lua CAC.onConfig).
function CAC.setSafeGuard(settings)
  settings = type(settings) == 'table' and settings or {}
  sets.events    = toSet(settings.SafeEvents)
  sets.safe      = toSet(settings.SafeScripts, resourceKey)
  sets.ignored   = toSet(settings.IgnoredScripts, resourceKey)
  sets.injection = toSet(settings.AntiResourceInjectionSafeList, resourceKey)
end

CAC.onConfig(CAC.setSafeGuard)

function CAC.isSafeEvent(ev)
  return type(ev) == 'string' and sets.events[ev] == true
end

--- CoreAC'in tamamen dokunmadığı resource mu?
function CAC.isIgnoredScript(name)
  local k = resourceKey(name)
  return k ~= nil and sets.ignored[k] == true
end

--- Güvenilen resource mu? (Ignored, Safe'in üst kümesidir.)
function CAC.isSafeScript(name)
  local k = resourceKey(name)
  return k ~= nil and (sets.safe[k] == true or sets.ignored[k] == true)
end

--- Resource-enjeksiyon kontrolü bu kaynağı işaretlemeyecek mi?
function CAC.isInjectionSafe(name)
  local k = resourceKey(name)
  return k ~= nil and (sets.injection[k] == true or sets.safe[k] == true or sets.ignored[k] == true)
end

--- Bir olay listesinden Safe Events'tekileri çıkarır (client'lara giden tuzak listesi).
function CAC.withoutSafeEvents(list)
  local out = {}
  if type(list) ~= 'table' then return out end
  for _, ev in ipairs(list) do
    if not CAC.isSafeEvent(ev) then out[#out + 1] = ev end
  end
  return out
end

-- Resource'a atfedilebilen tespit ayrıntıları (modüllere göre farklı alan adı).
local function attributedResource(det)
  local v = det.resource or det.resourceName or det.script or det.invoker or det.invokingResource
  return type(v) == 'string' and v ~= '' and v or nil
end

--- Bu tespit Safe Guard muafiyetine giriyor mu? (true → panele hiç gönderme.)
--- dtype: panelin kanonik tespit tipi (CoreAC.NormalizeDetection çıktısı).
function CAC.safeGuardDrops(dtype, det)
  if type(det) ~= 'table' then return false end
  dtype = tostring(dtype or '')

  -- Tuzak olay: Safe Events'teki olay hileci değil, meşru bir script'in olayıdır.
  if dtype == 'CHEAT_EVENT_HONEYPOT' and CAC.isSafeEvent(det.event) then return true end

  local res = attributedResource(det)
  if res then
    -- Ignored Scripts: ona atfedilen hiçbir şey raporlanmaz.
    if CAC.isIgnoredScript(res) then return true end
    -- Resource enjeksiyonu: Injection Safe List / Safe Scripts.
    if dtype == 'RESOURCE_INJECT' and CAC.isInjectionSafe(res) then return true end
    -- İzole araç spawn'ı + backdoor çağrısı: güvenilen script.
    if (dtype == 'ISOLATED_VEHICLE' or dtype == 'BACKDOOR') and CAC.isSafeScript(res) then return true end
  end
  return false
end

print('^2[CoreAC] Safe Guard yuklendi.^7')
