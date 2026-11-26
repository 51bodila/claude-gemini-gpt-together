# ask-claude: ask Claude through Claude Code CLI (claude -p), on the Claude subscription (no API key).
# Read-only by default. -Build lets it edit files inside the folder (no shell commands).
# Usage:
#   ask-claude "task"                       (folder = current folder)
#   ask-claude <folder> "task"
#   ask-claude -Build -Model opus <folder> "task"
param(
  [switch]$Build,
  [string]$Model = "",
  [string]$Role = "designer",
  [int]$TimeoutMin = 30,
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ErrorActionPreference = "Continue"
. "$PSScriptRoot\common.ps1"
if ($env:CLAUDECODE -eq "1" -and -not $env:AI_TEAM_ALLOW_SELF) { Write-Output "ERROR: you are Claude (the lead). A lead never calls itself: do this part yourself."; exit 7 }
$dt = Split-DirTask $Rest; $Dir = $dt.dir; $Task = $dt.task
if (-not $Task) { Write-Output "ERROR: no task. Usage: ask-claude [folder] `"task`""; exit 4 }
$cfg = Read-TeamConfig
if (-not $Model) { $Model = (Get-ToolDefault $cfg "claude" $Role).model }

$claude = Get-ClaudeExe
if (-not $claude) { Write-Output "ERROR: Claude Code CLI is not installed. Run in PowerShell: irm https://claude.ai/install.ps1 | iex"; exit 2 }
if (-not (Test-Path $Dir)) { Write-Output "ERROR: folder not found: $Dir"; exit 4 }
$dirFull = (Resolve-Path $Dir).Path

$a = @("-p", "--output-format", "json", "--no-session-persistence")
if ($Model) { $a += @("--model", $Model) }
if ($Build) {
  $a += @("--permission-mode", "acceptEdits", "--allowedTools", "Read,Grep,Glob,Edit,Write", "--disallowedTools", "Bash,WebFetch,WebSearch")
  $prefix = "When done, reply in at most 5 lines: what you changed and how you checked it. "
} else {
  $a += @("--allowedTools", "Read,Grep,Glob", "--disallowedTools", "Edit,Write,NotebookEdit,Bash,WebFetch,WebSearch")
  $prefix = "You are a read-only adviser. Do not change any files. Mark anything you are not sure about as 'guess'. "
}
$a = @(($prefix + $Task)) + $a   # prompt first: --allowedTools/--disallowedTools take a list and would eat it

$start = Get-Date
$status = "failed"; $code = 1; $out = ""
# Drop the parent app's session variables so the CLI uses its own claude.ai sign-in.
$drop = @("CLAUDECODE", "CLAUDE_CODE_*", "ANTHROPIC_BASE_URL", "CLAUDE_AGENT_SDK_*", "CLAUDE_PID")
for ($try = 1; $try -le 2; $try++) {
  $r = Invoke-WithTimeout $claude $a $dirFull ($TimeoutMin * 60) $drop
  $code = $r.code
  if ($r.timedOut) { $status = "timeout"; $out = "ERROR: Claude ($Model) gave no answer in $TimeoutMin min (tried $try times). Do the work yourself and tell the user."; continue }
  $jsonLine = ($r.out -split "`r?`n" | Where-Object { $_.TrimStart().StartsWith('{"') } | Select-Object -Last 1)
  $j = $null; try { $j = $jsonLine | ConvertFrom-Json -ErrorAction Stop } catch {}
  if ($r.out -match "(?i)not logged in|please run /login|invalid api key") { $code = 3; $out = "ERROR: Claude Code is not signed in. Run 'claude' in a terminal and log in with your Claude account."; break }
  if ($j -and -not $j.is_error -and $j.result) { $status = "done"; $code = 0; $out = "$($j.result)".Trim(); break }
  $msg = if ($j) { "$($j.result)" } else { (($r.out -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 2) -join " | ") }
  if (Test-Limit $msg) { if ($try -lt 2) { Start-Sleep -Seconds 20; continue }; $status = "limit"; $code = 6; $out = "LIMIT: Claude plan limit reached ($Model). Give this role to another model with /team and tell the user. $msg"; break }
  $out = "ERROR: Claude failed (exit $code): $msg"
  if ($msg -match "(?i)model.*(not found|invalid|not available)") { break }
  Start-Sleep -Seconds 5
}
Write-TeamLog "claude" $Role $Model "" ((Get-Date) - $start).TotalSeconds $status $Task
Write-Output $out
if ($status -eq "done") { exit 0 } else { if ($code -eq 0) { $code = 1 }; exit $code }
