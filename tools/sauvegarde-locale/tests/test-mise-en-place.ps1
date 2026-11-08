# Test de mettre-en-place.ps1 avec de FAUSSES clés rangées dans un dossier temporaire (aucune vraie clé, aucun accès Firebase).
# Usage : powershell -ExecutionPolicy Bypass -File tests\test-mise-en-place.ps1
$ErrorActionPreference = 'Stop'
$script = if ($env:P1_MEP_SCRIPT) { $env:P1_MEP_SCRIPT } else { Join-Path (Split-Path -Parent $PSScriptRoot) 'mettre-en-place.ps1' }
$racine = Join-Path ([IO.Path]::GetTempPath()) ('p1-mep-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $racine | Out-Null
$secret = 'FAUSSE-CLE-PRIVEE-NE-JAMAIS-AFFICHER'
$ok = 0; $ko = 0

function Verifier([string]$nom, [bool]$condition, [string]$detail = '') {
  if ($condition) { $script:ok++; Write-Host "   OK  $nom" } else { $script:ko++; Write-Host "   ECHEC  $nom $detail" -ForegroundColor Red }
}
function Nouveau-Cas([string]$nom) {
  $c = Join-Path $racine $nom
  New-Item -ItemType Directory -Path (Join-Path $c 'telechargements'), (Join-Path $c 'cles') | Out-Null
  return @{ Dl = (Join-Path $c 'telechargements'); Cles = (Join-Path $c 'cles') }
}
function Ecrire-Cle([string]$dossier, [string]$fichier, [string]$compte, [string]$projet = 'p1planner', [string]$marque = $secret) {
  $o = [ordered]@{ type = 'service_account'; project_id = $projet; client_email = "$compte@$projet.iam.gserviceaccount.com"; private_key = "faux-contenu-$marque" }
  [IO.File]::WriteAllText((Join-Path $dossier $fichier), ($o | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
}
function Lancer([hashtable]$cas, [string]$mode = 'sauvegarde') {
  $sortie = (& powershell -NoProfile -ExecutionPolicy Bypass -File $script -Mode $mode -Telechargements $cas.Dl -DossierCle $cas.Cles -SansLancer 2>&1 | Out-String)
  return @{ Code = $LASTEXITCODE; Sortie = $sortie }
}
$LECTURE = 'cle-lecture-seule.json'; $RESTAURATION = 'cle-restauration.json'

Write-Host '1. Aucune clé'
$c = Nouveau-Cas 'aucune'; $r = Lancer $c
Verifier 'refusé (code 1), rien rangé' ($r.Code -eq 1 -and $r.Sortie -match 'Aucun fichier' -and -not (Test-Path (Join-Path $c.Cles $LECTURE)))

Write-Host '2. Clé d''un autre compte (administrateur)'
$c = Nouveau-Cas 'admin'; Ecrire-Cle $c.Dl $LECTURE 'firebase-adminsdk-abc12'; $r = Lancer $c
Verifier 'refusée, laissée où elle est, rien rangé' ($r.Code -eq 1 -and (Test-Path (Join-Path $c.Dl $LECTURE)) -and -not (Test-Path (Join-Path $c.Cles $LECTURE)))
Verifier 'le contenu de la clé n''est pas affiché' (-not $r.Sortie.Contains($secret))

Write-Host '3. Clé d''un autre projet'
$c = Nouveau-Cas 'autre-projet'; Ecrire-Cle $c.Dl $LECTURE 'sauvegarde-locale' 'autre-projet'; $r = Lancer $c
Verifier 'refusée, rien rangé' ($r.Code -eq 1 -and (Test-Path (Join-Path $c.Dl $LECTURE)) -and -not (Test-Path (Join-Path $c.Cles $LECTURE)))

Write-Host '4. Bonne clé'
$c = Nouveau-Cas 'bonne'; Ecrire-Cle $c.Dl $LECTURE 'sauvegarde-locale'; $r = Lancer $c
$dest = Join-Path $c.Cles $LECTURE
Verifier 'rangée (code 0), retirée des Téléchargements' ($r.Code -eq 0 -and (Test-Path $dest) -and -not (Test-Path (Join-Path $c.Dl $LECTURE)))
Verifier 'contenu intact et jamais affiché' ((Get-Content -Raw $dest).Contains($secret) -and -not $r.Sortie.Contains($secret))
$acl = @(& icacls $dest | Where-Object { $_ -match '\(' })
Verifier 'droits limités à un seul compte, en lecture' ($acl.Count -eq 1 -and $acl[0] -match '\(R\)') ($acl -join ' | ')

Write-Host '5. Bonne clé avec doublon dans les Téléchargements'
$c = Nouveau-Cas 'doublon'; Ecrire-Cle $c.Dl $LECTURE 'sauvegarde-locale'; Ecrire-Cle $c.Dl 'cle-lecture-seule (1).json' 'sauvegarde-locale'; $r = Lancer $c
Verifier 'une clé rangée, les deux fichiers retirés des Téléchargements' ($r.Code -eq 0 -and (Test-Path (Join-Path $c.Cles $LECTURE)) -and @(Get-ChildItem $c.Dl).Count -eq 0)

Write-Host '6. Relance sans nouvelle clé (déjà en place)'
$r = Lancer $c
Verifier 'accepté, clé conservée' ($r.Code -eq 0 -and (Test-Path (Join-Path $c.Cles $LECTURE)))

Write-Host '7. Remplacement d''une clé déjà protégée'
$c = Nouveau-Cas 'remplacement'; Ecrire-Cle $c.Dl $LECTURE 'sauvegarde-locale' 'p1planner' 'ANCIENNE-MARQUE'; $null = Lancer $c
Ecrire-Cle $c.Dl $LECTURE 'sauvegarde-locale' 'p1planner' 'NOUVELLE-MARQUE'; $r = Lancer $c
$contenu = Get-Content -Raw (Join-Path $c.Cles $LECTURE)
Verifier 'ancienne clé protégée remplacée par la nouvelle' ($r.Code -eq 0 -and $contenu.Contains('NOUVELLE-MARQUE') -and -not $contenu.Contains('ANCIENNE-MARQUE') -and @(Get-ChildItem $c.Dl).Count -eq 0)

Write-Host '8. Clé déjà en place mais invalide, rien dans les Téléchargements'
$c = Nouveau-Cas 'invalide'; Ecrire-Cle $c.Cles $LECTURE 'firebase-adminsdk-abc12'; $r = Lancer $c
Verifier 'refusée (code 1)' ($r.Code -eq 1)

Write-Host '9. Mode restauration'
$c = Nouveau-Cas 'restauration'; Ecrire-Cle $c.Dl $RESTAURATION 'restauration'; $r = Lancer $c 'restauration'
Verifier 'clé de restauration rangée (code 0)' ($r.Code -eq 0 -and (Test-Path (Join-Path $c.Cles $RESTAURATION)) -and -not (Test-Path (Join-Path $c.Dl $RESTAURATION)))
$c = Nouveau-Cas 'restauration-mauvaise'; Ecrire-Cle $c.Dl $RESTAURATION 'sauvegarde-locale'; $r = Lancer $c 'restauration'
Verifier 'la clé de sauvegarde est refusée en mode restauration' ($r.Code -eq 1 -and -not (Test-Path (Join-Path $c.Cles $RESTAURATION)))
$c = Nouveau-Cas 'sauvegarde-mauvaise'; Ecrire-Cle $c.Dl $LECTURE 'restauration'; $r = Lancer $c
Verifier 'la clé de restauration (écriture) est refusée en mode sauvegarde' ($r.Code -eq 1 -and -not (Test-Path (Join-Path $c.Cles $LECTURE)))

Get-ChildItem -LiteralPath $racine -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object { & icacls $_.FullName /grant:r "$($env:USERNAME):F" | Out-Null }
Remove-Item -LiteralPath $racine -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''
Write-Host "$ok vérifications réussies, $ko en échec."
exit $(if ($ko -eq 0) { 0 } else { 1 })
