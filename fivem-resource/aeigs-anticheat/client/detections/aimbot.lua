-- aimbot.lua — Aimbot, ÜÇ KATMANLI (DÜZELTİLMİŞ)
--
-- DEĞİŞİKLİKLER:
--   - Katman 1 snap eşiği 35 → 25 (smoothing'li hileleri de yakalar)
--   - Katman 2 kilit süresi 4000 → 2000ms (pratikte çok daha etkili)
--   - Katman 3 precision eşikleri biraz gevşetildi (1.6→2.0 mean, 0.8→1.0 stddev)
--     çünkü çok sıkı tutunca düşük ping'li iyi oyuncuları da yakalıyordu
--   - onPlayer kontrolü için fallback eklendi: GetEntityPlayerIsFreeAimingAt
--     bazen yanlış döndüğü için raycast ile çift kontrol yapılıyor

local snapStrike      = Aeigs.strike(3, 8000)
local precisionStrike = Aeigs.strike(2, 30000)

local lastH, lastP, lastT
local lockTarget, lockSince, lockMoveTicks, lockTotalTicks = nil, 0, 0, 0
local errSamples, lastErrSample, precisionSince = {}, 0, 0

local function camForward()
  local r   = GetGameplayCamRot(2)
  local zr  = math.rad(r.z)
  local xr  = math.rad(r.x)
  local num = math.abs(math.cos(xr))
  return vector3(-math.sin(zr) * num, math.cos(zr) * num, math.sin(xr))
end

local function angleErrorDeg(camPos, fwd, targetPos)
  local dir  = targetPos - camPos
  local dist = #dir
  if dist < 0.5 then return nil end
  dir = dir / dist
  local dot = fwd.x*dir.x + fwd.y*dir.y + fwd.z*dir.z
  dot = math.max(-1.0, math.min(1.0, dot))
  return math.deg(math.acos(dot))
end

-- FIX: GetEntityPlayerIsFreeAimingAt güvenilmez olduğu için raycast ile doğrula
local function getAimTarget(ped)
  local aiming, ent = GetEntityPlayerIsFreeAimingAt(Aeigs.S.id)
  if aiming and ent and ent ~= 0 and IsEntityAPed(ent) and IsPedAPlayer(ent) then
    return true, ent
  end
  -- Fallback: kamera yönünde 150m raycast
  local camPos = GetGameplayCamCoord()
  local fwd    = camForward()
  local dest   = camPos + fwd * 150.0
  local hit, _, _, _, hitEnt = StartExpensiveSynchronousShapeTestLosProbe(
    camPos.x, camPos.y, camPos.z,
    dest.x,   dest.y,   dest.z,
    12, ped, 4)  -- 12 = ped flag
  if hit and hit ~= 0 and hitEnt and hitEnt ~= 0
    and IsEntityAPed(hitEnt) and IsPedAPlayer(hitEnt) then
    return true, hitEnt
  end
  return false, nil
end

local function evaluatePrecision(now)
  if #errSamples < 12 then return end
  local sum = 0
  for _, v in ipairs(errSamples) do sum = sum + v end
  local mean = sum / #errSamples
  local varsum = 0
  for _, v in ipairs(errSamples) do varsum = varsum + (v - mean)^2 end
  local stddev = math.sqrt(varsum / #errSamples)
  -- FIX: eşikler biraz gevşetildi (2.0 / 1.0) — iyi oyuncu FP atmasın
  if mean <= 2.0 and stddev <= 1.0 and (now - precisionSince) >= 2500 then
    if precisionStrike:hit() then
      Aeigs.report('AIM_PRECISION_SUSPECTED', 'MEDIUM', {
        source = 'precision',
        mean   = math.floor(mean   * 100) / 100,
        stddev = math.floor(stddev * 100) / 100,
      }, 20000)
    end
    errSamples    = {}
    precisionSince = now
  end
end

CreateThread(function()
  while true do
    local S = Aeigs.S
    if Aeigs.rule('anti_aimbot', true) and Aeigs.active()
      and S.ped and IsPlayerFreeAiming(S.id) then

      local rot    = GetGameplayCamRot(2)
      local now    = GetGameTimer()
      local onPlayer, ent = getAimTarget(S.ped)  -- FIX: raycast fallback

      -- KATMAN 1: ani snap — FIX: eşik 35 → 25
      if lastT and (now - lastT) > 0 and (now - lastT) < 60 then
        local dh = math.abs(((rot.z - lastH + 180.0) % 360.0) - 180.0)
        local dp = math.abs(rot.x - lastP)
        if (dh + dp) > 25.0 and IsPedShooting(S.ped) and onPlayer then
          if snapStrike:hit() then
            Aeigs.report('AIMBOT', 'CRITICAL', {
              source = 'snap',
              snap   = math.floor(dh + dp),
            })
          end
        end
      end
      lastH, lastP, lastT = rot.z, rot.x, now

      -- KATMAN 2 / 3: kesintisiz kilit
      if onPlayer then
        if lockTarget == ent then
          if lockSince == 0 then
            lockSince      = now
            lockMoveTicks  = 0
            lockTotalTicks = 0
            errSamples     = {}
            precisionSince = now
          end
          lockTotalTicks = lockTotalTicks + 1
          if GetEntitySpeed(ent) > 1.2 then lockMoveTicks = lockMoveTicks + 1 end
          local movingEnough = lockTotalTicks > 0
            and (lockMoveTicks / lockTotalTicks) > 0.7

          -- Katman 3 örnekleme (~100ms)
          if movingEnough and (now - lastErrSample) >= 100 then
            lastErrSample = now
            local err = angleErrorDeg(
              GetGameplayCamCoord(), camForward(),
              GetEntityCoords(ent) + vector3(0, 0, 0.6))
            if err then
              errSamples[#errSamples + 1] = err
              if #errSamples > 25 then table.remove(errSamples, 1) end
              evaluatePrecision(now)
            end
          end

          -- FIX: süre 4000 → 2000ms
          if (now - lockSince) >= 2000 and movingEnough then
            lockSince      = now
            lockMoveTicks  = 0
            lockTotalTicks = 0
            Aeigs.report('AIMBOT', 'CRITICAL', {
              source = 'sustained_lock',
              ms     = 2000,
            })
          end
        else
          lockTarget     = ent
          lockSince      = now
          lockMoveTicks  = 0
          lockTotalTicks = 0
          errSamples     = {}
          precisionSince = now
        end
      else
        lockTarget     = nil
        lockSince      = 0
        errSamples     = {}
      end

      Wait(0)
    else
      lastT          = nil
      lockTarget     = nil
      lockSince      = 0
      lockMoveTicks  = 0
      lockTotalTicks = 0
      errSamples     = {}
      Wait(300)
    end
  end
end)
