@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kur, sonra tekrar dene.
  pause
  exit /b 1
)
node scriptspanel.mjs setup %*
pause
