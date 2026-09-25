-- =============================================================================
-- server/commands.lua — sunucu KONSOLU komutu:  ac <alt-komut>
--
-- Oyuncular sohbete /ac yazınca client'taki yönetici komutu çalışır
-- (client/admin.lua); bu komut yalnızca sunucu konsolundan ve panelin
-- Console sayfasından (kaynak ExecuteCommand ile çalıştırır → source 0) gelir.
--
-- DÜZELTİLEN HATALAR (eski sürüm):
--   * "ac ban" gerçekte BANLAMIYORDU: sebep metni tespit tipi olarak
--     gönderiliyordu → panel tanımadığı tipi yalnızca LOG'luyordu.
--   * "ac unban" / "unban all" panelde OLMAYAN uçları çağırıyordu (404).
--   * "ac baninfo" yardımda vardı ama hiç yazılmamıştı; "install/uninstall/
--     debug" hiçbir şey yapmıyordu; "ac reload" config'i indirip UYGULAMIYORDU.
--   * "ac clear peds" OYUNCU ped'lerini de silmeye çalışıyordu.
-- =============================================================================

local PREFIX = (CoreAC.Config.Settings and CoreAC.Config.Settings.CommandPrefix) or 'ac'

-- Çıktı: sunucu konsoluna basılır; komut PANELİN Console sayfasından geldiyse
-- (server/main.lua pollCommands) aynı satır panele log olarak da gider ki
-- web konsolunda sonuç görünsün. Async (panel yanıtı bekleyen) sonuçlar da
-- komutun geldiği yeri hatırlar.
local function replier(fromPanel)
    return function(msg, color)
        print(('^5[CoreAC]^7 %s%s^7'):format(color or '', msg))
        if fromPanel and CAC.log then
            CAC.log((color == '^1') and 'WARN' or 'INFO', 'console', (msg:gsub('%^%d', '')))
        end
    end
end
local out = replier(false)

local function isVehicleOccupiedByAPlayer(vehicle)
    for seat = -1, 6 do
        local ped = GetPedInVehicleSeat(vehicle, seat)
        if ped ~= 0 and IsPedAPlayer(ped) then return true end
    end
    return false
end

local function help(out)
    if CoreAC.drawLogo then CoreAC:drawLogo() end
    out('Console commands:')
    out(('  %s players                        ^3list online players and their IDs'):format(PREFIX))
    out(('  %s kick <id> <reason>             ^3kick an online player'):format(PREFIX))
    out(('  %s ban <id> [hours] <reason>      ^3ban an online player (no hours = permanent)'):format(PREFIX))
    out(('  %s unban <Ban ID>                 ^3lift a ban (the code the player sees, e.g. AC-7K3QP9)'):format(PREFIX))
    out(('  %s baninfo <Ban ID>               ^3show who, why and until when'):format(PREFIX))
    out(('  %s announce <message>             ^3banner on every player\'s screen'):format(PREFIX))
    out(('  %s clear <peds|vehicles|objects|all>  ^3delete world entities (never players or occupied vehicles)'):format(PREFIX))
    out(('  %s reload                         ^3pull the configuration from the panel now'):format(PREFIX))
end

local function onlineTarget(arg, out)
    local id = tonumber(arg)
    if not id or not GetPlayerName(id) then
        out('No online player with that ID. Use "' .. PREFIX .. ' players".', '^1')
        return nil
    end
    return id
end

local function clearEntities(kind)
    local n = 0
    if kind == 'peds' or kind == 'all' then
        for _, e in ipairs(GetAllPeds()) do
            if DoesEntityExist(e) and not IsPedAPlayer(e) then DeleteEntity(e); n = n + 1 end
        end
    end
    if kind == 'vehicles' or kind == 'all' then
        for _, e in ipairs(GetAllVehicles()) do
            if DoesEntityExist(e) and not isVehicleOccupiedByAPlayer(e) then DeleteEntity(e); n = n + 1 end
        end
    end
    if kind == 'objects' or kind == 'all' then
        for _, e in ipairs(GetAllObjects()) do
            if DoesEntityExist(e) then DeleteEntity(e); n = n + 1 end
        end
    end
    return n
end

RegisterCommand(PREFIX, function(source, args)
    -- Yalnızca konsol / panel (source 0). Oyuncunun /ac'si client'ta çalışır.
    if tonumber(source) ~= 0 then return end
    local out = replier(CAC.commandFromPanel == true)
    local sub = args[1] and args[1]:lower() or nil

    if not sub or sub == 'help' then
        help(out)

    elseif sub == 'players' then
        local list = GetPlayers()
        out(('%d player(s) online'):format(#list))
        for _, sid in ipairs(list) do
            out(('  #%s  %s'):format(sid, GetPlayerName(sid) or '?'))
        end

    elseif sub == 'kick' then
        local target = onlineTarget(args[2], out); if not target then return end
        local reason = table.concat(args, ' ', 3); if reason == '' then reason = 'Console' end
        local name = GetPlayerName(target)
        CAC.request('/ingame-action', 'POST', {
            type = 'KICK', reason = reason, by = 'Console',
            license = CAC.getIdents(target).license, playerName = name,
        }, nil)
        DropPlayer(target, '[CoreAC] You have been kicked from this server.')
        out(('Kicked %s (%s).'):format(name, reason), '^2')

    elseif sub == 'ban' then
        local target = onlineTarget(args[2], out); if not target then return end
        local hours = tonumber(args[3])
        local reasonFrom = 3
        if hours and hours >= 1 and hours <= 87600 then reasonFrom = 4 else hours = nil end
        local reason = table.concat(args, ' ', reasonFrom); if reason == '' then reason = 'Console' end
        local name = GetPlayerName(target)
        CAC.request('/ingame-action', 'POST', {
            type = 'BAN', reason = reason, by = 'Console',
            license = CAC.getIdents(target).license, playerName = name,
            durationHours = hours and math.floor(hours) or nil,
        }, function(ok, data)
            if CAC.refreshBans then CAC.refreshBans() end
            local code = (data and data.banCode) or '—'
            if GetPlayerName(target) then
                DropPlayer(target, ('[CoreAC] You are banned from this server. | Ban ID: %s'):format(code))
            end
            if ok then out(('Banned %s — Ban ID %s%s.'):format(name, code, hours and (' for ' .. math.floor(hours) .. 'h') or ' (permanent)'), '^2')
            else out('The ban could not be recorded on the panel — check coreac_api / coreac_token.', '^1') end
        end)

    elseif sub == 'unban' then
        local code = args[2] and args[2]:upper() or nil
        if not code then out(('Usage: %s unban <Ban ID>'):format(PREFIX), '^3') return end
        CAC.request('/ingame/unban', 'POST', { code = code, by = 'Console' }, function(ok, data)
            if ok then
                if CAC.refreshBans then CAC.refreshBans() end
                out(('Lifted ban %s (%s).'):format(code, (data and data.playerName) or 'player'), '^2')
            else
                out(('No active ban with ID %s.'):format(code), '^1')
            end
        end)

    elseif sub == 'baninfo' then
        local code = args[2] and args[2]:upper() or nil
        if not code then out(('Usage: %s baninfo <Ban ID>'):format(PREFIX), '^3') return end
        CAC.request('/ingame/data', 'POST', { tab = 'bans', q = code }, function(ok, data)
            local row
            for _, r in ipairs((ok and data and data.rows) or {}) do
                if r.code == code then row = r break end
            end
            if not row then out(('No active ban with ID %s.'):format(code), '^1') return end
            out(('Ban %s'):format(row.code), '^3')
            out(('  Player:  %s'):format(row.name or '?'))
            out(('  Reason:  %s'):format(row.reason or '?'))
            out(('  By:      %s'):format(row.by or '?'))
            out(('  Issued:  %s'):format(row.at or '?'))
            out(('  Expires: %s'):format(row.permanent and 'never (permanent)' or (row.expiresAt or '?')))
        end)

    elseif sub == 'announce' then
        local msg = table.concat(args, ' ', 2)
        if msg == '' then out(('Usage: %s announce <message>'):format(PREFIX), '^3') return end
        msg = msg:sub(1, 200)
        TriggerClientEvent('coreac:announceBanner', -1, msg, 'Server')
        CAC.log('INFO', 'console', 'Announcement: ' .. msg)
        out('Announcement sent.', '^2')

    elseif sub == 'clear' then
        local kind = args[2] and args[2]:lower() or ''
        if kind ~= 'peds' and kind ~= 'vehicles' and kind ~= 'objects' and kind ~= 'all' then
            out(('Usage: %s clear <peds|vehicles|objects|all>'):format(PREFIX), '^3') return
        end
        local n = clearEntities(kind)
        CAC.log('INFO', 'console', ('World clean-up (%s): %d entities removed'):format(kind, n))
        out(('Removed %d %s.'):format(n, kind == 'all' and 'entities' or kind), '^2')

    elseif sub == 'reload' then
        if CAC.heartbeat then
            CAC.heartbeat()
            out('Configuration requested from the panel — it applies as soon as the panel answers.', '^2')
        end

    else
        out(('Unknown sub-command "%s". Type "%s" for the list.'):format(sub, PREFIX), '^1')
    end
end, false)
