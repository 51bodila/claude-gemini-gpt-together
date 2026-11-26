# set-team: give a role to a model, after one probe call proves the model answers.
# Usage:
#   set-team builder  gpt-6.2-astra [-Effort high]
#   set-team reviewer gpt-6.2-sol -Effort medium
#   set-team advisor  "Gemini 4 Hydrogen (High)"
#   set-team designer opus
#   set-team builder  opus            (any role can go to any tool: the tool is guessed from the model name)
param(
  [Parameter(Position = 0, Mandatory = $true)][ValidateSet("builder", "reviewer", "advisor", "designer")][string]$Role,
  [Parameter(Position = 1, Mandatory = $true)][string]$Model,
  [string]$Effort = "",
  [ValidateSet("", "gpt", "gemini", "claude")][string]$Tool = "",
  [switch]$NoProbe
)
$ErrorActionPreference = "Continue"
. "$PSScriptRoot\common.ps1"
$cfg = Read-TeamConfig
if (-not $Tool) {
  $Tool = if ($Model -match "^(?i)gpt-|^o\d") { "gpt" } elseif ($Model -match "^(?i)gemini") { "gemini" } elseif ($Model -match "^(?i)(claude|opus|sonnet|haiku|fable)") { "claude" } else { "" }
  if ($Model -match "\(") { $Tool = "gemini" }   # agy display names like "Claude Opus 4.6 (Thinking)" run through Antigravity
}
if (-not $Tool) { Write-Output "NOT SAVED: can't tell which app runs '$Model'. Add -Tool gpt|gemini|claude."; exit 1 }
if ($Tool -ne "gpt") { $Effort = "" }
if ($Effort -and $Effort -notin "low", "medium", "high", "xhigh", "max", "ultra") { Write-Output "NOT SAVED: effort must be low, medium, high, xhigh, max or ultra."; exit 1 }

if (-not $NoProbe) {
  $tmp = Join-Path $env:TEMP "ai-team-probe"; New-Item -ItemType Directory -Force $tmp | Out-Null
  $env:AI_TEAM_ALLOW_SELF = "1"
  switch ($Tool) {
    "gpt"    { $p = @{ Review = $true; Model = $Model; TimeoutMin = 5; Role = "probe" }; if ($Effort) { $p.Effort = $Effort }; $r = & "$PSScriptRoot\ask-gpt.ps1" @p $tmp "Reply with exactly: OK" 2>&1 | Out-String }
    "gemini" { $r = & "$PSScriptRoot\ask-gemini.ps1" -Model $Model -TimeoutSec 180 -Role probe $tmp "Reply with exactly: OK" 2>&1 | Out-String }
    "claude" { $r = & "$PSScriptRoot\ask-claude.ps1" -Model $Model -TimeoutMin 5 -Role probe $tmp "Reply with exactly: OK" 2>&1 | Out-String }
  }
  $env:AI_TEAM_ALLOW_SELF = $null
  if ($r -match "(?m)^\s*(ERROR|LIMIT)" -or $r -notmatch "(?i)\bOK\b") { Write-Output "NOT SAVED: '$Model' did not answer the test call:"; Write-Output (($r.Trim() -split "`n" | Select-Object -First 2) -join " "); exit 1 }
}
$cfg.roles[$Role] = [ordered]@{ tool = $Tool; model = $Model; effort = $Effort }
if ($cfg.mode -ne "solo") { $cfg.mode = "custom" }
Save-TeamConfig $cfg
Write-Output ("SAVED: {0} = {1} ({2}){3}" -f $Role, $Model, $Tool, ($(if ($Effort) { ", $Effort" } else { "" })))
