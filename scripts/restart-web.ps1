# Restart the dsh web server and verify the dsh-sounds plugin end to end.
# Self-contained on purpose: it kills the old server (which may host the
# agent), starts a fresh one, polls it, and writes a JSON verdict file.
param(
  [string]$Port = "5096"
)
$ErrorActionPreference = "Continue"
$base = "C:\Users\Lenovo\.dsh\plugins\dsh-sounds\scripts"
$log = Join-Path $base "web-restart.log"
$serverLog = Join-Path $base "web-server.log"
$resultFile = Join-Path $base "web-verify-result.json"

function Write-Step($msg) {
  Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg)
}
Write-Step "=== restart+verify begin (port $Port) ==="

# 1. kill the old server on this port
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  $oldPid = $conn[0].OwningProcess
  Write-Step "killing old server pid $oldPid"
  Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
for ($i = 0; $i -lt 30; $i++) {
  if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Seconds 1
}

# 2. start the fresh server (same command the user runs)
$dshBin = "C:\Users\Lenovo\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js"
$proc = Start-Process -FilePath "node" -ArgumentList @("$dshBin", "web", "--port", $Port) `
  -WorkingDirectory "C:\Users\Lenovo\.dsh" `
  -RedirectStandardOutput $serverLog -RedirectStandardError "$serverLog.err" `
  -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 1
$proc.Refresh()
Write-Step "started new server pid $($proc.Id)"

# 3. wait for HTTP up
$up = $false
for ($i = 0; $i -lt 90; $i++) {
  if ($proc.HasExited) { Write-Step "server process exited early (code $($proc.ExitCode))"; break }
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $up = $true; break }
  } catch {}
  Start-Sleep -Seconds 1
}
Write-Step "http up: $up"

# 4. run checks
$checks = @()
function Check($name, [scriptblock]$block) {
  try {
    $v = & $block
    $script:checks += @{ name = $name; ok = $true; detail = "$v" }
    Write-Step "CHECK OK $name -> $v"
  } catch {
    $script:checks += @{ name = $name; ok = $false; detail = $_.Exception.Message }
    Write-Step "CHECK FAIL $name : $($_.Exception.Message)"
  }
}

Check "index status" { (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5).StatusCode }
Check "boot manifest contains dsh-sounds" {
  $html = (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5).Content
  if ($html -match '__DSH_BOOT__') {
    if ($html -match '"id":\s*"dsh-sounds"') { "found" } else { "BOOT PRESENT BUT dsh-sounds MISSING" }
  } else { "NO BOOT MANIFEST" }
}
Check "plugin bundle status" { (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/plugins/dsh-sounds/client.js" -UseBasicParsing -TimeoutSec 5).StatusCode }
Check "plugin bundle format" {
  $c = (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/plugins/dsh-sounds/client.js" -UseBasicParsing -TimeoutSec 5).Content
  if ($c -match '__ModuleLoader__\.load' -and $c -match 'dsh-sounds') { "module-loader format ok" } else { "NOT module loader format" }
}
Check "sounds api settings.get" {
  $body = @{ method = "settings.get" } | ConvertTo-Json
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/sounds/api" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 5
  $r.Content
}
Check "server log has no dsh-sounds errors" {
  $text = if (Test-Path $serverLog) { Get-Content $serverLog -Raw -ErrorAction SilentlyContinue } else { "" }
  if ($text -match 'dsh-sounds.*(FAIL|Error|error)') { "log mentions dsh-sounds errors" } else { "clean" }
}
Check "server log last lines" {
  if (Test-Path $serverLog) { (Get-Content $serverLog -Tail 5 -ErrorAction SilentlyContinue) -join " | " } else { "no log" }
}

$ok = ($checks | Where-Object { -not $_.ok }).Count -eq 0
$result = @{ ok = $ok; up = $up; serverPid = $proc.Id; checks = $checks }
$result | ConvertTo-Json -Depth 6 | Set-Content $resultFile -Encoding UTF8
Write-Step "=== DONE ok=$ok pid=$($proc.Id) ==="
