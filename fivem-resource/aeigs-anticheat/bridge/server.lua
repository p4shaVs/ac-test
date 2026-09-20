-- =============================================================================
-- Aeigs × CoreAC Bridge — Server Side
-- CoreAC.DetectPlayer → Aeigs web API entegrasyonu
-- =============================================================================

-- Aeigs = sunucu tarafı web bağlantı objesi (server/http.lua'dan gelir)
-- Burada Aeigs başlatılmamış olabilir, hazır olmasını bekleriz.
Aeigs = Aeigs or {}

-- ---------------------------------------------------------------------------
-- Modules'un beklediği ek CoreAC global'leri (server-side)
-- ---------------------------------------------------------------------------

-- playerDropped.lua için
CoreAC.DeadPlayersCache = {}

-- playerConnecting.lua / playerJoining için (reconnect state cache — oldID -> geçici veri)
CoreAC.TempPlayerCache = CoreAC.TempPlayerCache or {}

-- playerConnecting.lua için (bağlantı tekrarı koruması)
connectedLicenses = connectedLicenses or {}

-- playerConnecting.lua ve autoWhiteList için (banlı oyuncu önbelleği)
CoreAC.BannedPlayers = CoreAC.BannedPlayers or {}

-- Discord webhook (playerDropped.lua CoreAC:sendWebHook kullanır — Aeigs'e delege et)
function CoreAC:sendWebHook(title, description, fields, category, color)
    -- Aeigs discord.ts modülü varsa kullan (panelden ayarlanmış webhook)
    -- Burada sessizce logla; Aeigs web'i kendi webhook'unu halledecek
    if Config and Config.Debug then
        print(('[Aeigs-AC] Discord Webhook: [%s] %s'):format(tostring(category or ''), tostring(title or '')))
    end
end

-- ---------------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------------
local function safeGetName(src)
    if type(src) ~= 'number' or src <= 0 then return 'Unknown' end
    return GetPlayerName(src) or ('Player#' .. src)
end

local function actionToSeverity(action)
    if action == CoreAC.Actions.BAN.id or action == 'BAN' then return 'CRITICAL' end
    if action == CoreAC.Actions.KICK.id or action == 'KICK' then return 'HIGH' end
    return 'MEDIUM'
end

-- ---------------------------------------------------------------------------
-- CoreAC.DetectPlayer (Server)
-- modules/server/events/*.lua ve heartbeat/server.lua bu fonksiyonu çağırır.
-- İmzası: CoreAC.DetectPlayer(playerId, reason, details, action, duration, bannedBy)
-- ---------------------------------------------------------------------------
CoreAC.DetectPlayer = function(playerId, reason, details, action, duration, bannedBy)
    -- Tespitler geçici kapalıysa (yeni altyapı testi) hiçbir şey yapma.
    if Config and Config.DetectionsEnabled == false then return end
    local src = tonumber(playerId)
    if not src or src <= 0 then return end
    if not GetPlayerName(src) then return end  -- oyuncu bağlı değil

    -- Tespit tipini bul (CoreAC.Detections string'i veya düz string) ve
    -- kanonik panel tipine normalize et (bkz. bridge/shared.lua).
    local detType = CoreAC.NormalizeDetection(reason)

    -- Severity hesapla
    local severity = actionToSeverity(action)

    -- Details normalize
    local det = {}
    if type(details) == 'table' then
        det = details
    elseif details ~= nil then
        det = { info = tostring(details) }
    end
    if bannedBy then det.bannedBy = tostring(bannedBy) end

    -- Aeigs.report mekanizmasına besle (server/main.lua'daki 'aeigs:serverReport')
    TriggerEvent('aeigs:serverReport', src, detType, severity, det)
end

-- ---------------------------------------------------------------------------
-- EKSİK CoreAC YARDIMCILARI (orijinal pakette utils.lua'daydı, taşınmamıştı).
-- Bunlar TANIMSIZ olduğu için çağrıldıkları handler'lar İLK SATIRDA çöküyordu:
--   * GetExplosionName → explosionEvent.lua:53 → patlama korumasının TAMAMI ölü
--     (blacklist, görünmez/sessiz patlama, limiter, log — hiçbiri çalışmıyordu).
--   * SendLog          → explosionEvent.lua:136 ve weaponDamageEvent.lua:383 (kill logu)
--   * IsPlayerBanned   → playerConnecting.lua:381 (şu an fxmanifest'te kapalı)
-- ---------------------------------------------------------------------------

-- NOT: CoreAC.GetExplosionName + patlama tipi tablosu bridge/shared.lua'ya
-- taşındı (panelden gelen "BlackListedExplosions" listesinin normalizasyonu da
-- aynı tabloyu kullanıyor).

--- Modüllerin "bu olayı panele/konsola yaz" çağrısı. Tespit DEĞİLDİR —
--- ceza üretmez, sadece log akışına düşer (panel → Logs sayfası).
function CoreAC.SendLog(kind, src, data)
    if not Aeigs or not Aeigs.log then return end
    local who = (type(src) == 'number' and src > 0 and (GetPlayerName(src) or ('#' .. src))) or tostring(src or '-')
    local extra = ''
    if type(data) == 'table' then
        local parts = {}
        for k, v in pairs(data) do parts[#parts + 1] = ('%s=%s'):format(k, tostring(v)) end
        table.sort(parts)
        extra = ' ' .. table.concat(parts, ' ')
    end
    Aeigs.log('INFO', 'anticheat', ('[%s] %s%s'):format(tostring(kind or 'EVENT'), who, extra))
end

--- Ban kontrolü artık server/main.lua'daki playerConnecting akışında (BanList +
--- matchBan) yapılıyor. Bu, eski playerConnecting.lua modülü tekrar açılırsa
--- çökmemesi için güvenli bir köprüdür: banlı ise true döner.
function CoreAC.IsPlayerBanned(src)
    if not Aeigs.isBanned then return false, 0 end
    return Aeigs.isBanned(src) == true, 0
end

-- ---------------------------------------------------------------------------
-- StrikesSystem (SUNUCU) — server/events/entityCreating.lua ve
-- weaponDamageEvent.lua dosya yüklenirken bunu çağırıyor. Yalnızca
-- bridge/client.lua'da tanımlı olduğu için sunucuda nil'di: iki dosya da İLK
-- satırlarda çöküyor ve handler'ları HİÇ kaydolmuyordu → entity korumasının
-- tamamı (kara liste, spawn limitleri, araç fırlatma) ve silah hasarı
-- korumaları (spam punch, stealth kill) sunucuda ölüydü.
--
-- Client sürümü TEK sayaç tutar (client'ta tek oyuncu vardır). Sunucuda aynı
-- mantık farklı oyuncuların strike'larını KARIŞTIRIRDI: A'nın 2 strike'ı +
-- B'nin 1 strike'ı = B tespit yer. Burada sayaç, çağrının ilk argümanı olan
-- oyuncu ID'sine göre ayrı tutulur (tüm sunucu çağrıları source'u ilk geçer).
-- ---------------------------------------------------------------------------
CoreAC.StrikesSystem = {}

function CoreAC.StrikesSystem.createStrikeSystem(name, maxStrikes, callback, resetMs)
    local resetInterval = resetMs or 10000
    local perPlayer = {}   -- [src] = { strikes, last }

    AddEventHandler('playerDropped', function()
        perPlayer[source] = nil
    end)

    return function(playerId, ...)
        local key = tonumber(playerId) or tostring(playerId)
        local now = GetGameTimer()
        local s = perPlayer[key]
        if not s or now - s.last > resetInterval then
            s = { strikes = 0, last = now }
            perPlayer[key] = s
        end
        s.strikes = s.strikes + 1
        s.last = now

        if s.strikes >= maxStrikes then
            s.strikes = 0
            if type(callback) == 'function' then
                callback(playerId, ...)
            end
        end
    end
end

-- GetDisplayNameFromVehicleModel yalnızca CLIENT native'idir; sunucuda yoktur.
-- entityCreating.lua bunu araç tespitlerinde çağırıyor → (StrikesSystem
-- düzeltilince) ilk araç olayında çökerdi. Sunucuda model hash'i döner.
function CoreAC.GetVehicleName(model)
    local h = tonumber(model)
    if not h then return tostring(model) end
    if h < 0 then h = h + 4294967296 end
    return ('0x%08X'):format(h)
end

-- ---------------------------------------------------------------------------
-- CoreAC.exports — anti-backdoors.lua ve server/commands.lua için
-- ---------------------------------------------------------------------------
CoreAC.exports = exports

-- ---------------------------------------------------------------------------
-- CoreAC:print / CoreAC:drawLogo — server/commands.lua için
-- ---------------------------------------------------------------------------
function CoreAC:print(msg, color, label)
    color = color or '^3'
    label = label or 'Info'
    print(('^0(^5Aeigs-AC^0): [%s%s^0] >> %s^0'):format(color, label, tostring(msg)))
end

function CoreAC:drawLogo()
    local ver = (Config and Config.AcVersion) or '1.0.0'
    local det = (Config and Config.DetectionsEnabled == false) and '^1DISABLED (test mode)^7' or '^2ENABLED^7'
    print('^7 ')
    print('^5  ╔══════════════════════════════════════════════╗^7')
    print('^5  ║                                              ║^7')
    print('^5  ║        ^7 ▄████  ▄████  █████▄ ▄████  ^5          ║^7')
    print('^5  ║        ^7█      █    █ █    █ █      ^5          ║^7')
    print('^5  ║        ^7█      █    █ █████  █████  ^5 ▄▄  ▄▄  ^5║^7')
    print('^5  ║        ^7█      █    █ █  █   █      ^5 █▄▄█ █    ^5║^7')
    print('^5  ║        ^7 ▀████  ▀████  █   █ █████  ^5 █  █ █▄▄  ^5║^7')
    print('^5  ║                                              ║^7')
    print('^5  ╚══════════════════════════════════════════════╝^7')
    print(('^5   %s ^7v%s^7   ·   Detections: %s'):format((Config and Config.BrandName) or 'CoreAC', ver, det))
    print('^7 ')
end

-- ---------------------------------------------------------------------------
-- CoreAC:doesPlayerHavePerms — server/commands.lua için
-- ---------------------------------------------------------------------------
function CoreAC:doesPlayerHavePerms(source, perm, silent)
    -- Aeigs yönetici sistemi (server/live.lua'daki Admins tablosundan kontrol)
    -- Basit: RCON / console (source=0) her şeye izinli
    if source == 0 then return true end
    -- Oyun içi yönetici izin kontrolü için Aeigs sistemine delege ediyoruz
    if Aeigs.isAdmin then return Aeigs.isAdmin(source, perm) end
    return false
end

-- ---------------------------------------------------------------------------
-- CoreAC:unban / CoreAC.UnbanAllPlayers — server/commands.lua için
-- ---------------------------------------------------------------------------
function CoreAC:unban(banId, unbannedBy)
    -- Aeigs ban sistemine delege
    if Aeigs.request then
        Aeigs.request('/bans/' .. tostring(banId) .. '/unban', 'POST',
            { unbannedBy = unbannedBy or 'Console' }, function(ok, data)
            if ok then
                self:print('Ban kaldirildi: ' .. tostring(banId), '^2', 'Unban')
                if Aeigs.refreshBans then Aeigs.refreshBans() end
            else
                self:print('Ban kaldirilamadi: ' .. tostring(banId), '^1', 'Unban')
            end
        end)
    end
end

function CoreAC.UnbanAllPlayers()
    if Aeigs.request then
        Aeigs.request('/bans/unban-all', 'POST', {}, function(ok)
            if ok then
                CoreAC:print('Tum banlar kaldirildi.', '^2', 'Unban')
                if Aeigs.refreshBans then Aeigs.refreshBans() end
            end
        end)
    end
end

-- ---------------------------------------------------------------------------
-- CoreAC:ReloadConfiguration — server/commands.lua için
-- ---------------------------------------------------------------------------
function CoreAC:ReloadConfiguration()
    if Aeigs.request then
        Aeigs.request('/heartbeat', 'POST', {
            acVersion = Config and Config.AcVersion or '1.0.0',
            maxSlots  = GetConvarInt('sv_maxclients', 48),
            onlineCount = #GetPlayers(),
        }, function(ok, data)
            if ok and data and data.config then
                self:print('Konfigurasyon yenilendi.', '^2', 'Config')
            end
        end)
    end
end

-- ---------------------------------------------------------------------------
-- CoreAC:checkInstallation / CoreAC:uninstallResources — server/commands.lua stubs
-- (Bu kaynak kendi resource'u olduğundan install/uninstall anlamsız, yok sayılır)
-- ---------------------------------------------------------------------------
function CoreAC:checkInstallation()
    self:print('Bu komut aeigs-anticheat resource\'unda desteklenmez.', '^3', 'Install')
end

function CoreAC:uninstallResources()
    self:print('Bu komut aeigs-anticheat resource\'unda desteklenmez.', '^3', 'Uninstall')
    return false, 0
end

-- ---------------------------------------------------------------------------
-- CoreAC.ValidateSignature — server include için stub (kullanmıyoruz)
-- ---------------------------------------------------------------------------
CoreAC.ValidateSignature = function() return true end

-- server/anti-backdoors.lua içindeki uyarı thread'leri `while not CoreAC or not
-- CoreAC.Started do Wait(100) end` ile bekliyor. Bu bayrak hiç set edilmediği
-- için SQL/RCON sızdırma ve şüpheli HTTP uyarıları asla basılmıyordu (ve
-- StopServerWhenDetected hiç devreye girmiyordu). Kaynak yüklendi → işaretle.
CoreAC.Started = true

-- ---------------------------------------------------------------------------
-- GlobalState config'ini Aeigs rules ile senkronize et
-- Aeigs web panelinden gelen kurallar (server/main.lua heartbeat içinde ServerConfig
-- değişkenine yazılır). Bu fonksiyon aeigs:rules event'i ile tetiklenir.
-- ---------------------------------------------------------------------------
local function syncRulesToCoreAC(rules)
    if type(rules) ~= 'table' then return end

    -- Aeigs kural anahtarları → CoreAC.Config.Main anahtarları
    local ruleMap = {
        anti_noclip              = 'AntiNoClip',
        anti_flyhack             = 'AntiFly',
        anti_speedhack           = 'AntiSpeedHack',
        anti_teleport            = 'AntiTeleport',
        anti_superjump           = 'AntiSuperJump',
        anti_vehicle_speed       = 'AntiVehicleSpeed',
        anti_vehicle_noclip      = 'AntiVehicleNoClip',
        anti_aimbot              = 'AntiAimbot',
        anti_silent_aim          = 'AntiSilentAim',
        anti_infinite_ammo       = 'AntiInfiniteAmmo',
        anti_no_reload           = 'AntiNoReload',
        anti_damage_multiplier   = 'AntiDamageMultiplier',
        anti_explosive_bullets   = 'AntiExplosiveBullets',
        anti_explosion_spam      = 'AntiExplosionSpam',
        anti_godmode             = 'AntiInvincible',
        anti_vehicle_godmode     = 'AntiVehicleGodmode',
        anti_illegal_vehicle     = 'AntiIllegalVehicle',
        anti_illegal_ped         = 'AntiIllegalPed',
        anti_illegal_object      = 'AntiIllegalObject',
        anti_give_all_weapons    = 'AntiGiveAllWeapons',
        anti_resource_mismatch   = 'AntiResourceMismatch',
    }

    for aeigs_key, coreac_key in pairs(ruleMap) do
        if rules[aeigs_key] ~= nil then
            CoreAC.Config.Main[coreac_key] = (rules[aeigs_key] == true)
        end
    end

    -- GlobalState'i güncelle (client'lar okusun)
    local cfg_key = CoreAC.CFct1C6gobnW4qkaQUx3Xk9Q
    GlobalState[cfg_key] = {
        Main     = CoreAC.Config.Main,
        Settings = CoreAC.Config.Settings,
        Entities = CoreAC.Config.Entities,
    }

    print('^2[Aeigs-CoreAC Bridge] Kurallar guncellendi.^7')
end

-- ---------------------------------------------------------------------------
-- TAM CoreAC config (panel Configuration sayfası) — server.config.ac altında
-- gelir. Panelde WaveShield yapısındaki tüm sekmeler/kartlar bu objeyi düzenler.
-- Burada CoreAC.Config[section][key]'e BİREBİR uygulanır, GlobalState güncellenir
-- ve client'lara yayınlanır. Panelde OLMAYAN anahtarlara dokunulmaz (mevcut
-- varsayılanlar korunur).
-- ---------------------------------------------------------------------------
local lastAcConfig = nil

function Aeigs.applyAcConfig(rawAc)
    if type(rawAc) ~= 'table' then return end
    -- Panel listeleri metin dizisi olarak gelir; modüllerin çoğu hash ile
    -- indeksler. Normalizasyon olmadan kara/beyaz listelerin hiçbiri eşleşmezdi.
    -- Ayrıca boş beyaz listeler burada güvenli biçimde kapatılır.
    local ac = CoreAC.NormalizeAcConfig(rawAc)
    -- Client'lara HAM config gider ve orada normalize edilir: ağ üzerinden
    -- devasa hash anahtarlı tablolar taşımaktan kaçınırız, payload küçük kalır.
    lastAcConfig = rawAc
    for section, fields in pairs(ac) do
        if type(fields) == 'table' and CoreAC.Config[section] then
            for key, value in pairs(fields) do
                CoreAC.Config[section][key] = value
            end
        end
    end

    -- GlobalState'i güncelle (client modülleri config bag'i okuyanlar için)
    local cfg_key = CoreAC.CFct1C6gobnW4qkaQUx3Xk9Q
    GlobalState[cfg_key] = {
        Main       = CoreAC.Config.Main,
        Settings   = CoreAC.Config.Settings,
        Entities   = CoreAC.Config.Entities,
        Weapons    = CoreAC.Config.Weapons,
        Explosions = CoreAC.Config.Explosions,
        Premium    = CoreAC.Config.Premium,
        Beta       = CoreAC.Config.Beta,
    }

    -- Client CoreAC.Config tablolarına uygulansın diye yayınla (ham hâliyle)
    TriggerClientEvent('aeigs:acConfig', -1, rawAc)
end

-- Sonradan bağlanan client mevcut config'i ister
RegisterNetEvent('aeigs:requestAcConfig', function()
    if lastAcConfig then
        TriggerClientEvent('aeigs:acConfig', source, lastAcConfig)
    end
end)

-- Aeigs'in kural broadcast'ini dinle
AddEventHandler('aeigs:rulesUpdated', function(rules)
    syncRulesToCoreAC(rules)
end)

-- Aeigs server/main.lua heartbeat callback'inden kuralları al
-- (server/main.lua'daki heartbeat fonksiyonunu genişlet)
CreateThread(function()
    Wait(3000)  -- http.lua ve main.lua'nın yüklenmesini bekle
    -- İlk heartbeat sonrası çalışacak hook: Aeigs.getRules() varsa senkronize et
    while true do
        Wait(30000)
        if Aeigs.getRules then
            local rules = Aeigs.getRules()
            if rules and next(rules) then
                syncRulesToCoreAC(rules)
            end
        end
    end
end)

-- ---------------------------------------------------------------------------
-- aeigs:serverReport event handler
-- Hem kendi modüllerimizden hem de CoreAC modüllerinden gelen raporları
-- Aeigs web API'sine iletir (server/main.lua bunu zaten handle ediyor,
-- ama ek güvenlik için burada da dinliyoruz)
-- ---------------------------------------------------------------------------
AddEventHandler('aeigs:serverReport', function(src, dtype, severity, details)
    -- server/main.lua'daki RegisterNetEvent('aeigs:report') bunu halledecek
    -- Burada sadece loglama yapıyoruz
    if Config and Config.Debug then
        print(('[Aeigs-AC] ServerReport: src=%s type=%s sev=%s'):format(
            tostring(src), tostring(dtype), tostring(severity)))
    end
end)

print('^2[Aeigs-CoreAC Bridge] Server bridge yuklendi.^7')
