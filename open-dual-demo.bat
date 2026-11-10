@echo off
chcp 65001 >nul
title BrewLite Dual-Screen Demo Launcher
cls
echo =====================================================================
echo          ☕ BREWLITE - CÔNG CỤ MỞ DEMO 2 MÀN HÌNH SONG SONG
echo =====================================================================
echo.
echo [1/3] Đang cập nhật tài khoản Customer & Admin vào CSDL...
node scripts-demo/setup-demo-accounts.mjs
echo.
echo ---------------------------------------------------------------------
echo 🔑 THÔNG TIN TÀI KHOẢN ĐỂ DEMO:
echo.
echo   📱 MÀN HÌNH KHÁCH HÀNG (Trình duyệt thường):
echo      - URL:      http://localhost:3000/login
echo      - Email:    customer@gmail.com
echo      - Mật khẩu: password123
echo      - Điểm sẵn có: 50.000 điểm (tha hồ test giảm giá)
echo.
echo   👑 MÀN HÌNH QUẢN TRỊ / BARISTA (Trình duyệt Ẩn danh):
echo      - URL:      http://localhost:3000/admin
echo      - Email:    admin@brewlite.local
echo      - Mật khẩu: admin123
echo      - Quyền:    ADMIN (Duyệt đơn, đổi trạng thái State Machine)
echo ---------------------------------------------------------------------
echo.
echo [2/3] Đang mở Cửa sổ 1: Giao diện Khách hàng (Chrome thường)...
start "" "http://localhost:3000/login"

timeout /t 2 >nul

echo [3/3] Đang mở Cửa sổ 2: Giao diện Admin/Barista (Ẩn danh / Incognito)...
REM Thử mở Chrome Incognito; nếu không có thì mở Edge
where chrome >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start chrome --incognito "http://localhost:3000/admin"
) else (
    where msedge >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        start msedge --inprivate "http://localhost:3000/admin"
    ) else (
        start "" "http://localhost:3000/admin"
    )
)

echo.
echo =====================================================================
echo ✅ ĐÃ MỞ XONG CẢ 2 CỬA SỔ!
echo 💡 Mẹo: Đặt Cửa sổ Khách hàng bên TRÁI, Cửa sổ Admin bên PHẢI.
echo    Khách bấm Đặt hàng -> Qua Admin bấm F5 duyệt làm món ngay lập tức!
echo =====================================================================
echo.
pause

