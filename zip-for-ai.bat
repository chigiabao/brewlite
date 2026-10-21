@echo off
setlocal
title BrewLite - ZIP for AI

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\zip-for-ai.ps1" -ProjectRoot "%~dp0."
set "zip_exit_code=%errorlevel%"

echo.
if not "%zip_exit_code%"=="0" echo ZIP failed. See the error above.
if /i not "%~1"=="/nopause" pause
exit /b %zip_exit_code%
