local ignoredWeapons = {
    ["0"] = true,
    ["126349499"] = true, -- snowball
    ["600439132"] = true, -- ball
    ["2725352035"] = true, -- Fists
    ["1198879012"] = true, -- FLARE GUN
    ["4222310262"] = true,
    ["2461879995"] = true,
    ["3425972830"] = true,
    ["133987706"] = true,
    ["2741846334"] = true,
    ["3452007600"] = true,
    ["4194021054"] = true,
    ["324506233"] = true,
    ["2339582971"] = true,
    ["2294779575"] = true,
    ["28811031"] = true,
    ["148160082"] = true,
    ["1223143800"] = true,
    ["4284007675"] = true,
    ["1936677264"] = true,
    ["539292904"] = true,
    ["910830060"] = true,
    ["3750660587"] = true,
    ["341774354"] = true,
    ["3204302209"] = true,
    ["2282558706"] = true,
    ["431576697"] = true,
    ["2092838988"] = true,
    ["476907586"] = true,
    ["3048454573"] = true,
    ["328167896"] = true,
    ["190244068"] = true,
    ["1151689097"] = true,
    ["3293463361"] = true,
    ["2556895291"] = true,
    ["2756453005"] = true,
    ["1200179045"] = true,
    ["525623141"] = true,
    ["4148791700"] = true,
    ["1000258817"] = true,
    ["3628350041"] = true,
    ["741027160"] = true,
    ["3959029566"] = true,
    ["1817275304"] = true,
    ["1338760315"] = true,
    ["2722615358"] = true,
    ["3936892403"] = true,
    ["2600428406"] = true,
    ["3036244276"] = true,
    ["1595421922"] = true,
    ["3393648765"] = true,
    ["2700898573"] = true,
    ["3507816399"] = true,
    ["1416047217"] = true,
    ["1566990507"] = true,
    ["1987049393"] = true,
    ["2011877270"] = true,
    ["1331922171"] = true,
    ["1226518132"] = true,
    ["855547631"] = true,
    ["785467445"] = true,
    ["704686874"] = true,
    ["1119518887"] = true,
    ["153396725"] = true,
    ["2861067768"] = true,
    ["507170720"] = true,
    ["2206953837"] = true,
    ["394659298"] = true,
    ["711953949"] = true,
    ["3754621092"] = true,
    ["3303022956"] = true,
    ["3846072740"] = true,
    ["3857952303"] = true,
    ["3123149825"] = true,
    ["4128808778"] = true,
    ["3808236382"] = true,
    ["2220197671"] = true,
    ["1198717003"] = true,
    ["3708963429"] = true,
    ["2786772340"] = true,
    ["1097917585"] = true,
    ["3643944669"] = true,
    ["2344076862"] = true,
    ["3595383913"] = true,
    ["3796180438"] = true,
    ["1966766321"] = true,
    ["3473446624"] = true,
    ["1186503822"] = true,
    ["3800181289"] = true,
    ["1638077257"] = true,
    ["2456521956"] = true,
    ["2467888918"] = true,
    ["2263283790"] = true,
    ["162065050"] = true,
    ["3530961278"] = true,
    ["3177079402"] = true,
    ["3878337474"] = true,
    ["158495693"] = true,
    ["1820910717"] = true,
    ["50118905"] = true,
    ["84788907"] = true,
    ["3946965070"] = true,
    ["231629074"] = true,
    ["3169388763"] = true,
    ["1371067624"] = true,
    ["3450622333"] = true,
    ["4171469727"] = true,
    ["3355244860"] = true,
    ["3595964737"] = true,
    ["2667462330"] = true,
    ["968648323"] = true,
    ["955522731"] = true,
    ["519052682"] = true,
    ["1176362416"] = true,
    ["3565779982"] = true,
    ["3884172218"] = true,
    ["1744687076"] = true,
    ["3670375085"] = true,
    ["2656583842"] = true,
    ["1015268368"] = true,
    ["1945616459"] = true,
    ["3683206664"] = true,
    ["1697521053"] = true,
    ["1177935125"] = true,
-- V1dXV1dXV1dXV1dXV1dXV1cgZm1h
    ["2156678476"] = true,
    ["341154295"] = true,
    ["1192341548"] = true,
    ["2966510603"] = true,
    ["1217122433"] = true,
    ["376489128"] = true,
    ["1100844565"] = true,
    ["3041872152"] = true,
    ["1155224728"] = true,
    ["729375873"] = true,
    ["2144528907"] = true,
    ["2756787765"] = true,
    ["4094131943"] = true,
    ["1347266149"] = true,
    ["2275421702"] = true,
    ["1150790720"] = true,
    ["1741783703"] = true,
    ["1392289305"] = true,
    ["3940737434"] = true,
    ["4161575695"] = true,
    ["3948829706"] = true,
    ["3014743549"] = true,
    ["3794660812"] = true,
    ["3746472001"] = true,
    ["3611149825"] = true,
    ["3059926651"] = true,
    ["2361261192"] = true,
    ["1984488269"] = true,
    ["1790524546"] = true,
    ["1599495177"] = true,
    ["984313451"] = true,
    ["562032424"] = true,
    ["816319410"] = true,

}

local stealthKills = {}

local spamPunchStrike = CoreAC.StrikesSystem.createStrikeSystem("AntiSpamPunch", 10, function(playerId)
    CoreAC.DetectPlayer(playerId, CoreAC.Detections.ANTI_KILL, {
        type = "Spam Punch"
    })
end, 2500)

local stealthKillsStrike = CoreAC.StrikesSystem.createStrikeSystem("AntiStealthKills", 3, function(playerId)
    CoreAC.DetectPlayer(playerId, CoreAC.Detections.ANTI_KILL, {
        type = "Stealth Kill Exploit"
    })
end, 5000)

AddEventHandler("weaponDamageEvent", LPH_JIT_MAX(function(sender, data)
    if data.weaponType == 539292904 and CoreAC.Config.Explosions.CancelAllExplosions then CancelEvent() return end
    if data.weaponType == 3750660587 and CoreAC.Config.Explosions.CancelAllFires then CancelEvent() return end

    if CoreAC.Config.Weapons.AntiSpoofedBullets or CoreAC.Config.Weapons.AntiSuperPunch or CoreAC.Config.Weapons.AntiKill then
        if CoreAC.Config.Weapons.AntiKill then
            if data.silenced and data.weaponDamage == 0 and data.weaponType == 2725352035 then
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                    weaponType = data.weaponType,
                    weaponDamage = data.weaponDamage,
                    damageFlags = data.damageFlags,
                })
                return
            end
            if data.silenced and data.weaponDamage == 0 and data.weaponType == 3452007600 then
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                    weaponType = data.weaponType,
                    weaponDamage = data.weaponDamage,
                    damageFlags = data.damageFlags,
                })
                return
            end

            if data.silenced and data.weaponType == 849905853 and (data.damageFlags == 513 or data.damageFlags == 1) and data.weaponDamage == 0 then
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                    type = "Tranquilizer",
                })
                return
            end
            
            if data.silenced and data.weaponType == 1003267566 and data.damageFlags == 1581104 then
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                    type = "Eulen Send Crash",
                })
                return
            end

            if data.weaponType == 2725352035 and data.damageFlags == 454 and data.weaponDamage == 0 and (data.damageType == 2 or data.damageType == 3)
            and data.hitComponent == 0 and data.actionResultId == 0 then
                --tz fists 1
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                    type = "Tz Fists",
                    weaponType = data.weaponType,
                    weaponDamage = data.weaponDamage,
                })
                return
            end
            if data.weaponType == 2725352035 and data.damageFlags == 525312 and data.weaponDamage > 0 and data.hitComponent == 0 and data.actionResultId == 0 then
                --keyser fists 1
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                    type = "Keyser Fists",
                    weaponDamage = data.weaponDamage,
                })
                return
            end

            if data.weaponType == 2725352035 and data.damageFlags == 524288 and data.weaponDamage == 100 then
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                    type = "Ambani Fists",
                })
                return
            end

            if data.weaponType == 2725352035 and data.damageFlags == 454 and data.weaponDamage == 0 and data.hitComponent == 20 and data.damageType == 3 then
                --keyser fists 2
                CancelEvent()
                stealthKillsStrike(sender)
            end
            if data.weaponType == 2725352035 and data.weaponDamage >= 200 and data.damageFlags >= 1500000 then
                --eulen fists
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                    weaponType = data.weaponType,
                    weaponDamage = data.weaponDamage,
                    damageFlags = data.damageFlags,
                })
                return
            end
            if data.weaponType == 133987706 and data.weaponDamage > 200 and data.damageFlags == 525312 then
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                    type = "Ram Exploit",
                    weaponDamage = data.weaponDamage,
                })
                return
            end
            if data.weaponType == 2725352035 and data.damageFlags == 198 and data.weaponDamage == 1 then
                -- keyser punch
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                    type = "Punch Exploit",
                    weaponDamage = data.weaponDamage,
                })
                return
            end
            if data.weaponType == 2725352035 and (data.damageFlags == 524810 or data.damageFlags == 8339382) and data.weaponDamage == 0 then
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                    type = "Slap Exploit",
                    weaponDamage = data.weaponDamage,
                })
                return
            end

            if data.weaponType == 2725352035 and data.damageFlags == 522 and data.hitGlobalId and data.hitGlobalId > 0 then
                -- HATA DÜZELTİLDİ: mesafe VURULAN entity'ye değil, o entity'nin
                -- ağ SAHİBİ olan oyuncunun ped'ine ölçülüyordu. Bir NPC'nin sahibi
                -- uzaktaki başka bir oyuncuysa, NPC'ye atılan meşru yumruk
                -- "5 m+ uzaktan vuruş" sayılıp hasarı İPTAL ediliyordu. Entity sunucuda
                -- yoksa da koordinat (0,0,0) okunup aynı hata oluşuyordu.
                local victim = NetworkGetEntityFromNetworkId(data.hitGlobalId)
                if victim and victim ~= 0 and DoesEntityExist(victim) and IsPedAPlayer(victim) then
                    local distance = #(GetEntityCoords(GetPlayerPed(sender)) - GetEntityCoords(victim))
                    if distance >= 5.0 then
                        CancelEvent()
                        spamPunchStrike(sender)
                    end
                end
                return
            end
        end

        if (data.parentGlobalId == 0) and (data.damageType == 3 or data.damageType == 10) then

            if CoreAC.Config.Weapons.AntiKill then
                if data.weaponType == 2339582971 and data.weaponDamage == 9999 and data.damageFlags == 525312 then
                    CancelEvent()
                    CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                        weaponType = data.weaponType,
                        weaponDamage = data.weaponDamage,
                        damageFlags = data.damageFlags,
                    })
                    return
                end

                if data.weaponType == 3452007600 and data.weaponDamage >= 512 and data.damageFlags == 16 then
                    CancelEvent()
                    CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                        weaponType = data.weaponType,
                        weaponDamage = data.weaponDamage,
                        damageFlags = data.damageFlags,
                    })
                    return
                end

                if data.weaponType == 1834887169 and data.damageFlags == 2642962 and data.damageTime > 200000 then
                    CancelEvent()
                    CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_KILL, {
                        weaponType = data.weaponType,
                        weaponDamage = data.weaponDamage,
                        damageFlags = data.damageFlags,
                    })
                    return
                end
            end

            if CoreAC.Config.Weapons.AntiSpoofedBullets and (data.damageFlags == 513 or data.damageFlags == 1 or data.weaponType == 911657153) and not data.f133 and not ignoredWeapons[tostring(data.weaponType)] then
                local selectedWeapon = signedToUnsigned(GetSelectedPedWeapon(GetPlayerPed(sender)))

                -- KALDIRILDI: `if data.weaponType ~= selectedWeapon then CancelEvent() end`.
                -- Sunucunun gördüğü seçili silah senkron durumdur ve client'ın
                -- gerisinde kalır (silah değiştirilen an, araçtan ateş, envanter
                -- scriptinin verdiği silah). Eşleşmeyince MEŞRU merminin hasarı
                -- sessizce siliniyordu. Karar artık aşağıdaki doğrulamaya bırakılır.

                if data.weaponType ~= selectedWeapon
                    and (data.damageFlags ~= 513 or (data.damageFlags == 513 and (data.willKill or data.hitComponent == 0)) or data.weaponType == 911657153)
                then
                    local targetId = NetworkGetEntityFromNetworkId(data.hitGlobalId)
                    if DoesEntityExist(targetId) then
                        CoreAC.issueSpoofCheck(tonumber(sender), selectedWeapon, data.weaponType)
                        TriggerClientEvent("__CoreAC:CheckSpoofedBullets", tonumber(sender), selectedWeapon, data.weaponType, data.damageTime)
                    end
                end
            end
        end

        if CoreAC.Config.Weapons.AntiSuperPunch and data.weaponType == 2725352035 then --super punch
            local targetEntity = NetworkGetEntityFromNetworkId(data.hitGlobalId)
            if (data.parentGlobalId == 0) and (data.damageType == 3) and (data.weaponDamage > 500) then
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_SUPER_PUNCH, {
                    type = "Player",
                    damages = data.weaponDamage,
                })
                return
            elseif data.hasImpactDir and (data.damageType == 1) and (data.weaponDamage > 400) and (DoesEntityExist(targetEntity) and GetEntityType(targetEntity) == 2) then
                CancelEvent()
                CoreAC.DetectPlayer(sender, CoreAC.Detections.ANTI_SUPER_PUNCH, {
                    type = "Vehicle",
                    damages = data.weaponDamage,
                })
                return
            end
        end
        --todo check les degats cote srv??
    end

    if data.willKill then
        local targetId = NetworkGetEntityFromNetworkId(data.hitGlobalId)
        -- Yalnızca OYUNCU öldürmeleri. Eskiden her NPC öldürmesi de işleniyordu ve
        -- "kurban" olarak NPC'nin ağ sahibi olan (alakasız) oyuncu yazılıyordu;
        -- panel log akışı da her ateşli çatışmada NPC kill'leriyle doluyordu.
        if targetId and targetId ~= 0 and DoesEntityExist(targetId) and IsPedAPlayer(targetId) then
            local targetOwner = NetworkGetEntityOwner(targetId)

            if targetOwner and (tonumber(sender) ~= targetOwner) then
                if not CoreAC.DeadPlayersCache[tonumber(sender)] then CoreAC.DeadPlayersCache[tonumber(sender)] = {} end
                CoreAC.DeadPlayersCache[tonumber(sender)][#CoreAC.DeadPlayersCache[tonumber(sender)]+ 1] = {timestamp = os.time(), killedId = targetOwner}

                CoreAC.SendLog("KILL", sender, {
                    target = ("[%s] %s"):format(targetOwner, GetPlayerName(targetOwner) or "Unknown"),
                    weaponType = data.weaponType,
                })
            end
        end
    end
end))

-- ---------------------------------------------------------------------------
-- Spoofed bullets doğrulaması — sunucu şüpheli bir hasar görünce client'a
-- "bu silah gerçekten elinde mi?" diye sorar, client sonucu geri bildirir.
--
-- Eskiden:
--   * Sunucu, client'ın oyun zamanlayıcısından gelen damageTime'ı kendi
--     GetGameTimer()'ı ile kıyaslıyordu — iki ayrı saat; kontrol ya hiç
--     çalışmıyor ya da rastgele tetikleniyordu.
--   * İstenmemiş (sunucunun sormadığı) yanıtlar da kabul ediliyordu.
--   * Rapor sunucu kaynaklı gidiyordu. Oysa "silah elimde değil" kararını
--     client veriyor; hile client'ı bunu bastırabilir ya da uydurabilir. Sunucu
--     kaynaklı sayılınca "confirmed" tip olarak doğrudan BAN atabiliyordu.
-- Artık: yalnızca sunucunun sorduğu kontrollere, 2 sn içinde gelen yanıtlar
-- kabul edilir ve rapor CLIENT kaynaklı gider (en fazla KICK).
-- ---------------------------------------------------------------------------
local pendingSpoofChecks = {}   -- [src] = { at, selected, spoofed }

function CoreAC.issueSpoofCheck(src, selectedWeapon, spoofedWeapon)
    if not src then return end
    pendingSpoofChecks[src] = { at = GetGameTimer(), selected = selectedWeapon, spoofed = spoofedWeapon }
end

AddEventHandler('playerDropped', function()
    pendingSpoofChecks[source] = nil
end)

RegisterNetEvent("__CoreAC:CheckSpoofedBullets", function(weaponHash, selectedWeapon, spoofedWeapon, damageTime)
    local src = source
    local pending = pendingSpoofChecks[src]
    if not pending then return end                     -- sunucu bu oyuncuya sormadı
    pendingSpoofChecks[src] = nil

    local interval = GetGameTimer() - pending.at
    if interval > 2000 then return end                 -- bayat yanıt

    local selectedClientWeaponData = CoreAC.WEAPON_DATA[weaponHash]
    local selectedServerWeaponData = CoreAC.WEAPON_DATA[pending.selected]
    local spoofedWeaponData = CoreAC.WEAPON_DATA[pending.spoofed]
    CoreAC.DetectPlayer(src, CoreAC.Detections.ANTI_SPOOFED_BULLETS, {
        __origin = 'client',
        selectedClientWeapon = selectedClientWeaponData and selectedClientWeaponData.weaponName or weaponHash,
        selectedServerWeapon = selectedServerWeaponData and selectedServerWeaponData.weaponName or pending.selected,
        spoofedWeapon = spoofedWeaponData and spoofedWeaponData.weaponName or pending.spoofed,
        answeredInMs = interval,
    })
end)

-- AddEventHandler("weaponDamageEvent", function(sender, data)
--     if not data.overrideDefaultDamage then return end
--     if data.willKill then return end

--     local interval = GetGameTimer() - data.damageTime
--     if interval > 100 then return end
--     local targetId = NetworkGetEntityFromNetworkId(data.hitGlobalId)
--     if not DoesEntityExist(targetId) then return end

--     local beforeHealth = GetEntityHealth(targetId)
--     Wait(100)

--     local health = GetEntityHealth(targetId)
--     local healthDiff = math.abs(beforeHealth - health - data.weaponDamage)
--     if health == 0 then return end

--     print("checking...", targetId, GetPlayerInvincible(GetPlayerPed(100)), data.weaponDamage)
--     if healthDiff > 2 then
--         print(targetId, "is in god mode", beforeHealth, "->", health, interval)
--     end
-- end)