# FIX 05 — Release Gate, Clean DB, CI và nghiệm thu Scrum (BrewLite)

**Áp dụng trên source đã nhập FIX 01 → FIX 04.** Bản này bổ sung cơ chế *đo kiểm* và minh chứng, **không tự tuyên bố Sprint 3 hoặc release đã pass**.

## 1. Trạng thái có căn cứ tại thời điểm tạo FIX 05 (30/10/2026)

| Gate | Tiêu chí | Bằng chứng hiện có | Trạng thái |
|---|---|---|---|
| G0 – Contract | Source không phá Foundation/Master Contract | Chạy `node scripts/verify-foundation.mjs` trong phiên tạo bản vá | PASS (tĩnh) |
| G1 – Build/Schema | Prisma validate/migrate, backend/frontend lint/build | Log Sprint 2 ngày 24/10 **trước** FIX 01–05 | CHỜ CHẠY LẠI |
| G2 – Business | Unit + E2E có PostgreSQL thực, rollback/idempotency/JWT | FIX 04 có test mới nhưng chưa chạy đầy đủ | CHỜ CHẠY |
| G3 – Docker & E2E | DB sạch + seed x2 + healthy + HTTP 200/401 | Script + GitHub Actions đã cấu hình, **chưa chạy Docker trong phiên này** | CHỜ CHẠY |
| G4 – Bàn giao | Report với log theo commit, demo và review | Có template/bảng truy vết; chưa xác nhận tất cả gate | CHƯA NGHIỆM THU |

**Quy tắc:** Có file test/script ≠ test đã pass. GitHub Actions xanh của commit cũ không xác nhận commit mới. Không tự suy ra 10/10 task đã được nghiệm thu.

## 2. Cách chạy một lệnh trên Windows (khuyến nghị)

Từ thư mục gốc repo đã chép FIX01–FIX05:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-fix05.ps1
```

Yêu cầu: Docker Desktop đang chạy (Linux containers), port **3000/3001/5432** còn trống, Node.js để chạy guard/smoke (khuyến nghị Node **24**). Script tự tạo một **Docker Compose project mới** với volume riêng, không xóa volume của project BrewLite hiện tại. Sau đó chạy:

1. Foundation contract guard và xác minh Compose.
2. Docker Compose build/start đủ 3 service (`--wait`), Prisma migration status.
3. Fingerprint Product/Coupon/User sau seed đầu, seed lần hai, fingerprint phải **giữ nguyên**.
4. Backend lint/build/unit/E2E bằng Vitest bên trong container, frontend lint/build.
5. HTTP smoke menu, product detail, frontend và **401 không JWT** ở Orders, Payments, Rewards.
6. Lưu log/summary vào `docs/evidence/FIX05-YYYYMMDD-HHMMSS-xxxxxxxx/`, luôn thu Docker logs, sau đó dọn **đúng Compose project riêng**.

Nếu port đang bận: dừng các service sử dụng port đó rồi chạy lại. Nếu muốn giữ project kiểm thử để điều tra, thêm `-KeepStack`, sau đó dùng tên `composeProject` trong `summary.json` để dọn `docker compose -p <project> down -v`.

**Cảnh báo:** `-KeepStack` và `down -v` chỉ dùng với **tên project test được sinh ra**, không chạy `docker compose down -v` vô điều kiện với database đang có dữ liệu cá nhân/nhóm. Test E2E sử dụng database tạm có thể xóa, không chạy trên production.

## 3. GitHub Actions tự động

Workflow `.github/workflows/foundation.yml` gồm 4 job: `contract`, `backend`, `frontend`, `docker-smoke`. Bản FIX 05 bổ sung:

- Node 24; backend CI chạy PostgreSQL 16 sạch; migrate, generate, seed lần 1 và 2.
- **Fingerprint** (SHA-256 của tập record quan trọng) chứng minh seed lần 2 không đổi Product/Coupon/User. Count không đổi một mình **chưa đủ**.
- Unit/E2E theo FIX 04; pipeline **đỏ nếu test thất bại**.
- Docker Compose `up --build --wait`, migration status, seed fingerprint + HTTP smoke 200 và 401.
- Artifacts `backend-seed-fingerprints` và `docker-http-smoke` để tải bằng chứng từ GitHub Actions.

GitHub Actions chỉ chạy khi bạn push commit hoặc mở PR lên repo thật. ZIP không chứa lịch sử `.git` và không thể xác minh một workflow đã chạy/chạy xanh trên GitHub.

## 4. Truy vết Task / Sprint và Definition of Done

| Sprint | Task | Phạm vi cần giảng viên xem | Điều kiện nghiệm thu tối thiểu |
|---|---|---|---|
| 1 | 1–4 | Monorepo, Product API, Menu, Detail | lint/build, `GET /products`, product detail và UI hoạt động |
| 2 | 5–7 | Cart, Orders, Identity | JWT bảo vệ tạo đơn, server-side pricing, stock rollback, Cart persist |
| 3 | 8–10 | Payment, confirmation, Rewards, Docker | idempotency, payment fail, cancel/refund quota + point, Docker sạch, test PASS |

**Bằng chứng thực tế của Sprint 3:** chỉ tick nghiệm thu sau khi script `verify-fix05.ps1` hoàn tất PASS, GitHub Actions của **chính commit** xanh và nhóm chạy demo checkout thực tế thành công. Một lỗi E2E/CI khiến gate tương ứng vẫn BLOCKED.

## 5. Sprint Review / Retrospective — ghi theo bằng chứng

- **Done (mã nguồn):** có đủ module B–G, các bản FIX 01–04 và test bổ sung, wiring CI/Docker có sẵn.
- **Verified:** Foundation Guard sau khi nhập FIX 05 (ghi log riêng), các lệnh cú pháp/đọc cấu hình được kiểm tra trong môi trường đóng gói.
- **Pending:** chạy Node 24 + Docker/PostgreSQL + Vitest toàn stack và review trên commit chuẩn; cập nhật số test pass/failed **theo log**, không dùng số liệu cũ.
- **Risk/blocker:** Docker/host port không sẵn; sai cấu hình DB; các test mới có thể phát hiện lỗi nghiệp vụ cần owner E/F/G sửa.
- **Action:** A chạy script và đính kèm evidence; E/F/G xử lý failure nếu có; F demo payment thành công/thất bại; G demo coupon/points; nhóm xác nhận Sprint Review; A tag release sau khi mọi gate PASS.

## 6. Bằng chứng cần nộp

- Link commit Git + PR (ít nhất 1 reviewer) và link workflow run tương ứng.
- `docs/evidence/FIX05-.../summary.json`, `SUMMARY.md`, log của từng bước, `docker-logs.txt`.
- Ảnh/ghi hình demo: menu → cart → login → tạo order → payment → confirmed → history; retry failed; coupon/loyalty.
- Bảng test số lượng thực tế (passed/failed/skipped), số lượng không được tự đặt.
- Trạng thái gate G0–G4 có người duyệt và ngày duyệt.

**Không bao gồm:** khẳng định GitHub Actions hoặc E2E thực tế đã PASS trong môi trường tạo bản vá này.
