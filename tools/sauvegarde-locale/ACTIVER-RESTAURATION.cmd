@echo off
rem Range la cle de restauration puis ouvre l'assistant (double-clic). Voir GUIDE.html.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0mettre-en-place.ps1" -Mode restauration
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
call "%~dp0RESTAURER.cmd"
