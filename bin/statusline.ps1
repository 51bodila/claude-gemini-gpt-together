# Claude Code status line, e.g. "pro · Astra high · Hydrogen High · 12 calls"
$null = [Console]::In.ReadToEnd()
. "$PSScriptRoot\common.ps1"
$cfg = Read-TeamConfig
function Short($r) {
  if (-not $r) { return "" }
  $m = "$($r.model)"
  if ($r.tool -eq "gpt") { $m = (Get-Culture).TextInfo.ToTitleCase((($m -replace "^gpt-[\d.]+-", ""))) }
  elseif ($r.tool -eq "gemini") { $m = $m -replace "^Gemini [\d.]+ ", "" -replace "[()]", "" }
  elseif ($r.tool -eq "claude") { $m = "Claude " + (Get-Culture).TextInfo.ToTitleCase($m) }
  if ($r.effort) { "$m $($r.effort)" } else { $m }
}
$calls = 0
if (Test-Path $LogCsv) { $today = Get-Date -Format "yyyy-MM-dd"; $calls = @(Get-Content $LogCsv | Where-Object { $_.StartsWith($today) -and $_ -notmatch ",probe," }).Count }
$parts = @($cfg.mode)
if ($cfg.mode -ne "solo") { $parts += Short $cfg.roles.builder; $parts += Short $cfg.roles.advisor }
$parts += "$calls calls"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::Out.Write((($parts | Where-Object { $_ }) -join " $([char]0x00B7) "))
