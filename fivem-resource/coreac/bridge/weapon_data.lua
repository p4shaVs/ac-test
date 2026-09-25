-- =============================================================================
-- WEAPON_DATA — merkezi silah tablosu (client + server)
--
-- Orijinal CoreAC paketinde bu tablo utils.lua içindeydi ve bu projeye
-- taşınmamıştı; burada STANDART (vanilla) GTA5 silahlarından yeniden üretiyoruz.
-- Hash'ler çalışma anında GetHashKey ile hesaplanır (elle yanlış hash yazma
-- riski yok). Tablo HEM dizi (for i=1,#WEAPON_DATA) HEM de hash anahtarıyla
-- (WEAPON_DATA[hash]) erişilebilir — modüller iki şekilde de kullanıyor.
--
-- Addon (özel) silahlar buraya YAZILMAZ: onları panelden "Add-On Weapons"
-- listesine girersin; weaponSpawn.lua o listeyi ayrıca izinli sayar. Böylece
-- vanilla olmayan silahların false ban üretmez.
-- =============================================================================

CoreAC = CoreAC or {}

-- 32-bit signed hash'i unsigned'a çevirir (utils.lua'daki eksik global).
-- Bit işlemi yerine aritmetik — her Lua sürümünde ve float/int'te güvenli.
function signedToUnsigned(h)
    h = tonumber(h) or 0
    if h < 0 then return h + 4294967296 end
    return h
end

-- Standart GTA5 silahları, SINIFA GÖRE gruplanmış (weapon_*).
-- Sınıf bilgisi, silah-başına hasar tavanı için kullanılır (aşağıya bakın).
-- Kaynak: genel GTA5 native listesi.
local WEAPON_CLASSES = {
    -- Yakın dövüş
    melee = {
        'weapon_dagger', 'weapon_bat', 'weapon_bottle', 'weapon_crowbar',
        'weapon_flashlight', 'weapon_golfclub', 'weapon_hammer', 'weapon_hatchet',
        'weapon_knuckle', 'weapon_knife', 'weapon_machete', 'weapon_switchblade',
        'weapon_nightstick', 'weapon_wrench', 'weapon_battleaxe', 'weapon_poolcue',
        'weapon_stone_hatchet', 'weapon_candycane',
    },
    -- Tabancalar
    pistol = {
        'weapon_pistol', 'weapon_pistol_mk2', 'weapon_combatpistol', 'weapon_appistol',
        'weapon_stungun', 'weapon_pistol50', 'weapon_snspistol', 'weapon_snspistol_mk2',
        'weapon_heavypistol', 'weapon_vintagepistol', 'weapon_flaregun', 'weapon_marksmanpistol',
        'weapon_revolver', 'weapon_revolver_mk2', 'weapon_doubleaction', 'weapon_raypistol',
        'weapon_ceramicpistol', 'weapon_navyrevolver', 'weapon_gadgetpistol', 'weapon_pistolxm3',
    },
    -- Hafif makineli / SMG
    smg = {
        'weapon_microsmg', 'weapon_smg', 'weapon_smg_mk2', 'weapon_assaultsmg',
        'weapon_combatpdw', 'weapon_machinepistol', 'weapon_minismg', 'weapon_raycarbine',
    },
    -- Pompalı
    shotgun = {
        'weapon_pumpshotgun', 'weapon_pumpshotgun_mk2', 'weapon_sawnoffshotgun',
        'weapon_assaultshotgun', 'weapon_bullpupshotgun', 'weapon_musket',
        'weapon_heavyshotgun', 'weapon_dbshotgun', 'weapon_autoshotgun', 'weapon_combatshotgun',
    },
    -- Tüfekler
    rifle = {
        'weapon_assaultrifle', 'weapon_assaultrifle_mk2', 'weapon_carbinerifle',
        'weapon_carbinerifle_mk2', 'weapon_advancedrifle', 'weapon_specialcarbine',
        'weapon_specialcarbine_mk2', 'weapon_bullpuprifle', 'weapon_bullpuprifle_mk2',
        'weapon_compactrifle', 'weapon_militaryrifle', 'weapon_heavyrifle', 'weapon_tacticalrifle',
    },
    -- Makineli tüfekler
    mg = {
        'weapon_mg', 'weapon_combatmg', 'weapon_combatmg_mk2', 'weapon_gusenberg',
    },
    -- Keskin nişancı
    sniper = {
        'weapon_sniperrifle', 'weapon_heavysniper', 'weapon_heavysniper_mk2',
        'weapon_marksmanrifle', 'weapon_marksmanrifle_mk2', 'weapon_precisionrifle',
    },
    -- Ağır silahlar (patlayıcı/fırlatıcı) — hasar-çarpanı kontrolü UYGULANMAZ,
    -- patlama + illegal-weapon (>2000) yolları ele alır.
    heavy = {
        'weapon_rpg', 'weapon_grenadelauncher', 'weapon_grenadelauncher_smoke',
        'weapon_minigun', 'weapon_firework', 'weapon_railgun', 'weapon_hominglauncher',
        'weapon_compactlauncher', 'weapon_rayminigun', 'weapon_emplauncher',
    },
    -- Fırlatılabilir
    thrown = {
        'weapon_grenade', 'weapon_bzgas', 'weapon_molotov', 'weapon_stickybomb',
        'weapon_proxmine', 'weapon_snowball', 'weapon_pipebomb', 'weapon_ball',
        'weapon_smokegrenade', 'weapon_flare', 'weapon_petrolcan', 'weapon_hazardcan',
        'weapon_fertilizercan',
    },
    -- Ekipman / diğer
    equipment = {
        'weapon_parachute', 'weapon_fireextinguisher', 'weapon_unarmed', 'weapon_briefcase',
        'weapon_briefcase_02', 'weapon_garbagebag', 'weapon_handcuffs',
    },
}

-- Sınıf başına MEŞRU tek-atış hasar tavanı (weaponDamageEvent.weaponDamage).
--
-- Vanilla taban hasarının ÇOK üzerinde tutulur; pay şunları soğurur:
--   * sunucu geneli SetWeaponDamageModifier (RP sunucularında 2-3x sık),
--   * Mk2 patlayıcı/AP mermi hasar bonusu,
--   * yuvarlama.
-- (Kafa vuruşu çarpanı `weaponDamage`'a YANSIMAZ — motor cana uygularken çarpar.)
-- Böylece MEŞRU oyuncu asla tetiklemez; yalnızca abartılı modifiye yakalanır.
--
-- Bu değerler PANELE AÇILMAZ: yanlış girilen bir tavan doğrudan false ban
-- üretir (satıcı biz ayarlarız). Müşteri yalnızca genel Config.MaxWeaponDamage
-- tavanını görür; sınıflandırılmamış/addon silahlar ona geri düşer.
--
-- melee → super punch ayrı ele alınır; heavy/thrown/equipment → patlama +
-- illegal-weapon yolu ele alır. Bu sınıflar burada YER ALMAZ; genel tavana düşer.
local CLASS_MAX_DAMAGE = {
    pistol  = 250,
    smg     = 250,
    rifle   = 320,
    mg      = 380,
    shotgun = 500,   -- pompalı yakın mesafede yüksek/çoklu-saçma raporlar
    sniper  = 900,   -- heavy sniper ~216 tabanlı; Mk2 patlayıcı mermi + 4x çarpan payı
}

CoreAC.WEAPON_DATA = {}

for class, names in pairs(WEAPON_CLASSES) do
    for _, name in ipairs(names) do
        local h  = GetHashKey(name)
        local uh = signedToUnsigned(h)
        -- weaponDamages: modüller bu alanı okur (weaponDamages.lua "> 0" kıyaslar).
        -- Otoriter vanilla hasar değerimiz yok → 0 (baseline kapalı; hasar-çarpanı
        -- tespiti sınıf tavanıyla ÇALIŞIR, bu alana bağlı değil). Yanlış değer
        -- false ban riski taşırdı; 0 güvenli.
        local entry = {
            weaponName = name, weaponHash = h, weaponUnsignedHash = uh,
            weaponDamages = 0, class = class,
        }
        -- Dizi kısmı (for i=1,#WEAPON_DATA döngüleri için)
        CoreAC.WEAPON_DATA[#CoreAC.WEAPON_DATA + 1] = entry
        -- Hash anahtarlı erişim (WEAPON_DATA[hash] aramaları için) — büyük sayılar
        -- diziyi (#) etkilemez, iki erişim biçimi de aynı entry'ye gider.
        CoreAC.WEAPON_DATA[h]  = entry
        CoreAC.WEAPON_DATA[uh] = entry
    end
end

-- Bir silah için MEŞRU tek-atış hasar tavanını döndürür.
-- Bilinmeyen/addon silahta veya kontrol dışı sınıfta (melee/heavy/thrown/
-- equipment) nil döner → çağıran taraf genel Config.MaxWeaponDamage'a düşer.
function CoreAC.GetWeaponMaxDamage(hash)
    if not hash then return nil end
    local entry = CoreAC.WEAPON_DATA[hash] or CoreAC.WEAPON_DATA[signedToUnsigned(hash)]
    if not entry or not entry.class then return nil end
    return CLASS_MAX_DAMAGE[entry.class]
end

-- Bir silahın sınıfını döndürür (melee/pistol/smg/... veya nil = bilinmeyen/addon).
function CoreAC.GetWeaponClass(hash)
    if not hash then return nil end
    local entry = CoreAC.WEAPON_DATA[hash] or CoreAC.WEAPON_DATA[signedToUnsigned(hash)]
    return entry and entry.class or nil
end

-- Yakın-dövüş silahı mı? (yumruk/bıçak/sopa vb.) — "reach" tespiti için.
-- Yumruk (unarmed, weapon_data'da yok) da melee sayılır.
local UNARMED_HASHES = { [GetHashKey('weapon_unarmed')] = true, [2725352035] = true }
function CoreAC.IsMeleeWeapon(hash)
    if not hash then return false end
    if UNARMED_HASHES[hash] or UNARMED_HASHES[signedToUnsigned(hash)] then return true end
    return CoreAC.GetWeaponClass(hash) == 'melee'
end

if Config and Config.Debug then
    print(('^2[CoreAC] WEAPON_DATA yuklendi — %d vanilla silah.^7'):format(#CoreAC.WEAPON_DATA))
end
