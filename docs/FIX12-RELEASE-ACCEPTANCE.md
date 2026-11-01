# FIX 12 — Kiểm thử tổng thể, chốt nghiệp vụ và bàn giao BrewLite

## 1) Mục tiêu và phạm vi sửa

- **P0 — Chặn hoàn tiền giả:** API `PATCH /admin/orders/:id/status` không cho ghi `REFUNDED` hoặc `PAID` thủ công. Stripe webhook (đã xác thực chữ ký và số tiền) mới được chốt `REFUNDED` trong mã backend hiện có. **Chưa có nút/API chủ động yêu cầu refund Stripe:** muốn hoàn tiền thật phải thao tác đúng quy trình Stripe, sau đó hệ thống đồng bộ khi webhook thành công. Mock không phải hoàn tiền thật.
- **P0 — Hủy/pha chế an toàn:** `CANCELLED` chỉ cho đơn chưa thanh toán và gọi `OrdersService.cancel`, có lock Order, chặn khi payment pending, hoàn tồn kho/điểm/coupon đúng giao dịch. `PREPARING/READY/COMPLETED` gọi `OrdersService.advancePreparation` với compare-and-swap (CAS) để tránh race.
- **P1 — Sửa hiển thị điểm:** 1 điểm = 1 VND, không nhân 1.000. `discountTotal` vốn chứa cả coupon và điểm, vì vậy hiển thị phần coupon = `discountTotal - pointsRedeemed`.
- **P1 — Sửa tồn kho Admin:** cập nhật `stock`/`delta` nguyên tử, CAS `version`, không âm thầm clamp thành 0 hoặc ghi đè một lượt bán vừa xảy ra. Cạnh tranh -> HTTP 409 và người dùng thao tác lại.
- **P1 — Docker healthcheck:** backend chỉ healthy khi `GET /health/ready` chứng minh PostgreSQL reachable.
- **QA:** unit tests Admin, static contract checks, smoke không ghi và smoke E2E có kiểm soát trên DB demo.

FIX 12 **không sửa schema/migration** và **không tích hợp cổng hoàn tiền mới**. Có thể giải nén gói change-only vào source đã áp FIX 10 + FIX 11.

## 2) Thứ tự cài trên máy sạch

1. Dùng dự án `brewlite-ai(4).zip` **đã áp FIX 10**, sau đó **FIX 11**, rồi giải nén **FIX 12** lên thư mục gốc (`backend/`, `frontend/`). Đảm bảo `backend/prisma/migrations/20261101100000_admin_rbac` tồn tại.
2. Sao chép `.env.example` thành `.env` trong thư mục gốc. Để demo local: `PAYMENT_PROVIDER=MOCK`, `MOCK_GATEWAY_TEST_MODE=true`. Không đưa `.env` hoặc mật khẩu vào Git.
3. `docker compose up -d --build --wait`. Kiểm tra `docker compose ps` gồm DB, backend, frontend đều healthy.
4. `node scripts/verify-foundation.mjs` và `node --test scripts/fix12-contract.test.mjs`.
5. `node scripts/smoke-http.mjs` (chỉ đọc các API công khai và kiểm tra HTTP 401, không ghi DB).
6. Sau khi chắc chắn dùng **DB demo/test** và đã bật Mock decline, chạy smoke có ghi DB:

```powershell
# Windows PowerShell, tại thư mục gốc
$env:BREWLITE_ALLOW_TEST_WRITES='1'
node scripts/smoke-e2e.mjs
Remove-Item Env:\BREWLITE_ALLOW_TEST_WRITES
```

```bash
# bash/Linux/macOS
BREWLITE_ALLOW_TEST_WRITES=1 node scripts/smoke-e2e.mjs
```

`smoke-e2e.mjs` tự tạo user/đơn mới, test: đăng ký, đăng nhập, ngăn truy cập Admin, tạo đơn, replay đơn, giả lập thất bại, replay thanh toán lỗi, retry bằng key mới, PAID, loyalty chỉ cộng đúng một lần, xác nhận/lịch sử và coupon hết hạn. **Không chạy trên DB production**. Script in JSON PASS/FAIL với bước đã hoàn tất, không in mật khẩu hoặc token.

## 3) Kiểm thử phần backend/frontend thực tế (bắt buộc trước chốt)

Trên máy có **Node.js 24 LTS**, npm registry hoạt động, PostgreSQL test và `.env` phù hợp:

```bash
cd backend
npm ci
npx prisma generate
npm run build
npm test
npm run test:e2e
cd ../frontend
npm ci
npm run lint
npm run build
cd ..
node --experimental-strip-types --test frontend/tests/*.test.mjs
```

Kiểm tra riêng FIX 12:

```bash
cd backend
npm run test -- src/admin/admin.service.spec.ts
cd ..
node --test scripts/fix12-contract.test.mjs
```

**Lưu ý:** không nên chạy E2E backend đối với DB có dữ liệu thực vì nhiều bài kiểm thử tạo/sửa/xóa dữ liệu. Đặt `DATABASE_URL` về DB test cách ly.

## 4) Checklist demo giảng viên (đánh dấu sau khi xác minh THẬT)

- [ ] `docker compose up -d --build --wait` chạy từ DB sạch; `/health/ready` trả 200.
- [ ] Login khách hàng, xem menu; size M/L, topping, thêm giỏ, refresh vẫn còn.
- [ ] Coupon `GIAM10` hợp lệ, `HET_HAN` trả lỗi; hiển thị tổng tiền đúng.
- [ ] Chọn điểm (nếu có), tạo đơn; bấm 2 lần/reload không tạo đơn thứ hai.
- [ ] Mock failure trả PAYMENT_FAILED, giữ giỏ; thử lại bằng key mới -> PAID.
- [ ] PAID cập nhật lịch sử/xác nhận, xóa giỏ đúng lúc; loyalty chỉ cộng 1 lần.
- [ ] Customer JWT không gọi được `/admin/stats` (403), không JWT (401).
- [ ] Cấp quyền Admin theo `backend/src/admin/README-FIX10.md`; xem `/admin`.
- [ ] Admin PAID→PREPARING→READY→COMPLETED; nhảy cóc bị chặn 409.
- [ ] Admin không thể tự gán PAID, REFUNDED; không thể hủy PAID bằng status update.
- [ ] Admin hủy đơn PENDING không có payment pending: stock/coupon/points được trả lại chính xác.
- [ ] Admin xuất kho vượt tồn kho trả lỗi; 2 yêu cầu cập nhật đồng thời không mất cập nhật.
- [ ] Ghi lại log PASS backend unit + E2E, frontend build/lint/test, smoke E2E, Docker.
- [ ] README, Sprint backlog/burndown, retrospective, PR review và đóng góp 7 thành viên được cập nhật.

## 5) Phân biệt các mức kiểm thử

- **Đã thực hiện ở môi trường tạo FIX 12:** `node scripts/verify-foundation.mjs` PASS; `node --experimental-strip-types --test frontend/tests/*.test.mjs` **25/25 PASS**; `node --test scripts/fix12-contract.test.mjs` **6/6 PASS**; kiểm tra cú pháp TypeScript/TSX của file đã sửa.
- **Chưa thực hiện:** backend Vitest, backend/frontend build đầy đủ, HTTP smoke khi Docker đang chạy và E2E trên PostgreSQL. Môi trường tạo bản sửa không có Docker runtime và thiếu package npm. **Không đánh dấu đã nghiệm thu 100% khi các bước này còn thiếu.**

## 6) Git commit và dữ liệu cần bàn giao

```bash
git add .
git commit -m "fix(release): harden admin order lifecycle and add acceptance smoke tests"
```

Bàn giao mã nguồn, `docs/FIX12-RELEASE-ACCEPTANCE.md`, `.env.example`, hướng dẫn demo FIX 10/11 và log thực tế của các test sau khi chạy trên máy. **Không bàn giao mật khẩu, access token, Stripe key, `.env` hoặc thông tin khách hàng thật.**
