-- =============================================================================
-- server/combat_guard.lua — PvP: silah istatistikleri, tek-atış öldürmeler,
-- kafa vuruşu oranı ve ayrıntılı kill logu.
--
-- NEDEN: "adam tek atıyor ama ne log ne kick ne ban" şikâyeti. İnceleme:
--   * Hasar tavanı ve silent aim yalnızca VANİLLA silahları ölçüyordu. GUN PVP
--     sunucularındaki silahların çoğu eklentidir (weapon_browning…) → o
--     silahlarla atılan her mermi hiçbir kontrolden geçmiyordu.
--   * Client'taki temel hasar kontrolü hiç çalışmıyordu (tüm taban değerler 0).
--   * Tek atışta dolu can+zırh indiren oyuncuyu izleyen bir şey yoktu.
--   * Kill logu yalnızca silah hash'i yazıyordu: kafa mı gövde mi, mesafe,
--     kurbanın canı — personel videodaki olayı logdan doğrulayamıyordu.
--
-- BU DOSYA:
--   1) SİLAH İSTATİSTİĞİ MUTABAKATI — her client elindeki silahın hasarını ve
--      çarpanlarını bildirir (client/weapons/weaponDamages.lua). Meşru
--      oyuncularda aynı silahın değeri AYNIDIR (silah dosyaları sunucudan
--      iner, sunucunun kendi çarpan ayarı herkese uygulanır). En az iki başka
--      oyuncunun paylaştığı değerin %25 üstünde kalan oyuncu = hasar hilesi.
--      Eklenti silahların sınıfı (tabanca/tüfek/pompalı…) da buradan öğrenilir.
--   2) TEK-ATIŞ ÖLDÜRME (ONE_SHOT_KILL) — kurbanın dolu havuzunu (can+zırh
--      ≥150) GÖVDEDEN tek mermiyle sıfırlamak. Sunucu kendi gördüğü can ile
--      ölçer; saldırganın client'ı karara karışamaz.
--   3) KAFA VURUŞU ORANI (HEADSHOT_RATE, yalnızca log) — son 10 öldürmenin
--      9'u uzak mesafeden tek kafa vuruşuysa personele inceleme işareti.
--   4) KILL LOGU — "A [17] killed B [4] · weapon_pistol · HEAD · 17 m · ONE
--      SHOT (200 hp+armor)" (panel → Server Logs, kaynak "combat").
--
-- YANLIŞ-POZİTİF TASARIMI:
--   * Kafa vuruşu tek atışı FiveM'de VARSAYILAN olarak öldürür (kritik isabet,
--     zırhı saymaz) → kafadan tek atış asla cezalandırılmaz, yalnızca oran
--     istatistiğine girer (LOG).
--   * Gövdeden tek atış: pompalı/keskin/ağır silahlar ve sınıfı bilinmeyen
--     silahlar sayılmaz; kurban son 2 sn içinde kimseden hasar almamış olmalı
--     (sunucudaki can bilgisi bayat olmasın), başka saldırgan aynı anda vurduysa
--     sayılmaz; aynı silahla BAŞKA iki oyuncu da gövdeden tek atıyorsa silah
--     zaten güçlüdür → muaf. 10 dakikada 3 olay gerekir; en fazla KICK.
--   * İstatistik mutabakatı client kaynaklıdır (en fazla KICK) ve 90 sn içinde
--     3 ardışık ölçüm ister. Herhangi bir resource (yeniden) başlayınca tüm
--     istatistik sıfırlanır — sahip silah dosyasını güncelleyince eski değerler
--     yeni değerleri "hile" gibi göstermesin.
-- =============================================================================

local function ruleOn(key)
  return CAC.getRules()[key] == true
end

local function now() return GetGameTimer() end

local HEAD = { [19] = true, [20] = true }        -- ragdoll bileşeni: boyun, kafa
local STAT_TTL          = 2 * 60 * 60000         -- silah istatistiği ömrü
local STAT_RATIO        = 1.25                   -- mutabakatın bu katı üstü = hile
local STAT_STRIKES      = 3                      -- ardışık ölçüm (client ~10 sn'de bir yollar)
local STAT_STRIKE_WINDOW= 90000
local FULL_POOL         = 150                    -- "dolu havuz": can(100 üstü)+zırh
local QUIET_BEFORE_MS   = 2000                   -- kurban bu süredir hasar almamış olmalı
local ONE_SHOT_WINDOW   = 10 * 60000
local ONE_SHOT_NEEDED   = 3
local ONE_SHOT_CLASSES  = { pistol = true, smg = true, rifle = true, mg = true }
local HS_KILLS          = 10                     -- kafa oranı: son N öldürme
local HS_ONE_TAPS       = 9                      -- …bunların en az bu kadarı tek kafa vuruşu
local HS_MIN_MEDIAN_M   = 15                     -- …ve ortanca mesafe bu kadar
local HS_WINDOW         = 15 * 60000

local function round(n) return math.floor((tonumber(n) or 0) * 10 + 0.5) / 10 end

-- ---------------------------------------------------------------------------
-- Silah adı: vanilla tablo → paneldeki "Add-On Weapons" listesi → #hash
-- ---------------------------------------------------------------------------
local addonNames, addonFrom = {}, nil
local function weaponName(hash)
  hash = signedToUnsigned(hash)
  local e = CoreAC.WEAPON_DATA[hash]
  if e then return e.weaponName end
  local list = CoreAC.Config.Weapons.AddonWeapons
  if list ~= addonFrom then
    addonNames, addonFrom = {}, list
    if type(list) == 'table' then
      for _, n in ipairs(list) do
        addonNames[signedToUnsigned(GetHashKey(tostring(n)))] = tostring(n):lower()
      end
    end
  end
  return addonNames[hash] or ('#' .. math.floor(hash))
end
CoreAC.WeaponLabel = weaponName

-- ---------------------------------------------------------------------------
-- 1) SİLAH İSTATİSTİĞİ MUTABAKATI
-- ---------------------------------------------------------------------------
local wstats = {}        -- [hash] = { [src] = { eff, group, at } }
local statStrikes = {}   -- ["src:hash"] = { n, at }

--- Bir silah için başka oyuncuların bildirdiği değerler.
---   ref   = en az 2 oyuncunun PAYLAŞTIĞI en yüksek etkin hasar (yoksa nil)
---   group = en az 2 oyuncunun paylaştığı silah grubu (yoksa nil)
--- `exclude` (genelde değerlendirilen oyuncu) sayılmaz: hileci kendi
--- değeriyle mutabakatı kaydıramaz.
function CoreAC.WeaponConsensus(hash, exclude)
  local byWeapon = wstats[signedToUnsigned(tonumber(hash) or 0)]
  if not byWeapon then return nil end
  local t = now()
  local effCount, groupCount = {}, {}
  for src, e in pairs(byWeapon) do
    if src ~= exclude and t - e.at < STAT_TTL then
      local k = ('%.1f'):format(e.eff)
      effCount[k] = (effCount[k] or 0) + 1
      if e.group then groupCount[e.group] = (groupCount[e.group] or 0) + 1 end
    end
  end
  local ref, refPlayers = nil, 0
  for k, n in pairs(effCount) do
    local v = tonumber(k)
    if n >= 2 and (not ref or v > ref) then ref, refPlayers = v, n end
  end
  local group, groupPlayers = nil, 0
  for g, n in pairs(groupCount) do
    if n >= 2 and n > groupPlayers then group, groupPlayers = g, n end
  end
  if not ref and not group then return nil end
  return { ref = ref, players = refPlayers, group = group }
end

--- Silah sınıfı: vanilla tablo, yoksa oyuncuların bildirdiği grup (en az 2 kişi).
function CoreAC.ResolveWeaponClass(hash, exclude)
  local cls = CoreAC.GetWeaponClass and CoreAC.GetWeaponClass(hash)
  if cls then return cls end
  local c = CoreAC.WeaponConsensus(hash, exclude)
  return c and c.group and CoreAC.WeaponClassFromGroup(c.group) or nil
end

local function checkStats(src, hash, eff)
  if not ruleOn('anti_damage_multiplier') then return end
  if CAC.isWhitelisted and CAC.isWhitelisted(src) then return end
  local key = src .. ':' .. hash
  local c = CoreAC.WeaponConsensus(hash, src)
  if not (c and c.ref and c.ref > 0) or eff <= c.ref * STAT_RATIO + 0.5 then
    statStrikes[key] = nil
    return
  end
  local t = now()
  local s = statStrikes[key]
  if not s or t - s.at > STAT_STRIKE_WINDOW then s = { n = 0 } end
  s.n, s.at = s.n + 1, t
  statStrikes[key] = s
  if s.n < STAT_STRIKES then return end
  statStrikes[key] = nil
  TriggerEvent('coreac:serverReport', src, 'DAMAGE_MULTIPLIER', 'CRITICAL', {
    __origin = 'client',            -- değer oyuncunun kendi oyunundan geldi → en fazla KICK
    source   = 'weapon_stats',
    weapon   = weaponName(hash),
    damage   = round(eff),
    normal   = round(c.ref),
    players  = c.players,
  })
end

RegisterNetEvent('coreac:wstat', function(hash, dmgType, group, damage, wMod, pMod)
  local src = source
  if CAC.eventLimited(src, 'wstat', 6, 10000) then return end
  hash, group = tonumber(hash), tonumber(group)
  damage, wMod, pMod = tonumber(damage), tonumber(wMod), tonumber(pMod)
  if tonumber(dmgType) ~= 3 or not (hash and damage and wMod and pMod) then return end
  if damage < 0 or damage > 100000 or wMod < 0 or wMod > 1000 or pMod < 0 or pMod > 1000 then return end
  hash = signedToUnsigned(hash)
  local eff = damage * wMod * pMod
  local byWeapon = wstats[hash] or {}
  wstats[hash] = byWeapon
  byWeapon[src] = { eff = eff, group = group and group ~= 0 and signedToUnsigned(group) or nil, at = now() }
  checkStats(src, hash, eff)
end)

-- Bir resource (yeniden) başladıysa silah dosyaları değişmiş olabilir.
AddEventHandler('onResourceStart', function()
  wstats, statStrikes = {}, {}
end)

-- ---------------------------------------------------------------------------
-- 2-4) ÖLDÜRMELER — tek atış, kafa vuruşu oranı, kill logu
-- ---------------------------------------------------------------------------
local victimHits   = {}   -- [victim] = { {t, attacker} }   (son 2.5 sn)
local lastKillAt   = {}   -- [victim] = zaman (aynı ölüm için tek kayıt)
local killHistory  = {}   -- [attacker] = { {t, oneTapHead, dist} }
local bodyOneShots = {}   -- [attacker] = { zamanlar }
local oneShotUsers = {}   -- [weapon] = { [attacker] = zaman }  (silah gücü)

local function prune(list, maxAge, t)
  local out = {}
  for _, e in ipairs(list or {}) do
    local at = type(e) == 'table' and e.t or e
    if t - at < maxAge then out[#out + 1] = e end
  end
  return out
end

local function median(nums)
  if #nums == 0 then return 0 end
  table.sort(nums)
  local m = math.floor((#nums + 1) / 2)
  if #nums % 2 == 0 then return (nums[m] + nums[m + 1]) / 2 end
  return nums[m]
end

local function pname(src) return GetPlayerName(src) or ('#' .. src) end

local function onKill(attacker, victim, k)
  local t = now()
  if t - (lastKillAt[victim] or 0) < 3000 then return end
  lastKillAt[victim] = t

  local oneShot = k.quiet and not k.shared and k.poolBefore >= FULL_POOL
  local wname = weaponName(k.weapon)
  local line = ('%s [%d] killed %s [%d] · %s · %s · %d m'):format(
    pname(attacker), attacker, pname(victim), victim, wname, k.head and 'HEAD' or 'body', math.floor(k.dist))
  if oneShot then line = line .. (' · ONE SHOT (%d hp+armor)'):format(k.poolBefore) end
  CAC.log('INFO', 'combat', line)

  if CAC.isWhitelisted and CAC.isWhitelisted(attacker) then return end
  local cls = CoreAC.ResolveWeaponClass(k.weapon, attacker)

  -- Gövdeden tek atış (hasar hilesi işareti)
  if oneShot and not k.head and ONE_SHOT_CLASSES[cls] and ruleOn('anti_damage_multiplier') then
    local users = oneShotUsers[k.weapon] or {}
    oneShotUsers[k.weapon] = users
    users[attacker] = t
    local others = 0
    for s, at in pairs(users) do
      if s ~= attacker and t - at < 30 * 60000 then others = others + 1 end
    end
    if others < 2 then
      local list = prune(bodyOneShots[attacker], ONE_SHOT_WINDOW, t)
      list[#list + 1] = t
      bodyOneShots[attacker] = list
      if #list >= ONE_SHOT_NEEDED then
        bodyOneShots[attacker] = nil
        TriggerEvent('coreac:serverReport', attacker, 'ONE_SHOT_KILL', 'HIGH', {
          source = 'server_one_shot', kills = #list, weapon = wname,
          poolBefore = k.poolBefore, distance = math.floor(k.dist),
        })
      end
    end
  end

  -- Kafa vuruşu oranı (yalnızca log; tek-atış metasında iyi oyuncu da yüksek olabilir)
  if ruleOn('anti_headshot_rate') then
    local hist = prune(killHistory[attacker], HS_WINDOW, t)
    hist[#hist + 1] = { t = t, oneTapHead = oneShot and k.head, dist = k.dist }
    while #hist > HS_KILLS do table.remove(hist, 1) end
    killHistory[attacker] = hist
    if #hist >= HS_KILLS then
      local taps, dists = 0, {}
      for _, h in ipairs(hist) do
        if h.oneTapHead then taps = taps + 1 end
        dists[#dists + 1] = h.dist
      end
      local med = median(dists)
      if taps >= HS_ONE_TAPS and med >= HS_MIN_MEDIAN_M then
        killHistory[attacker] = nil
        TriggerEvent('coreac:serverReport', attacker, 'HEADSHOT_RATE', 'MEDIUM', {
          kills = #hist, oneTaps = taps, medianDist = math.floor(med),
        })
      end
    end
  end
end

local function onWeaponDamage(sender, data)
  if Config and Config.DetectionsEnabled == false then return end
  if WasEventCanceled() then return end            -- iptal edilen hasar kurbana ulaşmaz
  local attacker = tonumber(sender)
  if not attacker or attacker <= 0 or type(data) ~= 'table' or not data.weaponType then return end

  local nid = data.hitGlobalId or (data.hitGlobalIds and data.hitGlobalIds[1])
  local ent = nid and NetworkGetEntityFromNetworkId(nid) or 0
  if not ent or ent == 0 or not DoesEntityExist(ent) or GetEntityType(ent) ~= 1 or not IsPedAPlayer(ent) then return end
  local victim = NetworkGetEntityOwner(ent)
  if not victim or victim <= 0 or victim == attacker then return end

  local t = now()
  local quiet = true
  local hits = {}
  for _, h in ipairs(victimHits[victim] or {}) do
    if t - h.t < 2500 then
      hits[#hits + 1] = h
      if t - h.t < QUIET_BEFORE_MS then quiet = false end
    end
  end
  hits[#hits + 1] = { t = t, attacker = attacker }
  victimHits[victim] = hits

  local health = GetEntityHealth(ent)
  if health <= 101 then return end                  -- zaten yerde/ölü
  local poolBefore = math.max(0, health - 100) + GetPedArmour(ent)
  local aPed = GetPlayerPed(attacker)
  local dist = (aPed and aPed ~= 0) and #(GetEntityCoords(aPed) - GetEntityCoords(ent)) or 0.0
  local k = {
    weapon = signedToUnsigned(data.weaponType), head = HEAD[data.hitComponent] == true,
    dist = dist, poolBefore = poolBefore, quiet = quiet, shared = false,
  }
  local willKill = data.willKill == true

  -- Ölümü sunucunun kendi gözüyle doğrula (willKill saldırganın beyanıdır).
  SetTimeout(500, function()
    if not GetPlayerName(victim) then return end
    local dead = DoesEntityExist(ent) and GetEntityHealth(ent) <= 100
    if not (willKill or dead) then return end
    for _, h in ipairs(victimHits[victim] or {}) do
      if h.t > t and h.attacker ~= attacker then k.shared = true end
    end
    onKill(attacker, victim, k)
  end)
end

-- Thread içinden kaydedilir: bu kaynaktaki diğer weaponDamageEvent
-- handler'larından SONRA çalışsın ve onların CancelEvent() kararını görsün.
CreateThread(function()
  AddEventHandler('weaponDamageEvent', onWeaponDamage)
end)

AddEventHandler('playerDropped', function()
  local s = source
  victimHits[s], lastKillAt[s], killHistory[s], bodyOneShots[s] = nil, nil, nil, nil
  for key in pairs(statStrikes) do
    if key:find('^' .. s .. ':') then statStrikes[key] = nil end
  end
end)

-- Eski istatistikleri temizle (ayrılan oyuncuların ölçümleri TTL boyunca
-- mutabakata katkı vermeye devam eder — küçük sunucularda referans kaybolmasın).
CreateThread(function()
  while true do
    Wait(5 * 60000)
    local t = now()
    for hash, byWeapon in pairs(wstats) do
      local any = false
      for src, e in pairs(byWeapon) do
        if t - e.at >= STAT_TTL then byWeapon[src] = nil else any = true end
      end
      if not any then wstats[hash] = nil end
    end
    for w, users in pairs(oneShotUsers) do
      local any = false
      for s, at in pairs(users) do
        if t - at >= 30 * 60000 then users[s] = nil else any = true end
      end
      if not any then oneShotUsers[w] = nil end
    end
  end
end)
