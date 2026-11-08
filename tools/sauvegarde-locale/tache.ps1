# Lancé par la tâche planifiée (voir installer-tache.ps1). Ne fait une sauvegarde que si la dernière date de plus de 20 h (seuilRetardHeures).
param([string]$Node = 'node', [string]$Config = '')
$outil = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $outil
& $Node (Join-Path $outil 'sauvegarder.js') --config $(if ($Config) { $Config } else { Join-Path $outil 'config.json' }) --si-en-retard
exit $LASTEXITCODE
