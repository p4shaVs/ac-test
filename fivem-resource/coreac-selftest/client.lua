-- =============================================================================
-- coreac-selftest — client
--
-- Tek kişiyle anti-cheat doğrulaması. Her komut KENDİ karakterinde belirli bir
-- hile davranışını taklit eder; sonra panelde (Events / Detections) beklenen
-- tespitin çıkıp çıkmadığına bakarsın.
--
-- İki tür test var:
--   TESPİT ETMELİ  → hile taklidi, panelde satır BEKLENİR.
--   TESPİT ETMEMELİ → meşru davranış, panelde satır BEKLENMEZ (yanlış-pozitif testi).
--
-- Komutlar sohbet kutusuna yazılır:  /cstest <ad>
-- =============================================================================

local ENABLED = GetConvarInt('coreac_selftest', 0) == 1
local AC = 'aeigs-anticheat'

local function msg(text, color)
    TriggerEvent('chat:addMessage', {
        color = color or { 120, 190, 255 },
        multiline = true,
        args = { '[CoreAC Test]', text },
    })
    print('[coreac-selftest] ' .. text)
end

--- AC'nin meşru-ışınlanma muafiyetini çağırır (varsa).
local function markTeleport()
    pcall(function() exports[AC]:markTeleport() end)
end

local function ped() return PlayerPedId() end

-- ---------------------------------------------------------------------------
-- TESTLER
-- Her giriş: { desc, expect, run }
--   expect = 'detect'  → panelde tespit bekleniyor
--   expect = 'clean'   → panelde HİÇBİR ŞEY beklenmiyor
-- ---------------------------------------------------------------------------
local tests = {}

-- --- GODMODE (sunucu-otoriter) ------------------------------------------------
-- godmode_guard.lua'yı tetiklemenin tek yolu GERÇEK bir weaponDamageEvent'tir.
-- Kendimize ShootSingleBulletBetweenCoords ile ateş ederek bunu tek kişiyle
-- üretiyoruz: sunucu "hasar gitti ama can havuzu düşmedi" der ve GODMODE yazar.
local function selfShot(damage)
    local p = ped()
    local chest = GetPedBoneCoords(p, 24818, 0.0, 0.0, 0.0)   -- SKEL_Spine3
    local from  = chest + vector3(0.0, -0.6, 0.0)
    ShootSingleBulletBetweenCoords(
        from.x, from.y, from.z,
        chest.x, chest.y, chest.z,
        damage or 30, true, GetHashKey('WEAPON_SNSPISTOL'),
        p, false, true, 1000.0
    )
end

tests.godmode = {
    desc = 'Godmode: dokunulmaz olup kendine 4 el ateş eder',
    expect = 'detect',
    run = function()
        SetPlayerInvincible(PlayerId(), true)
        SetEntityInvincible(ped(), true)
        msg('Dokunulmazlık ACIK. 4 el ateş ediliyor (~8 sn)...')
        for i = 1, 4 do
            selfShot(30)
            msg(('  atış %d/4 — can: %d'):format(i, GetEntityHealth(ped())))
            Wait(2000)
        end
        SetPlayerInvincible(PlayerId(), false)
        SetEntityInvincible(ped(), false)
        msg('Dokunulmazlık kapatıldı. Panelde GODMODE bekleniyor.', { 255, 190, 90 })
    end,
}

tests.godmode_clean = {
    desc = 'YANLIŞ-POZİTİF: dokunulmaz DEĞİLken kendine 4 el ateş eder',
    expect = 'clean',
    run = function()
        msg('Normal hasar testi — canın gerçekten düşmeli, tespit ÇIKMAMALI.')
        for i = 1, 4 do
            local before = GetEntityHealth(ped())
            selfShot(25)
            Wait(700)                       -- sunucunun ölçüm penceresi geçsin
            local after = GetEntityHealth(ped())
            msg(('  atış %d/4 — can %d → %d'):format(i, before, after))
            SetEntityHealth(ped(), 200)     -- ölçümden SONRA geri doldur
            Wait(1500)
        end
        msg('Bitti. Panelde GODMODE ÇIKMAMALI.', { 140, 230, 140 })
    end,
}

-- --- HAREKET ------------------------------------------------------------------
tests.speed = {
    desc = 'Speed hack: koşu çarpanını yükseltir (eşik 14 m/s)',
    expect = 'detect',
    run = function()
        SetRunSprintMultiplierForPlayer(PlayerId(), 1.49)
        msg('Koşu çarpanı 1.49. ŞİMDİ 10 saniye düz koş (Shift basılı).')
        Wait(12000)
        SetRunSprintMultiplierForPlayer(PlayerId(), 1.0)
        msg('Normale döndü. Panelde SPEED_HACK bekleniyor.', { 255, 190, 90 })
    end,
}

tests.superjump = {
    desc = 'Super jump: beast jump açar',
    expect = 'detect',
    run = function()
        msg('10 saniye boyunca ZIPLA (Space).')
        local until_ = GetGameTimer() + 10000
        while GetGameTimer() < until_ do
            SetSuperJumpThisFrame(PlayerId())
            Wait(0)
        end
        msg('Bitti. Panelde SUPER_JUMP bekleniyor.', { 255, 190, 90 })
    end,
}

tests.teleport = {
    desc = 'Teleport: 300 m sıçrar, muafiyet BİLDİRMEZ',
    expect = 'detect',
    run = function()
        local c = GetEntityCoords(ped())
        msg('300 m ışınlanıyor (markTeleport çağrılmadan)...')
        SetEntityCoords(ped(), c.x + 300.0, c.y + 300.0, c.z, false, false, false, false)
        Wait(3000)
        msg('Panelde TELEPORT bekleniyor.', { 255, 190, 90 })
    end,
}

tests.teleport_ok = {
    desc = 'YANLIŞ-POZİTİF: 300 m sıçrar ama önce markTeleport çağırır',
    expect = 'clean',
    run = function()
        local c = GetEntityCoords(ped())
        markTeleport()                       -- meşru tp yapan script'in yapması gereken
        msg('markTeleport çağrıldı, 300 m ışınlanıyor...')
        SetEntityCoords(ped(), c.x - 300.0, c.y - 300.0, c.z, false, false, false, false)
        Wait(6000)
        msg('Panelde TELEPORT ÇIKMAMALI.', { 140, 230, 140 })
    end,
}

tests.noclip = {
    desc = 'NoClip: çarpışmayı kapatıp havada süzülür',
    expect = 'detect',
    run = function()
        local p = ped()
        SetEntityCollision(p, false, false)
        FreezeEntityPosition(p, true)
        msg('Çarpışma kapalı, 12 sn boyunca havada taşınıyor...')
        for i = 1, 4 do
            local c = GetEntityCoords(p)
            SetEntityCoords(p, c.x + 25.0, c.y, c.z + 8.0, false, false, false, false)
            Wait(3000)
        end
        FreezeEntityPosition(p, false)
        SetEntityCollision(p, true, true)
        msg('Normale döndü. Panelde NOCLIP bekleniyor.', { 255, 190, 90 })
    end,
}

tests.skydive = {
    desc = 'YANLIŞ-POZİTİF: 400 m yukarı çıkıp paraşütle atlar',
    expect = 'clean',
    run = function()
        local p = ped()
        local c = GetEntityCoords(p)
        markTeleport()
        GiveWeaponToPed(p, GetHashKey('GADGET_PARACHUTE'), 1, false, false)
        SetEntityCoords(p, c.x, c.y, c.z + 400.0, false, false, false, false)
        msg('400 m yukarıdasın — serbest düş, sonra paraşütü aç. Bu ESKİDEN NOCLIP veriyordu.')
        Wait(30000)
        msg('Panelde NOCLIP ÇIKMAMALI.', { 140, 230, 140 })
    end,
}

-- --- CAN / ZIRH ---------------------------------------------------------------
tests.armor = {
    desc = 'Armor hack: zırhı 150 yapar (vanilla tavan 100)',
    expect = 'detect',
    run = function()
        SetPedArmour(ped(), 150)
        msg('Zırh 150. 10 sn bekleniyor...')
        Wait(10000)
        SetPedArmour(ped(), 0)
        msg('Panelde ARMOR_HACK bekleniyor.', { 255, 190, 90 })
    end,
}

tests.invincible_flag = {
    desc = 'Client godmode bayrağı: SetPlayerInvincible (client tespiti)',
    expect = 'detect',
    run = function()
        SetPlayerInvincible(PlayerId(), true)
        msg('Invincible bayrağı açık, 12 sn bekleniyor...')
        Wait(12000)
        SetPlayerInvincible(PlayerId(), false)
        msg('Panelde GODMODE bekleniyor — ve bu CLIENT kaynaklı olduğu için en fazla KICK olmalı.', { 255, 190, 90 })
    end,
}

-- --- PATLAMA ------------------------------------------------------------------
-- Limiter'ın eski hâli limiti 0 okuduğu için İLK patlamada bile iptal+tespit
-- veriyordu. Artık varsayılan 5 saniyede 8.
tests.explosions_ok = {
    desc = 'YANLIŞ-POZİTİF: 5 saniyede 4 patlama (limitin altında)',
    expect = 'clean',
    run = function()
        local c = GetEntityCoords(ped())
        for i = 1, 4 do
            AddExplosion(c.x + 30.0 + i, c.y + 30.0, c.z, 2, 1.0, true, false, 1.0)
            Wait(1000)
        end
        msg('4 patlama atıldı. Panelde EXPLOSION_LIMIT ÇIKMAMALI.', { 140, 230, 140 })
    end,
}

tests.explosions_spam = {
    desc = 'Patlama spam: 5 saniyede 15 patlama (limitin üstünde)',
    expect = 'detect',
    run = function()
        local c = GetEntityCoords(ped())
        for i = 1, 15 do
            AddExplosion(c.x + 30.0 + (i % 5), c.y + 30.0, c.z, 2, 1.0, true, false, 1.0)
            Wait(200)
        end
        msg('15 patlama atıldı. Panelde EXPLOSION_LIMIT bekleniyor.', { 255, 190, 90 })
    end,
}

-- --- GÖRSEL -------------------------------------------------------------------
tests.invisible = {
    desc = 'Görünmezlik: ped\'i görünmez yapar',
    expect = 'detect',
    run = function()
        SetEntityVisible(ped(), false, false)
        msg('Görünmezsin, 12 sn bekleniyor...')
        Wait(12000)
        SetEntityVisible(ped(), true, false)
        msg('Panelde INVISIBLE bekleniyor (Configuration → Anti Invisibility açık olmalı).', { 255, 190, 90 })
    end,
}

-- --- BAL KAPANI ---------------------------------------------------------------
tests.honeypot = {
    desc = 'Hile menüsü bal kapanı: bilinen hile event\'ini tetikler',
    expect = 'detect',
    run = function()
        TriggerEvent('adminmenu:allowall')
        msg('Bal kapanı event\'i tetiklendi. Panelde CHEAT_EVENT_HONEYPOT bekleniyor.', { 255, 190, 90 })
    end,
}

-- ---------------------------------------------------------------------------
-- Komut arayüzü
-- ---------------------------------------------------------------------------
local running = false

local function listTests()
    msg('Kullanım: /cstest <ad>   —   /cstest all_clean (tüm yanlış-pozitif testleri)')
    local names = {}
    for k in pairs(tests) do names[#names + 1] = k end
    table.sort(names)
    for _, n in ipairs(names) do
        local t = tests[n]
        local tag = t.expect == 'detect' and '~r~[TESPİT ETMELİ]' or '~g~[TEMİZ KALMALI]'
        msg(('%s  /cstest %s — %s'):format(tag, n, t.desc))
    end
end

RegisterCommand('cstest', function(_, args)
    if not ENABLED then
        msg('Kapalı. server.cfg içine: set coreac_selftest 1', { 255, 120, 120 })
        return
    end
    local name = args[1]
    if not name then listTests() return end

    if running then msg('Zaten bir test çalışıyor.', { 255, 190, 90 }) return end

    if name == 'all_clean' then
        running = true
        CreateThread(function()
            for _, n in ipairs({ 'godmode_clean', 'teleport_ok', 'explosions_ok', 'skydive' }) do
                msg('=== ' .. n .. ' ===')
                pcall(tests[n].run)
                Wait(3000)
            end
            msg('Tüm yanlış-pozitif testleri bitti. Panelde bu aralıkta HİÇ tespit olmamalı.', { 140, 230, 140 })
            running = false
        end)
        return
    end

    local t = tests[name]
    if not t then msg('Bilinmeyen test: ' .. name, { 255, 120, 120 }) listTests() return end

    running = true
    CreateThread(function()
        msg(('=== %s === (%s)'):format(name, t.expect == 'detect' and 'tespit BEKLENİYOR' or 'tespit BEKLENMİYOR'))
        local ok, err = pcall(t.run)
        if not ok then msg('Test hatası: ' .. tostring(err), { 255, 120, 120 }) end
        running = false
    end)
end, false)

CreateThread(function()
    Wait(4000)
    if ENABLED then
        msg('Test kiti yüklü. Komutları görmek için: /cstest', { 255, 190, 90 })
    end
end)
