# BrewLite — FIX 04: Kiểm thử rollback, bảo mật và E2E

Áp dụng **sau khi đã nhập FIX 01, FIX 02 và FIX 03**. Gói này chỉ thay test, không thay đổi nghiệp vụ, schema, Docker hoặc cấu hình production. Đây là test bổ sung, **không** phải bằng chứng test đã PASS trên PostgreSQL.

## Thay đổi

1. `backend/src/orders/orders.rollback.e2e-spec.ts`: truyền Idempotency-Key hợp lệ; spy `StockService.reserve()` và kiểm tra promise reserve đã hoàn thành trước lỗi FK. Sau khi transaction lỗi, xác nhận stock/version không đổi và không có Order.
2. `backend/test/authz-boundaries.e2e-spec.ts`: chạy controller thực với JWT Strategy/Guard thật (mock service). Thêm kiểm tra `/rewards/me` không token, JWT giả chữ ký, hết hạn; kiểm tra dùng đúng `sub` của token; Orders cũng từ chối JWT giả.
3. `backend/test/payments.e2e-spec.ts`: bỏ fixture tài khoản ID = 1, tạo tài khoản cô lập bằng email ngẫu nhiên, chỉ xóa order/payment/loyalty/orderItem của fixture và xóa user khi kết thúc.
4. `backend/test/payments.integration.e2e-spec.ts`: bỏ fixture ID = 2 và cleanup tác động dữ liệu ngoài test; dùng user/key ngẫu nhiên mỗi lượt.
5. `backend/test/order-checkout-flow.e2e-spec.ts`: kiểm tra qua HTTP + DB thật: tạo Order, snapshot giá, thanh toán, replay payment, EARN 1 lần, phân quyền, retry Order, tampered-price, coupon/point cancel và rollback hoàn tài nguyên.

## Cách chạy trên Windows PowerShell

Chạy trên **database thử nghiệm có thể xóa**, không dùng database có dữ liệu thật. PostgreSQL phải chạy và migration đã áp dụng. Phải cài dependency (npm ci) trước khi kiểm thử.

```powershell
# tại thư mục gốc BrewLite
Copy-Item .env.example .env -ErrorAction SilentlyContinue
# Kiểm tra .env, sửa credential theo Docker Compose thực tế
# Ví dụ DB local ở localhost:5432; thay nếu cấu hình của bạn khác

docker compose up -d db
cd backend
$env:DATABASE_URL = "postgresql://brew:brew@localhost:5432/brewlite"
$env:JWT_SECRET = "fix04-test-secret-at-least-32-characters"
$env:NODE_ENV = "test"
npm.cmd ci
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
```

Lưu ý: `npm run test:e2e` có các test chạy PostgreSQL thật, cần `DATABASE_URL` đúng. Không chạy test trên DB production. Nếu Node/npm dự án yêu cầu phiên bản Node khác, ưu tiên đúng phiên bản đã chốt ở repo.

## Kết quả kiểm chứng trong môi trường tạo bản vá

- `node scripts/verify-foundation.mjs`: **PASS**.
- Transpile cú pháp 5 test TypeScript qua TypeScript compiler API: **PASS** (chỉ cú pháp, không phải typecheck/build).
- Chưa chạy được Vitest + PostgreSQL thực tế: package binaries không có trong snapshot và runtime không có PostgreSQL/Docker. Không tuyên bố các test mới PASS.

## Giới hạn

- Unit/mocked HTTP tests chỉ chứng minh boundary; DB E2E mới là nơi kiểm tra transaction/rollback thật.
- Đã thiết kế dọn dữ liệu riêng trong hai test payment + suite mới. Một số test cũ khác có thể vẫn cần xem xét chính sách fixture riêng trước khi dùng trên DB chung.
- Khi test lỗi, lưu log test và sửa code nghiệp vụ nếu phát hiện bug; FIX 04 không cố tình thay đổi production logic để ép test xanh.
