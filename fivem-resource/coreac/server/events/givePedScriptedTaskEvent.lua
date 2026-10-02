-- artifacts >= 12882
AddEventHandler("givePedScriptedTaskEvent", function(source, data)
    -- data.entityNetId, data.taskId || See https://alloc8or.re/gta5/doc/enums/eTaskTypeIndex.txt
end)

AddEventHandler("requestNetworkSyncedSceneEvent", function(source, data)
    -- data.sceneId
end)

AddEventHandler("updateNetworkSyncedSceneEvent", function(source, data)
    -- data.sceneId, data.rate
end)

AddEventHandler("stopNetworkSyncedSceneEvent", function(source, data)
    -- data.sceneId
end)

AddEventHandler("startNetworkSyncedSceneEvent", function(source, data)
    -- uint32_t sceneId; // Increased from uint16_t, see "NetworkSynchronisedSceneHacks.cpp"
	-- uint32_t startTime;

	-- bool isActive;

	-- float scenePosX;
	-- float scenePosY;
	-- float scenePosZ;

	-- float sceneRotX;
-- Zm1hLnd0ZiBldmVyeXdoZXJl
	-- float sceneRotY;
	-- float sceneRotZ;
	-- float sceneRotW;

	-- bool hasAttachEntity;
	-- uint16_t attachEntityId;
	-- uint8_t attachEntityBone;

	-- float phaseToStopScene;
	-- float rate;

	-- bool holdLastFrame;
	-- bool isLooped;
	-- float phase;

	-- uint32_t cameraAnimHash;
	-- uint32_t animDictHash;

	-- std::vector<PedEntityData> pedEntities;
	-- std::vector<NonPedEntityData> nonPedEntities;
	-- std::vector<MapEntityData> mapEntities;
end)




-- test in starlife:

-- AddEventHandler("givePedScriptedTaskEvent", function(source, data)
--     console.log("givePedScriptedTaskEvent", source, json.encode(data, {indent = true}))
-- end)

-- AddEventHandler("vehicleComponentControlEvent", function(source, data)
--     console.log("vehicleComponentControlEvent", source, json.encode(data, {indent = true}))
-- end)

-- AddEventHandler("requestNetworkSyncedSceneEvent", function(source, data)
--     console.log("requestNetworkSyncedSceneEvent", source, json.encode(data, {indent = true}))
-- end)

-- AddEventHandler("startNetworkSyncedSceneEvent", function(source, data)
--     console.log("startNetworkSyncedSceneEvent", source, json.encode(data, {indent = true}))
-- end)

-- AddEventHandler("updateNetworkSyncedSceneEvent", function(source, data)
--     console.log("updateNetworkSyncedSceneEvent", source, json.encode(data, {indent = true}))
-- end)

-- AddEventHandler("stopNetworkSyncedSceneEvent", function(source, data)
--     console.log("stopNetworkSyncedSceneEvent", source, json.encode(data, {indent = true}))
-- end)