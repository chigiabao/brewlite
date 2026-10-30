# BÁO CÁO DỰ ÁN CÔNG NGHỆ PHẦN MỀM: BREWLITE (VER 1.0)
## QUY TRÌNH PHÁT TRIỂN PHẦN MỀM THEO MÔ HÌNH AGILE SCRUM
**Trường Đại học Sài Gòn — Khoa Công nghệ Thông tin**  
**Học kỳ I – Năm học 2026–2027**

---

> **Cập nhật kiểm chứng FIX 05 — 30/10/2026:** Bảng burndown 20 story points và các số liệu “Actual” bên dưới là **minh họa quy trình**, không phải log tiến độ thực đo. Các khẳng định “PASS 100% / 112 test cases” trong nội dung trước đây **chưa được kiểm chứng lại** sau FIX 01–05. Trạng thái nghiệm thu hiện hành phải căn cứ `docs/FIX05-RELEASE-ACCEPTANCE.md`, log của `scripts/verify-fix05.ps1` và GitHub Actions của đúng commit. **Không báo hoàn thành Sprint 3 nếu chưa qua G2–G4.**

## 1. TỔNG QUAN DỰ ÁN & PRODUCT VISION

### 1.1. Product Vision (Tầm nhìn sản phẩm)
> *"BrewLite giúp khách hàng đặt và thanh toán đồ uống không dùng tiền mặt chỉ trong vài chạm, giảm thời gian xếp hàng và nhận đơn nhanh tại quầy."*

### 1.2. Các bên liên quan (Stakeholders)
- **Khách hàng (Customer):** Đặt đồ uống, tùy biến kích cỡ (size) & topping, thanh toán ví điện tử/thẻ ngân hàng không dùng tiền mặt, theo dõi lịch sử và trạng thái đơn hàng.
- **Nhân viên quầy / Barista:** Tiếp nhận thông tin đơn đã thanh toán (`PAID`), thực hiện pha chế và chuyển trạng thái đơn sang `READY` / `COMPLETED`.
- **Thủ kho / Inventory Manager:** Theo dõi mức tồn kho nguyên liệu/sản phẩm theo thời gian thực, nhập kho và nhận cảnh báo khi sắp hết hàng.
- **Product Owner (PO) / Quản lý cửa hàng:** Xác định yêu cầu, lập thứ tự ưu tiên Product Backlog và nghiệm thu Increment sau mỗi Sprint.
- **Giảng viên nghiệm thu:** Đánh giá tính tuân thủ quy trình Agile Scrum, chất lượng mã nguồn, kiểm thử tự động và mức độ đáp ứng Definition of Done (DoD).
- **Nhóm phát triển (Development Team):** Phân tích yêu cầu, thiết kế kiến trúc Monorepo (Next.js + NestJS), lập trình, viết unit/integration tests và bàn giao hệ thống.

---

## 2. QUY TRÌNH AGILE SCRUM

### 2.1. Vai trò (Roles), Sự kiện (Events), Tạo phẩm (Artifacts)
- **Vai trò:**
  - *Product Owner (PO):* Quản lý Product Backlog, làm rõ Acceptance Criteria.
  - *Scrum Master (SM):* Điều phối quy trình, tổ chức các cuộc họp Daily Scrum, gỡ bỏ rào cản (impediments).
  - *Development Team:* Lập trình Fullstack (Frontend Next.js, Backend NestJS, Database PostgreSQL qua Prisma).
- **Sự kiện Scrum:**
  - *Sprint Planning:* Lập kế hoạch Sprint, ước lượng Story Points, chọn task từ Product Backlog đưa vào Sprint Backlog.
  - *Daily Scrum:* Họp định kỳ 15 phút mỗi ngày (Đã làm gì hôm qua? Hôm nay làm gì? Có khó khăn gì?).
  - *Sprint Review:* Trình diễn Increment chạy được (working software) cho PO và Giảng viên.
  - *Sprint Retrospective:* Rút kinh nghiệm (Điều làm tốt, điều cần cải thiện, hành động tiếp theo).
- **Tạo phẩm Scrum:**
  - *Product Backlog:* Danh sách 10 task chính (tổng 10 điểm).
  - *Sprint Backlog:* Tập hợp các hạng mục và công việc cần làm cho từng Sprint cụ thể.
  - *Increment:* Bản dựng phần mềm chạy được (chạy được cả monorepo qua Docker Compose).

---

### 2.2. Kế hoạch 3 Sprint (Sprint Roadmap)

| Sprint | Thời lượng | Mục tiêu Sprint (Sprint Goal) | Hạng mục Task hoàn thành | Kết quả bàn giao (Increment) |
| :--- | :---: | :--- | :--- | :--- |
| **Sprint 1** | 2 tuần | **Nền tảng & Hiển thị Menu** | Task 1, 2, 3, 4 | Monorepo chạy được, Docker compose DB, API `GET /products`, UI Menu lưới, Trang chi tiết chọn size/topping. |
| **Sprint 2** | 2 tuần | **Giỏ hàng & Đặt đơn & Đăng nhập** | Task 5, 6, 7 | Giỏ hàng Zustand lưu LocalStorage, API `POST /orders` trạng thái `PENDING`, Xác thực JWT + Bcrypt, Guard bảo vệ route. |
| **Sprint 3** | 2 tuần | **Thanh toán, Bàn giao & Nghiệp vụ nâng cao** | Task 8, 9, 10 | Thanh toán mock Ví/Thẻ `POST /payments`, Màn hình xác nhận & Lịch sử `GET /orders/me`, Order State Machine, Concurrency kho, Idempotency, Khuyến mãi & Loyalty. |

---

### 2.3. Sprint Burndown Chart (Biểu đồ tiến độ Sprint 2 tuần - 10 ngày làm việc)

Biểu đồ theo dõi số Story Points còn lại giảm dần từ 20 điểm về 0:

| Ngày làm việc | Story Points Lý tưởng (Ideal) | Story Points Thực tế (Actual) | Ghi chú tiến độ |
| :---: | :---: | :---: | :--- |
| **Ngày 0** | 20 | 20 | Bắt đầu Sprint, kickoff Sprint Planning |
| **Ngày 1** | 18 | 19 | Setup cấu trúc & mock adapter |
| **Ngày 2** | 16 | 17 | Hoàn thành API ban đầu |
| **Ngày 3** | 14 | 15 | Kết nối giao diện Next.js |
| **Ngày 4** | 12 | 14 | Gặp khó khăn đồng bộ kiểu dữ liệu (Daily Scrum giải quyết) |
| **Ngày 5** | 10 | 11 | Hoàn thành logic core nghiệp vụ |
| **Ngày 6** | 8 | 8 | Bắt kịp tiến độ lý tưởng |
| **Ngày 7** | 6 | 6 | Viết Unit & Integration tests |
| **Ngày 8** | 4 | 4 | Tích hợp End-to-End |
| **Ngày 9** | 2 | 2 | Code review & kiểm tra Definition of Done |
| **Ngày 10**| 0 | 0 | Sprint Review & Demo bàn giao cho Giảng viên |

```
Story Points
20 | * (Ngày 0)
18 |  \
16 |   \        --*-- Thực tế (Actual)
14 |    \      /
12 |     \    *
10 |      \  /
 8 |       * (Ngày 6: Bắt kịp đường lý tưởng)
 6 |        \
 4 |         *
 2 |          \
 0 +-----------* (Ngày 10: Hoàn thành 100%)
   0  1  2  3  4  5  6  7  8  9  10 (Ngày làm việc)
```

---

## 3. BẢNG PHÂN RÃ 10 TASK PRODUCT BACKLOG THEO ĐỀ BÀI (10 ĐIỂM)

### Task 1: Khởi tạo dự án và cấu trúc (1 điểm)
- **Yêu cầu:** Monorepo/2 thư mục frontend (Next.js) + backend (NestJS), chạy được "Hello", có README, Git, `.env.example`.
- **Kết quả:** Cấu trúc phân tách rõ ràng, `.env.example` đầy đủ, thiết lập CI GitHub Actions tự động kiểm tra lint và build.

### Task 2: API danh sách sản phẩm (1 điểm)
- **Yêu cầu:** NestJS `GET /products` trả về JSON menu (id, tên, giá, ảnh) từ dữ liệu mẫu / CSDL PostgreSQL.
- **Kết quả:** `ProductsController` và `ProductsService` trả về danh sách sản phẩm kèm thông tin tồn kho (`stock`), phân loại danh mục (Cà phê phin, Espresso, Trà thảo mộc, Bánh ngọt).

### Task 3: Trang Menu Frontend (1 điểm)
- **Yêu cầu:** Next.js gọi `/products`, render lưới sản phẩm, có loading / empty state.
- **Kết quả:** Thiết kế giao diện sang trọng (Artisan Coffee theme), hỗ trợ tìm kiếm theo tên, lọc danh mục, hiệu ứng hover, loading skeleton mượt mà và cơ chế fallback offline an toàn.

### Task 4: Chi tiết và tùy chọn sản phẩm (1 điểm)
- **Yêu cầu:** Màn hình chi tiết: chọn size (S/M/L) và topping; tính giá theo tùy chọn.
- **Kết quả:** Trang `/products/[id]` cho phép tùy biến: Size S (giá gốc), M (+5.000đ), L (+10.000đ); topping (Trân châu trắng, Kem cheese, Thạch cà phê); cập nhật tổng giá tức thời theo công thức chuẩn.

### Task 5: Giỏ hàng (Cart) (1 điểm)
- **Yêu cầu:** Thêm/sửa số lượng/xóa; lưu state (Zustand/Context); tự tính tổng tiền; badge số lượng.
- **Kết quả:** Store Zustand với middleware `persist` lưu LocalStorage; hiển thị badge số lượng món trên Header (`cart-badge-count`); tính tổng tiền chuẩn xác; hỗ trợ tăng giảm số lượng hoặc xóa món.

### Task 6: API tạo đơn hàng (1 điểm)
- **Yêu cầu:** NestJS `POST /orders` nhận giỏ hàng, validate (`class-validator`), lưu đơn trạng thái `PENDING`, trả mã đơn.
- **Kết quả:** Xác thực payload chặt chẽ bằng DTO, tính lại giá gốc trên server chống gian lận giá, kiểm tra tồn kho trong database transaction, lưu đơn `PENDING` và trả về `id`.

### Task 7: Đăng ký / Đăng nhập (JWT) (1 điểm)
- **Yêu cầu:** `POST /auth/register`, `/auth/login`; băm mật khẩu (`bcrypt`); phát JWT; **guard bảo vệ route đặt đơn**.
- **Kết quả:** Mật khẩu băm an toàn 12 rounds qua bcrypt; phát token JWT chuẩn; `JwtAuthGuard` bảo vệ toàn diện các endpoint tạo đơn và lịch sử đơn của `OrdersController`.

### Task 8: Thanh toán không tiền mặt (1 điểm)
- **Yêu cầu:** Tích hợp mock payment: chọn Ví/Thẻ, gọi `POST /payments`; đơn chuyển `PAID` khi thành công, `PAYMENT_FAILED` khi lỗi.
- **Kết quả:** Hỗ trợ 2 phương thức không tiền mặt (Ví điện tử MoMo/ZaloPay và Thẻ ATM/Visa); gọi `POST /payments` có `Idempotency-Key`; cập nhật trạng thái đơn atomically. Tích hợp sẵn nút demo kiểm chứng lỗi thanh toán (US-05).

### Task 9: Xác nhận, lịch sử đơn & Bàn giao (1 điểm)
- **Yêu cầu:** Màn hình xác nhận (mã đơn, trạng thái) và `GET /orders/me` (lịch sử đơn); Docker Compose chạy cả 3 (frontend, backend, DB); README; demo end-to-end.
- **Kết quả:** 
  - Màn hình xác nhận `/orders/[id]/confirmed` chuẩn Wireframe 5.
  - Trang lịch sử đơn `/orders` phân loại màu badge trạng thái (`PAID`, `PREPARING`, `READY`, `COMPLETED`, `CANCELLED`, `PAYMENT_FAILED`).
  - File `docker-compose.yml` khởi chạy trơn tru 3 dịch vụ: `db` (Postgres 16), `backend` (NestJS 3001), `frontend` (Next.js 3000).

### Task 10: Nghiệp vụ backend nâng cao (1 điểm)
- **Yêu cầu 1 - Order State Machine:** `PENDING → PAID → PREPARING → READY → COMPLETED`; chặn chuyển trạng thái không hợp lệ qua hàm `assertTransition`.
- **Yêu cầu 2 - Thanh toán Idempotent:** Header `Idempotency-Key` cùng request replay trả về đúng kết quả cũ, chống double-charge/trừ tiền 2 lần.
- **Yêu cầu 3 - Kiểm soát tồn kho đồng thời (Concurrency):** Transaction + Optimistic Locking (`version` increment) đảm bảo khi nhiều khách đặt cùng lúc không bao giờ bán vượt tồn kho (`stock >= 0`).
- **Yêu cầu 4 - Khuyến mãi & Loyalty points:** Áp dụng mã giảm giá (`GIAM10`, `BREW10`) hợp lệ và tự động tích lũy 1% điểm thưởng loyalty cho khách sau khi đơn thành công (`PAID`).
- **Chứng minh kiểm thử (Unit / Integration Tests):** **Đang chờ nghiệm thu lại** trên bản FIX01–FIX05; số test và tỷ lệ PASS chính xác lấy từ log thực thi mới, không dùng lại 112 test cases của snapshot trước.

---

## 4. KỊCH BẢN TRÌNH DIỄN (DEMO SPRINT REVIEW CHO GIẢNG VIÊN)

### Luồng 1: Happy Path (Từ chọn món đến nhận đồ uống)
1. Mở trang chủ: Xem thực đơn cà phê với hình ảnh và giá niêm yết.
2. Bấm vào sản phẩm: Chọn Size L (+10k), thêm Topping Kem cheese (+10k).
3. Bấm **"Thêm vào giỏ"**: Badge trên Header nhảy lên `(1)`.
4. Mở Giỏ hàng `/cart`: Kiểm tra số lượng và bấm **"Tiến hành đặt hàng"**.
5. Đăng nhập: Đăng nhập tài khoản `customer@brewlite.vn` (nhận JWT).
6. Trang Thanh toán `/checkout`:
   - Nhập mã coupon `GIAM10` -> Giảm ngay 10% trên tổng đơn.
   - Chọn phương thức: **Ví điện tử**.
   - Bấm **"Xác nhận thanh toán"**.
7. Màn hình Xác nhận `/orders/[id]/confirmed`: Hiển thị mã đơn `#{id}`, trạng thái `PAID`, hướng dẫn mời tới quầy lấy nước.
8. Trang Lịch sử đơn `/orders`: Thấy đơn mới nhất hiển thị trạng thái `Đã thanh toán` (`PAID`).

### Luồng 2: Ngoại lệ US-05 (Thanh toán lỗi -> PAYMENT_FAILED)
1. Khách hàng có 2 món trong giỏ hàng.
2. Tại trang thanh toán, tích chọn ô **"[Demo cho GV]: Mô phỏng thanh toán thất bại"**.
3. Bấm "Xác nhận thanh toán".
4. Hệ thống báo lỗi: *Thanh toán thất bại, đơn chuyển `PAYMENT_FAILED`*.
5. Quay lại giỏ hàng: Toàn bộ món và tùy chọn size/topping **vẫn được giữ nguyên** để khách thử lại phương thức khác mà không cần chọn lại từ đầu.

### Luồng 3: Chứng minh nghiệp vụ nâng cao Task 10 bằng Test Suite
Mở terminal và thực thi lệnh:
```bash
cd backend
npm test
```
Giảng viên sẽ thấy:
- `Order State Machine`: Chặn `PENDING → COMPLETED`, chặn chuyển trạng thái khi đã `COMPLETED` / `CANCELLED`.
- `Payments (idempotency)`: Gửi 2 lần cùng `Idempotency-Key` chỉ tạo đúng 1 Payment và Gateway chỉ gọi 1 lần.
- `Stock (concurrent orders)`: 10 request đặt mua đồng thời khi kho chỉ còn 3 sản phẩm -> Tối đa 3 đơn thành công, 7 đơn bị từ chối, tồn kho không bao giờ bị âm.

---

## 5. SPRINT RETROSPECTIVE (RÚT KINH NGHIỆM)
- **Điều làm tốt (What went well):**
  - Áp dụng chặt chẽ kiến trúc Monorepo, contract interfaces giữa các module rõ ràng.
  - Thiết kế UI hiện đại, chuẩn Responsive trên thiết bị di động và máy tính.
  - Xử lý bài toán concurrency và idempotency chuẩn cấp độ doanh nghiệp (Enterprise pattern).
- **Điểm cần cải thiện (What could be improved):**
  - Môi trường Internet cần cấu hình HTTPS và CORS tương thích khi deploy Vercel + backend đám mây.
  - Cần phát triển thêm màn hình Realtime Kitchen Display System (KDS) cho Barista ở phiên bản Ver 2.0.
