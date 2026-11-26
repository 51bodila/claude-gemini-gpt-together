# list-models: JSON with the models each CLI really offers on the user's plans now, locked ones, and the current team.
$ErrorActionPreference = "Continue"
. "$PSScriptRoot\common.ps1"
$out = [ordered]@{ gpt = @(); gemini = @(); gemini_locked = @(); claude = @(); config = $null }

$codex = Join-Path $env:APPDATA "npm\codex.cmd"
if (Test-Path $codex) {
  try {
    $j = (& $codex debug models 2>$null | Out-String) | ConvertFrom-Json
    $out.gpt = @($j.models | Where-Object { $_.visibility -eq "list" } | ForEach-Object {
      [ordered]@{ id = $_.slug; name = $_.display_name; about = $_.description; efforts = @($_.supported_reasoning_levels.effort) }
    })
  } catch {}
}

$agy = Join-Path $env:LOCALAPPDATA "agy\bin\agy.exe"
if (Test-Path $agy) {
  $lines = "" | & $agy models 2>$null
  $out.gemini = @($lines | Where-Object { $_ -match "`t" } | ForEach-Object { $p = $_ -split "`t"; [ordered]@{ id = $p[0].Trim(); name = $p[1].Trim() } })
  $names = $out.gemini | ForEach-Object { $_.name }
  foreach ($m in "Gemini 4 Neon", "Gemini 4 Carbon") {
    if (-not ($names | Where-Object { $_ -like "$m*" })) { $out.gemini_locked += [ordered]@{ name = $m; why = "needs Google AI Pro or Ultra" } }
  }
}

# Claude Code has no model-list command: these aliases always map to the newest model of each family on the plan.
if (Get-ClaudeExe) {
  $out.claude = @(
    [ordered]@{ id = "opus"; name = "Claude Opus (newest)"; about = "strongest: design, frontend, final say" },
    [ordered]@{ id = "sonnet"; name = "Claude Sonnet (newest)"; about = "everyday" },
    [ordered]@{ id = "haiku"; name = "Claude Haiku (newest)"; about = "cheapest" }
  )
}
$out.config = Read-TeamConfig
$out | ConvertTo-Json -Depth 6
