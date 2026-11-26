# ask-team: send a task to whoever plays a role now (config.json), so the lead does not need to know the model.
# Usage: ask-team <builder|reviewer|advisor|designer> [folder] "task"
param(
  [Parameter(Position = 0, Mandatory = $true)][ValidateSet("builder", "reviewer", "advisor", "designer")][string]$Role,
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$Rest
)
. "$PSScriptRoot\common.ps1"
$cfg = Read-TeamConfig
if ($cfg.mode -eq "solo") { Write-Output "SOLO: the team is in solo mode. Do it yourself (the user can name a model to override)."; exit 8 }
$r = $cfg.roles[$Role]
if (-not $r) { Write-Output "ERROR: role $Role is not set. Use /team."; exit 4 }
$p = @{ Role = $Role }
if ($r.model) { $p.Model = $r.model }
switch ($r.tool) {
  "gpt" {
    if ($r.effort) { $p.Effort = $r.effort }
    if ($Role -ne "builder") { $p.Review = $true }
    & "$PSScriptRoot\ask-gpt.ps1" @p @Rest
  }
  "gemini" { & "$PSScriptRoot\ask-gemini.ps1" @p @Rest }
  "claude" {
    if ($Role -eq "builder" -or $Role -eq "designer") { $p.Build = $true }
    & "$PSScriptRoot\ask-claude.ps1" @p @Rest
  }
  default { Write-Output "ERROR: unknown tool '$($r.tool)' for role $Role"; exit 4 }
}
exit $LASTEXITCODE
