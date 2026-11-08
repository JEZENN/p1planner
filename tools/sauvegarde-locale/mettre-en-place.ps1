<#
  Mise en place en un double-clic (METTRE-EN-PLACE.cmd, ACTIVER-RESTAURATION.cmd). Voir GUIDE.html.
  Mode sauvegarde   : range la clé en lecture seule, vérifie l'accès, fait la première sauvegarde, installe la tâche.
  Mode restauration : range la clé d'écriture, seulement quand une restauration est nécessaire.
  Une clé qui n'est pas celle du compte attendu (par exemple une clé administrateur) est refusée.
  Le contenu des clés n'est jamais affiché.
  -SansLancer s'arrête après le rangement de la clé ; -Telechargements et -DossierCle changent les dossiers utilisés.
#>
param(
  [ValidateSet('sauvegarde', 'restauration')][string]$Mode = 'sauvegarde',
  [string]$Telechargements = '',
  [string]$DossierCle = (Join-Path $env:USERPROFILE '.p1planner-sauvegarde'),
  [switch]$SansLancer
)
$ErrorActionPreference = 'Stop'
$projet = 'p1planner'
$outil = Split-Path -Parent $MyInvocation.MyCommand.Path
$restauration = $Mode -eq 'restauration'
$nomCle = if ($restauration) { 'cle-restauration' } else { 'cle-lecture-seule' }
$compte = $(if ($restauration) { 'restauration' } else { 'sauvegarde-locale' }) + "@$projet.iam.gserviceaccount.com"
$destination = Join-Path $DossierCle "$nomCle.json"

function Arreter([string]$message) {
  Write-Host ''
  Write-Host $message -ForegroundColor Red
  exit 1
}
function Etape([string]$texte) {
  Write-Host ''
  Write-Host $texte -ForegroundColor Cyan
}
function Test-Cle([string]$fichier) {
  try { $j = [IO.File]::ReadAllText($fichier) | ConvertFrom-Json } catch { return $false }
  return [bool]($j.type -eq 'service_account' -and $j.project_id -eq $projet -and $j.client_email -eq $compte -and $j.private_key)
}

Etape '1. Recherche de la clé'
if (-not $Telechargements) { $Telechargements = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path }
$trouves = @(Get-ChildItem -LiteralPath $Telechargements -Filter "$nomCle*.json" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
$bonnes = @($trouves | Where-Object { Test-Cle $_.FullName })

if ($trouves.Count -and -not $bonnes.Count) {
  Arreter "Le fichier « $($trouves[0].Name) » n'est pas la clé attendue ($compte, projet $projet). Rien n'a été fait."
}
if ($bonnes.Count) {
  New-Item -ItemType Directory -Force -Path $DossierCle | Out-Null
  if (Test-Path -LiteralPath $destination) {
    & icacls $destination /grant:r "$($env:USERNAME):F" | Out-Null
    Remove-Item -LiteralPath $destination -Force
  }
  Move-Item -LiteralPath $bonnes[0].FullName -Destination $destination
  foreach ($doublon in @($bonnes | Select-Object -Skip 1)) { Remove-Item -LiteralPath $doublon.FullName -Force }
  & icacls $destination /inheritance:r /grant:r "$($env:USERNAME):R" | Out-Null
  if ($LASTEXITCODE -ne 0) { Arreter 'Impossible de protéger le fichier de la clé.' }
  Write-Host "Clé rangée hors de OneDrive et lisible par votre seul compte Windows."
} elseif (Test-Path -LiteralPath $destination) {
  if (-not (Test-Cle $destination)) { Arreter "Le fichier $destination n'est pas la clé attendue. Rien n'a été fait." }
  Write-Host 'Clé déjà en place.'
} else {
  Arreter "Aucun fichier « $nomCle.json » dans $Telechargements. Refaites l'étape du téléchargement dans GUIDE.html."
}

if ($restauration) {
  Write-Host 'Clé de restauration prête.' -ForegroundColor Green
  exit 0
}
if ($SansLancer) { exit 0 }

Set-Location -LiteralPath $outil
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Arreter 'Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez.' }
if (-not (Test-Path (Join-Path $outil 'config.json'))) { Copy-Item -LiteralPath (Join-Path $outil 'config.exemple.json') -Destination (Join-Path $outil 'config.json') }
if (-not (Test-Path (Join-Path $outil 'node_modules\firebase-admin'))) {
  Etape 'Installation des dépendances (une seule fois)'
  & npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Arreter "L'installation des dépendances a échoué (internet ?). Relancez ce fichier." }
}

Etape '2. Vérification de l''accès et de la taille (environ 1 minute, rien n''est écrit)'
& node sauvegarder.js --estimer
if ($LASTEXITCODE -ne 0) {
  Arreter "La vérification a échoué. Si le message parle de permission, attendez 2 minutes puis relancez : Google met parfois un peu de temps à activer les droits."
}

Etape '3. Première sauvegarde (de quelques minutes à une heure : laissez le PC ouvert et branché)'
& node sauvegarder.js
if ($LASTEXITCODE -ne 0) { Arreter 'La sauvegarde a échoué. Vous pouvez relancer ce fichier : les sauvegardes réussies ne sont pas touchées.' }

Etape '4. Installation de la sauvegarde automatique'
try { & (Join-Path $outil 'installer-tache.ps1') } catch { Arreter "L'installation de la tâche a échoué : $($_.Exception.Message)" }

Write-Host ''
Write-Host 'TOUT EST EN PLACE. Vous n''avez plus rien à faire.' -ForegroundColor Green
exit 0
