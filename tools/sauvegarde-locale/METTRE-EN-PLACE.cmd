@echo off
rem Mise en place de la sauvegarde (double-clic). Voir GUIDE.html.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0mettre-en-place.ps1"
echo.
pause
