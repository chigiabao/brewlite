@echo off
chcp 65001 >nul
title BrewLite - Robot Auto-Demo Launcher
cls
echo =====================================================================
echo          🤖 BREWLITE - ROBOT AUTO-DEMO (TỰ ĐỘNG BẤM NHƯ THẬT)
echo =====================================================================
echo.
echo Đang kiểm tra tài khoản Demo...
node scripts-demo/setup-demo-accounts.mjs
echo.
echo Đang khởi chạy Robot tự động thao tác trên trình duyệt...
echo (Lưu ý: Đảm bảo Backend port 3001 và Frontend port 3000 đang chạy)
echo.
node scripts-demo/robot-live-demo.mjs
echo.
pause

