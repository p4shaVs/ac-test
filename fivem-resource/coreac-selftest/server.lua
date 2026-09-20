-- =============================================================================
-- coreac-selftest — server
--
-- Testler beklendiği gibi tetiklenmediğinde "neden" sorusunu cevaplayan tanı
-- katmanı. Anti-cheat'in gördüğü ham olayları konsola basar, böylece sorunun
-- tespit mantığında mı yoksa olayın hiç gelmemesinde mi olduğunu ayırt edersin.
--
-- Konsol komutları (F8 değil, SUNUCU konsolu):
--   cs_watch          → weaponDamageEvent / explosionEvent akışını aç-kapa
--   cs_status         → AC'nin panelden aldığı config'in özeti
-- =============================================================================

local ENABLED = GetConvarInt('coreac_selftest', 0) == 1
local watching = false

local function log(s)
    print(('^3[coreac-selftest]^7 %s'):format(s))
end

if not ENABLED then
    print('^3[coreac-selftest]^7 kapalı (server.cfg: set coreac_selftest 1)')
    return
end

print('^1[coreac-selftest] TEST KAYNAGI ACIK — CANLI SUNUCUDA CALISTIRMA.^7')

-- ---------------------------------------------------------------------------
-- Ham olay akışı
-- ---------------------------------------------------------------------------
AddEventHandler('weaponDamageEvent', function(sender, data)
    if not watching then return end
    local victims = {}
    local ids = data and (data.hitGlobalIds or (data.hitGlobalId and { data.hitGlobalId })) or {}
    for _, nid in ipairs(ids) do
        local ent = NetworkGetEntityFromNetworkId(nid)
        local isPlayer = ent and ent ~= 0 and DoesEntityExist(ent) and IsPedAPlayer(ent)
        victims[#victims + 1] = ('net=%s player=%s hp=%s'):format(
            nid, tostring(isPlayer),
            (ent and ent ~= 0 and DoesEntityExist(ent)) and GetEntityHealth(ent) or '-')
    end
    log(('weaponDamageEvent  saldıran=%s hasar=%s hedef=[%s]'):format(
        tostring(sender), tostring(data and data.weaponDamage), table.concat(victims, ' | ')))
end)

AddEventHandler('explosionEvent', function(sender, ev)
    if not watching then return end
    log(('explosionEvent  kaynak=%s tip=%s hasar=%s görünmez=%s'):format(
        tostring(sender), tostring(ev and ev.explosionType),
        tostring(ev and ev.damageScale), tostring(ev and ev.isInvisible)))
end)

-- Anti-cheat'in ürettiği her tespiti burada da görürüz (AC'nin kendi
-- raporlama yolunu dinliyoruz — panel gecikmesini beklemeden).
AddEventHandler('aeigs:serverReport', function(src, dtype, severity, details)
    log(('^2TESPİT^7  oyuncu=%s tip=%s severity=%s kaynak=sunucu'):format(
        tostring(src), tostring(dtype), tostring(severity)))
end)

RegisterCommand('cs_watch', function(source)
    if source ~= 0 then return end   -- yalnızca sunucu konsolu
    watching = not watching
    log('olay akışı: ' .. (watching and 'AÇIK' or 'KAPALI'))
end, true)

-- ---------------------------------------------------------------------------
-- Config özeti — "ayarı kaydettim ama sunucuya gitti mi?" sorusunu cevaplar.
-- ---------------------------------------------------------------------------
RegisterCommand('cs_status', function(source)
    if source ~= 0 then return end

    local bagKey = GlobalState.CFct1C6gobnW4qkaQUx3Xk9Q
    local cfg = bagKey and GlobalState[bagKey]
    if not cfg then
        log('^1CoreAC config bag BOŞ — kaynak paneli okuyamamış (token/URL?).^7')
        return
    end

    local function show(section, keys)
        local t = cfg[section]
        if not t then log(section .. ': yok') return end
        local parts = {}
        for _, k in ipairs(keys) do parts[#parts + 1] = ('%s=%s'):format(k, tostring(t[k])) end
        log(section .. ': ' .. table.concat(parts, '  '))
    end

    show('Main', { 'AntiNoClip', 'AntiTeleport', 'AntiSpeedHack', 'AntiSuperJump', 'AntiInvincible', 'AntiLuaMenu' })
    show('Settings', { 'LogOnly', 'EnableAntiBackdoors', 'StopServerWhenDetected' })

    -- NOT: anti-cheat'in `Config` tablosuna buradan erişilemez (her resource
    -- kendi Lua durumunda çalışır). Aynı bilgiyi kaynağın okuduğu convar'dan
    -- alıyoruz — GlobalState ise resource'lar arası paylaşımlıdır.
    log(('Tespitler: %s   |   Bağlı oyuncu: %d'):format(
        GetConvar('aeigs_detections', 'true') == 'true' and '^2AÇIK^7' or '^1KAPALI^7',
        #GetPlayers()))
end, true)
