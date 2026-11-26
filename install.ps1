# AI team installer (Windows). Safe to run again: it updates its own blocks and files only.
# Every file it changes is backed up to ~/.ai-team/backup/<timestamp> first. It never deletes your files.
#   powershell -ExecutionPolicy Bypass -File install.ps1 [-Mode pro] [-AcceptAgyRisk] [-AgyAutoAllowHelpers]
param(
  [ValidateSet("eco", "pro", "max", "solo")][string]$Mode = "pro",
  [switch]$AcceptAgyRisk,        # turn Gemini (agy -p) on: Google staff said wrapping agy in other agents may break its Terms
  [switch]$AgyAutoAllowHelpers,  # let Antigravity run ONLY the ask-*/set-* helpers without asking (needed for headless agy -p)
  [string]$HomeDir = $env:USERPROFILE,
  [switch]$NoPath
)
$ErrorActionPreference = "Stop"
$Src = $PSScriptRoot
$TeamDir = Join-Path $HomeDir ".ai-team"
$Bin = Join-Path $TeamDir "bin"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Backup = Join-Path $TeamDir "backup\$Stamp"
$Utf8 = New-Object Text.UTF8Encoding $false
$done = New-Object System.Collections.Generic.List[string]

function Save-Backup([string]$path) {
  if (-not (Test-Path $path)) { return }
  $rel = $path.Substring($HomeDir.Length).TrimStart("\") -replace "[\\/:]", "_"
  New-Item -ItemType Directory -Force $Backup | Out-Null
  Copy-Item $path (Join-Path $Backup $rel) -Recurse -Force
}
function Write-Text([string]$path, [string]$text) {
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  if ((Test-Path $path) -and ([IO.File]::ReadAllText($path) -eq $text)) { return }
  Save-Backup $path
  [IO.File]::WriteAllText($path, $text, $Utf8)
}
function Fill([string]$text, [string]$lead = "", [string]$self = "") {
  $text.Replace("{{BIN}}", $Bin).Replace("{{TEAM}}", $TeamDir).Replace("{LEAD}", $lead).Replace("{SELF}", $self)
}
# Put $block (which has START/END marker lines) into $path: replace our old block, or append. Never touches other text.
function Set-Block([string]$path, [string]$block) {
  $old = if (Test-Path $path) { [IO.File]::ReadAllText($path) } else { "" }
  $re = "(?s)<!-- AI-TEAM START[^>]*-->.*?<!-- AI-TEAM END -->"
  $new = if ($old -match $re) { [regex]::Replace($old, $re, { param($m) $block.Trim() }) } else { ($old.TrimEnd() + "`r`n`r`n" + $block.Trim() + "`r`n").TrimStart() }
  Write-Text $path $new
}
function Copy-Tree([string]$from, [string]$to) {
  Get-ChildItem $from -Recurse -File | ForEach-Object {
    $dest = Join-Path $to $_.FullName.Substring($from.Length).TrimStart("\")
    Write-Text $dest (Fill ([IO.File]::ReadAllText($_.FullName)))
  }
}

# 1. Helpers
New-Item -ItemType Directory -Force $Bin | Out-Null
Get-ChildItem (Join-Path $Src "bin") -File | ForEach-Object { Write-Text (Join-Path $Bin $_.Name) ([IO.File]::ReadAllText($_.FullName)) }
foreach ($n in "ask-gpt", "ask-gemini", "ask-claude", "ask-team", "set-team", "set-mode", "list-models") {
  Write-Text (Join-Path $Bin "$n.cmd") "@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -File `"%~dp0$n.ps1`" %*`r`nexit /b %ERRORLEVEL%`r`n"
  Write-Text (Join-Path $Bin $n) "#!/bin/sh`nexec powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"`$(cygpath -w `"`$(dirname `"`$0`")`")\\$n.ps1`" `"`$@`"`n"
}
Write-Text (Join-Path $TeamDir "modes.json") ([IO.File]::ReadAllText((Join-Path $Src "config\modes.json")))
if (-not (Test-Path (Join-Path $TeamDir "config.json"))) {
  $env:USERPROFILE_SAVE = $env:USERPROFILE; $env:USERPROFILE = $HomeDir
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Bin "set-mode.ps1") $Mode | Out-Null
  $env:USERPROFILE = $env:USERPROFILE_SAVE
}
if ($AcceptAgyRisk) { Write-Text (Join-Path $TeamDir "allow-agy") "" }
$done.Add("helpers -> $Bin")
if (-not $NoPath -and $HomeDir -eq $env:USERPROFILE) {
  $p = [Environment]::GetEnvironmentVariable("Path", "User")
  if (($p -split ";") -notcontains $Bin) { [Environment]::SetEnvironmentVariable("Path", ($p.TrimEnd(";") + ";$Bin"), "User"); $done.Add("PATH: added $Bin (open a new terminal)") }
}

$rules = [IO.File]::ReadAllText((Join-Path $Src "rules\rules-template.md"))

# 2. Claude Code
$claudeDir = Join-Path $HomeDir ".claude"
if ((Test-Path $claudeDir) -or (Get-Command claude -ErrorAction SilentlyContinue)) {
  Copy-Tree (Join-Path $Src "claude\commands") (Join-Path $claudeDir "commands")
  Set-Block (Join-Path $claudeDir "CLAUDE.md") (Fill ([IO.File]::ReadAllText((Join-Path $Src "rules\claude-section.md"))))
  $sp = Join-Path $claudeDir "settings.json"
  $s = if (Test-Path $sp) { Get-Content $sp -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
  $changed = $false
  $statusCmd = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$Bin\statusline.ps1`""
  if (-not $s.PSObject.Properties["statusLine"]) { $s | Add-Member statusLine ([pscustomobject]@{ type = "command"; command = $statusCmd }); $changed = $true }
  elseif ("$($s.statusLine.command)" -notmatch "statusline\.ps1") { $done.Add("Claude: you already have a status line; kept it. Ours: $statusCmd") }
  $hookCmd = "node `"$($Bin -replace '\\','/')/mentions-hook.js`""
  if (-not $s.PSObject.Properties["hooks"]) { $s | Add-Member hooks ([pscustomobject]@{}) }
  $ups = @(); if ($s.hooks.PSObject.Properties["UserPromptSubmit"]) { $ups = @($s.hooks.UserPromptSubmit) }
  if (-not (($ups | ConvertTo-Json -Depth 10) -match "mentions-hook")) {
    $ups += [pscustomobject]@{ hooks = @([pscustomobject]@{ type = "command"; command = $hookCmd; timeout = 5 }) }
    if ($s.hooks.PSObject.Properties["UserPromptSubmit"]) { $s.hooks.UserPromptSubmit = $ups } else { $s.hooks | Add-Member UserPromptSubmit $ups }
    $changed = $true
  }
  if ($changed) { Write-Text $sp ($s | ConvertTo-Json -Depth 20) }
  $done.Add("Claude Code: /team /mode /gpt /gemini /claude /council, rules in CLAUDE.md, @mentions hook, status line")
}

# 3. Codex
$codexDir = Join-Path $HomeDir ".codex"
if ((Test-Path $codexDir) -or (Get-Command codex -ErrorAction SilentlyContinue)) {
  Set-Block (Join-Path $codexDir "AGENTS.md") (Fill $rules "GPT (running in Codex)" "you are GPT, so never call ask-gpt or ask-team for a role whose tool is gpt; do that part yourself.")
  Copy-Tree (Join-Path $Src "codex\skills") (Join-Path $HomeDir ".agents\skills")
  $toml = Join-Path $codexDir "config.toml"
  $t = if (Test-Path $toml) { [IO.File]::ReadAllText($toml) } else { "" }
  if ($t -notmatch "(?m)^\[sandbox_workspace_write\]") {
    Write-Text $toml ($t.TrimEnd() + "`r`n`r`n# AI team: helpers write their log/config here (no network, no full access)`r`n[sandbox_workspace_write]`r`nwritable_roots = ['$TeamDir']`r`n").TrimStart()
  } elseif ($t -notmatch [regex]::Escape($TeamDir)) { $done.Add("Codex: add '$TeamDir' to writable_roots under [sandbox_workspace_write] in config.toml yourself (that section already exists)") }
  $done.Add("Codex: rules in ~/.codex/AGENTS.md, skills ai-team-* in ~/.agents/skills")
}

# 4. Antigravity
$agyExe = Join-Path $env:LOCALAPPDATA "agy\bin\agy.exe"
$gemCfg = Join-Path $HomeDir ".gemini\config"
if ((Test-Path (Join-Path $HomeDir ".gemini")) -or (Test-Path $agyExe)) {
  $plug = Join-Path $gemCfg "plugins\ai-team"
  Write-Text (Join-Path $plug "plugin.json") "{ `"name`": `"ai-team`" }`r`n"
  Write-Text (Join-Path $plug "rules\AGENTS.md") (Fill $rules "Gemini (running in Antigravity)" "you are Gemini, so never call ask-gemini or ask-team for a role whose tool is gemini; do that part yourself.")
  Copy-Tree (Join-Path $Src "antigravity\skills") (Join-Path $gemCfg "skills")
  if ($AgyAutoAllowHelpers) {
    $hook = @{ "ai-team-allow-helpers" = @{ PreToolUse = @(@{ matcher = "run_command"; hooks = @(@{ type = "command"; command = "node `"$($Bin -replace '\\','/')/agy-allow-helpers.js`""; timeout = 5 }) }) } }
    Write-Text (Join-Path $plug "hooks.json") ($hook | ConvertTo-Json -Depth 10)
    $done.Add("Antigravity: helpers (only them) run without asking")
  }
  $done.Add("Antigravity: rules plugin ~/.gemini/config/plugins/ai-team, skills ai-team-*")
}

Write-Output "AI team installed. Mode: $Mode"
$done | ForEach-Object { Write-Output " - $_" }
if (-not (Test-Path (Join-Path $TeamDir "allow-agy"))) { Write-Output " - Gemini helper is OFF. Read the README (Terms risk), then re-run with -AcceptAgyRisk to turn it on." }
if (Test-Path $Backup) { Write-Output " - backups: $Backup" }
Write-Output "Sign in once in your own terminal if you haven't: claude | codex (Sign in with ChatGPT) | agy (Google). Then run tests\smoke.ps1"
