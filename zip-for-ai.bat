@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title BrewLite - Nen code cho AI

cd /d "%~dp0"

echo =======================================================
echo          BREWLITE - NEN ZIP CODE CHO AI
echo =======================================================
echo.

set "OUTPUT_ZIP=brewlite-ai.zip"

if exist "%OUTPUT_ZIP%" (
    echo [i] Dang xoa file zip cu...
    del /f /q "%OUTPUT_ZIP%"
)

echo [*] Dang tao file %OUTPUT_ZIP%...
echo     Loai bo: node_modules, .next, dist, .git, *.zip, .env

where tar.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    tar.exe -a -c -f "%OUTPUT_ZIP%" ^
      --exclude="node_modules" ^
      --exclude=".next" ^
      --exclude="dist" ^
      --exclude=".git" ^
      --exclude="*.zip" ^
      --exclude=".env" ^
      --exclude=".env.local" ^
      --exclude="generated" ^
      backend frontend contracts docs scripts README.md docker-compose.yml .env.example .gitignore .github
) else (
    where git.exe >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo [i] Su dung git archive...
        git archive -o "%OUTPUT_ZIP%" HEAD
    ) else (
        echo [!] Khong tim thay tar.exe hoac git.exe de nen file.
        goto :ERROR
    )
)

if not exist "%OUTPUT_ZIP%" goto :ERROR

for %%I in ("%OUTPUT_ZIP%") do set "SIZE=%%~zI"
set /a "KB=!SIZE! / 1024"

echo.
echo =======================================================
echo [OK] NEN THANH CONG!
echo - File: %OUTPUT_ZIP% [!KB! KB]
echo - Thu muc: %~dp0%OUTPUT_ZIP%
echo.
echo Ban co the tai file nay len AI de ho tro code.
echo =======================================================
goto :END

:ERROR
echo.
echo [X] Co loi xay ra khi nen file.

:END
echo.
pause
