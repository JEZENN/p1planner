# Retire la tâche planifiée. Les sauvegardes déjà faites ne sont pas touchées.
param([string]$NomTache = 'P1Planner - Sauvegarde quotidienne')
if (Get-ScheduledTask -TaskName $NomTache -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $NomTache -Confirm:$false
  Write-Host "Tâche « $NomTache » retirée."
} else {
  Write-Host "Aucune tâche « $NomTache »."
}
