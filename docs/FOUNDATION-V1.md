# BrewLite – Master Contract & Hard Skeleton V1

**Trạng thái:** FOUNDATION-01 là quyết định kỹ thuật đề xuất để nhóm chốt; FOUNDATION-02 là khung code đã chỉnh; FOUNDATION-03 chỉ được coi là đạt sau khi test trên máy thật/CI xanh. Không được ghi "release xong" vì service B/D/E/F/G còn TODO.

## 1. Nguồn và phạm vi

- **Đề bài:** `BrewLite-CongNghePhanMem(2).pdf` mục 4 (yêu cầu), 5 (luồng), 6 (NestJS + Next.js), 8 (10 task), 9 (4 phần nâng cao), 10 (DoD), 12 (API/entity).
- **Guide gốc:** A.pdf → G.pdf; không sửa lại nội dung PDF, mà dùng guide cùng tài liệu này làm chuẩn kỹ thuật.
- **Code:** `brewlite(2).zip` được dùng làm baseline; không xóa các feature của người nhận việc.
- **Lựa chọn do nhóm đề xuất, KHÔNG ghi trong đề bài:** coupon giảm cố định/%, số tiền discount snapshot, nhiều payment attempt/order, LoyaltyEntry audit, quy tắc retry và validate chặt. Phải được PO và nhóm xác nhận ở Gate 0.

## 2. Kiến trúc chốt cho V1

Next.js (`frontend/`) → REST/JSON → NestJS modular monolith (`backend/src/{products,auth,orders,payments,rewards}/`) → Prisma → PostgreSQL; payment chỉ là mock. **Không bỏ NestJS module; không cần microservices/Node server thứ hai.** Cart phía client dùng Zustand; server không tin đơn giá/tổng tiền client. Các module dùng chung `backend/src/contracts/public.ts` (kiểu), `backend/src/prisma/` (kết nối), `backend/src/common/` (pricing). File contract JSON chuẩn: `contracts/brewlite-v1.json`.

**Ranh giới module:** feature này không import `service.ts`, `controller.ts`, `dto.ts` từ feature khác. Chỉ truy cập qua `../<feature>/public.js` hoặc các kiểu trong `contracts/public.ts` (service cụ thể sẽ được bọc bởi port nếu cần); người phụ trách A review thay đổi biên; việc một module cần lấy dữ liệu của module khác phải nêu API/service public trước PR. `app.module.ts` chỉ wiring. Prisma schema/migration là shared area do A merge, mỗi feature đề xuất thay đổi qua PR.

## 3. Owner file/feature – duy nhất 1 owner chính

| Vị trí | Sở hữu (không đụng file module khác) | Task theo đề | Bàn giao tối thiểu |
|---|---|---|---|
| **A – Platform/Integration** | `.github/`, `docker-compose.yml`, `backend/prisma/schema.prisma` + migrations (merge), `backend/src/contracts/`, `backend/src/common/`, `frontend/lib/api.ts`, README/docs | 1 + phần Docker/merge 9 | Clean clone, CI, DB migration, contract guard, demo tích hợp |
| **B – Catalog** | `backend/src/products/`, `backend/prisma/seed.ts` (data menu, qua A review), `frontend/app/page.tsx`, `frontend/app/products/` | 2,3,4 + hiển thị khuyến mãi | API menu/detail, chọn size/topping, hiển thị giá từ API |
| **C – Cart** | `frontend/store/cart.ts`, `frontend/app/cart/`, phần cart badge của layout (PR A review) | 5 | Thêm/sửa/xóa, persist, badge; gửi payload không có giá |
| **D – Identity** | `backend/src/auth/`, `frontend/app/login/` | 7 | JWT, bảo vệ routes, đăng ký/login, user ownership |
| **E – Ordering** | `backend/src/orders/`, trạng thái/stock, endpoints lịch sử | 6, phần API 9, state/stock phần 10 | Transaction + stock concurrency + order snapshot + tests |
| **F – Payments** | `backend/src/payments/`, `frontend/app/checkout/`, `frontend/app/orders/` | 8, UI 9, idempotency phần 10 | Mock payment, checkout, retry, chống duplicate charge, tests |
| **G – Rewards** | `backend/src/rewards/`, coupon/loyalty theo hợp đồng, đề nghị thay schema qua A | Phần loyalty/coupon task 10 | Coupon cap/expiry, points chỉ xử lý once-per-paid, tests |

**Chú ý:** `backend/src/orders/orders.service.ts` thuộc E, `backend/src/payments/payments.service.ts` thuộc F. G **không tự sửa** hai file này: E/F gọi interface hoặc nhận PR review có đồng tác giả. `frontend/app/layout.tsx` thuộc shared UI nên C thay đổi phần badge qua PR review của A. `backend/prisma/schema.prisma` cũng chỉ có A merge.

## 4. API V1 – contract đầu vào/đầu ra

| Endpoint | Auth | Request | Response thành công | Lỗi trọng yếu |
|---|---|---|---|---|
| `GET /products` | Không | – | `[{id,name,price,imageUrl,stock}]` | 500 |
| `GET /products/:id` | Không | id số nguyên dương | `{id,name,price,imageUrl,stock}` | 404 |
| `POST /auth/register` | Không | `{email,password}` | `{accessToken}` (chốt thống nhất với D) | 400,409 |
| `POST /auth/login` | Không | `{email,password}` | `{accessToken}` | 400,401 |
| `POST /orders` | JWT | `{items:[{productId,size,toppings,qty}],couponCode?,pointsToRedeem?}` | `{id,status,subtotal,discountTotal,pointsRedeemed,total}` | 400,401,409 |
| `GET /orders/me` | JWT | – | `[{id,status,total,createdAt}]` | 401 |
| `GET /orders/:id` | JWT | id đơn | chi tiết đơn, chỉ user sở hữu | 401,403/404 |
| `POST /payments` | JWT + `Idempotency-Key` | `{orderId,method}` | `{orderId,status}` | 400,401,404,409 |
| `POST /coupons/validate` | Không/JWT (phải chốt trước triển khai) | `{code,orderTotal}` | `{valid,discount}` | 400,404 |

**Chú thích:** `GET /orders/:id` và `/coupons/validate` là phần mở rộng theo E/G guide, không phải endpoint tối thiểu đề gốc. HTTP status và response nên chuẩn hóa trước khi viết API. Request error dùng NestJS mặc định giai đoạn skeleton; A có thể tạo `ApiErrorResponse` ở phiên bản tiếp theo. **Không trả `passwordHash`; guard quyền sở hữu order bắt buộc.** `POST /orders` không chấp nhận giá client. Tiền nguyên VND, >= 0. Size S/M/L; topping chỉ `Trân châu`, `Kem`, không lặp.

## 5. Business invariants và migration

- **Order:** `PENDING → PAID → PREPARING → READY → COMPLETED`. `PENDING → PAYMENT_FAILED`; `PAYMENT_FAILED → PAID` khi thanh toán lại. `CANCELLED` theo chuyển tiếp đã ghi trong JSON. `COMPLETED`/`CANCELLED` là terminal. **Không dùng PICKED_UP.** E phải viết `assertTransition`, test tất cả đường đúng/sai.
- **Inventory:** trong PostgreSQL transaction, E đọc stock/version, `updateMany(where:{id,version,stock:{gte:qty}}, data:{stock:{decrement:qty},version:{increment:1}})`. Nếu update 0 → conflict/retry có giới hạn. Test đồng thời stock=3, 10 request, <=3 đơn được nhận. Cần quyết định business của hoàn kho cho huỷ/thất bại và viết test trước khi chốt release.
- **Order snapshot:** E tính lại bằng DB product price + size/topping; lưu `unitPrice`, `toppings`, `lineTotal`, `subtotal`; discount/điểm đã quy đổi vào `total`. Đơn không tự thay đổi khi Product đổi giá.
- **Payment:** F phải tạo unique `idempotencyKey` bằng ràng buộc DB, lưu `requestHash`. Cùng key + same payload → same result; key + khác payload → 409. `PENDING` gateway response không biết chắc không được coi là failure và gọi lại tuỳ tiện. Chống race bằng transaction/unique index; mock deterministic theo input; nhiều attempts được phép nhưng 1 đơn không được được PAID hai lần.
- **Rewards:** coupon 1 kiểu giảm (% hoặc số cố định); validate không tăng `usedCount`; chặn hết hạn, hết lượt, cap theo tổng; áp coupon + dùng points + cập nhật điểm **trong giao dịch và đúng 1 lần**. `LoyaltyEntry(orderId,kind)` unique. Chốt công thức điểm 1% từ guide G (cần xác định làm tròn và basis với PO). Người dùng không thể đổi điểm vượt số hiện có khi concurrent orders.
- **Retry frontend:** Trang checkout tái sử dụng `orderId` trong cùng phiên checkout, không POST /orders liên tục. Khi mạng mất/refresh cần kiểm tra lịch sử đơn trước thao tác mới. Chưa có idempotency cho tạo order – đây là **rủi ro chưa xử lý triệt để** và là đầu việc E/F phối hợp trước release.
- **Prisma v7:** schema không chứa URL, `prisma.config.ts` cấp URL. Migration baseline nằm ở `backend/prisma/migrations/20261014000100_foundation_v1` và **chỉ dùng cho DB trống**. DB đã có dữ liệu phải backup và thiết kế migration chuyển đổi riêng; tuyệt đối không `migrate reset` trên dữ liệu cần giữ.

## 6. Ranh giới được phép thay đổi

1. Mỗi thành viên tạo branch `feature/<A-G>-<ten-feature>`, chỉ sửa file sở hữu. Nếu cần sửa file shared/module khác: PR kèm ví dụ request/response, test, approval owner; không tự đổi schema giữa Sprint.
2. A review `/contracts`, `/prisma`, `/common`, `frontend/lib/api.ts`, `frontend/app/layout.tsx`, Docker/CI. Chốt API/DB trước khi triển khai; nếu phải đổi contract, tăng version và thông báo các bên dùng nó.
3. Test của người thực hiện phải thể hiện cả happy path, validation, cạnh tranh đồng thời (đối với E/F/G) và thất bại. `it.todo` **không được tính pass cho DoD của feature**.
4. Ưu tiên merge: A contract/migration → B + D → C → E → F + G → integration. Tuy vậy mỗi người có thể code song song trên fixtures/mock mà không đợi module khác hoàn tất.

## 7. Release gates và bằng chứng cần có

**G0 / Contract Freeze:** A-G thống nhất owner, enum, API, price, migration, retry, coupon; `node scripts/verify-foundation.mjs` PASS. Cần ghi một quyết định nhóm cụ thể trước phát triển.

**G1 / Skeleton:** `npm ci` và `npx prisma generate`, `npm run build` ở backend, `npm run lint && npm run build` frontend; migration qua `npx prisma migrate deploy` với DB mới; Docker Compose đủ 3 services và DB health. Không được dùng run chưa thực hiện làm bằng chứng.

**G2 / Feature tests:** B menu 200/404; C persist/thao tác; D 401/409; E transaction/stock & state; F idempotency/mất mạng; G coupon quota & loyalty. Mỗi PR có test log thực tế.

**G3 / Integration:** Login → menu → detail/size/topping → cart → POST order → payment wallet/card (ok/failed) → confirm → history; đồng thời race stock, payment duplicate, loyalty exactly-once. Kiểm tra docker từ clean clone.

**G4 / Bàn giao Scrum:** Backlog 10 task, Sprint Planning/Review/Retrospective, commit Git, README, demo end-to-end; đề bài 10 task mỗi task 1 điểm, không đồng nghĩa độ khó bằng nhau.

## 8. Lệnh chạy / giới hạn kiểm chứng

```bash
node scripts/verify-foundation.mjs
cd backend
npm ci
npx prisma validate
npx prisma migrate deploy    # PostgreSQL đang chạy và DATABASE_URL thiết lập
npx prisma generate
npm run build
npm test
npm run test:e2e           # có Postgres+DATABASE_URL
cd ../frontend
npm ci
npm run lint
npm run build
cd ..
docker compose up --build
```

Node version khuyến nghị: **Node 24** cho dự án hiện tại (NestJS 12 CLI trong lockfile yêu cầu Node tối thiểu cao hơn 22.16). Build trên môi trường thiếu package hoặc không có Docker/Postgres **chưa thể kết luận xanh**. Phải kiểm tra kết quả CI và demo ở máy nhóm. Filechangeonly chỉ chứa file thêm/sửa, **không xóa/ghi đè file khác**, có manifest và SHA-256 đi kèm.

## 9. Kết luận đang chờ nhóm duyệt (không tự coi là requirement đề gốc)

1. Quy ước phần stock: stock sản phẩm vs stock nguyên liệu; Task 10 dùng demo stock sản phẩm là tối thiểu, nhưng đề gốc nhắc "nguyên liệu/sản phẩm".
2. Hủy đơn PAID/hoàn kho/hoàn điểm; đối với mock payment phải nhất quán trạng thái để không cộng điểm sai.
3. Coupon usage khi đơn PAYMENT_FAILED và nguyên tắc điểm thưởng/đổi điểm; công thức làm tròn 1%.
4. Có cần POST /orders idempotent để tránh duplicate khi mất mạng sau tạo đơn (khuyến nghị có trước release).
5. Cách xác thực cho `coupons/validate` và error envelope chính thức.
