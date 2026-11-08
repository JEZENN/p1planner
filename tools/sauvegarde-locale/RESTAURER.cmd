@echo off
rem Assistant de restauration (double-clic) : un utilisateur, tout, consultation, annulation.
chcp 65001 >nul
cd /d "%~dp0"
node assistant-restauration.js %*
echo.
pause
