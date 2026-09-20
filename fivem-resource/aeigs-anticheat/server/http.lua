-- Basit HTTP katmanı: Aeigs API'sine yetkili istek atar.
Aeigs = Aeigs or {}

local function headers()
  return {
    ['Content-Type'] = 'application/json',
    ['Authorization'] = 'Bearer ' .. (Config.Token or ''),
  }
end

--- @param path string  '/heartbeat' gibi
--- @param method string 'GET' | 'POST'
--- @param body table|nil
--- @param cb function|nil  function(ok, data, status)
function Aeigs.request(path, method, body, cb)
  if not Config.Token or Config.Token == '' then
    if cb then cb(false, nil, 0) end
    return
  end
  local url = Config.ApiBase .. path
  local data = body and json.encode(body) or '{}'
  PerformHttpRequest(url, function(status, resText, _)
    local parsed = nil
    if resText and #resText > 0 then
      local success, decoded = pcall(json.decode, resText)
      if success then parsed = decoded end
    end
    local okFlag = status >= 200 and status < 300 and parsed and parsed.ok
    if cb then cb(okFlag == true, parsed and parsed.data or nil, status) end
    if not okFlag and Config.Debug then
      print(('[Core Shield] %s %s -> %s %s'):format(method, path, status, resText or ''))
    end
  end, method, data, headers())
end
