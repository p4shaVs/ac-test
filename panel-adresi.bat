@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "URL=%~1"
if "%URL%"=="" (
  echo Oyuncularin ve FiveM sunucusunun paneli acacagi adresi yaz.
  echo Ornek: http://85.10.20.30:3000   ya da   https://panel.alanadin.com
  set /p "URL=Panel adresi: "
)
node scripts\panel.mjs set-url "%URL%"
pause
