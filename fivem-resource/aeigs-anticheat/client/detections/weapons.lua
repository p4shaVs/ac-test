-- weapons.lua — Infinite Ammo / No Reload + kara listedeki silah engelleme
local UNARMED = GetHashKey("weapon_unarmed")

-- Ammo tespitleri: ateş ederken mermi/şarjör HİÇ azalmıyorsa (6 örnek doğrulama)
CreateThread(function()
  local lastWeapon, lastTotal, lastClip = nil, -1, -1
  local sameAmmo, sameClip = 0, 0
  while true do
    Wait(500)
    local S = Aeigs.S
    local ped, wep = S.ped, S.weapon
    if not ped then goto cont end
    if wep ~= lastWeapon then
      lastWeapon = wep
      lastTotal = GetAmmoInPedWeapon(ped, wep)
      lastClip = GetAmmoInClip(ped, wep)
      sameAmmo, sameClip = 0, 0
    end
    do
      local clipSize = GetMaxAmmoInClip(ped, wep, false)
      local isFirearm = wep ~= UNARMED and clipSize and clipSize > 1
      local total = GetAmmoInPedWeapon(ped, wep)
      local clip = GetAmmoInClip(ped, wep)
      if isFirearm and IsPedShooting(ped) and total > 0 then
        if Aeigs.rule('anti_infinite_ammo', true) and total == lastTotal then
          sameAmmo = sameAmmo + 1
          if sameAmmo >= 6 then sameAmmo = 0; Aeigs.report('INFINITE_AMMO', 'CRITICAL', {}) end
        else sameAmmo = 0 end
        if Aeigs.rule('anti_no_reload', true) and clip == lastClip and clip > 0 then
          sameClip = sameClip + 1
          if sameClip >= 6 then sameClip = 0; Aeigs.report('NO_RELOAD', 'CRITICAL', {}) end
        else sameClip = 0 end
      else sameAmmo = 0; sameClip = 0 end
      lastTotal = total; lastClip = clip
    end
    ::cont::
  end
end)

-- ---------------------------------------------------------------------------
-- GIVE ALL WEAPONS — hile menülerinin klasik özelliği: tüm silahları anında
-- envantere ekler. Bilinen yaygın silahlardan bir örneklem sayılır; bu
-- örneklemden BİRDEN FAZLASI aynı 3 sn'lik pencerede aniden belirirse
-- (normal oyunda silahlar teker teker, satın alınarak/bulunarak gelir)
-- kesin işaret. Yüksek eşik (≥6 yeni silah) → false riski yok.
-- ---------------------------------------------------------------------------
local SAMPLE_WEAPON_NAMES = {
  'WEAPON_PISTOL', 'WEAPON_COMBATPISTOL', 'WEAPON_APPISTOL', 'WEAPON_PISTOL50',
  'WEAPON_MICROSMG', 'WEAPON_SMG', 'WEAPON_ASSAULTSMG', 'WEAPON_MINISMG',
  'WEAPON_ASSAULTRIFLE', 'WEAPON_CARBINERIFLE', 'WEAPON_ADVANCEDRIFLE',
  'WEAPON_SPECIALCARBINE', 'WEAPON_BULLPUPRIFLE', 'WEAPON_MG', 'WEAPON_COMBATMG',
  'WEAPON_PUMPSHOTGUN', 'WEAPON_SAWNOFFSHOTGUN', 'WEAPON_ASSAULTSHOTGUN',
  'WEAPON_BULLPUPSHOTGUN', 'WEAPON_STUNGUN', 'WEAPON_SNIPERRIFLE',
  'WEAPON_HEAVYSNIPER', 'WEAPON_GRENADELAUNCHER', 'WEAPON_RPG',
  'WEAPON_MINIGUN', 'WEAPON_GRENADE', 'WEAPON_STICKYBOMB', 'WEAPON_PROXMINE',
  'WEAPON_MOLOTOV', 'WEAPON_KNIFE', 'WEAPON_NIGHTSTICK', 'WEAPON_HAMMER',
  'WEAPON_BAT', 'WEAPON_MACHETE', 'WEAPON_SWITCHBLADE', 'WEAPON_REVOLVER',
  'WEAPON_DOUBLEACTION', 'WEAPON_MARKSMANPISTOL', 'WEAPON_MACHINEPISTOL',
  'WEAPON_COMBATPDW', 'WEAPON_MARKSMANRIFLE', 'WEAPON_HEAVYRIFLE',
}
local SAMPLE_WEAPONS = {}
for i, wname in ipairs(SAMPLE_WEAPON_NAMES) do SAMPLE_WEAPONS[i] = GetHashKey(wname) end

CreateThread(function()
  local lastCount = nil
  while true do
    Wait(3000)
    local ped = Aeigs.S.ped
    if ped and Aeigs.rule('anti_give_all_weapons', true) and Aeigs.active() then
      local count = 0
      for _, hash in ipairs(SAMPLE_WEAPONS) do
        if HasPedGotWeapon(ped, hash, false) then count = count + 1 end
      end
      if lastCount ~= nil and (count - lastCount) >= 6 then
        Aeigs.report('GIVE_ALL_WEAPONS', 'CRITICAL', { before = lastCount, after = count })
      end
      lastCount = count
    else
      lastCount = nil
    end
  end
end)

-- Kara listedeki silah envanterde belirir belirmez (ateş etmeden)
CreateThread(function()
  while true do
    Wait(1000)
    local ped = Aeigs.S.ped
    if ped then
      for hash, action in pairs(Aeigs.WeaponBlacklist) do
        if HasPedGotWeapon(ped, hash, false) then
          if action == 'REMOVE' then
            RemoveWeaponFromPed(ped, hash)
            Aeigs.report('BLACKLIST_WEAPON', 'MEDIUM', { hash = hash })
          else
            TriggerServerEvent('aeigs:weaponHit', hash)
          end
        end
      end
    end
  end
end)
