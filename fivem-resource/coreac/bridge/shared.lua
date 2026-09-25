-- =============================================================================
-- CoreAC Panel Bridge — Shared (client + server)
-- Bu dosya modules/ klasöründeki CoreAC tabanlı dosyaların CAC web paneli
-- ile birlikte çalışmasını sağlar. Modules dosyalarına DOKUNULMAZ.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- LPH Obfuscation Stubs
-- Modules dosyaları Luraph ile obfuscate edilmiş versiyonlarda çalışmak üzere
-- tasarlanmıştır. Obfuscation olmadığı için bu fonksiyonları passthrough yaparız.
-- ---------------------------------------------------------------------------
if LPH_JIT_MAX == nil then
    LPH_JIT_MAX = function(fn) return fn end
end
if LPH_NO_VIRTUALIZE == nil then
    LPH_NO_VIRTUALIZE = function(fn) return fn end
end
if LPH_OBFUSCATED == nil then
    LPH_OBFUSCATED = false
end

-- ---------------------------------------------------------------------------
-- CoreAC Global Base
-- ---------------------------------------------------------------------------
CoreAC = CoreAC or {}

local isServerSide = IsDuplicityVersion()

CoreAC.Wait         = Wait
CoreAC.CreateThread = CreateThread
CoreAC.resourceName = GetCurrentResourceName()

-- ---------------------------------------------------------------------------
-- Action Sabitleri (modules heartbeat/server.lua ve diğerleri kullanır)
-- ---------------------------------------------------------------------------
CoreAC.Actions = {
    LOG  = { id = 'LOG'  },
    KICK = { id = 'KICK' },
    BAN  = { id = 'BAN'  },
    WARN = { id = 'WARN' },
}

-- ---------------------------------------------------------------------------
-- Tespit Tipi Sabitleri (modules client/*.lua ve server/events/*.lua kullanır)
-- Bu string'ler CAC web panelindeki detection type'larla eşleştiriliyor.
-- ---------------------------------------------------------------------------
CoreAC.Detections = {
    -- Hareket
    ANTI_NO_CLIP              = 'NOCLIP',
    ANTI_FLY                  = 'FLYHACK',
    ANTI_SPEED                = 'SPEED_HACK',
    ANTI_TELEPORT             = 'TELEPORT',
    ANTI_SUPER_JUMP           = 'SUPER_JUMP',
    ANTI_VEHICLE_SPEED        = 'VEHICLE_SPEED',
    ANTI_VEHICLE_NO_CLIP      = 'VEHICLE_NOCLIP',

    -- Combat
    ANTI_AIMBOT               = 'AIMBOT',
    ANTI_SILENT_AIM           = 'SILENT_AIM',
    ANTI_INFINITE_AMMO        = 'INFINITE_AMMO',
    ANTI_NO_RELOAD            = 'NO_RELOAD',
    ANTI_ILLEGAL_WEAPON       = 'ILLEGAL_WEAPON',
    ANTI_DAMAGE_MULTIPLIER    = 'DAMAGE_MULTIPLIER',
    ANTI_EXPLOSIVE_BULLETS    = 'EXPLOSIVE_BULLETS',
    ANTI_EXPLOSION            = 'EXPLOSION',
    ANTI_RAPID_FIRE           = 'RAPID_FIRE',
    ANTI_WALLBANG             = 'WALLBANG',
    ANTI_NO_RECOIL            = 'NO_RECOIL',
    ANTI_GIVE_ALL_WEAPONS     = 'GIVE_ALL_WEAPONS',

    -- Can & Zırh
    ANTI_INVINCIBLE           = 'GODMODE',
    ANTI_INFINITE_REFILL      = 'GODMODE',
    ANTI_OVERRIDE_HEALTH_STATS= 'ARMOR_HACK',
    ANTI_NO_COMBAT_DAMAGES    = 'GODMODE',
    ANTI_ARMOR_REGEN          = 'ARMOR_REGEN',
    ANTI_NO_FALL_DAMAGE       = 'NO_FALL_DAMAGE',
    ANTI_VEHICLE_GODMODE      = 'VEHICLE_GODMODE',
    ANTI_INSTANT_REPAIR       = 'INSTANT_REPAIR',
    ANTI_OUT_OF_BOUNDS        = 'OUT_OF_BOUNDS',

    -- Görsel / Kamera
    ANTI_FREECAM              = 'FREECAM',
    ANTI_SPECTATE             = 'SPECTATE',
    ANTI_INFINITE_STAMINA     = 'INFINITE_STAMINA',
    ANTI_MODEL_CHANGE         = 'MODEL_CHANGE',
    ANTI_PROP_DISGUISE        = 'PROP_DISGUISE',
    ANTI_INVISIBLE            = 'INVISIBLE',
    ANTI_NIGHT_VISION         = 'NIGHT_VISION',
    ANTI_VOICE_EXPLOITS       = 'VOICE_EXPLOIT',

    -- Entity / Spawn
    ANTI_SPAWN_VEHICLES       = 'ILLEGAL_VEHICLE',
    ANTI_SPAWN_PEDS           = 'ILLEGAL_PED',
    ANTI_SPAWN_OBJECTS        = 'ILLEGAL_OBJECT',
    ANTI_BLACKLIST_VEHICLE    = 'BLACKLIST_VEHICLE',
    ANTI_BLACKLIST_PED        = 'BLACKLIST_PED',
    ANTI_BLACKLIST_OBJECT     = 'BLACKLIST_OBJECT',
    ANTI_BLACKLIST_WEAPON     = 'BLACKLIST_WEAPON',

    -- Diğer
    ANTI_RECONNECT_SPAM       = 'RECONNECT_SPAM',
    ANTI_CHAT_FLOOD           = 'CHAT_FLOOD',
    ANTI_MENU                 = 'CHEAT_MENU_SUSPECTED',
    -- client/events.lua BAL KAPANI'dır: bu event adlarını yalnızca bilinen hile
    -- menüleri tetikler. Zayıf "şüpheli" sinyali değil, yüksek güvenli tespittir.
    ANTI_TRIGGER_CLIENT_EVENT = 'CHEAT_EVENT_HONEYPOT',
    ANTI_TRIGGER_SERVER_EVENT = 'CHEAT_EVENT_HONEYPOT',
    ANTI_BACKDOOR             = 'BACKDOOR',

    -- -----------------------------------------------------------------------
    -- Modüllerin GERÇEKTEN kullandığı anahtarlar.
    -- Bunlar tanımlı olmadığı sürece aşağıdaki __index metatable'ı devreye
    -- girip anahtarın KENDİSİNİ (ör. 'ANTI_SPEED_HACK') tespit tipi olarak
    -- gönderiyordu: panel tipi tanımıyor, Aksiyonlar haritası tutmuyor ve
    -- karar severity fallback'ine düşüyordu. Hepsi kanonik panel tiplerine
    -- eşlendi — isim farkı olanlar mevcut tipe yönlendirildi (ANTI_AIM_BOT →
    -- AIMBOT gibi), gerçekten yeni olanlar için panelde de tip tanımlandı.
    -- -----------------------------------------------------------------------
    ANTI_SPEED_HACK                 = 'SPEED_HACK',
    ANTI_AIM_BOT                    = 'AIMBOT',
    ANTI_FREE_CAM                   = 'FREECAM',
    ANTI_NIGHT_VISIONS              = 'NIGHT_VISION',
    ANTI_PED_MODEL_CHANGE           = 'MODEL_CHANGE',
    ANTI_NO_RAGDOLL                 = 'NO_RAGDOLL',
    ANTI_AFK_BYPASS                 = 'AFK_BYPASS',
    ANTI_CLEAR_TASKS                = 'CLEAR_TASKS',
    ANTI_INPUT_BOX                  = 'INPUT_BOX',
    ANTI_LUA_MENU                   = 'LUA_MENU',
    ANTI_OVERLAY                    = 'OVERLAY',
    ANTI_RESOURCE_INJECTION         = 'RESOURCE_INJECT',
    ANTI_RESOURCE_STOP              = 'AC_TAMPER',
    ANTI_BYPASS_ATTEMPT             = 'BYPASS_ATTEMPT',
    ANTI_CRASH_ATTEMPT              = 'CRASH_ATTEMPT',

    -- Silah / combat
    ANTI_AMMO_CHEATING              = 'AMMO_CHEAT',
    ANTI_GIVE_WEAPONS               = 'GIVE_WEAPON',
    ANTI_REMOVE_WEAPONS             = 'REMOVE_WEAPON',
    ANTI_WEAPON_SPAWNER             = 'WEAPON_SPAWN',
    ANTI_WEAPON_SPOOF               = 'WEAPON_SPOOF',
    ANTI_SPOOFED_BULLETS            = 'SPOOFED_BULLETS',
    ANTI_STUNNING_BULLETS           = 'STUNNING_BULLETS',
    ANTI_SUPER_PUNCH                = 'SUPER_PUNCH',
    ANTI_HITBOX_MODIFIER            = 'HITBOX_MODIFIER',
    ANTI_KILL                       = 'KILL_EXPLOIT',
    ANTI_WEAPON_DAMAGES_MODIFIER    = 'DAMAGE_MULTIPLIER',
    ANTI_WEAPON_COMPONENT_MODIFIER  = 'WEAPON_COMPONENT',
    WEAPON_BLACKLIST                = 'BLACKLIST_WEAPON',
    PROJECTILE_LIMIT                = 'PROJECTILE_LIMIT',
    PROJECTILE_WHITELIST            = 'PROJECTILE_WHITELIST',

    -- Araç / entity
    ANTI_SPEED_MODIFIER             = 'VEHICLE_SPEED',
    ANTI_HANDLING_MODIFIER          = 'VEHICLE_HANDLING',
    ANTI_THROW_VEHICLES             = 'THROW_VEHICLE',
    ANTI_ATTACH_VEHICLES            = 'ATTACH_VEHICLE',
    ANTI_REQUEST_CONTROL            = 'REQUEST_CONTROL',
    ANTI_VEHICLE_PLATE_CHANGER      = 'PLATE_CHANGER',
    ANTI_SPAWN_ISOLATED_VEHICLES    = 'ISOLATED_VEHICLE',
    ANTI_TELEPORT_IN_VEHICLE        = 'VEHICLE_HIJACK',
    ANTI_AI_SPAWN_PEDS              = 'ILLEGAL_PED',
    ANTI_PICKUP_SPAWN               = 'PICKUP_SPAWN',
    VEHICLE_BLACKLIST               = 'BLACKLIST_VEHICLE',
    VEHICLE_WHITELIST               = 'VEHICLE_WHITELIST',
    VEHICLE_LIMIT                   = 'VEHICLE_LIMIT',
    PED_BLACKLIST                   = 'BLACKLIST_PED',
    PED_WHITELIST                   = 'PED_WHITELIST',
    PED_LIMIT                       = 'PED_LIMIT',
    OBJECT_BLACKLIST                = 'BLACKLIST_OBJECT',
    OBJECT_WHITELIST                = 'OBJECT_WHITELIST',
    OBJECT_LIMIT                    = 'OBJECT_LIMIT',

    -- Patlama / partikül
    ANTI_SPAWN_EXPLOSION            = 'EXPLOSION_SPAWN',
    ANTI_SPAWN_PARTICLE             = 'PARTICLE_SPAWN',
    ANTI_PARTICLE_ATTACHED_TO_ENTITY= 'PARTICLE_ATTACHED',
    DETECT_INVISIBLE_EXPLOSIONS     = 'INVISIBLE_EXPLOSION',
    DETECT_INAUDIBLE_EXPLOSIONS     = 'INAUDIBLE_EXPLOSION',
    EXPLOSION_BLACKLIST             = 'BLACKLIST_EXPLOSION',
    EXPLOSION_LIMIT                 = 'EXPLOSION_LIMIT',
    PARTICLE_WHITELIST              = 'PARTICLE_WHITELIST',
    PARTICLE_SCALE                  = 'PARTICLE_SCALE',
}

-- ---------------------------------------------------------------------------
-- CoreAC.Config — Modules'un kural kontrolleri için (Config.Main, Config.Settings)
-- CAC web panelinden gelen kurallar server/main.lua içinde ServerConfig olarak
-- saklanıyor. Burada sensible default'lar tanımlıyoruz; panel kuralları
-- bridge/server.lua içinde güncellenecek.
-- ---------------------------------------------------------------------------
CoreAC.Config = {
    Main = {
        -- Hareket tespitleri
        AntiNoClip              = true,
        AntiFly                 = true,
        AntiSpeedHack           = true,
        AntiTeleport            = true,
        AntiSuperJump           = true,
        AntiVehicleSpeed        = true,
        AntiVehicleNoClip       = true,

        -- Combat tespitleri
        AntiAimbot              = true,
        AntiSilentAim           = true,
        AntiInfiniteAmmo        = true,
        AntiNoReload            = true,
        AntiDamageMultiplier    = true,
        AntiExplosiveBullets    = true,
        AntiExplosionSpam       = true,
        AntiRapidFire           = false,
        AntiNoRecoil            = false,
        AntiGiveAllWeapons      = true,

        -- Can tespitleri
        AntiInvincible          = true,
        AntiInfiniteRefill      = true,
        AntiOverrideHealthStats = true,
        AntiNoCombatDamages     = true,
        AntiArmorRegen          = false,
        AntiNoFallDamage        = false,
        AntiVehicleGodmode      = true,
        AntiInstantRepair       = false,

        -- Görsel tespitleri
        AntiFreecam             = false,
        AntiSpectate            = false,
        AntiInfiniteStamina     = false,
        AntiModelChange         = false,
        AntiPropDisguise        = false,
        AntiInvisible           = false,
        AntiVoiceExploits       = false,

        -- Spawn tespitleri
        AntiIllegalVehicle      = true,
        AntiIllegalPed          = true,
        AntiIllegalObject       = false,

        -- Executor / overlay tespiti (antiExec.lua) — kutudan AÇIK gelsin diye
        -- burada varsayılan veriliyor (panel config'i yoksa da çalışır).
        -- E6 agresif → varsayılan kapalı. Panel Configuration'dan değiştirilebilir.
        E1 = true,
        E2 = true,
        E3 = true,
        E4 = true,
        E5 = true,
        E6 = false,

        -- Diğer
        AntiTriggerClientEventAI = false,
        AntiTriggerServerEventAI = false,
        AntiTriggerExportAI      = false,
        AntiResourceMismatch     = false,
        IgnoredEvents            = {},
    },
    Settings = {
        CommandPrefix              = 'ac',
        EnableGameplayRecord       = false,
        EnableAntiBackdoors        = true,
        StopServerWhenDetected     = false,
        IgnoredScripts             = {},
        -- playerConnecting / playerDropped modül alanları
        AntiConnectionDupe         = false,
        LogConnectionsToConsole    = false,
        LogConnectionsToDiscord    = false,
        LogOnConnect               = false,
        LogOnDisconnect            = false,
        -- Diğer modules alanları
        EnableWhitelist            = false,
        EnableBlacklist            = true,
        MaxExplosionsPerSecond     = 5,
        MaxVehicleSpeed            = 120.0,
        MaxObjectsPerPlayer        = 20,
        MaxPedsPerPlayer           = 5,
    },
    Entities = {
        EnableObjectsAI         = false,
        EnableVehiclesAI        = false,
        EnablePedsAI            = false,
    },
}

-- ---------------------------------------------------------------------------
-- FAIL-SAFE UYUMLULUK KATMANI
-- Bu "CoreAC" modülleri orijinal (fma.wtf) pakedin utils.lua + geniş config
-- katmanına bağımlıydı; o katman bu projeye TAŞINMADI. Eksik alanlar
-- (Config.Weapons/Explosions/Premium/Beta, WEAPON_DATA, bazı Detections
-- anahtarları) tetiklendiğinde crash ya da YANLIŞ ban üretebilir.
--
-- Çözüm: eksikleri GÜVENLİ varsayılanlarla dolduruyoruz —
--   * Bilinmeyen her Config flag'i => false  (leaked tespit modülleri
--     kendiliğinden PASİF kalır; asıl tespit işini senin kendi
--     client/detections/* + server guard'ların yapar).
--   * WEAPON_DATA => boş tablo (sunucu weapon event'leri zaten nil-guard'lı,
--     güvenle atlar; false ban üretmez).
--   * Bilinmeyen Detections anahtarı => anahtar adının kendisi (string),
--     böylece nil birleştirme/crash olmaz, log okunur kalır.
-- Bu blok tamamen geri alınabilir: leaked modülleri gerçekten kullanmak
-- istersen orijinal utils.lua/config'i porta edip bu bloğu kaldırırsın.
-- ---------------------------------------------------------------------------

-- Bilinmeyen bir config anahtarı istendiğinde tipini İSİMLENDİRME KURALINDAN
-- çıkarıp güvenli varsayılan döndürür. Kritik: aynı anahtar kodda hep aynı
-- şekilde kullanılır (flag ise hep flag, koleksiyon ise hep pairs/ipairs) —
-- bu yüzden tek bir tip yeterli:
--   *Listed* / AddonWeapons => {}    (pairs/ipairs ile dönülen KOLEKSİYON)
--   *LimitIn / Max*         => 0     (sayısal eşik; limiter zaten kapalı)
--   diğer her şey           => false (Anti*/Enable*/Detect*/... = kapalı flag)
-- ÖNEMLİ: koleksiyonlar "Listed" içerir (WhiteListed/BlackListed); "Enable...List"
-- gibi anahtarlar FLAG'dir (sadece "List") → false olmalı, yoksa boş whitelist'le
-- özellik yanlışlıkla açılıp false ban üretir.
-- Döndürülen değeri geri yazarız (rawset) ki kimliği sabit ve ucuz olsun.
local function configIndex(t, k)
    local key = tostring(k)
    local v
    if key:find('Listed') or key == 'AddonWeapons' then
        v = {}
    elseif key:find('LimitIn') or key:find('^Max') then
        -- KRİTİK: eskiden 0 dönüyordu. Sayaç kontrolleri "count >= limit"
        -- biçiminde olduğu için limit 0 → İLK olayda bile tetikleniyordu
        -- (ör. EnableExplosionsLimiter açıkken her el bombası iptal + tespit).
        -- Tanımsız bir eşik "sınırsız" demektir; devasa bir değer döndürüyoruz.
        v = math.huge
    else
        v = false
    end
    rawset(t, k, v)
    return v
end

-- Eksik alt-config bölümleri (leaked modüllerin beklediği ama taşınmayanlar).
CoreAC.Config.Weapons    = CoreAC.Config.Weapons    or {}
CoreAC.Config.Explosions = CoreAC.Config.Explosions or {}
CoreAC.Config.Premium    = CoreAC.Config.Premium    or {}
CoreAC.Config.Beta       = CoreAC.Config.Beta       or {}

-- Tüm alt-config bölümlerine akıllı varsayılan __index'i uygula.
for _, section in ipairs({ 'Main', 'Settings', 'Entities', 'Weapons', 'Explosions', 'Premium', 'Beta' }) do
    setmetatable(CoreAC.Config[section], { __index = configIndex })
end

-- Bilinmeyen Config bölümü istenirse de çökme yerine akıllı-tablo dön.
setmetatable(CoreAC.Config, { __index = function(t, k)
    local sec = setmetatable({}, { __index = configIndex })
    rawset(t, k, sec)
    return sec
end })

-- Merkezi silah verisi taşınmadı → boş (nil-guard'lı okumalar güvenle atlar,
-- veri gerektiren tespitler ilgili flag zaten false olduğu için hiç çalışmaz).
CoreAC.WEAPON_DATA = CoreAC.WEAPON_DATA or {}

-- Bilinmeyen Detections anahtarı => anahtarın kendisi (crash yerine okunur string).
setmetatable(CoreAC.Detections, { __index = function(_, k) return tostring(k) end })

-- ---------------------------------------------------------------------------
-- TESPİT TİPİ NORMALİZASYONU
-- Bazı modüller CoreAC.Detections yerine düz metin gönderiyor ("Bypass Attempt
-- Detected" gibi). Panel bu tipleri tanımadığı için Aksiyonlar haritası tutmuyor
-- ve karar severity fallback'ine düşüyordu. Tek kapıdan geçirip kanonik tipe
-- çeviriyoruz; tanınmayan bir metin gelirse BÜYÜK_HARF_ALT_ÇİZGİ biçimine
-- normalize edilir (panelde en azından tutarlı ve gruplanabilir görünür).
-- ---------------------------------------------------------------------------
local LEGACY_TYPES = {
    ['Bypass Attempt Detected']      = 'BYPASS_ATTEMPT',
    ['CoreAC Stop Detected']         = 'AC_TAMPER',
    ['Server Crash Attempt Detected']= 'CRASH_ATTEMPT',
    ['Thermal Vision Detected']      = 'NIGHT_VISION',
    ['Vehicle Hijack Detected']      = 'VEHICLE_HIJACK',
    -- server/events/playerDropped.lua: FiveM'in çıkış sebebi hile client'ının
    -- kendi imzasını içeriyor — sahte pozitif ihtimali yok denecek kadar düşük.
    ['Kekhack detected']             = 'KEKHACK_CLIENT',
    ['Red Engine Detected']          = 'RED_ENGINE_CLIENT',
}

function CoreAC.NormalizeDetection(t)
    local s = tostring(t or 'UNKNOWN')
    if LEGACY_TYPES[s] then return LEGACY_TYPES[s] end
    -- Zaten kanonik (yalnız büyük harf/rakam/alt çizgi) ise dokunma.
    if s:find('^[A-Z0-9_]+$') then return s end
    return (s:upper():gsub('[^A-Z0-9]+', '_'):gsub('^_+', ''):gsub('_+$', ''))
end

-- ---------------------------------------------------------------------------
-- GTA5 patlama tipleri (id ↔ ad). Hem CoreAC.GetExplosionName hem de panelden
-- gelen "BlackListedExplosions" listesinin normalizasyonu kullanır.
-- ---------------------------------------------------------------------------
CoreAC.ExplosionNames = {
    [-1] = 'DONTCARE', [0] = 'GRENADE', [1] = 'GRENADELAUNCHER', [2] = 'STICKYBOMB',
    [3] = 'MOLOTOV', [4] = 'ROCKET', [5] = 'TANKSHELL', [6] = 'HI_OCTANE',
    [7] = 'CAR', [8] = 'PLANE', [9] = 'PETROL_PUMP', [10] = 'BIKE',
    [11] = 'DIR_STEAM', [12] = 'DIR_FLAME', [13] = 'DIR_WATER_HYDRANT', [14] = 'DIR_GAS_CANISTER',
    [15] = 'BOAT', [16] = 'SHIP_DESTROY', [17] = 'TRUCK', [18] = 'BULLET',
    [19] = 'SMOKEGRENADELAUNCHER', [20] = 'SMOKEGRENADE', [21] = 'BZGAS', [22] = 'FLARE',
    [23] = 'GAS_CANISTER', [24] = 'EXTINGUISHER', [25] = 'PROGRAMMABLEAR', [26] = 'TRAIN',
    [27] = 'BARREL', [28] = 'PROPANE', [29] = 'BLIMP', [30] = 'DIR_FLAME_EXPLODE',
    [31] = 'TANKER', [32] = 'PLANE_ROCKET', [33] = 'VEHICLE_BULLET', [34] = 'GAS_TANK',
    [35] = 'BIRD_CRAP', [36] = 'RAILGUN', [37] = 'BLIMP2', [38] = 'FIREWORK',
    [39] = 'SNOWBALL', [40] = 'PROXMINE', [41] = 'VALKYRIE_CANNON', [42] = 'AIR_DEFENCE',
    [43] = 'PIPEBOMB', [44] = 'VEHICLEMINE', [45] = 'EXPLOSIVEAMMO', [46] = 'APCSHELL',
    [47] = 'BOMB_CLUSTER', [48] = 'BOMB_GAS', [49] = 'BOMB_INCENDIARY', [50] = 'BOMB_STANDARD',
    [51] = 'TORPEDO', [52] = 'TORPEDO_UNDERWATER', [53] = 'BOMBUSHKA_CANNON', [54] = 'BOMB_CLUSTER_SECONDARY',
    [55] = 'HUNTER_BARRAGE', [56] = 'HUNTER_CANNON', [57] = 'ROGUE_CANNON', [58] = 'MINE_UNDERWATER',
    [59] = 'ORBITAL_CANNON', [60] = 'BOMB_STANDARD_WIDE', [61] = 'EXPLOSIVEAMMO_SHOTGUN',
    [62] = 'OPPRESSOR2_CANNON', [63] = 'MORTAR_KINETIC', [64] = 'VEHICLEMINE_KINETIC',
    [65] = 'VEHICLEMINE_EMP', [66] = 'VEHICLEMINE_SPIKE', [67] = 'VEHICLEMINE_SLICK',
    [68] = 'VEHICLEMINE_TARBOMB', [69] = 'SCRIPT_DRONE', [70] = 'RAYGUN', [71] = 'BURIEDMINE',
    [72] = 'SCRIPT_MISSILE', [73] = 'RCTANK_ROCKET', [74] = 'BOMB_WATER', [75] = 'BOMB_WATER_SECONDARY',
    [78] = 'FLASHGRENADE', [79] = 'STUNGRENADE', [81] = 'SCRIPT_MISSILE_LARGE', [82] = 'SUBMARINE_BIG',
}

local EXPLOSION_IDS = {}
for id, nm in pairs(CoreAC.ExplosionNames) do EXPLOSION_IDS[nm] = id end

function CoreAC.GetExplosionName(explosionType)
    local t = tonumber(explosionType)
    if not t then return 'UNKNOWN' end
    return CoreAC.ExplosionNames[t] or ('EXPLOSION_' .. t)
end

-- ---------------------------------------------------------------------------
-- PANEL LİSTELERİNİN NORMALİZASYONU
--
-- Panel her listeyi bir metin DİZİSİ olarak gönderir: { "adder", "zentorno" }.
-- Ama modüllerin çoğu bu tabloları HASH ile indeksler:
--     CoreAC.Config.Entities.BlackListedVehicles[GetEntityModel(entity)]
-- Dizi indeksli bir tabloda hash araması hep nil döner → panelden girilen
-- kara/beyaz listelerin HİÇBİRİ çalışmıyordu (sessizce, hatasız).
--
-- Burada bu listeleri hem ada hem işaretli hem işaretsiz hash'e göre
-- aranabilir hâle getiriyoruz. Dizi kısmı (ipairs ile gezilen AddonWeapons /
-- BlackListedWeapons) BOZULMAZ — onlar ARRAY_LISTS'te ayrı tutulur.
--
-- Ayrıca BEYAZ LİSTE GÜVENLİĞİ: beyaz liste açık ama BOŞsa, ilgili özellik
-- kapatılır. Aksi halde "izinli hiçbir model yok" = sunucudaki her araç/ped/
-- obje iptal edilir ve herkes tespit yer.
-- ---------------------------------------------------------------------------

-- Hash ile indekslenen listeler (isim → arama tablosu).
local HASH_LISTS = {
    ['Entities.BlackListedObjects']   = true,
    ['Entities.WhiteListedObjects']   = true,
    ['Entities.PreBlackListedObjects']= true,
    ['Entities.BlackListedPeds']      = true,
    ['Entities.WhiteListedPeds']      = true,
    ['Entities.BlackListedVehicles']  = true,
    ['Entities.WhiteListedVehicles']  = true,
    ['Weapons.WhiteListedProjectiles']= true,
    ['Explosions.WhiteListedParticles'] = true,
}

-- ipairs ile DİZİ olarak gezilen listeler — dokunulmaz.
local ARRAY_LISTS = {
    ['Weapons.AddonWeapons']       = true,
    ['Weapons.BlackListedWeapons'] = true,
}

-- Beyaz liste boşsa kapatılacak bayraklar: bayrak → liste anahtarı.
local WHITELIST_GUARDS = {
    ['Entities.EnableVehiclesWhiteList']  = 'WhiteListedVehicles',
    ['Entities.EnablePedsWhiteList']      = 'WhiteListedPeds',
    ['Entities.EnableObjectsWhiteList']   = 'WhiteListedObjects',
    ['Weapons.EnableProjectilesWhiteList']= 'WhiteListedProjectiles',
    ['Explosions.EnableParticlesWhiteList'] = 'WhiteListedParticles',
}

local function isEmpty(t)
    if type(t) ~= 'table' then return true end
    return next(t) == nil
end

--- Metin dizisini ada + işaretli/işaretsiz hash'e göre aranabilir tabloya çevirir.
local function toHashLookup(list)
    local out = {}
    if type(list) ~= 'table' then return out end
    for _, v in ipairs(list) do
        local s = tostring(v)
        out[s] = true
        local n = tonumber(s)
        if n then
            out[n] = true
        else
            local h = GetHashKey(s)
            out[h] = true
            if h < 0 then out[h + 4294967296] = true end
        end
    end
    return out
end

--- Patlama tipi listesi: hem ad ("BULLET") hem numara ("18") kabul edilir.
local function toExplosionLookup(list)
    local out = {}
    if type(list) ~= 'table' then return out end
    for _, v in ipairs(list) do
        local s = tostring(v)
        local n = tonumber(s) or EXPLOSION_IDS[s:upper()]
        if n then out[n] = true end
    end
    return out
end

--- Panelden gelen tam config objesini modüllerin beklediği şekle getirir.
--- Girdiyi değiştirmez; yeni bir tablo döndürür.
function CoreAC.NormalizeAcConfig(ac)
    if type(ac) ~= 'table' then return {} end
    local out = {}

    for section, fields in pairs(ac) do
        if type(fields) == 'table' then
            local dst = {}
            for key, value in pairs(fields) do
                local path = section .. '.' .. key
                if ARRAY_LISTS[path] then
                    dst[key] = value                        -- dizi olarak kalmalı
                elseif path == 'Explosions.BlackListedExplosions' then
                    dst[key] = toExplosionLookup(value)
                elseif HASH_LISTS[path] then
                    dst[key] = toHashLookup(value)
                else
                    dst[key] = value
                end
            end
            out[section] = dst
        end
    end

    -- Beyaz liste güvenliği: liste boşsa özelliği kapat.
    for flagPath, listKey in pairs(WHITELIST_GUARDS) do
        local section, flag = flagPath:match('^(%w+)%.(%w+)$')
        local sec = out[section]
        if sec and sec[flag] == true and isEmpty(sec[listKey]) then
            sec[flag] = false
            print(('^3[CoreAC] %s acik ama "%s" listesi bos — guvenlik icin kapatildi.^7')
                :format(flagPath, listKey))
        end
    end

    return out
end

-- ---------------------------------------------------------------------------
-- GlobalState Anahtarları (modules'un sabit kodlu string'leri)
-- ---------------------------------------------------------------------------
local CONFIG_BAG_KEY  = 'coreac_ac_cfg'
local SUBS_KEY        = 'coreac_subs_k'

CoreAC.CFct1C6gobnW4qkaQUx3Xk9Q  = CONFIG_BAG_KEY   -- config bag key
CoreAC.HHct1C6gobnW3DkIQUxiXk9Q  = SUBS_KEY          -- substitution key

-- ---------------------------------------------------------------------------
-- ANTI-TAMPER CHALLENGE ÇÖZÜCÜ (client + server aynı fonksiyonu çalıştırır).
--
-- NEDEN: 'coreac:alive' sinyalini SADECE dinlemek zayıftı — hileci client AC'yi
-- kapatıp kendi kodundan TriggerServerEvent('coreac:alive') spam'leyerek canlılık
-- taklidi yapabiliyordu. Artık sunucu rastgele bir sayı yollar; client'ın bu
-- dönüşümü aynen üretmesi gerekir. AC'yi söken hileci dönüşümü de yeniden
-- üretmek zorunda kalır.
--
-- Kriptografik DEĞİL (client kodu oyuncuda) — amaç taklidi ucuz olmaktan
-- çıkarmak. Obfuscate build'de (Luraph) bu fonksiyon sanallaşır ve çıkarılması
-- ciddi şekilde zorlaşır. math.floor kullanılır: Lua 5.3/5.4 ikisinde de güvenli.
-- ---------------------------------------------------------------------------
function CoreAC.SolveChallenge(n)
    n = tonumber(n) or 0
    local a = (n * 1103515245 + 12345) % 2147483648
    a = (a + (n % 7919) * 31) % 2147483648
    a = (math.floor(a / 13) + (a % 97) * 1237) % 2147483648
    return a
end

-- Server side'da GlobalState'e yaz
if isServerSide then
    GlobalState.CFct1C6gobnW4qkaQUx3Xk9Q = CONFIG_BAG_KEY
    GlobalState.HHct1C6gobnW3DkIQUxiXk9Q = SUBS_KEY
    GlobalState.BanEventToken             = 'coreac_ban_tk'
    GlobalState.StateBagsToken            = 'coreac_state_tk'

    -- Anti-resource-stop watchdog (heartbeat/server.lua) YALNIZCA obfuscate
    -- edilmiş build için güvenilir. Düz build'de client heartbeat'i ağ hıçkırığı/
    -- alt-tab/yükleme yüzünden 90 sn gecikince "CoreAC Stop Detected" ile MASUM
    -- oyuncuyu kickliyordu. Obfuscate değilse watchdog'u kapat.
    -- (Canlılık işi zaten server/liveness_guard.lua'da FP-güvenli yapılıyor.)
    GlobalState.IsAntiResourceStopDisabled = (not LPH_OBFUSCATED)

    -- AYRI BAYRAK — resource enjeksiyon/durdurma guard'ı.
    -- HATA DÜZELTİLDİ: eskiden bu guard da yukarıdaki obfuscation bayrağına
    -- bağlıydı; düz build'de bayrak kalıcı 'true' kalıyor (server/resourcesHandler
    -- içindeki yeniden-açma thread'i "if not <bayrak>" yüzünden hiç çalışmıyordu)
    -- ve resource ENJEKSİYONU tespiti tamamen ölüydü. Artık obfuscation'dan
    -- bağımsız; yalnızca meşru resource restart penceresinde geçici duraklar.
    GlobalState.CoreAC_ResourceGuardPaused = false

    -- GlobalState[CONFIG_BAG_KEY] → modules bu key'i okuyarak config'e erişir
    GlobalState[CONFIG_BAG_KEY] = {
        Main     = CoreAC.Config.Main,
        Settings = CoreAC.Config.Settings,
        Entities = CoreAC.Config.Entities,
    }
end

-- ---------------------------------------------------------------------------
-- Şifreleme Stub'ları (modules event tokenization için kullanır)
-- CAC'in kendi basit string sistemini benimsiyoruz.
-- ---------------------------------------------------------------------------
CoreAC.SubstitutionKey      = SUBS_KEY
CoreAC.Substitution         = setmetatable({}, { __index = function(_, k) return k end })
CoreAC.InverseSubstitution  = setmetatable({}, { __index = function(_, k) return k end })
CoreAC.IsEventTokenizationReady = true

CoreAC.EncryptString = function(s)   return tostring(s or '') end
CoreAC.DecryptString = function(s)   return tostring(s or '') end
CoreAC.ConvertEvent  = function(name) return '_cac_e:' .. tostring(name) end

CoreAC.GenerateSubstitution = function(key)
    local id = setmetatable({}, { __index = function(_, k) return k end })
    return id, id
end

-- ---------------------------------------------------------------------------
-- Heartbeat Event Token
-- ---------------------------------------------------------------------------
CoreAC.HeartbeatEventToken = 'coreac:coreac_hb'

print('^2[CoreAC] Shared bridge yuklendi.^7')
