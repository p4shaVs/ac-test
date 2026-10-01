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
V.__div = function(a, b) return mk(a._n, a.x / b, a.y / b, a.z / b) end
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

-- ---------------------------------------------------------------- players / entities
local function byPed(ped) for _, p in pairs(SIM.players) do if p.ped == ped then return p end end end
function GetPlayers() local t = {} for id in pairs(SIM.players) do t[#t + 1] = tostring(id) end table.sort(t) return t end
function GetPlayerName(src) local p = SIM.players[tonumber(src)]; return p and p.name or nil end
function GetPlayerPed(src) local p = SIM.players[tonumber(src)]; return p and p.ped or 0 end
function GetEntityCoords(e) local p = byPed(e); if p then return p.coords end local x = SIM.entities[e]; return x and x.coords or vector3(0, 0, 0) end
function GetEntityVelocity(e) local p = byPed(e); if p then return p.vel end local x = SIM.entities[e]; return x and x.vel or vector3(0, 0, 0) end
function GetAllVehicles() local t = {} for id, x in pairs(SIM.entities) do if x.type == 2 then t[#t + 1] = id end end table.sort(t) return t end
function GetPedInVehicleSeat(veh) local x = SIM.entities[veh]; return x and x.driver or 0 end
function GetVehicleType(veh) local x = SIM.entities[veh]; return x and x.vtype or 'automobile' end
SIM.resources = {}
function GetVehiclePedIsIn(ped) local p = byPed(ped); return p and p.veh or 0 end
function GetSelectedPedWeapon(ped) local p = byPed(ped); return p and p.weapon or 0 end
function RemoveWeaponFromPed(ped, w) local p = byPed(ped); SIM.out(('RemoveWeaponFromPed(%s, %s)'):format(p and p.name or '?', tostring(w))); if p then p.weapon = 0 end end
function GetEntityAttachedTo() return 0 end
function GetPedArmour() return 0 end
function GetEntityHealth() return 200 end
function GetPlayerMaxArmour() return 100 end
function GetPlayerIdentifiers(src) local p = SIM.players[tonumber(src)]; return p and p.ids or {} end
function GetPlayerEndpoint() return '127.0.0.1' end
function GetPlayerPing() return 30 end
function IsPlayerAceAllowed(src, obj) local p = SIM.players[tonumber(src)]; return p ~= nil and p.ace == true and obj == 'command' end
function GetResourceState(n) return SIM.resources[n] or 'missing' end
function DropPlayer(src, reason) SIM.out(('DropPlayer(%s): %s'):format(GetPlayerName(src) or tostring(src), reason)) end
function GetConvar(k, d) if k == 'coreac_token' then return 'coreac_srv_test' end if k == 'coreac_api' then return 'http://panel/api/v1' end return d end
function GetConvarInt(_, d) return d end
function GetCurrentResourceName() return 'coreac' end
function GetNumResources() return 0 end
function GetEntityModel(e) local x = SIM.entities[e]; return x and x.model or 0 end
function GetEntityType(e) local x = SIM.entities[e]; return x and x.type or 0 end
function DoesEntityExist(e) return SIM.entities[e] ~= nil end
function DeleteEntity(e) SIM.out('DeleteEntity(' .. tostring(e) .. ')'); SIM.entities[e] = nil end
function NetworkGetEntityOwner(e) local x = SIM.entities[e]; return x and x.owner or -1 end
function NetworkGetFirstEntityOwner(e) local x = SIM.entities[e]; if x and x.first then return x.first end return NetworkGetEntityOwner(e) end
function GetEntityPopulationType(e) local x = SIM.entities[e]; return x and x.pop or 7 end
function IsPedAPlayer() return false end
function GetInvokingResource() return nil end

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
joaat = GetHashKey

json = { encode = function() return '{}' end, decode = function() return {} end }
GlobalState = {}
function Player(src)
  SIM.bags = SIM.bags or {}
  SIM.bags[src] = SIM.bags[src] or setmetatable({}, { __index = { set = function(self, k, v) rawset(self, k, v) end } })
  return { state = SIM.bags[src] }
end
SIM.exports = {}
exports = setmetatable({}, {
  __call = function(_, name, fn) SIM.exports[name] = fn end,
  __index = function() return setmetatable({}, { __index = function() return function() return nil end end }) end,
})

-- Unknown natives → harmless no-op (returns nil). Real globals must stay nil.
local KEEP_NIL = { CoreAC = 1, CAC = 1, Config = 1, Configuration = 1, ServerConfig = 1, LocalPlayer = 1 }
setmetatable(_G, { __index = function(_, k)
  if type(k) == 'string' and k:match('^[A-Z]') and not KEEP_NIL[k] and not k:match('^LPH_') then
    return function() return nil end
  end
  return nil
end })
