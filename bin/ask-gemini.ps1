# ask-gemini: ask Gemini through the Antigravity CLI (agy), on the Google account subscription (no API key).
# Read-only adviser: it answers, it never edits files.
# Usage:
#   ask-gemini "task"                       (folder = current folder)
#   ask-gemini <folder> "task"
#   ask-gemini -Model "Gemini 4 Hydrogen (XHigh)" <folder> "task"
# Default model comes from the Gemini role in ~/.ai-team/config.json.
param(
  [string]$Model = "",
  [string]$Role = "advisor",
  [int]$TimeoutSec = 900,
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ErrorActionPreference = "Continue"
. "$PSScriptRoot\common.ps1"
# AGY_TOS_PAUSE: Google staff (discuss.ai.google.dev/t/197131) said wrapping "agy -p" inside other agents on
# consumer plans may break Antigravity ToS Section 6. It stays OFF until the user creates ~/.ai-team/allow-agy (their account, their choice).
if (-not (Test-Path (Join-Path $Team "allow-agy"))) { Write-Output "ERROR: Gemini via Antigravity CLI is paused (file ~/.ai-team/allow-agy is missing). Google staff said calling agy -p from other agents on consumer plans may break Antigravity Terms. To accept that risk, create the file ~/.ai-team/allow-agy."; exit 5 }
$dt = Split-DirTask $Rest; $Dir = $dt.dir; $Task = $dt.task
if (-not $Task) { Write-Output "ERROR: no task. Usage: ask-gemini [folder] `"task`""; exit 4 }
$cfg = Read-TeamConfig
if (-not $Model) { $Model = (Get-ToolDefault $cfg "gemini" $Role).model }

$agy = Join-Path $env:LOCALAPPDATA "agy\bin\agy.exe"
if (-not (Test-Path $agy)) { $c = Get-Command agy -ErrorAction SilentlyContinue; $agy = if ($c) { $c.Source } else { $null } }
if (-not $agy) { Write-Output "ERROR: Antigravity CLI (agy) is not installed. Run in PowerShell: irm https://antigravity.google/cli/install.ps1 | iex"; exit 2 }
if (-not (Test-Path $Dir)) { Write-Output "ERROR: folder not found: $Dir"; exit 4 }
$dirFull = (Resolve-Path $Dir).Path

$prompt = "You are a read-only adviser. Do not create, edit, move or delete any files and do not run commands that change anything. Answer directly in plain text. Use no tools unless the task asks you to read a file; never run shell commands. Mark anything you are not sure about as 'guess'. " + $Task
$a = @("-p", $prompt, "--output-format", "json", "--print-timeout", "$($TimeoutSec)s", "--mode", "plan")
if ($Model) { $a += @("--model", $Model) }

$start = Get-Date
$status = "failed"; $code = 1; $out = ""
for ($try = 1; $try -le 2; $try++) {
  $r = Invoke-WithTimeout $agy $a $dirFull ($TimeoutSec + 60)
  $code = $r.code
  if ($r.timedOut) { $status = "timeout"; $out = "ERROR: Gemini ($Model) gave no answer in $([int]($TimeoutSec/60)) min (tried $try times). Do the work yourself and tell the user."; continue }
  $jsonLine = ($r.out -split "`r?`n" | Where-Object { $_.TrimStart().StartsWith('{"') } | Select-Object -Last 1)
  $j = $null; try { $j = $jsonLine | ConvertFrom-Json -ErrorAction Stop } catch {}
  if ($r.out -match "(?i)authentication required|not signed in|please log ?in") { $status = "failed"; $code = 3; $out = "ERROR: Antigravity CLI is not signed in. Run 'agy' once in a terminal and sign in with Google."; break }
  if ($j -and $j.status -eq "ERROR") {
    $e = "$($j.error)"
    $first = ($e -split "`n")[0].Trim()
    $models = (($e -split "`n") | Select-Object -Skip 1 | Where-Object { $_ -match "^\s{2,}\S" } | ForEach-Object { $_.Trim() }) -join ", "
    if (Test-Limit $e) { if ($try -lt 2) { Start-Sleep -Seconds 20; continue }; $status = "limit"; $code = 6; $out = "LIMIT: Gemini plan limit reached ($Model). Give this role to another model with /team and tell the user. $first"; break }
    $out = "ERROR: $first" + $(if ($models) { ". Models on your plan: $models" } else { "" })
    if ($e -match "(?i)invalid model|unavailable") { break }   # retrying will not help
  } elseif ($j -and -not "$($j.response)".Trim() -and $j.denied_actions) { $out = "ERROR: Gemini tried a blocked action (" + (($j.denied_actions | ForEach-Object { $_.display_name }) -join ", ") + ") and gave no answer." }
  elseif ($j -and $j.response) { $status = "done"; $code = 0; $out = "$($j.response)".Trim(); break }
  elseif (Test-Limit $r.out) { if ($try -lt 2) { Start-Sleep -Seconds 20; continue }; $status = "limit"; $code = 6; $out = "LIMIT: Gemini plan limit reached ($Model). Give this role to another model with /team and tell the user. " + (($r.out -split "`n" | Select-String -Pattern "(?i)limit|quota|exhausted|429" | Select-Object -First 1) -join ""); break }
  else { $out = "ERROR: Gemini returned nothing (exit $code). " + (($r.out -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 2) -join " | ") }
  Start-Sleep -Seconds 5
}
Write-TeamLog "gemini" $Role $Model "" ((Get-Date) - $start).TotalSeconds $status $Task
Write-Output $out
if ($status -eq "done") { exit 0 } else { if ($code -eq 0) { $code = 1 }; exit $code }
