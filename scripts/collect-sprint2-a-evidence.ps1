# scripts/collect-sprint2-a-evidence.ps1
# Chạy tại thư mục gốc của repo trên Windows PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\scripts\collect-sprint2-a-evidence.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$stamp = Get-Date -Format 'yyyy-MM-dd'
$evDir = Join-Path $root "docs\evidence\SPRINT-2-A-$stamp"
New-Item -ItemType Directory -Force -Path $evDir | Out-Null

function Run-Step([string]$label, [string]$workDir, [string]$cmd) {
    $logFile = Join-Path $evDir "$label.log"
    Write-Host "==> [$label] $cmd" -ForegroundColor Cyan
    Push-Location $workDir
    try {
        $start = (Get-Date).ToUniversalTime().ToString('o')
        "Command: $cmd`nWorkingDirectory: $workDir`nStarted(UTC): $start`n" | Out-File -FilePath $logFile -Encoding utf8
        
        # Trong PowerShell 5.1, các lệnh native (docker, git, npm) ghi log tiến trình ra stderr.
        # Nếu để ErrorActionPreference='Stop', PowerShell sẽ quăng lỗi NativeCommandError giả.
        # Do đó cần tạm thời chuyển sang 'Continue' trong lúc thực thi và kiểm tra exit code.
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $output = Invoke-Expression "& { $cmd } 2>&1"
            $code = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $prevEAP
        }

        if ($output) {
            $output | ForEach-Object {
                $line = "$_"
                Write-Host $line
                $line | Out-File -FilePath $logFile -Append -Encoding utf8
            }
        }

        if ($code -ne 0 -and $null -ne $code) {
            throw "Command failed with exit code $code"
        }
        "`nExitCode: 0" | Out-File -FilePath $logFile -Append -Encoding utf8
    } finally {
        Pop-Location
    }
}

# 1. Kiểm tra ownership, git tracking và contract lock
Run-Step "01-git-status-and-workflow-track" $root "git status --short; git ls-files .github/workflows/foundation.yml"
Run-Step "02-verify-foundation-guard" $root "node scripts/verify-foundation.mjs"

# 2. Clean DB + Migrate + Seed 2 lần liên tiếp
Run-Step "03-clean-db-start" $root "docker compose down -v --remove-orphans; docker compose up -d --wait db"

$env:DATABASE_URL = "postgresql://brew:brew@127.0.0.1:5432/brewlite?schema=public"
$env:JWT_SECRET = "local-only-test-secret"

Run-Step "04-prisma-validate-and-migrate" (Join-Path $root "backend") "npx.cmd prisma validate; npx.cmd prisma migrate deploy; npx.cmd prisma generate"
Run-Step "05-prisma-seed-run-1" (Join-Path $root "backend") "npx.cmd prisma db seed"
Run-Step "06-db-counts-after-seed-1" $root '@''
SELECT (SELECT COUNT(*) FROM "Product") AS product_count, (SELECT COUNT(*) FROM "Coupon") AS coupon_count;
SELECT code, "discountPercent", "discountAmount", "minOrderValue", active FROM "Coupon" ORDER BY code;
''@ | docker compose exec -T db psql -U brew -d brewlite'
Run-Step "07-prisma-seed-run-2" (Join-Path $root "backend") "npx.cmd prisma db seed"
Run-Step "08-db-counts-after-seed-2" $root '@''
SELECT (SELECT COUNT(*) FROM "Product") AS product_count, (SELECT COUNT(*) FROM "Coupon") AS coupon_count;
SELECT id, name, price, stock FROM "Product" ORDER BY id;
''@ | docker compose exec -T db psql -U brew -d brewlite'

# 3. Backend lint / build / unit / e2e
Run-Step "09-backend-lint" (Join-Path $root "backend") "npm.cmd run lint"
Run-Step "10-backend-build" (Join-Path $root "backend") "npm.cmd run build"
Run-Step "11-backend-unit-test" (Join-Path $root "backend") "npm.cmd test"
Run-Step "12-backend-e2e-test" (Join-Path $root "backend") "npm.cmd run test:e2e"

# 4. Frontend lint / build
Run-Step "13-frontend-lint" (Join-Path $root "frontend") "npm.cmd run lint"
Run-Step "14-frontend-build" (Join-Path $root "frontend") "npm.cmd run build; if (`$LASTEXITCODE -ne 0) { npm.cmd run build }"

# 5. Docker Compose Full Stack Smoke Test (HTTP 200 + Healthcheck + Seed x2 in Container)
Run-Step "15-docker-compose-up-wait" $root "docker compose down -v --remove-orphans; docker compose up -d --build --wait; docker compose ps"
Run-Step "16-docker-http-smoke" $root "Invoke-WebRequest http://localhost:3001/ -UseBasicParsing | Select-Object StatusCode, Content; Invoke-WebRequest http://localhost:3000/ -UseBasicParsing | Select-Object StatusCode"
Run-Step "17-docker-migrate-status-and-seed-2" $root "docker compose exec -T backend npx prisma migrate status; docker compose exec -T backend npx prisma db seed"
Run-Step "18-docker-compose-logs" $root "docker compose logs --no-color --tail=200 backend frontend db"

Write-Host "`nHOÀN TẤT! Toàn bộ bằng chứng Sprint 2 của A đã lưu tại: $evDir" -ForegroundColor Green
