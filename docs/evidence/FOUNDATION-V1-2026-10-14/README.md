# Bằng chứng kiểm tra FOUNDATION V1 — 14/10/2026

Đã chạy các lệnh trong mục 8 của `docs/FOUNDATION-V1.md` trên máy Windows. Các bước local build/test/migration đạt sau khi thử lại `npm ci` backend. **Docker Compose toàn bộ stack chưa đạt**, nên chưa thể chốt G1 hoặc coi FOUNDATION-03 hoàn tất.

Môi trường: Node `v24.15.0`, npm `11.12.1`, Docker `29.8.0`, Compose `v5.5.1`. Source tại commit `c149450400a65b4ad37b0cb082eca06ff2f56fc2`, branch `main`. Múi giờ người dùng: `Asia/Saigon`; metadata ghi thời gian UTC. Xem [môi trường](00-environment.json) và [SHA-256 source](00-source-hashes.json).

## Kết quả lệnh yêu cầu

| Thư mục | Lệnh | Kết quả thực tế | Log |
|---|---|---|---|
| Gốc | `docker compose up --build` | **FAIL**, exit 1: thiếu `DATABASE_URL` khi build backend | [01](01-docker-compose-up.log) |
| Gốc | `node scripts/verify-foundation.mjs` | PASS, exit 0 | [02](02-foundation-guard.log) |
| Backend | `npm ci` | Lần đầu FAIL, exit 1: `ECONNRESET`; có cảnh báo cleanup `EPERM`. Thử lại cùng lệnh PASS, exit 0 | [03](03-backend-npm-ci.log), [03b](03b-backend-npm-ci-retry.log) |
| Backend | `npx prisma validate` | PASS, exit 0 | [04](04-backend-prisma-validate.log) |
| Backend | `npx prisma migrate deploy` | PASS, exit 0; áp dụng `20261014000100_foundation_v1` vào DB mới | [05](05-backend-migrate-deploy.log) |
| Backend | `npx prisma generate` | PASS, exit 0; Prisma Client 7.10.0 | [06](06-backend-prisma-generate.log) |
| Backend | `npm run build` | PASS, exit 0 | [07](07-backend-build.log) |
| Backend | `npm test` | PASS, exit 0; **1 test passed, 5 TODO**, 2 file skipped | [08](08-backend-unit-tests.log) |
| Backend | `npm run test:e2e` | PASS, exit 0; **1 test passed** | [09](09-backend-e2e-tests.log) |
| Frontend | `npm ci` | PASS, exit 0 | [20](20-frontend-npm-ci.log) |
| Frontend | `npm run lint` | PASS, exit 0; 0 lỗi, 2 cảnh báo `<img>` | [21](21-frontend-lint.log) |
| Frontend | `npm run build` | PASS, exit 0; TypeScript đạt, tạo 10/10 trang static | [22](22-frontend-build.log) |

Mỗi log có file `.json` cùng tên ghi command, working directory, thời điểm bắt đầu/kết thúc và exit code. Lệnh Compose đầu tiên được ghi bằng PowerShell `Tee-Object`; timestamp trong JSON lấy từ thời điểm tạo/cập nhật log. Các lệnh còn lại dùng [run-command.mjs](run-command.mjs), gọi npm/npx qua Node CLI để tránh `npm.ps1` bị PowerShell execution policy chặn.

## Lỗi Docker đã xác định

Tại `backend/Dockerfile:8`, `RUN npx prisma generate && npm run build` dừng với:

```text
PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL.
```

`backend/prisma.config.ts` đọc `env('DATABASE_URL')` khi tải config. Compose cấp biến này ở môi trường runtime của backend; Dockerfile chưa cấp biến cho bước build, và `.env` bị loại khỏi build context. Bước build Next.js trong Docker hoàn tất, nhưng export image frontend bị hủy khi backend thất bại. Backend/frontend container chưa khởi động. Cần cấp một URL phù hợp cho bước generate lúc build trước khi kiểm tra lại toàn bộ Compose.

## Bằng chứng PostgreSQL và migration

Sau lỗi Compose, đã chạy riêng `docker compose up -d --wait db` để tiếp tục các kiểm tra local. Trước phiên này chưa có container hoặc volume BrewLite; Compose tạo mới `brewlite_dbdata`. DATABASE_URL cho các lệnh backend được dựng từ cấu hình Compose với host `127.0.0.1`, port `5432`; thông tin xác thực không được ghi vào log. JWT_SECRET cũng được lấy từ cấu hình Compose cho tiến trình kiểm tra backend.

- [30](30-database-up.log): tạo volume/container mới, PostgreSQL healthy.
- [31](31-db-before-migration.log): schema `public` có **0 bảng** trước migration.
- [33](33-db-volume.log): timestamp tạo volume mới.
- [05](05-backend-migrate-deploy.log): baseline được áp dụng thành công.
- [10](10-backend-migration-status.log): không còn migration chờ áp dụng.
- [34](34-db-after-migration.log): **7 bảng ứng dụng + `_prisma_migrations`**; migration có `finished_at`, 1 applied step, không rollback.
- [35](35-compose-final-status.log): cuối phiên chỉ service `db` đang chạy và healthy, ở port 5432.

Không chạy seed: Docker backend chưa tới bước startup, và mục 8 không có lệnh seed. Dữ liệu DB mới được giữ lại để kiểm tra tiếp.

## Giới hạn của kết quả

5 TODO về state machine, stock concurrency và payment idempotency chưa được thực thi và **không được tính là test pass cho G2**. E2E hiện chỉ kiểm tra `GET /` trả `Hello World!`, không truy vấn DB; bằng chứng DB đến từ migration và truy vấn SQL riêng. Chưa có bằng chứng cho luồng nghiệp vụ tích hợp G3 hoặc release hoàn tất.

`npm ci` báo backend 9 vulnerabilities (2 low, 1 moderate, 6 high), frontend 5 high; đây là thông báo từ lần cài dependency, chưa có audit chi tiết. Lint cảnh báo ở `frontend/app/page.tsx:27` và `frontend/app/products/[id]/page.tsx:38`.

Phiên này chỉ thêm tài liệu/log bằng chứng; không sửa source, lockfile hay Dockerfile. [summary.json](summary.json) tổng hợp các lần chạy; [SHA256SUMS.json](SHA256SUMS.json) ghi hash các artifact trong thư mục này.
