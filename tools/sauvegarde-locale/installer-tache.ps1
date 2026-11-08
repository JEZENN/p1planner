<#
  Installe la tâche planifiée Windows « P1Planner - Sauvegarde quotidienne ».
  - chaque jour (par défaut 23:00) ; réveille le PC s'il est en veille et branché ;
  - si le PC était éteint à l'heure prévue : lancée dès que possible, puis 15 min après chaque ouverture de session
    tant que la dernière sauvegarde complète date de plus de 20 h (option --si-en-retard, réglable dans config.json) ;
  - internet requis ; aucune fenêtre ne s'ouvre ; journal dans <destination>\journaux ; alerte sur le Bureau en cas d'échec.

  Usage (PowerShell, dans ce dossier) :
    powershell -ExecutionPolicy Bypass -File .\installer-tache.ps1 -Apercu     # montre la tâche sans l'installer
    powershell -ExecutionPolicy Bypass -File .\installer-tache.ps1             # installe (chaque jour à 23:00)
    powershell -ExecutionPolicy Bypass -File .\installer-tache.ps1 -Heure 21:00
#>
param(
  [string]$Heure = '23:00',
  [string]$NomTache = 'P1Planner - Sauvegarde quotidienne',
  [switch]$Apercu
)
$ErrorActionPreference = 'Stop'
$outil = Split-Path -Parent $MyInvocation.MyCommand.Path
$config = Join-Path $outil 'config.json'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js introuvable. Installez-le depuis https://nodejs.org puis relancez." }
if (-not (Test-Path $config)) { throw "config.json absent : copiez config.exemple.json en config.json et adaptez-le d'abord (voir LISEZMOI.md)." }
if (-not (Test-Path (Join-Path $outil 'node_modules\firebase-admin'))) { throw "Dépendances absentes : lancez 'npm install' dans $outil." }

$lanceur = Join-Path $outil 'tache.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $outil -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $lanceur + '" -Node "' + $node + '"')
$quotidien = New-ScheduledTaskTrigger -Daily -At $Heure
$session = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$session.Delay = 'PT15M'
$reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 6) -MultipleInstances IgnoreNew -RunOnlyIfNetworkAvailable
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$tache = New-ScheduledTask -Action $action -Trigger @($quotidien, $session) -Settings $reglages -Principal $principal -Description "Sauvegarde complète quotidienne Firestore + Storage + comptes du projet p1planner vers le disque local (lecture seule côté Firebase). Outil : $outil"

if ($Apercu) {
  Write-Host "APERÇU (rien n'est installé)" -ForegroundColor Yellow
  Write-Host "Tâche      : $NomTache"
  Write-Host "Commande   : powershell.exe $($action.Arguments)"
  Write-Host "Dossier    : $outil"
  Write-Host "Déclencheurs : chaque jour à $Heure ; 15 min après l'ouverture de session (seulement si la dernière date de plus de 20 h)"
  Write-Host "Réglages   : rattrapage si manquée, réveil du PC, sur batterie autorisé, réseau requis, 6 h max"
  return
}
if (Get-ScheduledTask -TaskName $NomTache -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $NomTache -Confirm:$false }
Register-ScheduledTask -TaskName $NomTache -InputObject $tache | Out-Null
Write-Host "Tâche « $NomTache » installée : chaque jour à $Heure (+ rattrapage à l'ouverture de session)." -ForegroundColor Green
Write-Host "Lancer une sauvegarde tout de suite : Start-ScheduledTask -TaskName '$NomTache'  (ou double-clic sur lancer-sauvegarde.cmd)"
