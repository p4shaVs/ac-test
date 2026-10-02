-- =============================================================================
-- liveness_guard.lua — SERVER-AUTHORITATIVE ANTI-TAMPER (en büyük açığı kapatır)
--
-- Client core.lua her ~10 sn 'coreac:alive' gönderir. Bir hileci client AC'yi
-- durdurur/etkisizleştirirse bu sinyal KESİLİR. Bu guard, AKTİF oynayan bir
-- oyuncudan sinyal sürdürülebilir bir süre gelmezse "AC devre dışı bırakıldı"
-- (AC_TAMPER) olarak raporlar — karar (LOG/KICK/BAN) panel Aksiyonlar sistemine
-- ve DetectionsEnabled anahtarına tabidir.
--
-- FALSE-POSITIVE TASARIMI (bu projedeki eski watchdog false-kick atıyordu):
--   * SADECE en az bir kez 'coreac:alive' GÖNDERMİŞ oyuncu izlenir (yükleme/
--     bağlanma ekranındaki oyuncu asla işaretlenmez).
--   * Ping 0/çok yüksek (timeout/kopma) ise atlanır — bu ağ sorunudur, tamper değil.
--   * Grace: ilk sinyalden sonra WARMUP kadar beklenir.
--   * Kayıp, ABSENCE_LIMIT'i aşmalı (birçok kayıp beat) VE tek sefer raporlanır.
--   * Whitelist/bypass muaf. DetectionsEnabled=false iken hiç işlem yapılmaz.
-- =============================================================================

local CHECK_INTERVAL = 20000    -- kontrol sıklığı (ms)
local ABSENCE_LIMIT  = 45000    -- son sinyalden bu kadar sonra kayıp say (>4 beat)
local WARMUP         = 60000    -- ilk sinyalden sonra bu kadar geçmeden işaretleme
local MAX_PING       = 400      -- bunun üstünde ping = ağ sorunu, atla

local seen = {}   -- [src] = { first = ms, last = ms, flagged = bool }

RegisterNetEvent('coreac:alive', function()
  local src = source
  if not src or src <= 0 then return end
  local now = GetGameTimer()
  local s = seen[src]
  if not s then
    seen[src] = { first = now, last = now, flagged = false }
  else
    s.last = now
    s.flagged = false   -- tekrar sinyal geldi → temiz
  end
end)

-- ---------------------------------------------------------------------------
-- CHALLENGE-RESPONSE — "coreac:alive" taklidini kapatır.
--
-- Pasif heartbeat tek başına yetersizdi: AC'yi kapatan hileci kendi kodundan
-- TriggerServerEvent('coreac:alive') spam'leyip canlı görünebiliyordu. Artık
-- sunucu rastgele bir nonce yollar, client CoreAC.SolveChallenge ile cevaplar.
--
-- FALSE-POSITIVE TASARIMI (liveness ile aynı titizlik):
--   * Yalnızca en az bir kez 'alive' göndermiş, WARMUP'ı geçmiş oyuncuya sorulur.
--   * Ping 0 / MAX_PING üstü (ağ sorunu) ise sorulmaz.
--   * Whitelist muaf. DetectionsEnabled=false iken hiç çalışmaz.
--   * Cevap penceresi geniş (REPLY_WINDOW) ve ÜST ÜSTE 3 başarısızlık gerekir;
--     tek bir kayıp paket/donma asla işaretlemez. Doğru cevap sayacı sıfırlar.
-- ---------------------------------------------------------------------------
local CHALLENGE_INTERVAL = 30000  -- kaç ms'de bir sorulur
local REPLY_WINDOW       = 15000  -- cevap için tanınan süre
local FAIL_LIMIT         = 3      -- üst üste bu kadar başarısızlık = tamper

local pending = {}  -- [src] = { nonce, expect, at }
local fails   = {}  -- [src] = int

RegisterNetEvent('coreac:challengeReply', function(nonce, answer)
  local src = source
  local p = pending[src]
  if not p then return end
  if tonumber(nonce) ~= p.nonce then return end          -- bayat/uydurma nonce
  if (GetGameTimer() - p.at) > REPLY_WINDOW then return end
  pending[src] = nil
  if tonumber(answer) == p.expect then
    fails[src] = 0                                        -- doğru → temiz
  else
    fails[src] = (fails[src] or 0) + 1                    -- yanlış dönüşüm
  end
end)

AddEventHandler('playerDropped', function()
  if seen[source] then seen[source] = nil end
  pending[source] = nil
  fails[source] = nil
end)

CreateThread(function()
  while true do
    Wait(CHALLENGE_INTERVAL)
    if Config.DetectionsEnabled ~= false then
      local now = GetGameTimer()
      for _, sid in ipairs(GetPlayers()) do
        local src = tonumber(sid)
        local s = src and seen[src]
        if s and GetPlayerName(src) and (now - s.first) > WARMUP then
          local ping = GetPlayerPing(src)
          if ping and ping > 0 and ping < MAX_PING
             and not (CAC.isWhitelisted and CAC.isWhitelisted(src)) then
            -- Önceki soru cevapsız kaldıysa (penceresi doldu) başarısızlık say.
            local p = pending[src]
            if p and (now - p.at) > REPLY_WINDOW then
              pending[src] = nil
              fails[src] = (fails[src] or 0) + 1
            end

            if (fails[src] or 0) >= FAIL_LIMIT then
              fails[src] = 0
              TriggerEvent('coreac:serverReport', src, 'AC_TAMPER', 'HIGH', {
                reason = 'anti-tamper challenge failed (client anti-cheat not responding correctly)',
                failures = FAIL_LIMIT,
              })
              CAC.log('WARN', 'anticheat', ('AC_TAMPER: %s (challenge failed x%d)')
                :format(GetPlayerName(src) or src, FAIL_LIMIT))
            elseif not pending[src] then
              local nonce = math.random(1, 2147483000)
              pending[src] = { nonce = nonce, expect = CoreAC.SolveChallenge(nonce), at = now }
              TriggerClientEvent('coreac:challenge', src, nonce)
            end
          end
        end
      end
      -- ayrılanları temizle
      local online = {}
      for _, sid in ipairs(GetPlayers()) do online[tonumber(sid)] = true end
      for k in pairs(pending) do if not online[k] then pending[k] = nil end end
      for k in pairs(fails) do if not online[k] then fails[k] = nil end end
    end
  end
end)

CreateThread(function()
  while true do
    Wait(CHECK_INTERVAL)
    if Config.DetectionsEnabled ~= false then
      local now = GetGameTimer()
      for _, sid in ipairs(GetPlayers()) do
        local src = tonumber(sid)
        local s = src and seen[src]
        -- Yalnızca en az bir kez sinyal göndermiş oyuncuyu izle
        if s and GetPlayerName(src) then
          local ping = GetPlayerPing(src)
          if ping and ping > 0 and ping < MAX_PING then
            if (now - s.first) > WARMUP
               and (now - s.last) > ABSENCE_LIMIT
               and not s.flagged then
              if not (CAC.isWhitelisted and CAC.isWhitelisted(src)) then
                s.flagged = true
                TriggerEvent('coreac:serverReport', src, 'AC_TAMPER', 'HIGH', {
                  reason = 'client anti-cheat heartbeat stopped (resource stopped or suppressed)',
                  silentFor = math.floor((now - s.last) / 1000) .. 's',
                })
                CAC.log('WARN', 'anticheat', ('AC_TAMPER: %s (no heartbeat for %ss)')
                  :format(GetPlayerName(src) or src, math.floor((now - s.last) / 1000)))
              end
            end
          end
        end
      end
      -- ayrılanları temizle
      local online = {}
      for _, sid in ipairs(GetPlayers()) do online[tonumber(sid)] = true end
      for k in pairs(seen) do if not online[k] then seen[k] = nil end end
    end
  end
end)

print('^2[CoreAC] Liveness guard (anti-tamper) yuklendi.^7')
