# Smoke test: every installed model answers through its helper, called from a script (no TTY).
#   powershell -ExecutionPolicy Bypass -File tests\smoke.ps1
$Bin = Join-Path $env:USERPROFILE ".ai-team\bin"
$tmp = Join-Path $env:TEMP "ai-team-smoke"; New-Item -ItemType Directory -Force $tmp | Out-Null
$env:AI_TEAM_ALLOW_SELF = "1"   # the test may run inside Claude Code; let it call Claude anyway
$rows = @()
foreach ($t in @(
  @{ name = "GPT";    exe = "ask-gpt.cmd";    args = @("-Review", $tmp, "Reply with exactly: OK") },
  @{ name = "Gemini"; exe = "ask-gemini.cmd"; args = @($tmp, "Reply with exactly: OK") },
  @{ name = "Claude"; exe = "ask-claude.cmd"; args = @($tmp, "Reply with exactly: OK") })) {
  $s = Get-Date
  $out = "" | & (Join-Path $Bin $t.exe) @($t.args) 2>&1 | Out-String
  $ok = ($LASTEXITCODE -eq 0) -and ($out -match "(?i)\bOK\b")
  $rows += [pscustomobject]@{ Model = $t.name; Result = $(if ($ok) { "PASS" } else { "FAIL" }); Seconds = [int]((Get-Date) - $s).TotalSeconds; Answer = ($out.Trim() -split "`n")[0] }
}
$env:AI_TEAM_ALLOW_SELF = $null
$rows | Format-Table -AutoSize | Out-String -Width 200
Write-Output "Unit tests:"; node --test (Join-Path $PSScriptRoot "agy-allow-helpers.test.js") 2>&1 | Select-String "^. (pass|fail) "
if ($rows.Result -contains "FAIL") { exit 1 }
