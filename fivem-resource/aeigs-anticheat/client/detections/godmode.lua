-- godmode.lua — QBCore uyumlu, false positive düzeltilmiş
--
-- SORUN: QBCore spawn sırasında SetEntityInvincible(ped, true) yapıyor.
-- Spawn animasyonu + blackout + inventory yüklemesi = 20-45sn sürebiliyor.
-- Önceki versiyon sadece zamana bakıyordu (35sn grace), ama spawn geç
-- bitince hâlâ invincible olan oyuncuyu godmode sanıyordu.
--
-- YENİ YAKLAŞIM:
--   GetPlayerInvincible true olsa bile — QBCore'un kendi spawn'unun
--   bittiğini doğrulamadan flag atmıyoruz. QBCore spawn bitince
--   'QBCore:Client:OnPlayerLoaded' event'i tetiklenir. Biz bunu dinliyoruz.
--   Bu event gelene kadar godmode tespiti tamamen devre dışı.
--   Event geldikten sonra da 5sn daha bekliyoruz (inventory/skin yüklemesi).

local flagStrike     = Aeigs.strike(6, 25000)
local lastVehExit    = 0
local VEH_EXIT_GRACE = 3000

-- QBCore spawn takibi
local qbSpawnDone    = false
local qbSpawnTime    = 0
local QB_POST_GRACE  = 5000  -- spawn bittikten sonra 5sn daha muaf

-- QBCore spawn tamamlandı eventi
AddEventHandler('QBCore:Client:OnPlayerLoaded', function()
  qbSpawnDone = true
  qbSpawnTime = GetGameTimer()
end)

-- Respawn / hastaneden çıkış (QBCore)
AddEventHandler('hospital:client:Revive', function()
  qbSpawnTime = GetGameTimer()
end)
AddEventHandler('QBCore:Client:OnPlayerUnload', function()
  -- Karakter değişimi veya logout → spawn sıfırla
  qbSpawnDone = false
  qbSpawnTime = 0
end)

-- Araçtan çıkış takibi
CreateThread(function()
  local wasInVeh = false
  while true do
    Wait(500)
    local S = Aeigs.S
    if S then
      if wasInVeh and not S.inVeh then
        lastVehExit = GetGameTimer()
      end
      wasInVeh = S.inVeh or false
    end
  end
end)

local function exemptState()
  local S   = Aeigs.S
  local now = GetGameTimer()

  if not S.ped or S.dead then return true end

  -- QBCore spawn henüz bitmedi → tamamen muaf
  if not qbSpawnDone then return true end

  -- Spawn bitti ama post-grace süresi dolmadı
  if qbSpawnTime > 0 and (now - qbSpawnTime) < QB_POST_GRACE then return true end

  -- Araçta veya araçtan yeni inildi
  if S.inVeh or (now - lastVehExit) < VEH_EXIT_GRACE then return true end

  if S.ragdoll or S.falling or S.swimming or S.climbing
    or S.jumping or S.frozen or S.cutscene or S.collisionOff then return true end

  if S.parachute > 0 or IsPedInParachuteFreeFall(S.ped) then return true end
  if IsPlayerCamControlDisabled(S.id) then return true end

  if Aeigs.reviveGrace and Aeigs.reviveGrace() then return true end
  if Aeigs.tpGrace     and Aeigs.tpGrace()     then return true end

  return false
end

CreateThread(function()
  while true do
    Wait(2000)
    if Aeigs.rule('anti_invincibility', true) and Aeigs.active() and not exemptState() then
      local S       = Aeigs.S
      local flagged = false

      if S.invincible then flagged = true end

      -- GetEntityProofs: üçü birden true olmalı (tek bayrak framework olabilir)
      local ok, bulletProof, fireProof, _, _, meleeProof = pcall(GetEntityProofs, S.ped)
      if ok and bulletProof and meleeProof and fireProof then
        flagged = true
      end

      if flagged then
        if flagStrike:hit() then
          Aeigs.report('GODMODE', 'HIGH', {
            source      = 'flags',
            invincible  = S.invincible,
            bulletProof = ok and bulletProof or false,
          })
        end
      else
        flagStrike:resetStrike()
      end
    end
  end
end)
