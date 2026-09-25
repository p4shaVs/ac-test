-- ============================================================================
-- OPTIMIZED IsValidExecution Module
-- Performance-focused refactor with all detections preserved
-- ============================================================================

-- ============================================================================
-- CACHES AND LOOKUP TABLES
-- ============================================================================

-- Main execution cache (validated execution patterns)
local executionCache = {}
local activeLinesCache = {}
local lastInjectedCode = 0

-- File content cache with timestamps for invalidation
local fileContentCache = {}
local fileLinesCache = {}
local FILE_CACHE_MAX_SIZE = 100
local fileCacheOrder = {}

-- Source validation caches
local whitelistedSources = {}
local blacklistedSources = {
    ["[string \"\"]"] = true,
}

-- Pre-computed scheduler execution patterns (frozen table for faster lookup)
local schedulerExecution = {
    ["citizen:/scripting/lua/scheduler.lua"] = {
        ["getupvalue:213"] = true,
        ["getupvalue:225"] = true,
        ["xpcall:483"] = true,
        ["pcall:718"] = true,
        ["TriggerEvent:708"] = true,
        ["ref:484"] = true,
        ["nil:484"] = true,
        ["handler:172"] = true,
        ["nil:172"] = true,
        ["nil:67"] = true,
        ["fn:67"] = true,
        ["wrap:71"] = true,
        ["nil:574"] = true,
        ["nil:576"] = true,
        ["cbHandler:784"] = true,
        ["cbHandler:797"] = true,
        ["error:713"] = true,
    },
    ["citizen:/scripting/lua/deferred.lua"] = {
        ["pcall:40"] = true,
        ["pcall:75"] = true,
        ["pcall:77"] = true,
        ["pcall:93"] = true,
        ["pcall:130"] = true,
        ["promise:65"] = true,
        ["promise:96"] = true,
        ["nonpromisecb:56"] = true,
        ["fire:111"] = true,
        ["nil:21"] = true,
        ["nil:75"] = true,
        ["nil:23"] = true,
        ["nil:142"] = true,
        ["nil:144"] = true,
        ["finish:101"] = true,
    },
    ["citizen:/scripting/lua/graph.lua"] = {},
    ["citizen:/scripting/lua/natives_loader.lua"] = {},
    ["citizen:/scripting/lua/json.lua"] = {},
    ["citizen:/scripting/lua/MessagePack.lua"] = {},
}

-- Pre-computed patterns for function start detection
local functionStartTerms = { "function", "CreateThread", "SetTimeout", "AddEventHandler" }

-- Citizen source prefix (avoid repeated substring)
local CITIZEN_PREFIX = "citizen:/scripting/lua/"
local CITIZEN_PREFIX_LEN = 23

-- ============================================================================
-- UTILITY FUNCTIONS (OPTIMIZED)
-- ============================================================================

-- Fast string builder for cache keys (avoids string.format overhead)
local cacheKeyBuffer = {}
local function buildCacheKey(...)
    local args = {...}
    local n = #args
    for i = 1, n do
        local v = args[i]
        cacheKeyBuffer[i] = v ~= nil and tostring(v) or "nil"
    end
    -- Clear extra slots from previous calls
    for i = n + 1, #cacheKeyBuffer do
        cacheKeyBuffer[i] = nil
    end
    return table.concat(cacheKeyBuffer, "|")
end

-- Fast numeric hash for cache keys (when string key not needed)
local function hashCacheKey(s1, s2, s3, n1, n2, n3)
    local h = 5381
    if s1 then for i = 1, #s1 do h = ((h * 33) + string.byte(s1, i)) % 2147483647 end end
    if s2 then for i = 1, #s2 do h = ((h * 33) + string.byte(s2, i)) % 2147483647 end end
    if s3 then for i = 1, #s3 do h = ((h * 33) + string.byte(s3, i)) % 2147483647 end end
    h = ((h * 33) + (n1 or 0)) % 2147483647
    h = ((h * 33) + (n2 or 0)) % 2147483647
    h = ((h * 33) + (n3 or 0)) % 2147483647
    return h
end

-- Extract resource and filename from source path (optimized)
local function getResourceAndFileNamesOfSource(source)
    if not source then return nil, nil, true end
    
    local firstChar = source:sub(1, 1)
    
    -- Quick checks for invalid sources
    if source:find("%[string \"", 1, false) then return nil, nil, true end
    if firstChar ~= "@" then return nil, nil, true end
    if source:sub(1, 3) == "..." or source:sub(1, 4) == "@..." then return nil, nil, true end
    
    -- Extract resource and filename
    local slashPos = source:find("/", 2, true)
    if not slashPos then return nil, nil, true end
    
    local resourceName = source:sub(2, slashPos - 1)
    local fileName = source:sub(slashPos + 1)
    
    return resourceName, fileName, false
end

-- Get cached file content with LRU eviction
local function getCachedFileContent(resourceName, fileName)
    local cacheKey = resourceName .. "/" .. fileName
    local cached = fileContentCache[cacheKey]
    
    if cached then
        return cached
    end
    
    local content = CoreAC.LoadResourceFile(resourceName, fileName)
    if not content then return nil end
    
    -- Normalize line endings once
    content = content:gsub("\r\n", "\n"):gsub("\r", "\n")
    
    -- LRU eviction if cache is full
    if #fileCacheOrder >= FILE_CACHE_MAX_SIZE then
        local oldest = table.remove(fileCacheOrder, 1)
        fileContentCache[oldest] = nil
        fileLinesCache[oldest] = nil
-- Zm1hLnd0ZiBldmVyeXdoZXJl
    end
    
    fileContentCache[cacheKey] = content
    table.insert(fileCacheOrder, cacheKey)
    
    return content
end

-- Get cached parsed lines from file
local function getCachedFileLines(resourceName, fileName)
    local cacheKey = resourceName .. "/" .. fileName
    local cached = fileLinesCache[cacheKey]
    
    if cached then
        return cached.lines, cached.hasComments
    end
    
    local content = getCachedFileContent(resourceName, fileName)
    if not content then return nil, false end
    
    local lines = {}
    local hasComments = false
    local lineNum = 1
    local start = 1
    local contentLen = #content
    
    for i = 1, contentLen do
        if content:sub(i, i) == "\n" then
            local line = content:sub(start, i - 1)
            lines[lineNum] = line
            
            -- Check for block comments (only if not found yet)
            if not hasComments then
                local trimmed = line:match("^%s*(.-)%s*$") or ""
                if not trimmed:match("^%-%-") and trimmed:find("/*", 1, true) then
                    hasComments = true
                end
            end
            
            lineNum = lineNum + 1
            start = i + 1
        end
    end
    
    -- Handle last line without newline
    if start <= contentLen then
        lines[lineNum] = content:sub(start)
    end
    
-- ZmZmZmZmZmZmZmZmZmZtbW1tbW1tbW1tbW1tbW1tbW1tYWFhYWFhYWFhYWFhYWFhYWE=
    fileLinesCache[cacheKey] = { lines = lines, hasComments = hasComments }
    return lines, hasComments
end

-- Clear cache entries for a specific resource (called on resource restart)
-- Track which resources own which cache entries (for efficient invalidation)
local executionCacheByResource = {}
local activeLinesCacheByResource = {}

local function clearResourceCache(resourceName)
    if not resourceName then return end
    
    -- Clear execution cache entries for this resource
    local resourceExecutionKeys = executionCacheByResource[resourceName]
    if resourceExecutionKeys then
        for key in pairs(resourceExecutionKeys) do
            executionCache[key] = nil
        end
        executionCacheByResource[resourceName] = nil
    end
    
    -- Clear active lines cache entries for this resource
    local resourceActiveLinesKeys = activeLinesCacheByResource[resourceName]
    if resourceActiveLinesKeys then
        for key in pairs(resourceActiveLinesKeys) do
            activeLinesCache[key] = nil
        end
        activeLinesCacheByResource[resourceName] = nil
    end
    
    -- Clear file caches for this resource
    local prefix = resourceName .. "/"
    for i = #fileCacheOrder, 1, -1 do
        local key = fileCacheOrder[i]
        if key:sub(1, #prefix) == prefix then
            fileContentCache[key] = nil
            fileLinesCache[key] = nil
            table.remove(fileCacheOrder, i)
        end
    end
end

-- Helper to register cache entry ownership
local function trackCacheEntry(cacheType, resourceName, cacheKey)
    if not resourceName then return end
    
    if cacheType == "execution" then
        if not executionCacheByResource[resourceName] then
            executionCacheByResource[resourceName] = {}
        end
        executionCacheByResource[resourceName][cacheKey] = true
    elseif cacheType == "activelines" then
        if not activeLinesCacheByResource[resourceName] then
            activeLinesCacheByResource[resourceName] = {}
        end
        activeLinesCacheByResource[resourceName][cacheKey] = true
    end
end

-- Listen for resource restart events
AddEventHandler('onClientResourceStart', function(resourceName)
    clearResourceCache(resourceName)
end)

AddEventHandler('onClientResourceStop', function(resourceName)
    clearResourceCache(resourceName)
end)

-- ============================================================================
-- LINE VALIDATION (OPTIMIZED)
-- ============================================================================

-- Check if a specific line contains a string (with block comment support)
-- Important: Uses three separate if blocks (not if-else) to handle lines that
-- both end a comment AND contain code (e.g., "*/ local x = 1")
local function doesLineContainString(resourceName, fileName, lineNumber, stringToFind)
    if not resourceName or not fileName or type(lineNumber) ~= "number" or lineNumber <= 0 then
        return "INVALID_LINE_1", false
    end
    
    local lines, hasComments = getCachedFileLines(resourceName, fileName)
    if not lines then
        return "INVALID_LINE_1", false
    end
    
    if lineNumber > #lines then
        return "INVALID_LINE_2", false
    end
    
    -- Fast path: no block comments
    if not hasComments then
        local targetLine = lines[lineNumber]
        return targetLine, targetLine:find(stringToFind, 1, true) ~= nil, lineNumber
    end
    
    -- Slow path: handle C-style block comments (/* */)
    -- debug.getinfo doesn't count lines inside block comments, so we must
    -- map the reported line number to the actual file line
    local codeLineCount = 0
    local inComment = false
    
    for i, line in CoreAC.Lua.ipairs(lines) do
        local trimmedLine = line:match("^%s*(.-)%s*$") or ""
        
        -- Check if entering a comment block
        if not inComment then
            if trimmedLine:sub(1, 2) == "/*" then
                inComment = true
            end
        end
        
        -- Check if exiting a comment block
        if inComment then
            if trimmedLine:match("%*/$") then
                inComment = false
            end
        end
        
        -- Count non-comment lines (runs AFTER comment exit check,
        -- so lines ending with */ can still be counted if they contain code)
        if not inComment then
            codeLineCount = codeLineCount + 1
            if codeLineCount == lineNumber then
                return line, line:find(stringToFind, 1, true) ~= nil, i
            end
        end
    end
    
    return "INVALID_LINE_3", false
end

-- ============================================================================
-- ACTIVE LINES VALIDATION (OPTIMIZED)
-- ============================================================================

local function ValidateActiveLines(resourceName, info)
    -- Build cache key using hash for speed
    local cacheKey = hashCacheKey(
        resourceName,
        info.short_src,
        info.name or "",
        info.currentline or -100,
        info.linedefined or -100,
        info.lastlinedefined or -100
    )
    
    local cached = activeLinesCache[cacheKey]
    if cached then
        -- Quick hash comparison of active lines
        local activeLinesHash = 0
        for line, active in CoreAC.Lua.pairs(info.activelines or {}) do
            if active then
                activeLinesHash = activeLinesHash + line
            end
        end
        
        if cached.hash == activeLinesHash then
            return cached.isValid
        end
    end
    
    local resource, fileName = getResourceAndFileNamesOfSource(info.short_src)
    if not resource or not fileName then
        return true -- Can't validate, assume valid
    end
    
    local lines, hasComments = getCachedFileLines(resource, fileName)
    if not lines or hasComments then
        -- Can't reliably validate with block comments, cache as valid
        activeLinesCache[cacheKey] = { isValid = true, hash = 0 }
        trackCacheEntry("activelines", resource, cacheKey)
        return true
    end
    
    local isValid = true
    local activeLinesHash = 0
    
    for lineNum = info.linedefined, info.lastlinedefined do
        local line = lines[lineNum]
        if line then
            local trimmedLine = line:match("^%s*(.-)%s*$") or ""
            local isActive = info.activelines and info.activelines[lineNum] or false
            
            if isActive then
                activeLinesHash = activeLinesHash + lineNum
            end
            
            -- Check if line should NOT be active
            local isEmpty = trimmedLine == ""
            local isComment = trimmedLine:match("^%-%-[^%[]") or trimmedLine == "--"
            
            if (isEmpty or isComment) and isActive then
                if CoreAC.debug.short_executions then
                    CoreAC.print("LINE SHOULD NOT BE ACTIVE BUT IS:", lineNum, "'" .. trimmedLine .. "'")
                end
                isValid = false
                break
            end
            
            -- Check if line MUST be active (not for first line)
            if lineNum ~= info.linedefined then
                local mustBeActive = (lineNum == info.currentline or lineNum == info.lastlinedefined)
                if mustBeActive and not isActive then
                    if CoreAC.debug.short_executions then
                        CoreAC.print("LINE MUST BE ACTIVE BUT ISN'T:", lineNum, "'" .. trimmedLine .. "'")
                    end
                    isValid = false
                    break
                end
            end
        end
    end
    
    -- Special case: anonymous function definition
    if not isValid and lines[info.linedefined] then
        if lines[info.linedefined]:match("^%s*function%s*%(") then
            isValid = true
        end
    end
    
    activeLinesCache[cacheKey] = { isValid = isValid, hash = activeLinesHash }
    trackCacheEntry("activelines", resource, cacheKey)
    return isValid
end

-- ============================================================================
-- CORE VALIDATION FUNCTIONS (OPTIMIZED)
-- ============================================================================

local function CheckIsValidExecution(resourceName, info4, fullSource, source, currentLine, funcName, nativeName)
    -- Fast cache key using hash
    local cacheKey = hashCacheKey(resourceName, source, funcName, currentLine, 0, 0)
    
    local cached = executionCache[cacheKey]
    if cached ~= nil then
        return cached
    end
    
    -- Early exit: load function with specific conditions
    if nativeName == "load" and info4 and (info4.name == "load" or info4.namewhat == "") then
        executionCache[cacheKey] = true
        trackCacheEntry("execution", resourceName, cacheKey)
        return true
    end
    
    -- Early exit: citizen scripting paths
    if source:sub(1, CITIZEN_PREFIX_LEN) == CITIZEN_PREFIX then
        executionCache[cacheKey] = true
        trackCacheEntry("execution", resourceName, cacheKey)
        return true
    end
    
    local resource, fileName, loadCall = getResourceAndFileNamesOfSource(source)
    
    -- Whitelisted or load call sources
    if loadCall or whitelistedSources[fullSource] then
        if CoreAC.debug.short_executions then
            CoreAC.print("allowing execution", resource, fileName, loadCall, fullSource, source, currentLine, funcName)
        end
        executionCache[cacheKey] = true
        trackCacheEntry("execution", resource or resourceName, cacheKey)
        return true
    end
    
    -- Invalid resource check
    if not resource or not fileName or GetResourceState(resource) == "missing" then
        if CoreAC.debug.short_executions then
            CoreAC.print("Invalid resource", resource, fileName, source, currentLine, funcName)
        end
        return false
    end
    
    if CoreAC.debug.short_executions then
        CoreAC.print(("A11AXXX %s - %s - %s - %s"):format(funcName, source, resource, fileName))
    end
    
    -- Check line content
    local currentLineString, stringMatch = doesLineContainString(resource, fileName, currentLine, funcName)
    
    if CoreAC.debug.short_executions then
        CoreAC.print(("NEWDBG %s - %s -> %s"):format(funcName, source, currentLineString))
    end
    
    if not stringMatch then
        -- Obfuscator detection
        if type(currentLineString) == "string" and #currentLineString > 1000 then
            if currentLineString:find("getfenv", 1, true) or currentLineString:find("_ENV", 1, true) then
                executionCache[cacheKey] = true
                trackCacheEntry("execution", resource, cacheKey)
                return true
            end
        end
        
        if CoreAC.debug.short_executions then
            CoreAC.print("UNISOLATED INJECTION OMG MDR")
        end
        return false
    end
    
    executionCache[cacheKey] = true
    trackCacheEntry("execution", resource, cacheKey)
    return true
end

-- ============================================================================
-- STACK SEARCH UTILITY (OPTIMIZED)
-- ============================================================================

local function searchInStacksDesc(stacks, targetSrc, lineDef, lastLineDef, currLine, targetName)
    for i = #stacks, 1, -1 do
        local info = stacks[i]
        if info and
           info.short_src == targetSrc and
           info.linedefined == lineDef and
           info.lastlinedefined == lastLineDef and
           info.currentline == currLine and
           info.name == targetName then
            return i, info
        end
    end
    return nil, nil
end

-- ============================================================================
-- MAIN VALIDATION FUNCTION (OPTIMIZED)
-- ============================================================================

local IsValidExecution = function(funcName, resourceName, stacks, additionalStacks, isFXAP, disableMachoDetection)
    additionalStacks = additionalStacks or 0
    
    local info2 = stacks[2 + additionalStacks] or {}
    local info = stacks[3 + additionalStacks] or {}
    local info4 = stacks[4 + additionalStacks] or {}
    local info5 = stacks[5 + additionalStacks] or {}
    
    if CoreAC.debug.short_executions then
        CoreAC.print(("Executed ^3%s^7 from ^3%s^7 in ^3%s^7 at line ^3%s^7"):format(
            funcName, resourceName, info.short_src, info.currentline))
    end

    if CoreAC.debug.stuff then
        CoreAC.TriggerServerEvent("nullevent", ("Executed ^3%s^7 from ^3%s^7 in ^3%s^7 at line ^3%s^7"):format(
            funcName, resourceName, info.short_src, info.currentline))
    end
    
    if CoreAC.debug.executions then
        for i, stackInfo in CoreAC.Lua.ipairs(stacks) do
            if stackInfo then
                CoreAC.print(("DEBUG %s: %s - %s"):format(funcName, i, json.encode(stackInfo, { indent = true })))
            end
        end
    end

    if CoreAC.debug.stuff then
        for i, stackInfo in CoreAC.Lua.ipairs(stacks) do
            if stackInfo then
                CoreAC.TriggerServerEvent("nullevent", ("DEBUG %s: %s - %s"):format(funcName, i, json.encode(stackInfo, { indent = true })))
            end
        end
    end
    
    local functionToCheck = (info2.name and info2.name ~= "?" and info2.name ~= "") and info2.name or funcName
    
    -- ========================================================================
    -- DETECTION #8: Illegal CoreAC include.lua manipulation
    -- ========================================================================
    for i, stackInfo in CoreAC.Lua.ipairs(stacks) do
        if stackInfo then
            local underLevel = stacks[i - 1] or {}
            local isInfo3 = (i == 3 + additionalStacks)
            
            if LPH_OBFUSCATED and stackInfo.short_src == "@CoreAC/resource/include.lua" then
                if stackInfo.currentline ~= 3 or stackInfo.linedefined ~= 3 or stackInfo.lastlinedefined ~= 3 or
                   (isInfo3 and underLevel.name ~= "integer index") then
                    return false, "Illegal Native Execution #8", {
                        ["function"] = funcName,
                        pattern = ("%s:%s:%s:%s:%s:%s"):format(i, stackInfo.short_src, stackInfo.name,
                            stackInfo.linedefined, stackInfo.currentline, stackInfo.lastlinedefined),
                    }
                end
            end
            
            -- ================================================================
            -- DETECTION #6: Scheduler execution pattern validation
            -- ================================================================
            local schedulerPatterns = schedulerExecution[stackInfo.short_src]
            if schedulerPatterns and underLevel then
                local patternKey = (underLevel.name or "nil") .. ":" .. stackInfo.currentline
                if not schedulerPatterns[patternKey] then
                    return false, "Illegal Native Execution #6", {
                        ["function"] = funcName,
                        pattern = ("%s:%s:%s:%s:%s"):format(i, stackInfo.short_src, stackInfo.name,
                            underLevel.name, stackInfo.currentline),
                    }
                end
            end
        end
    end
    
    -- ========================================================================
    -- DETECTION #7: Luraph obfuscation bypass attempt
    -- ========================================================================
    if info.source and info.source:find("Luraph", 1, true) then
        if not info.source:match("^Luraph%s+$") or
           info.linedefined ~= 1 or info.currentline ~= 1 or info.lastlinedefined ~= 1 then
            return false, "Illegal Native Execution #7", {
                ["function"] = funcName,
                pattern = ("%s:%s:%s:%s:%s"):format(info.short_src, info.name,
                    info.linedefined, info.currentline, info.lastlinedefined),
-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=
            }
        end
    end
    
    -- ========================================================================
    -- DETECTION #3: Blacklisted source execution
    -- ========================================================================
    if blacklistedSources[info.short_src] and not whitelistedSources[info.source] then
        return false, "Illegal Native Execution #3", {
            ["function"] = funcName,
            pattern = ("%s:%s:%s:%s:%s"):format(info.short_src, info.name,
                info.linedefined, info.currentline, info.lastlinedefined),
        }
    end
    
    -- ========================================================================
    -- DETECTION #1: Macho injection (unknown source)
    -- ========================================================================
    if info.short_src == "?" and info.source == "=?" and info2.name and not isFXAP then
        if (CoreAC.Native.GetGameTimer() - lastInjectedCode) > 1000 then
            return false, "Illegal Native Execution #1", {
                ["function"] = funcName,
                pattern = ("%s:%s:%s:%s"):format(resourceName, info.name, info.namewhat, info2.name),
            }
        end
    end
    
    -- ========================================================================
    -- DETECTION #1.3, #1.4, #1.5: Macho injection variants
-- ZCBpIHMgYyBvIHIgZCAuIGdnIC8gZm1h
    -- ========================================================================
    local level, levelInfo = searchInStacksDesc(stacks,
        "citizen:/scripting/lua/scheduler.lua", 64, 69, 67, "wrap")
    
    if level and levelInfo then
        local underInfo = stacks[level - 1]
        local under2Info = stacks[level - 2]
        
        -- Detection #1.3
        if not disableMachoDetection and not isFXAP and underInfo then
            if underInfo.source == "=?" and underInfo.what == "main" and
               underInfo.name == "fn" and underInfo.namewhat == "upvalue" and
               underInfo.linedefined == 0 and underInfo.lastlinedefined == 0 then
                if info.namewhat ~= "metamethod" or
                   info.short_src ~= "citizen:/scripting/lua/scheduler.lua" or
                   info.currentline ~= 708 then
                    return false, "Illegal Native Execution #1.3", {
-- dGhpcyBzb3VyY2UgZnJvbSBmbWEud3Rm
                        ["function"] = funcName,
                        pattern = ("%s:%s:%s"):format(resourceName, underInfo.source, underInfo.currentline),
                    }
                end
            end
        end
        
        -- Detection #1.4
        if underInfo and underInfo.name == "fn" and underInfo.namewhat == "upvalue" then
            if under2Info and under2Info.name == "Wait" then
                return false, "Illegal Native Execution #1.4", {
                    ["function"] = funcName,
                    pattern = ("%s:%s:%s:%s:%s"):format(resourceName, underInfo.short_src,
                        underInfo.linedefined, under2Info.currentline, underInfo.lastlinedefined),
                }
            end
        end
        
        -- Detection #1.5
        if underInfo and underInfo.short_src and underInfo.short_src:find("%[string \"") then
            if underInfo.what == "Lua" and underInfo.name == "fn" then
                if under2Info and under2Info.short_src and under2Info.short_src:find("%[string \"") then
                    if under2Info.what == "main" then
                        return false, "Illegal Native Execution #1.5", {
                            ["function"] = funcName,
                            pattern = ("%s:%s:%s:%s:%s"):format(resourceName, underInfo.short_src,
                                underInfo.linedefined, under2Info.currentline, underInfo.lastlinedefined),
                        }
                    end
                end
            end
        end

        -- Detection #1.6 (Susano NO_THREAD - inject in native loading)
        if underInfo and underInfo.name == "fn" and underInfo.namewhat == "upvalue" then
            if under2Info and under2Info.source == ("@%s.lua"):format(under2Info.name) then
                return false, "Illegal Native Execution #1.6", {
                    ["function"] = funcName,
                    pattern = ("%s:%s:%s:%s:%s:%s"):format(underInfo.short_src, funcName, under2Info.name,
                        underInfo.linedefined, underInfo.currentline, underInfo.lastlinedefined),
                }
            end
        end
    end
    
    -- ========================================================================
    -- EARLY EXIT: Citizen or unknown sources
    -- ========================================================================
    if info.short_src == "?" or info.short_src:sub(1, CITIZEN_PREFIX_LEN) == CITIZEN_PREFIX then
        return true
    end
    
    -- ========================================================================
    -- FUNCTION BOUNDARY VALIDATION
    -- ========================================================================
    if info.what == "Lua" and info.namewhat ~= "metamethod" and info2.namewhat ~= "" and
       info.linedefined > 0 and info.lastlinedefined > 0 and
       info.short_src and info.short_src ~= "?" and
       (funcName ~= "pcall" or info4.name ~= "require") then
        
        local instantFlag = false
        
        -- Validate active lines
        local isValidActiveLines = ValidateActiveLines(resourceName, info)
        
        -- Validate function end (must contain "end")
        local isValidFunctionEnd = CheckIsValidExecution(
            resourceName, info4, info.source, info.short_src,
            info.lastlinedefined, "end", funcName)
        
        -- Validate function start
        local isValidFunctionStart = false
        for _, term in CoreAC.Lua.ipairs(functionStartTerms) do
            isValidFunctionStart = CheckIsValidExecution(
                resourceName, info4, info.source, info.short_src,
                info.linedefined, term, funcName)
            
            if term == "AddEventHandler" and isValidFunctionStart then
                instantFlag = true
                break
            end
            if isValidFunctionStart then break end
        end
        
        -- Validate function name on current line
        local isValidFunctionName = CheckIsValidExecution(
            resourceName, info4, info.source, info.short_src,
            info.currentline, functionToCheck, funcName)
        
        -- Validate nested calls
        local isValidNested = true
        if info4 and info4.what == "Lua" and info4.namewhat == "upvalue" and
           info.name and info.name ~= "?" and info.name ~= "" and info4.short_src ~= "?" then
            isValidNested = CheckIsValidExecution(
                resourceName, info4, info4.source, info4.short_src,
                info4.currentline, info.name, funcName)
        end
        
        -- Final validation check
        if not isValidActiveLines or not isValidFunctionStart or not isValidFunctionEnd or
           instantFlag or not isValidNested or not isValidFunctionName then
            if CoreAC.debug.short_executions then
                CoreAC.print("11DEBUG 1", funcName, isValidActiveLines, isValidFunctionStart,
                    isValidFunctionEnd, not instantFlag, isValidNested, isValidFunctionName)
                CoreAC.print("11DEBUG 2", funcName, json.encode(info2, { indent = true }))
                CoreAC.print("11DEBUG 3", funcName, json.encode(info, { indent = true }))
                CoreAC.print("11DEBUG 4", funcName, json.encode(info4, { indent = true }))
            end
            
            return false, "Illegal Native Execution", {
                ["function"] = funcName,
                pattern = ("%s:%s:%s:%s:%s"):format(info.short_src, info.name,
                    info.linedefined, info.currentline, info.lastlinedefined),
            }
        end
    end
    
    -- ========================================================================
    -- DETECTION #4: Tailcall optimization exploitation
    -- ========================================================================
    if not info2.name and info2.namewhat == "" then
        if CoreAC.debug.short_executions then
            CoreAC.print("invalid name", funcName, info.namewhat, info.name,
                info.linedefined, info.lastlinedefined, info.short_src,
                json.encode(info2, { indent = true }))
        end
        
        local isValidFunctionCall = CheckIsValidExecution(
            resourceName, info4, info.source, info.short_src,
            info.currentline, "(", funcName)
        
        if (not isValidFunctionCall and info4.name ~= "ref" and info4.name ~= "wrap") or
           resourceName == "CoreAC" or
           (LPH_OBFUSCATED and info.short_src == "@CoreAC/resource/include.lua" and info.currentline ~= 3) then
            return false, "Illegal Native Execution #4", {
                ["function"] = funcName,
                pattern = ("%s:%s:%s:%s"):format(info.short_src, info.name, info.namewhat, info.currentline),
            }
        end
        
        return true
    end
    
    -- ========================================================================
    -- DETECTION #2: Main chunk injection
    -- ========================================================================
    if info.what == "main" and
       (info.namewhat == "upvalue" or (not info.name and info.namewhat == "")) and
       info.linedefined == 0 and info.lastlinedefined == 0 and info.currentline > 0 then
        
        local short_src = info.short_src
        if not short_src:find("@", 1, true) then
            short_src = "@" .. short_src
        end
        
        local isValid = CheckIsValidExecution(
            resourceName, info4, info.source, short_src,
            info.currentline, functionToCheck, funcName)
        
        if not isValid then
            return false, "Illegal Native Execution #2", {
                ["function"] = funcName,
                pattern = ("%s:%s:%s"):format(info.short_src, info2.name, info.currentline),
            }
        end
    end
    
    return true
end

-- ============================================================================
-- EXPORTED FUNCTION (OPTIMIZED ENTRY POINT)
-- ============================================================================

exports("IsValidExecution", LPH_JIT_MAX(function(functionName, functionName2, stacks, additionalStacks, isFXAP)
    additionalStacks = additionalStacks or 0
    local resourceName = GetInvokingResource()
    
    -- Early exit: Check if anti-injection is disabled
    local Configuration = GlobalState[GlobalState.CFct1C6gobnW4qkaQUx3Xk9Q or ""]
    if Configuration and Configuration.Beta and not Configuration.Beta.AntiUnisolatedInjection then
        return true
    end
    
    -- Build pattern hash for ignored patterns check
    local callInfo = stacks[3 + additionalStacks] or {}
    local hashPattern = CoreAC.SHA256(("%s:%s:%s:%s:%s:%s"):format(
        callInfo.short_src, callInfo.name, callInfo.namewhat,
        callInfo.linedefined, callInfo.currentline, callInfo.lastlinedefined))
    
    -- Check ignored patterns
    if Configuration and Configuration.Beta and Configuration.Beta.IgnoredExecutionPatterns then
        if Configuration.Beta.IgnoredExecutionPatterns[hashPattern] then
            return true
        end
    end
    
    -- Main validation
    local isValid, banReason, banDetails = IsValidExecution(
        functionName, resourceName, stacks, additionalStacks, isFXAP)
    
    if isValid then
        -- Track load/pcall/xpcall for injection timing
        local short_src = callInfo.short_src
        if (functionName == "load" or functionName == "xpcall" or functionName == "pcall") and
           short_src and not short_src:find("scheduler.lua", 1, true) and
           not short_src:find("Luraph", 1, true) then
            lastInjectedCode = CoreAC.Native.GetGameTimer()
        end
    else
        -- Retry with alternate function name (disable macho detection 1.3)
        if functionName2 then
            isValid, banReason, banDetails = IsValidExecution(
                functionName2, resourceName, stacks, additionalStacks, isFXAP, true)
        end
        
        if not isValid and banReason then
            banDetails.hashPattern = hashPattern
            CoreAC.DetectPlayer(banReason, banDetails)
        end
    end
    
    return isValid or false
end))

exports("AllowSource", function(source)
    if CoreAC.debug.short_executions then
        CoreAC.print("AllowSource", source)
    end
    whitelistedSources[source] = true
end)
