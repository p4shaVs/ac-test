-- Minimal FiveM server runtime stub for simulation tests.
SIM = { now = 0, handlers = {}, netSafe = {}, threads = {}, timers = {}, clientEvents = {},
        requests = {}, players = {}, entities = {}, api = {}, errors = {}, lines = {} }

local rawprint = print
function SIM.out(s) SIM.lines[#SIM.lines + 1] = s; rawprint('  >> ' .. s) end
function SIM.err(e) SIM.errors[#SIM.errors + 1] = tostring(e); rawprint('  !! ERROR: ' .. tostring(e)) end
print = function(...) end   -- resource banners off

-- ---------------------------------------------------------------- vectors
local V = {}
V.__index = V
local function mk(n, x, y, z) return setmetatable({ x = x + 0.0, y = y + 0.0, z = (z or 0) + 0.0, _n = n }, V) end
function vector3(x, y, z) return mk(3, x, y, z) end
function vector2(x, y) return mk(2, x, y, 0) end
V.__sub = function(a, b) return mk(a._n, a.x - b.x, a.y - b.y, a.z - b.z) end
V.__add = function(a, b) return mk(a._n, a.x + b.x, a.y + b.y, a.z + b.z) end
V.__mul = function(a, b) if type(a) == 'number' then a, b = b, a end return mk(a._n, a.x * b, a.y * b, a.z * b) end
V.__len = function(a) if a._n == 2 then return math.sqrt(a.x ^ 2 + a.y ^ 2) end return math.sqrt(a.x ^ 2 + a.y ^ 2 + a.z ^ 2) end
V.__eq = function(a, b) return a.x == b.x and a.y == b.y and a.z == b.z end

-- ---------------------------------------------------------------- scheduler
function GetGameTimer() return SIM.now end
function GetNetworkTime() return SIM.now end
function CreateThread(fn) SIM.threads[#SIM.threads + 1] = { co = coroutine.create(fn), wake = SIM.now } end
function Wait(ms) coroutine.yield(ms or 0) end
function SetTimeout(ms, fn) SIM.timers[#SIM.timers + 1] = { at = SIM.now + ms, fn = fn } end
Citizen = { CreateThread = CreateThread, Wait = Wait, SetTimeout = SetTimeout, Trace = function() end }

function SIM.advance(ms, step)
  step = step or 50
  local target = SIM.now + ms
  while SIM.now < target do
    for i = #SIM.timers, 1, -1 do
      local t = SIM.timers[i]
      if t.at <= SIM.now then
        table.remove(SIM.timers, i)
        local ok, err = pcall(t.fn)
        if not ok then SIM.err(err) end
      end
    end
    local list = SIM.threads
    SIM.threads = {}
    for _, th in ipairs(list) do
      if th.wake <= SIM.now then
        local ok, res = coroutine.resume(th.co)
        if not ok then SIM.err(res)
        elseif coroutine.status(th.co) ~= 'dead' then th.wake = SIM.now + (tonumber(res) or 0); SIM.threads[#SIM.threads + 1] = th end
      else
        SIM.threads[#SIM.threads + 1] = th
      end
    end
    if SIM.onTick then SIM.onTick(step) end
    SIM.now = SIM.now + step
  end
end

-- ---------------------------------------------------------------- events
function RegisterNetEvent(name, fn) SIM.netSafe[name] = true; if fn then AddEventHandler(name, fn) end end
RegisterServerEvent = RegisterNetEvent
function AddEventHandler(name, fn)
  SIM.handlers[name] = SIM.handlers[name] or {}
  table.insert(SIM.handlers[name], fn)
  return { name = name }
end
function RemoveEventHandler() end
function SIM.dispatch(name, src, ...)
  local prev, prevCanceled = source, SIM.canceled
  SIM.canceled = false
  for _, h in ipairs(SIM.handlers[name] or {}) do
    source = src
    local ok, err = pcall(h, ...)
    if not ok then SIM.err(name .. ': ' .. tostring(err)) end
  end
  local result = SIM.canceled
  source, SIM.canceled = prev, prevCanceled
  return result
end
function TriggerEvent(name, ...) return SIM.dispatch(name, '', ...) end
--- client → server net event (only reaches handlers if some RegisterNetEvent made it net-safe)
function SIM.net(name, src, ...)
  if not SIM.netSafe[name] then SIM.out('blocked (not net-safe): ' .. name) return end
  return SIM.dispatch(name, src, ...)
end
function TriggerClientEvent(name, target, ...) SIM.clientEvents[#SIM.clientEvents + 1] = { name = name, target = target } end
function CancelEvent() SIM.canceled = true end
function WasEventCanceled() return SIM.canceled end


-- ---------------------------------------------------------------- client world
C = { coords = vector3(200, -800, 30), vel = vector3(0, 0, 0), invincible = false, inv2 = false, canDamage = true,
      bulletProof = 0, meleeProof = 0, armed = false, shooting = false, faded = false, frozen = false, visible = true,
      control = true, health = 200, maxHealth = 200, armour = 0, falling = false, height = 0.0 }
SIM.server = {}
-- ---------------------------------------------------------------- fake server end of the secure channel
-- client/secure_channel.lua talks on random event names (GlobalState.coreac_ch). This
-- stub answers the hello with a key (as a NETWORK event: numeric source), checks every
-- signature/sequence number and replays channel reports as the old 'coreac:report'
-- callback so the older client scenarios keep observing reports the same way.
SIM.CH = { hello = 'ch_hello', msg = 'ch_msg', key = 'ch_key', chal = 'ch_chal', pull = 'ch_pull', put = 'ch_put' }
SIM.KEY = { 123456789, 987654321 }
SIM.channel = {}      -- every verified message: { seq, kind, payload }
SIM.channelBad = {}   -- signature / sequence problems the stub saw
SIM.hellos = 0
SIM.autoKey = true
--- Server → client event (arrives with a numeric source, like the real network).
function SIM.fromServer(name, ...) return SIM.dispatch(name, 65535, ...) end

local lastSeq = 0
function TriggerServerEvent(name, ...)
  SIM.server[#SIM.server + 1] = { name = name, args = { ... } }
  if name == SIM.CH.hello then
    SIM.hellos = SIM.hellos + 1
    local _, nonce = ...
    if SIM.autoKey then
      SetTimeout(50, function() SIM.fromServer(SIM.CH.key, SIM.KEY[1], SIM.KEY[2], nonce) end)
    end
    return
  end
  if name == SIM.CH.msg then
    local seq, kind, sig, payload = ...
    if sig ~= CoreAC.ChannelSig(SIM.KEY, seq, kind) then SIM.channelBad[#SIM.channelBad + 1] = 'sig:' .. tostring(kind) end
    if seq ~= lastSeq + 1 then SIM.channelBad[#SIM.channelBad + 1] = ('seq:%s->%s'):format(lastSeq, tostring(seq)) end
    lastSeq = seq
    SIM.channel[#SIM.channel + 1] = { seq = seq, kind = kind, payload = payload }
    if kind == 'report' and type(payload) == 'table' and SIM.onServerEvent then
      SIM.onServerEvent('coreac:report', payload.t, payload.s, payload.d)
    end
    if SIM.onChannel then SIM.onChannel(kind, payload) end
    return
  end
  if SIM.onServerEvent then SIM.onServerEvent(name, ...) end
end

-- Resources, metadata, commands and the invoking resource (secure_channel, Event Shield).
SIM.clientResources = { 'coreac' }
SIM.meta = {}          -- [res][key] = { files… }
SIM.commandList = {}   -- GetRegisteredCommands()
SIM.invoker = nil
function GetInvokingResource() return SIM.invoker end
function GetNumResources() return #SIM.clientResources end
function GetResourceByFindIndex(i) return SIM.clientResources[i + 1] end
function GetNumResourceMetadata(res, key) local m = SIM.meta[res]; return m and m[key] and #m[key] or 0 end
function GetResourceMetadata(res, key, i) local m = SIM.meta[res]; return m and m[key] and m[key][i + 1] or nil end
function GetRegisteredCommands() return SIM.commandList end
function PlayerPedId() return 1 end
function PlayerId() return 0 end
function GetPlayerServerId() return 1 end
function GetEntityCoords() return C.coords end
function GetEntityVelocity() return C.vel end
function GetEntitySpeed() return #C.vel end
function GetEntityHealth() return C.health end
function GetEntityMaxHealth() return C.maxHealth end
function GetPedArmour() return C.armour end
function GetPlayerMaxArmour() return 100 end
function GetEntityHeightAboveGround() return C.height end
function GetEntityHeading() return 0.0 end
function GetPedType() return 4 end
function IsPedFalling() return C.falling end
function GetVehiclePedIsIn() return 0 end
function GetVehiclePedIsEntering() return 0 end
function GetPedInVehicleSeat() return 0 end
function GetPlayerInvincible() return C.invincible end
function GetPlayerInvincible_2() return C.inv2 end
function GetEntityCanBeDamaged() return C.canDamage end
function IsEntityVisible() return C.visible end
function GetEntityAttachedTo() return 0 end
function GetEntityProofs() return true, C.bulletProof, 0, 0, 0, C.meleeProof, 0, 0, 0 end
function IsPedArmed() return C.armed end
function IsPedShooting() return C.shooting end
function IsScreenFadedIn() return not C.faded end
function IsPlayerControlOn() return C.control end
function GetRenderingCam() return -1 end
function IsEntityPositionFrozen() return C.frozen end
function NetworkIsSessionStarted() return true end
function DoesEntityExist() return true end
function GetPedParachuteState() return -1 end
function GetEntityModel() return GetHashKey('mp_m_freemode_01') end
-- Commands, NUI and resource states (used by the Settings-tab client scenario).
SIM.commands, SIM.nui, SIM.nuiCallbacks, SIM.resources = {}, {}, {}, {}
function RegisterCommand(name, fn) SIM.commands[name] = fn end
function RegisterKeyMapping() end
function SendNUIMessage(msg) SIM.nui[#SIM.nui + 1] = msg end
function RegisterNUICallback(name, fn) SIM.nuiCallbacks[name] = fn end
function GetResourceState(n)
  if SIM.resources[n] then return SIM.resources[n] end
  for _, r in ipairs(SIM.clientResources or {}) do if r == n then return 'started' end end
  return 'missing'
end
function GetCurrentResourceName() return 'coreac' end
function GetConvar(_, d) return d end
LocalPlayer = { state = setmetatable({}, { __index = { set = function(self, k, v) rawset(self, k, v) end } }) }
GlobalState = { coreac_ch = SIM.CH }
json = { encode = function() return '{}' end, decode = function() return {} end }
SIM.exports = {}
exports = setmetatable({}, {
  __call = function(_, name, fn) SIM.exports[name] = fn end,
  __index = function() return setmetatable({}, { __index = function() return function() return nil end end }) end,
})
function GetHashKey(s)
  s = tostring(s):lower()
  local h = 0
  for i = 1, #s do
    h = (h + s:byte(i)) & 0xFFFFFFFF
    h = (h + (h << 10)) & 0xFFFFFFFF
    h = h ~ (h >> 6)
  end
  h = (h + (h << 3)) & 0xFFFFFFFF
  h = h ~ (h >> 11)
  h = (h + (h << 15)) & 0xFFFFFFFF
  if h >= 0x80000000 then h = h - 0x100000000 end
  return h
end
function GetIsLoadingScreenActive() return false end
function GetEntityCollisionDisabled() return false end
function GetPedConfigFlag() return false end
function NumberToBoolean(v) return v == true or v == 1 end
local KEEP_NIL = { CoreAC = 1, CAC = 1, Config = 1, Configuration = 1 }
setmetatable(_G, { __index = function(_, k)
  if type(k) ~= 'string' or KEEP_NIL[k] or k:match('^LPH_') then return nil end
  if k:match('^Is') or k:match('^Has') or k:match('^Does') or k:match('^Can') or k:match('^Network') then return function() return false end end
  if k:match('^GetIs') then return function() return false end end
  if k:match('^Get') then return function() return 0 end end
  if k:match('^[A-Z]') then return function() return nil end end
  return nil
end })
