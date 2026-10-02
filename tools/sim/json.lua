-- Small real JSON for the simulator (the prelude's old stub returned '{}').
-- Scenarios need it to read Adaptive Cards, API bodies and txAdmin files.
-- Loaded by run.cjs right after the prelude.

local esc = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }

local function enc(v, out)
  local t = type(v)
  if t == 'nil' then
    out[#out + 1] = 'null'
  elseif t == 'boolean' or t == 'number' then
    out[#out + 1] = tostring(v)
  elseif t == 'string' then
    out[#out + 1] = '"' .. v:gsub('[%c"\\]', function(c) return esc[c] or string.format('\\u%04x', c:byte()) end) .. '"'
  elseif t == 'table' then
    local n, isArr = 0, true
    for k in pairs(v) do
      n = n + 1
      if type(k) ~= 'number' then isArr = false end
    end
    if isArr and n == #v then
      out[#out + 1] = '['
      for i = 1, #v do
        if i > 1 then out[#out + 1] = ',' end
        enc(v[i], out)
      end
      out[#out + 1] = ']'
    else
      out[#out + 1] = '{'
      local first = true
      for k, x in pairs(v) do
        if type(x) ~= 'function' then
          if not first then out[#out + 1] = ',' end
          first = false
          enc(tostring(k), out)
          out[#out + 1] = ':'
          enc(x, out)
        end
      end
      out[#out + 1] = '}'
    end
  else
    out[#out + 1] = 'null'
  end
end

local function dec(s, i)
  i = s:find('%S', i) or #s + 1
  local c = s:sub(i, i)
  if c == '{' then
    local obj = {}
    i = s:find('%S', i + 1)
    if s:sub(i, i) == '}' then return obj, i + 1 end
    while true do
      local k
      k, i = dec(s, i)
      i = s:find(':', i, true) + 1
      local v
      v, i = dec(s, i)
      obj[k] = v
      i = s:find('[,}]', i)
      if s:sub(i, i) == '}' then return obj, i + 1 end
      i = i + 1
    end
  elseif c == '[' then
    local arr = {}
    i = s:find('%S', i + 1)
    if s:sub(i, i) == ']' then return arr, i + 1 end
    while true do
      local v
      v, i = dec(s, i)
      arr[#arr + 1] = v
      i = s:find('[,%]]', i)
      if s:sub(i, i) == ']' then return arr, i + 1 end
      i = i + 1
    end
  elseif c == '"' then
    local j, buf = i + 1, {}
    while true do
      local ch = s:sub(j, j)
      if ch == '' then error('json: unterminated string') end
      if ch == '"' then return table.concat(buf), j + 1 end
      if ch == '\\' then
        local n = s:sub(j + 1, j + 1)
        local map = { n = '\n', r = '\r', t = '\t', b = '\b', f = '\f' }
        if n == 'u' then
          buf[#buf + 1] = utf8.char(tonumber(s:sub(j + 2, j + 5), 16))
          j = j + 6
        else
          buf[#buf + 1] = map[n] or n
          j = j + 2
        end
      else
        buf[#buf + 1] = ch
        j = j + 1
      end
    end
  elseif s:sub(i, i + 3) == 'true' then
    return true, i + 4
  elseif s:sub(i, i + 4) == 'false' then
    return false, i + 5
  elseif s:sub(i, i + 3) == 'null' then
    return nil, i + 4
  else
    local num = s:match('^-?%d+%.?%d*[eE]?[+-]?%d*', i)
    if not num or num == '' then error('json: unexpected character at ' .. i) end
    return tonumber(num), i + #num
  end
end

json = {
  encode = function(v)
    local out = {}
    enc(v, out)
    return table.concat(out)
  end,
  decode = function(s)
    if type(s) ~= 'string' or s == '' then error('json: empty input') end
    local v = dec(s, 1)
    return v
  end,
}
