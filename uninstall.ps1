# Removes what install.ps1 added. Keeps your config.json, log.csv and backups in ~/.ai-team, and all your own text.
# Every file it changes is backed up to ~/.ai-team/backup/<timestamp>-uninstall first.
param([string]$HomeDir = $env:USERPROFILE)
$ErrorActionPreference = "Stop"
$TeamDir = Join-Path $HomeDir ".ai-team"; $Bin = Join-Path $TeamDir "bin"
$Backup = Join-Path $TeamDir ("backup\" + (Get-Date -Format "yyyyMMdd-HHmmss") + "-uninstall")
$Utf8 = New-Object Text.UTF8Encoding $false
function Save-Backup([string]$p) { if (Test-Path $p) { New-Item -ItemType Directory -Force $Backup | Out-Null; Copy-Item $p (Join-Path $Backup (($p.Substring($HomeDir.Length).TrimStart("\")) -replace "[\\/:]", "_")) -Recurse -Force } }
function Remove-Ours([string]$p) { if (Test-Path $p) { Save-Backup $p; Remove-Item $p -Recurse -Force; Write-Output " - removed $p" } }
function Remove-Block([string]$p) {
  if (-not (Test-Path $p)) { return }
  $t = [IO.File]::ReadAllText($p); $re = "(?s)\s*<!-- AI-TEAM START[^>]*-->.*?<!-- AI-TEAM END -->\s*"
  if ($t -match $re) { Save-Backup $p; $rest = [regex]::Replace($t, $re, "`r`n`r`n").Trim(); if ($rest) { [IO.File]::WriteAllText($p, $rest + "`r`n", $Utf8) } else { Remove-Item $p -Force }; Write-Output " - removed AI team block from $p" }
}

# Claude Code
$c = Join-Path $HomeDir ".claude"
foreach ($n in "team", "mode", "gpt", "gemini", "claude", "council") {
  $f = Join-Path $c "commands\$n.md"
  $src = Join-Path $PSScriptRoot "claude\commands\$n.md"
  if ((Test-Path $f) -and (([IO.File]::ReadAllText($f) -match [regex]::Escape($Bin)) -or ((Test-Path $src) -and ([IO.File]::ReadAllText($f).Trim() -eq [IO.File]::ReadAllText($src).Trim())))) { Remove-Ours $f }
}
Remove-Block (Join-Path $c "CLAUDE.md")
$sp = Join-Path $c "settings.json"
if (Test-Path $sp) {
  $s = Get-Content $sp -Raw | ConvertFrom-Json; $ch = $false
  if ($s.PSObject.Properties["statusLine"] -and "$($s.statusLine.command)" -match [regex]::Escape("$Bin\statusline.ps1")) { $s.PSObject.Properties.Remove("statusLine"); $ch = $true }
  if ($s.hooks -and $s.hooks.PSObject.Properties["UserPromptSubmit"]) {
    $keep = @($s.hooks.UserPromptSubmit | Where-Object { ($_ | ConvertTo-Json -Depth 10) -notmatch "mentions-hook" })
    if ($keep.Count -ne @($s.hooks.UserPromptSubmit).Count) { $ch = $true; if ($keep.Count) { $s.hooks.UserPromptSubmit = $keep } else { $s.hooks.PSObject.Properties.Remove("UserPromptSubmit") } }
  }
  if ($ch) { Save-Backup $sp; [IO.File]::WriteAllText($sp, ($s | ConvertTo-Json -Depth 20), $Utf8); Write-Output " - removed status line and @mentions hook from $sp" }
}
# Codex
Remove-Block (Join-Path $HomeDir ".codex\AGENTS.md")
Get-ChildItem (Join-Path $HomeDir ".agents\skills") -Directory -Filter "ai-team-*" -ErrorAction SilentlyContinue | ForEach-Object { Remove-Ours $_.FullName }
$toml = Join-Path $HomeDir ".codex\config.toml"
if (Test-Path $toml) {
  $t = [IO.File]::ReadAllText($toml)
  $ours = "(?s)\s*# AI team: helpers write their log/config here[^\n]*\n\[sandbox_workspace_write\]\s*\nwritable_roots = \['" + [regex]::Escape($TeamDir) + "'\]\s*"
  if ($t -match $ours) { Save-Backup $toml; [IO.File]::WriteAllText($toml, ([regex]::Replace($t, $ours, "`r`n").TrimEnd() + "`r`n"), $Utf8); Write-Output " - removed sandbox entry from $toml" }
  elseif ($t -match [regex]::Escape($TeamDir)) { Write-Output " - $toml still lists $TeamDir in writable_roots (edited by hand?): remove it yourself if you want" }
}
# Antigravity
Remove-Ours (Join-Path $HomeDir ".gemini\config\plugins\ai-team")
Get-ChildItem (Join-Path $HomeDir ".gemini\config\skills") -Directory -Filter "ai-team-*" -ErrorAction SilentlyContinue | ForEach-Object { Remove-Ours $_.FullName }
# Helpers and PATH
Remove-Ours $Bin
Remove-Ours (Join-Path $TeamDir "allow-agy")
if ($HomeDir -eq $env:USERPROFILE) {
  $p = [Environment]::GetEnvironmentVariable("Path", "User")
  $np = (($p -split ";") | Where-Object { $_ -and $_ -ne $Bin }) -join ";"
  if ($np -ne $p) { [Environment]::SetEnvironmentVariable("Path", $np, "User"); Write-Output " - removed $Bin from PATH" }
}
Write-Output "AI team removed. Kept: $TeamDir (config.json, log.csv, backups)."
