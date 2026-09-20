fx_version 'cerulean'
game 'gta5'

name 'coreac-selftest'
author 'CoreAC'
description 'CoreAC QA harness — simulates cheats on YOURSELF so a single person can verify detections. NEVER ship this to a live server.'
version '1.0.0'

-- Bu kaynak KENDİ karakterinde hile davranışını taklit eder; başka oyuncuya
-- dokunmaz. Yalnızca test için. Açılması için server.cfg'de:
--     set coreac_selftest 1
-- Test bitince o satırı silip kaynağı durdur.

client_scripts { 'client.lua' }
server_scripts { 'server.lua' }
