fx_version 'cerulean'
game 'gta5'

name 'coreac'
author 'CoreAC'
description 'CoreAC Anti-Cheat — web panel integration and CoreAC detection modules'
version '1.0.0'

-- Görsel (NUI) yönetici menüsü
ui_page 'html/menu.html'
files {
  'html/menu.html',
  'html/menu.css',
  'html/menu.js',
}

-- ---------------------------------------------------------------------------
-- Sunucu tarafı (server scripts)
-- Yükleme sırası: bridge → web katmanı → CoreAC modülleri → event handler'lar
-- ---------------------------------------------------------------------------
server_scripts {
  -- 1. Temel config
  'config.lua',

  -- 2. Shared bridge (LPH stubs + CoreAC base + Detections + Config.Main)
  'bridge/shared.lua',

  -- 2b. Merkezi silah tablosu (WEAPON_DATA + signedToUnsigned) — weapon event'leri kullanır
  'bridge/weapon_data.lua',

  -- 3. CAC web HTTP katmanı
  'server/http.lua',

  -- 4. Server bridge (CoreAC.DetectPlayer → CAC web API + ek CoreAC globals)
  'bridge/server.lua',

  -- 5. CoreAC modülleri — anti-backdoors ve resource handler (exports sağlar)
  'server/anti-backdoors.lua',
  'server/resourcesHandler.lua',

  -- 6. CAC web ana betiği (heartbeat, oyuncu sync, ban, ceza kuyruğu)
  'server/main.lua',

  -- 7. CAC tehdit motoru + canlı özellikler + korumalar
  -- 'server/threat_engine.lua',  -- KALDIRILDI: THREAT_SCORE / merkezi tehdit skoru devre dışı
  'server/live.lua',
  'server/protection.lua',
  'server/godmode_guard.lua',
  'server/vehicle_guard.lua',
  'server/staff_tools.lua',   -- yetkili tanıma + txAdmin/qb-adminmenu araç muafiyeti
  'server/entity_guard.lua',  -- fırlatılan araç, ses/megafon trolü, sunucu tuzak olayları
  'server/session_guard.lua',
  'server/liveness_guard.lua',
  'server/event_guard.lua',
  'server/event_log.lua',
  'server/recorder.lua',

  -- 8. CoreAC sunucu modülleri
  'server/commands.lua',
  'server/exploits-fixed.lua',
  'server/autoWhiteList.lua',

  -- 9. Heartbeat (CoreAC)
  'heartbeat/server.lua',

  -- 10. Server event handler'ları (CoreAC modülleri)
  'server/events/chatMessage.lua',
  'server/events/clearPedTasksEvent.lua',
  'server/events/entityCreating.lua',
  'server/events/entityRemoved.lua',
  'server/events/explosionEvent.lua',
  'server/events/fireEvent.lua',
  'server/events/givePedScriptedTaskEvent.lua',
  'server/events/giveWeaponEvent.lua',
  -- 'server/events/playerConnecting.lua',  -- DEVRE DIŞI: bağlanma/ban kartı artık server/main.lua'da (çift deferral + CoreAC.IsPlayerBanned nil crash'ini önler)
  'server/events/playerDropped.lua',
  'server/events/premiumEvents.lua',
  'server/events/ptFxEvent.lua',
  'server/events/removeAllWeaponsEvent.lua',
  'server/events/removeWeaponEvent.lua',
  'server/events/startNetworkSyncedSceneEvent.lua',
  'server/events/startProjectileEvent.lua',
  'server/events/weaponDamageEvent.lua',
}

-- ---------------------------------------------------------------------------
-- İstemci tarafı (client scripts)
-- Yükleme sırası: bridge → CAC core/detections → CoreAC modülleri → heartbeat
-- ---------------------------------------------------------------------------
client_scripts {
  -- 1. Temel config
  'config.lua',

  -- 2. Shared bridge (LPH stubs + CoreAC base)
  'bridge/shared.lua',

  -- 3. Client bridge (StrikesSystem, RegisterDetection, Native refs, state cache)
  'bridge/client.lua',

  -- 3b. Merkezi silah tablosu (WEAPON_DATA + signedToUnsigned) — weapon modülleri kullanır
  'bridge/weapon_data.lua',

  -- 4. CAC client çekirdeği (CAC.report, replay buffer, grace flags)
  'client/core.lua',

  -- 4b. Meşru ışınlanma (ekran kararması / admin olayları) + çatışma durumu
  'client/legit_moves.lua',

  -- 5. CAC kendi tespit modülleri (client/detections/*) — DEVRE DIŞI.
  -- Tek tespit sistemi artık CoreAC modülleri (client/*.lua, vehicles/, weapons/).
  -- Bu klasörü tekrar açmak istersen aşağıdaki satırların yorumunu kaldır.
  -- 'client/detections/noclip.lua',
  -- 'client/detections/flyhack.lua',
  -- 'client/detections/teleport.lua',
  -- 'client/detections/godmode.lua',
  -- 'client/detections/superjump.lua',
  -- 'client/detections/speedhack.lua',
  -- 'client/detections/aimbot.lua',
  -- 'client/detections/silentaim.lua',
  -- 'client/detections/norecoil.lua',
  -- 'client/detections/nofalldamage.lua',
  -- 'client/detections/menu_detect.lua',
  -- 'client/detections/weapons.lua',
  -- 'client/detections/extras.lua',
  -- 'client/detections/recorder.lua',

  -- 6. CAC client ana betik ve admin menü
  'client/main.lua',
  'client/aimsync.lua',   -- sunucu taraflı Silent Aim için atış-anı nişan örneği
  'client/admin.lua',

  -- 7. CoreAC client modülleri (modules/ klasöründen — değiştirilmeden)
  'client/events.lua',
  'client/afkTasks.lua',
  'client/entities.lua',
  'client/execution.lua',
  'client/freecam.lua',
  'client/godMode.lua',
  'client/infiniteStamina.lua',
  'client/inputBox.lua',
  'client/invisible.lua',
  'client/misc.lua',
  'client/nightVisions.lua',
  'client/noRagdoll.lua',
  'client/noclip.lua',
  'client/pedModel.lua',
  'client/resourcesHandler.lua',
  'client/spectate.lua',
  'client/speedHack.lua',
  'client/superJump.lua',
  'client/teleport.lua',
  'client/textures.lua',

  -- 8. CoreAC araç modülleri
  'client/vehicles/teleportInVehicle.lua',
  'client/vehicles/vehicleModifications.lua',
  'client/vehicles/vehicleSpeed.lua',

  -- 9. CoreAC silah modülleri
  'client/weapons/aimbot.lua',
  'client/weapons/ammos.lua',
  'client/weapons/hitbox.lua',
  'client/weapons/pickups.lua',
  'client/weapons/weaponDamages.lua',
  'client/weapons/weaponSpawn.lua',

  -- 10. CoreAC anti-exec (native hooking)
  'client/antiExec.lua',

  -- 11. Heartbeat (CoreAC)
  'heartbeat/client.lua',

  -- 12. Native hook'lar (JavaScript)
  'shared.js',
}
