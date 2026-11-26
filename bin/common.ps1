# Shared code for the AI team helpers. Dot-source it: . "$PSScriptRoot\common.ps1"
# Settings: ~/.ai-team/config.json   Log: ~/.ai-team/log.csv   Mode presets: ~/.ai-team/modes.json
$Team = Join-Path $env:USERPROFILE ".ai-team"
$CfgPath = Join-Path $Team "config.json"
$LogCsv = Join-Path $Team "log.csv"

function Read-TeamConfig {
  $d = [ordered]@{
    mode = "pro"
    roles = [ordered]@{
      builder  = [ordered]@{ tool = "gpt";    model = "gpt-6.2-astra"; effort = "high" }
      reviewer = [ordered]@{ tool = "gpt";    model = "gpt-6.2-astra"; effort = "medium" }
      advisor  = [ordered]@{ tool = "gemini"; model = "Gemini 4 Hydrogen (High)"; effort = "" }
      designer = [ordered]@{ tool = "claude"; model = "opus"; effort = "" }
    }
  }
  try {
    $j = Get-Content $CfgPath -Raw -ErrorAction Stop | ConvertFrom-Json
    if ($j.mode) { $d.mode = $j.mode }
    if ($j.roles) {
      foreach ($p in $j.roles.PSObject.Properties) {
        $d.roles[$p.Name] = [ordered]@{ tool = $p.Value.tool; model = "$($p.Value.model)"; effort = "$($p.Value.effort)" }
      }
    }
  } catch {}
  return $d
}

function Save-TeamConfig($cfg) {
  [IO.File]::WriteAllText($CfgPath, ($cfg | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding $false))
}

# Model + effort a tool should use when called directly (ask-gpt, ask-gemini, ask-claude).
# Takes the first role played by that tool; for GPT reviews prefers the reviewer role.
function Get-ToolDefault($cfg, [string]$tool, [string]$prefer = "") {
  if ($prefer -and $cfg.roles[$prefer] -and $cfg.roles[$prefer].tool -eq $tool) { return $cfg.roles[$prefer] }
  foreach ($r in "builder", "reviewer", "advisor", "designer") { if ($cfg.roles[$r] -and $cfg.roles[$r].tool -eq $tool) { return $cfg.roles[$r] } }
  $fb = @{ gpt = @{ model = "gpt-6.2-astra"; effort = "high" }; gemini = @{ model = "Gemini 4 Hydrogen (High)"; effort = "" }; claude = @{ model = "opus"; effort = "" } }
  return $fb[$tool]
}

function Write-TeamLog([string]$tool, [string]$role, [string]$model, [string]$effort, [double]$seconds, [string]$status, [string]$task) {
  if (-not (Test-Path $LogCsv)) { [IO.File]::WriteAllText($LogCsv, "time,tool,role,model,effort,seconds,status,task`r`n", (New-Object Text.UTF8Encoding $false)) }
  $t = ($task -replace '[\r\n]+', ' ' -replace '"', "'"); if ($t.Length -gt 80) { $t = $t.Substring(0, 80) }
  $line = '{0},{1},{2},"{3}",{4},{5},{6},"{7}"' -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $tool, $role, $model, $effort, [int][Math]::Round($seconds), $status, $t
  [IO.File]::AppendAllText($LogCsv, $line + "`r`n", (New-Object Text.UTF8Encoding $false))
}

# True if a CLI answer says the plan's usage limit is reached.
function Test-Limit([string]$text) {
  return ($text -match "(?i)usage limit|rate.?limit|quota|limit reached|hit your .*limit|too many requests|resource.?exhausted|\b429\b")
}

function Get-ClaudeExe {
  $c = Get-Command claude -ErrorAction SilentlyContinue
  if ($c -and $c.Source -like "*.exe") { return $c.Source }
  $local = Join-Path $env:USERPROFILE ".local\bin\claude.exe"
  if (Test-Path $local) { return $local }
  # Claude Code bundled with the Claude desktop app (folder name changes on every update: take the newest).
  $b = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Claude-Data\*\claude-code\*\*\claude.exe") -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($b) { return $b.FullName }
  return $null
}

# Runs a native exe with args, closed stdin, hard timeout. Returns @{ out; code; timedOut }.
function Invoke-WithTimeout([string]$exe, [string[]]$argv, [string]$dir, [int]$timeoutSec, [string[]]$dropEnv = @()) {
  $job = Start-Job -ScriptBlock {
    param($exe, $argv, $dir, $dropEnv)
    foreach ($n in $dropEnv) { Get-ChildItem env: | Where-Object { $_.Name -like $n } | ForEach-Object { [Environment]::SetEnvironmentVariable($_.Name, $null) } }
    Set-Location -LiteralPath $dir
    $o = "" | & $exe @argv 2>&1 | Out-String
    "$o`n__EXIT__$LASTEXITCODE"
  } -ArgumentList $exe, $argv, $dir, $dropEnv
  if (-not (Wait-Job $job -Timeout $timeoutSec)) { Stop-Job $job; Remove-Job $job -Force; return @{ out = ""; code = 124; timedOut = $true } }
  $o = (Receive-Job $job | Out-String); Remove-Job $job -Force
  $code = if ($o -match "__EXIT__(-?\d+)") { [int]$Matches[1] } else { 1 }
  return @{ out = ($o -replace "__EXIT__-?\d+", "").Trim(); code = $code; timedOut = $false }
}

# "ask-x <folder> task" or "ask-x task" (folder = current dir).
function Split-DirTask([string[]]$rest) {
  if ($rest.Count -ge 2) { return @{ dir = $rest[0]; task = ($rest[1..($rest.Count - 1)] -join " ") } }
  return @{ dir = (Get-Location).Path; task = ($rest -join " ") }
}
