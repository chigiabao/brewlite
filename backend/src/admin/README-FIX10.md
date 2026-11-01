# FIX 10 — bảo vệ API quản trị (JWT + RBAC)

- `GET/POST/PATCH/PUT/DELETE /admin/*`: bắt buộc JWT hợp lệ. Không token / token hết hạn => **401**.
- JWT hợp lệ nhưng role trong database không phải `ADMIN` => **403**. User bị xóa hoặc vừa bị thu hồi quyền cũng bị chặn.
- Không có trường role trong `/auth/register`, vì vậy đăng ký mới luôn là `CUSTOMER`; `role`/`isAdmin` gửi kèm bị `ValidationPipe` từ chối.
- Không tin email hoặc thuộc tính `role` trong JWT. Backend đọc `User.role` theo `sub` đã xác thực trên mỗi request.
- `GET /admin/session` (JWT Admin) trả `{ userId, email, role: 'ADMIN' }` cho frontend xác nhận quyền, không chỉ decode JWT.

## Áp dụng trên database cũ

```bash
cd backend
npm ci
npx prisma migrate deploy
npx prisma generate
```

**Migration không tự nâng quyền bất cứ tài khoản cũ nào.** Mọi người bắt đầu với `CUSTOMER`, cần cấp quyền cho Admin có kiểm soát:

```bash
# Tạo admin theo /auth/register (hoặc dùng tài khoản hiện có đã xác minh chủ sở hữu).
# Chạy trên máy/backend có DATABASE_URL; KHÔNG chạy từ frontend.
ADMIN_EMAIL=admin@gmail.com ADMIN_ACTION=grant ADMIN_NEW_PASSWORD='MatKhauManhMoiTu12KyTu' npx tsx scripts/set-admin-role.ts
# Thu hồi ngay: ADMIN_EMAIL=admin@gmail.com ADMIN_ACTION=revoke npx tsx scripts/set-admin-role.ts
```

PowerShell (Windows):

```powershell
$env:ADMIN_EMAIL='admin@gmail.com'; $env:ADMIN_ACTION='grant'; $env:ADMIN_NEW_PASSWORD='MatKhauManhMoiTu12KyTu'; npx tsx scripts/set-admin-role.ts
```

Chú ý: `prisma/seed.ts` từ FIX 10 chỉ tạo khách hàng demo, không còn tạo tài khoản Admin dùng password công khai. Khi `grant`, script **bắt buộc** `ADMIN_NEW_PASSWORD` dài 12–72 byte và đổi mật khẩu cùng lúc cấp quyền, tránh giữ password demo công khai. Nên nhập password riêng trên máy và không commit vào repo. Trước khi chạy, cần xác minh người nhận quyền.

## Test

```bash
cd backend
npm run test -- src/admin/admin-role.guard.spec.ts
npm run test:e2e -- test/admin-authz.e2e-spec.ts
```

Sau FIX 10, đăng nhập Admin bằng trang `/login` với thông tin đã cấu hình. Frontend `/admin` xác thực bằng `/admin/session`.
