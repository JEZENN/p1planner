@echo off
rem Sauvegarde manuelle immediate (double-clic). La sauvegarde automatique passe par la tache planifiee.
cd /d "%~dp0"
node sauvegarder.js %*
echo.
if errorlevel 1 (echo LA SAUVEGARDE A ECHOUE - voir le journal ci-dessus.) else (echo Sauvegarde terminee.)
pause
