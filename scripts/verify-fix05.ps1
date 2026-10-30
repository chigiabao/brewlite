<#
FIX05 — Local release verification for Windows PowerShell 5.1+.
Runs a fresh ISOLATED Docker Compose project (new database volume), backend/frontend checks,
HTTP+JWT smoke, and saves an evidence report. Never touches the normal brewlite project volume.

Run at repository root:
  powershell -ExecutionPolicy Bypass -File .\scripts\verify-fix05.ps1
Optional: -KeepStack (retains the isolated verification stack; remove it manually afterward).

Ports 3000, 3001 and 5432 must be free. This script DOES delete its own temporary
verification project's volume during cleanup; it does NOT delete the usual BrewLite DB.
#>
param([switch]$KeepStack)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$nonce = ([guid]::NewGuid().ToString('N')).Substring(0, 8)
$project = "brewlite-f05-$nonce"
$evidence = Join-Path $root "docs\evidence\FIX05-$stamp-$nonce"
New-Item -ItemType Directory -Force -Path $evidence | Out-Null
$script:steps = New-Object System.Collections.ArrayList
$script:failure = $null
$script:stackStarted = $false
$previousDemoMode = [Environment]::GetEnvironmentVariable('MOCK_GATEWAY_TEST_MODE', 'Process')
$env:MOCK_GATEWAY_TEST_MODE = 'false' # Release verification must not enable demo-only override.
$gitCommit = 'unavailable (no .git / not a Git worktree)'
$gitDirty = $null
if (Test-Path (Join-Path $root '.git')) {
  $gitCommit = (& git -C $root rev-parse HEAD 2>$null | Select-Object -First 1)
  $gitDirty = [bool]((& git -C $root status --porcelain 2>$null | Out-String).Trim())
}

function Invoke-Step([string]$name, [string]$exe, [string[]]$argv) {
  $log = Join-Path $evidence "$name.log"
  Write-Host "==> $name" -ForegroundColor Cyan
  $started = (Get-Date).ToUniversalTime()
  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue' # PowerShell 5.1 interprets native stderr as ErrorRecord.
  try {
    $output = & $exe @argv 2>&1
    $exit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $oldEap
  }
  @(
    "Command: $exe $($argv -join ' ')"
    "StartedUTC: $($started.ToString('o'))"
    "ExitCode: $exit"
    '--- output ---'
    ($output | ForEach-Object { "$_" })
  ) | Out-File -FilePath $log -Encoding utf8
  $item = [ordered]@{ step = $name; passed = ($exit -eq 0); exitCode = $exit; log = "$name.log" }
  [void]$script:steps.Add($item)
  if ($exit -ne 0) {
    $tail = ($output | Select-Object -Last 12 | Out-String)
    Write-Host $tail -ForegroundColor Red
    throw "Step '$name' failed (exit $exit). See $log"
  }
  Write-Host "    PASS" -ForegroundColor Green
}

$compose = @('compose', '--project-name', $project)
try {
  Invoke-Step '01-node-version' 'node' @('--version')
  Invoke-Step '02-foundation-contract' 'node' @('scripts/verify-foundation.mjs')
  Invoke-Step '03-docker-available' 'docker' @('compose', 'version')
  $script:stackStarted = $true
  Invoke-Step '04-compose-clean-start' 'docker' ($compose + @('up','-d','--build','--wait'))
  Invoke-Step '05-compose-ps' 'docker' ($compose + @('ps'))
  Invoke-Step '06-migration-status' 'docker' ($compose + @('exec','-T','backend','npx','prisma','migrate','status'))
  Invoke-Step '07-seed-fingerprint-before' 'docker' ($compose + @('exec','-T','backend','node','scripts/seed-fingerprint.mjs','--write','/tmp/seed-before-f05.json'))
  Invoke-Step '08-seed-rerun' 'docker' ($compose + @('exec','-T','backend','npx','prisma','db','seed'))
  Invoke-Step '09-seed-fingerprint-assert' 'docker' ($compose + @('exec','-T','backend','node','scripts/seed-fingerprint.mjs','--compare','/tmp/seed-before-f05.json','--write','/tmp/seed-after-f05.json'))
  Invoke-Step '10-backend-lint' 'docker' ($compose + @('exec','-T','backend','npm','run','lint'))
  Invoke-Step '11-backend-build' 'docker' ($compose + @('exec','-T','backend','npm','run','build'))
  Invoke-Step '12-backend-unit' 'docker' ($compose + @('exec','-T','backend','npm','test'))
  Invoke-Step '13-backend-e2e' 'docker' ($compose + @('exec','-T','backend','npm','run','test:e2e'))
  Invoke-Step '14-frontend-lint' 'docker' ($compose + @('exec','-T','frontend','npm','run','lint'))
  Invoke-Step '15-frontend-build' 'docker' ($compose + @('exec','-T','frontend','npm','run','build'))
  Invoke-Step '16-http-and-jwt-smoke' 'node' @('scripts/smoke-http.mjs')
} catch {
  $script:failure = "$_"
  Write-Warning $script:failure
} finally {
  if ($script:stackStarted) {
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      & docker @compose logs --no-color --tail=300 backend frontend db 2>&1 |
        Out-File -FilePath (Join-Path $evidence 'docker-logs.txt') -Encoding utf8
      if (-not $KeepStack) {
        & docker @compose down -v --remove-orphans 2>&1 |
          Out-File -FilePath (Join-Path $evidence 'docker-cleanup.log') -Encoding utf8
      }
    } finally {
      $ErrorActionPreference = $previousEap
    }
  }
  [Environment]::SetEnvironmentVariable('MOCK_GATEWAY_TEST_MODE', $previousDemoMode, 'Process')
}

$status = if ($script:failure) { 'FAIL' } else { 'PASS' }
$summary = [ordered]@{
  fix = 'FIX05'
  status = $status
  completedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  commit = $gitCommit
  uncommittedChanges = $gitDirty
  composeProject = $project
  isolatedTemporaryDb = $true
  stackKept = [bool]$KeepStack
  error = $script:failure
  steps = @($script:steps.ToArray())
}
$summary | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidence 'summary.json') -Encoding utf8
$lines = @(
  '# BrewLite FIX05 — Local release acceptance report',
  '',
  "- Timestamp (UTC): $($summary.completedAtUtc)",
  "- Status: **$status**",
  "- Isolated Compose project: ``$project``",
  "- Git commit: $gitCommit",
  "- Uncommitted changes: $gitDirty",
  '- Database: new temporary Docker volume (not the normal BrewLite volume)',
  "- Retained stack: $([bool]$KeepStack)",
  '- Evidence: log for each step, summary.json, docker-logs.txt',
  '',
  '| Check | Result | Log |',
  '|---|---|---|'
)
foreach ($step in $script:steps) {
  $state = if ($step.passed) { 'PASS' } else { 'FAIL' }
  $lines += "| $($step.step) | $state | $($step.log) |"
}
if ($script:failure) { $lines += "`n**Blocker:** $($script:failure)" }
$lines | Out-File -FilePath (Join-Path $evidence 'SUMMARY.md') -Encoding utf8
Write-Host "`nFIX05 $status - $evidence" -ForegroundColor $(if ($script:failure) { 'Red' } else { 'Green' })
if ($script:failure) { exit 1 }
