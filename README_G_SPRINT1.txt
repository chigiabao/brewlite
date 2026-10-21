BREWLITE | G | SPRINT 1 | FILE CHANGE ONLY
=======================================

MỤC TIÊU
- Pure reward rules và coupon code normalize.
- DTO validation POST /coupons/validate.
- POST /coupons/validate trả {valid:true,discount} hoặc HTTP 400/404.
- GET /rewards/me trả {loyaltyPoints}, phải có JWT (chưa auth -> 401).
- Unit test và HTTP fixture E2E.
- Không can thiệp Orders, Payments, checkout, schema, migration, shared contracts.

QUAN TRỌNG VỀ ĐỘ KHỚP REPO
Tại lượt tạo file chỉ được cung cấp hai PDF; không có ZIP nguồn BrewLite mới nhất.
File dựa trên tên thư mục/contract GUIDE-V2. Các import cụ thể dưới đây PHẢI
đối chiếu với repo hiện tại trước khi copy đè:
  backend/src/prisma/prisma.service.ts
  backend/src/prisma/prisma.module.ts
  backend/src/auth/public.ts (phải export CurrentUser, JwtAuthGuard, AuthUser)
  backend/src/rewards/rewards.module.ts (PrismaModule có export PrismaService không?)
Nếu Prisma nằm khác đường dẫn, cập nhật import trong rewards.service.ts,
rewards.service.spec.ts, rewards.module.ts và test/rewards.e2e-spec.ts theo code thật.
Không tự ý sửa file A/D để làm code mới biên dịch được.

CÁC FILE CODE CẦN CHÉP VÀO ROOT REPO (GIỮ NGUYÊN CÂY THƯ MỤC)
  backend/src/rewards/reward-rules.ts           [NEW]
  backend/src/rewards/reward-rules.spec.ts      [NEW]
  backend/src/rewards/rewards.dto.ts            [REPLACE/MERGE]
  backend/src/rewards/rewards.service.ts        [REPLACE/MERGE]
  backend/src/rewards/rewards.controller.ts     [REPLACE/MERGE]
  backend/src/rewards/rewards.module.ts         [REVIEW/MERGE; giữ provider cũ nếu cần]
  backend/src/rewards/rewards.service.spec.ts   [NEW]
  backend/src/rewards/public.ts                 [REVIEW/MERGE; giữ export cũ nếu có]
  backend/test/rewards.e2e-spec.ts              [NEW, fixture test]
  backend/prisma/seed.rewards.ts                [NEW, chỉ seed helper, chưa wire]

CÁCH ÁP DỤNG AN TOÀN
1. checkout branch feature/G-rewards-s1 từ develop.
2. Backup/review mọi file [REPLACE/MERGE] trước khi ghi đè.
3. Chép folder backend/ từ ZIP vào root repo sau khi diff từng file.
4. Xác nhận RewardsModule đã nằm trong AppModule (GUIDE-V2 nói đã có).
5. A review nếu muốn đưa endpoint GET /rewards/me vào shared public contract.
6. B/A quyết định cách upsert fixture từ prisma/seed.rewards.ts (KHÔNG ghi đè usedCount thật trong production).

CÁC LỆNH KIỂM TRA TRONG REPO THẬT (PowerShell)
  cd backend
  npx prisma generate
  npx vitest run src/rewards/reward-rules.spec.ts src/rewards/rewards.service.spec.ts
  npx vitest run --config ./vitest.config.e2e.ts test/rewards.e2e-spec.ts
  npm run lint
  npm run build
  npm test
  cd ..
  node scripts/verify-foundation.mjs

GHI CHÚ: Test E2E trong ZIP là HTTP Nest fixture: request đi qua routing,
ValidationPipe, controller, service; mock Prisma và override JWT guard.
Nó không chứng minh PostgreSQL/JWT thật. Khi có repo + DB, cần thêm real DB E2E
cùng seed và chụp log curl/SQL; reviewer mới ký PASS.

GỢI Ý CURL (đã khởi động backend + seed coupon GIAM10)
  curl.exe -i -X POST http://localhost:3001/coupons/validate -H "Content-Type: application/json" -d "{\"code\":\"GIAM10\",\"orderTotal\":100000}"
  curl.exe -i http://localhost:3001/rewards/me
  curl.exe -i http://localhost:3001/rewards/me -H "Authorization: Bearer <JWT_THAT>"

KỲ VỌNG (CHƯA XÁC NHẬN TRÊN DB THẬT)
Case                       Status   Body/ý nghĩa
GIAM10, 100000             200      {valid:true, discount:10000}
GIAM10, 40000              400      thấp hơn minOrderValue=50000
EXPIRED                    400      đã hết hạn
INACTIVE                   400      đã vô hiệu
QUOTA (1/1)                400      hết lượt
UNKNOWN                    404      không tồn tại
Body không hợp lệ          400      DTO reject
GET /rewards/me không JWT  401      không được xem điểm người khác
GET /rewards/me có JWT     200      {loyaltyPoints:<số điểm DB>}
Validate 2 lần             200      usedCount không đổi

CHÍNH SÁCH NGHIỆP VỤ
- Normalize: trim + uppercase.
- Có chính xác 1 loại discount: discountPercent(1..100) hoặc discountAmount(>0).
- Discount không vượt subtotal; phần trăm làm tròn xuống.
- Khi dùng points: subtotal -> coupon -> points -> total (không âm).
- EARN dự kiến floor(order.total/100) chỉ sau khi PAID; Sprint 1 CHƯA hook.
- Validate chỉ xem trước, KHÔNG reserve quota. Nếu hết quota khi POST /orders,
  E phải rollback transaction và báo 409 theo GUIDE-V2 trong Sprint tiếp theo.

ĐẦU VIỆC CẦN OWNER KHÁC REVIEW
- A: xác nhận Coupon/User/LoyaltyEntry schema, public contract, PrismaModule.
- E: subtotal authoritative tính lại từ product DB và create-order transaction.
- D: JwtAuthGuard / CurrentUser thực tế và token JWT.
- F: hiển thị điểm, nhập coupon, payment/checkout ở sprint sau.

BẰNG CHỨNG ĐÃ CHẠY TRONG MÔI TRƯỜNG TẠO FILE
- TypeScript tsc strict cho reward-rules.ts: PASS.
- node evidence/run-pure-rules-smoke.cjs: 17/17 PASS.
- Xem evidence/actual-smoke.log.
- CHƯA chạy: NestJS/Vitest e2e, Prisma PostgreSQL, build/lint toàn repo.
- CHƯA có PR, reviewer approval hoặc commit SHA: chỉ có ở repo Git thật.

Điểm nhấn: package này là Sprint 1, không tự nhận hoàn thành G2/G3.
