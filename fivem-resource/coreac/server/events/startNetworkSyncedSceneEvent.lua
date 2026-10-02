local flagData = {}
local flagThreshold = 5 -- Number of flags before ban
local timeWindow = 10000 -- Time window in milliseconds (10 seconds)

local blacklistedAnimPartialHash = {
	[274603296] = true, --lumia
	[269768552] = true, --phaze
	[789512159] = true, --phaze
	[2178555905] = true, --phaze freecam drag
	[1050245] = true,
    [1050677] = true, --phaze freecam drag
    [137702147] = true, --phaze freecam drag
    [2151786840] = true,
    [418136066] = true, --lumia
	-- phaze control vehicle
	[134355605] = true,
	[134363797] = true,
	[134277781] = true,
	[134271637] = true,
	[2148346200] = true,
	[2149820760] = true,
	[2148444504] = true,
	[3024097374] = true,
	[3236761604] = true,
	[1049653] = true,
	[1049717] = true,
}
  
local blacklistedCameraAnimHash = {
	[3918430216] = true, --lumia
    [100666202] = true, --lumia
	[444598280] = true, --phaze
	[444598277] = true, --phaze
	[444598281] = true, --phaze
	[173650] = true, --phaze freecam drag
	[2236392730] = true, --phaze control vehicle
	[109036198] = true, --phaze control vehicle
}

AddEventHandler("startNetworkSyncedSceneEvent", function(sender, data)
	if not CoreAC.Config.Premium.AntiRequestControl then return end
	if #data.pedEntities ~= 1 then return end
	local source = tonumber(sender)
	
	local animPartialHash = data.pedEntities[1].animPartialHash
	if 	blacklistedAnimPartialHash[animPartialHash]
		or (animPartialHash >= 134200000 and animPartialHash <= 134500000)
		or (animPartialHash >= 2148000000 and animPartialHash <= 2159000000)
		or (animPartialHash >= 1048000 and animPartialHash <= 1051000)
	then
		CancelEvent()
		CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_REQUEST_CONTROL, {
			animPartialHash = animPartialHash,
		})
		return;
	end

	local cameraAnimHash = data.cameraAnimHash
	if blacklistedCameraAnimHash[cameraAnimHash] or (cameraAnimHash >= 444598000 and cameraAnimHash <= 444599000) then
		CancelEvent()
		CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_REQUEST_CONTROL, {
			cameraAnimHash = cameraAnimHash,
		})
		return;
	end

	local attachEntityBone = data.attachEntityBone
	if data.rate >= 1 and data.hasAttachEntity and (attachEntityBone == 24 or attachEntityBone == 28) and data.cameraAnimHash > 0 then
		CancelEvent()
		-- exports["CoreAC"]:banPlayer(
			-- source, 
			-- "Attempted to control an entity", 
			-- "Attach Bone: " .. attachEntityBone, 
			-- "Entities"
		-- )
		return;
	end

	local objectId = data.pedEntities[1].objectId
	local entity = NetworkGetEntityFromNetworkId(objectId)
	local entityOwner = NetworkGetEntityOwner(entity)
	local entityType = GetEntityType(entity)

	if source ~= entityOwner and (entityType == 1 or entityType == 2) then				
		local currentTime = GetGameTimer()
		
		-- Clean up expired entries for this player
		if flagData[source] and currentTime - flagData[source].time > timeWindow then
			flagData[source] = nil
		end
		
		-- Initialize or update player data
		if not flagData[source] then
			flagData[source] = { time = currentTime, count = 1 }
		else
			flagData[source].count = flagData[source].count + 1
		end
		
		-- Ban if threshold reached
		if flagData[source].count >= flagThreshold then
-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=
			CancelEvent()
-- V1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXVyBmbWEud3Rm
			CoreAC.DetectPlayer(source, CoreAC.Detections.ANTI_REQUEST_CONTROL, {
				reason = "Spam",
			})
			flagData[source] = nil
		end
	end
end)
