# set-mode: switch the whole team at once.  Usage: set-mode eco|pro|max|solo
param([Parameter(Position = 0, Mandatory = $true)][ValidateSet("eco", "pro", "max", "solo")][string]$Mode)
. "$PSScriptRoot\common.ps1"
$cfg = Read-TeamConfig
if ($Mode -ne "solo") {
  $m = (Get-Content (Join-Path $Team "modes.json") -Raw | ConvertFrom-Json).$Mode
  foreach ($p in $m.PSObject.Properties) { $cfg.roles[$p.Name] = [ordered]@{ tool = $p.Value.tool; model = $p.Value.model; effort = $p.Value.effort } }
}
$cfg.mode = $Mode
Save-TeamConfig $cfg
if ($Mode -eq "solo") { Write-Output "SAVED: solo. The lead works alone; teammates only when the user names one." }
else { Write-Output (("SAVED: {0}. " -f $Mode) + (($cfg.roles.Keys | ForEach-Object { "{0}={1} {2}" -f $_, $cfg.roles[$_].model, $cfg.roles[$_].effort }) -join "; ")) }
