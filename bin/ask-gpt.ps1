# ask-gpt: hand a task to GPT through Codex CLI, on the ChatGPT subscription (no API key).
# Usage:
#   ask-gpt <folder> "task"                    GPT builds (workspace-write sandbox, only this folder)
#   ask-gpt -Review <folder> "task"            GPT reviews (read-only sandbox, changes nothing)
#   ask-gpt -Model gpt-6.2-sol -Effort xhigh <folder> "task"
# Model/effort default to the GPT role in ~/.ai-team/config.json. Never runs with full access.
param(
  [switch]$Review,
  [string]$Model = "",
  [string]$Effort = "",
  [string]$Role = "",
  [int]$TimeoutMin = 30,
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ErrorActionPreference = "Continue"
. "$PSScriptRoot\common.ps1"
$dt = Split-DirTask $Rest; $Dir = $dt.dir; $Task = $dt.task
if (-not $Task) { Write-Output "ERROR: no task. Usage: ask-gpt <folder> `"task`""; exit 4 }
if (-not $Role) { $Role = if ($Review) { "reviewer" } else { "builder" } }
$cfg = Read-TeamConfig
$def = Get-ToolDefault $cfg "gpt" $Role
if (-not $Model) { $Model = $def.model }
if (-not $Effort) { $Effort = $def.effort }

$codex = Join-Path $env:APPDATA "npm\codex.cmd"
if (-not (Test-Path $codex)) { $c = Get-Command codex -ErrorAction SilentlyContinue; $codex = if ($c) { $c.Source } else { $null } }
if (-not $codex) { Write-Output "ERROR: Codex CLI is not installed. Run: npm install -g @openai/codex"; exit 2 }
$st = & $codex login status 2>&1 | Out-String
if ($st -notmatch "Logged in") { Write-Output "ERROR: Codex is not signed in. Run 'codex' in a terminal and choose 'Sign in with ChatGPT'."; exit 3 }
if (-not (Test-Path $Dir)) { Write-Output "ERROR: folder not found: $Dir"; exit 4 }
$dirFull = (Resolve-Path $Dir).Path

$last = Join-Path $env:TEMP ("ai-team-gpt-" + [guid]::NewGuid().ToString("N") + ".txt")
$sandbox = if ($Review) { "read-only" } else { "workspace-write" }
$a = @("exec", "--sandbox", $sandbox, "-C", $dirFull, "--skip-git-repo-check", "--ephemeral", "--color", "never", "--output-last-message", $last)
if ($Model) { $a += @("-m", $Model) }
if ($Effort) { $a += @("-c", "model_reasoning_effort=`"$Effort`"") }
$prefix = if ($Review) { "You are a strict code reviewer. Do not modify any files. Report only real problems with file and line, then a final line PASS or FAIL. " } else { "When done, reply in at most 5 lines: what you changed and how you checked it. " }
$a += ($prefix + $Task)

$start = Get-Date
$status = "failed"; $code = 1; $out = ""
for ($try = 1; $try -le 2; $try++) {
  Remove-Item $last -ErrorAction SilentlyContinue
  $r = Invoke-WithTimeout $codex $a $dirFull ($TimeoutMin * 60)
  $code = $r.code
  $answer = if (Test-Path $last) { (Get-Content $last -Raw -Encoding UTF8).Trim() } else { "" }
  if ($r.timedOut) { $out = "ERROR: GPT ($Model) gave no answer in $TimeoutMin min (tried $try times). Do the work yourself and tell the user."; $status = "timeout"; continue }
  if ((Test-Limit $r.out) -and -not $answer) { if ($try -lt 2) { Start-Sleep -Seconds 20; continue }; $status = "limit"; $code = 6; $out = "LIMIT: GPT plan limit reached ($Model). Give this role to another model with /team and tell the user. " + (($r.out -split "`n" | Select-String -Pattern "(?i)limit|quota|try again" | Select-Object -First 1) -join ""); break }
  if ($code -eq 0 -and $answer) { $status = "done"; $out = $answer; break }
  $out = "ERROR: GPT failed (exit $code, try $try of 2). Last lines: " + (($r.out -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 4) -join " | ")
  Start-Sleep -Seconds 5
}
Remove-Item $last -ErrorAction SilentlyContinue
Write-TeamLog "gpt" $Role $Model $Effort ((Get-Date) - $start).TotalSeconds $status $Task
Write-Output $out
exit $code
