# BrewLite — Identity & Authentication Module (Owner: D)

Tài liệu kỹ thuật và hướng dẫn tích hợp dành cho module Xác thực & Phân quyền (**Identity / Auth**) của hệ thống BrewLite, tuân thủ chặt chẽ **Master Contract** (`contracts/brewlite-v1.json`).

---

## 1. Kiến trúc Tổng quan (Module Architecture)

Module Identity nằm tại `backend/src/auth/`, đảm nhiệm:
- **Đăng ký tài khoản (Register):** Tiếp nhận thông tin, chuẩn hoá email, băm mật khẩu bảo mật và phòng chống race condition khi trùng email.
- **Đăng nhập (Login):** Thẩm tra thông tin đăng nhập, xác thực bằng bcrypt, cấp phát JWT `accessToken`.
- **Bảo vệ Endpoint (Route Protection):** Cung cấp `JwtAuthGuard` và Decorator `@CurrentUser()` làm cổng kiểm soát xác thực danh tính cho toàn bộ API của hệ thống.
- **Ranh giới Hợp đồng Công khai (`public.ts`):** Là facade duy nhất cho các module khác (**E - Ordering**, **F - Payments**) import và sử dụng. Không module nào được phép import trực tiếp controller, service, dto nội bộ của Auth (được kiểm soát tự động bởi `scripts/verify-foundation.mjs`).

```
backend/src/auth/
├── auth.controller.ts         # Controller: POST /auth/register, POST /auth/login
├── auth.dto.ts                # DTO kiểm tra đầu vào (class-validator)
├── auth.module.ts             # NestJS Module đăng ký JwtModule & Passport
├── auth.service.ts            # Xử lý logic băm mật khẩu, so sánh bcrypt, sinh JWT
├── current-user.decorator.ts  # Param decorator trích xuất AuthUser từ request.user
├── jwt-auth.guard.ts          # Guard chặn 401 khi thiếu hoặc sai token
├── jwt.strategy.ts            # Passport JWT Strategy xác minh chữ ký & thời hạn
├── public.ts                  # Public Facade xuất JwtAuthGuard, CurrentUser, AuthUser
└── README.md                  # Tài liệu kỹ thuật này
```

---

## 2. Tiêu Chuẩn & Đánh Giá Bảo Mật (Security Review)

### 2.1. Chính sách Băm mật khẩu (Password Hashing Review)
- **Thuật toán:** `bcryptjs` với độ phức tạp `12 rounds` (`PASSWORD_ROUNDS = 12`).
  - Hệ số 12 rounds tương đương $2^{12} = 4096$ vòng lặp băm, tạo độ trễ tính toán vừa đủ (~200ms-300ms) để triệt tiêu nguy cơ tấn công brute-force và từ điển offline bằng GPU, trong khi vẫn tối ưu cho CPU máy chủ.
- **Giới hạn 72 byte của Bcrypt:** Thuật toán Bcrypt tự nhiên cắt ngắn chuỗi mật khẩu vượt quá 72 byte. Để ngăn chặn các cuộc tấn công DoS payload lớn và tính nhất quán, [AuthDto](file:///c:/Users/Admin/Documents/brewlite/backend/src/auth/auth.dto.ts) áp đặt:
  ```typescript
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
  ```
- **Chuẩn hoá Email:** Mọi email đều được xử lý qua `email.trim().toLowerCase()` trước khi ghi DB hoặc đối chiếu, loại bỏ tình trạng tạo nhiều tài khoản do khoảng trắng hoặc ký tự hoa/thường.
- **Tuyệt đối không rò rỉ `passwordHash`:**
  - `prisma.user.create` luôn sử dụng `select: { id: true, email: true }`.
  - Phản hồi HTTP 201 không bao giờ chứa trường `passwordHash`.
  - Mật khẩu gốc và chuỗi băm không bao giờ được in ra console hoặc ghi vào log hệ thống.

### 2.2. Quản lý Biến Môi Trường JWT (`JWT_SECRET`)
- **Cấu hình:** Secret key được nạp từ biến môi trường `process.env.JWT_SECRET`.
- **Cơ chế khởi động an toàn (`getJwtSecret()`):**
  ```typescript
  export function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET ?? (process.env.NODE_ENV === 'test' ? 'brewlite-test-jwt-secret-minimum-32-chars' : undefined);
    if (!secret) {
      throw new Error('JWT_SECRET phải được cấu hình trước khi khởi động xác thực');
    }
    return secret;
  }
  ```
- **Quy tắc:**
  - Ở môi trường `production`, nếu thiếu biến `JWT_SECRET`, ứng dụng sẽ chủ động throw Error và dừng khởi động, tuyệt đối không dùng secret mặc định.
  - Secret test dự phòng chỉ được kích hoạt duy nhất khi `NODE_ENV === 'test'`.
  - Token được ký có thời hạn 1 ngày (`signOptions: { expiresIn: '1d' }`), không dùng token vô hạn.
  - **Quy tắc Refresh Token:** Tuân thủ Master Contract v1.0.0, **không áp dụng refresh token bắt buộc** khi chưa có sự thống nhất và phê duyệt của Product Owner.

### 2.3. Kiểm soát DTO & Whitelist (DTO Whitelist Review)
- Ứng dụng kích hoạt bộ lọc toàn cục tại `backend/src/main.ts`:
  ```typescript
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  ```
- **Cơ chế phòng vệ:**
  - `whitelist: true`: Tự động loại bỏ mọi thuộc tính không được khai báo trong DTO.
  - `forbidNonWhitelisted: true`: Nếu client gửi kèm các trường ngoài luồng (như `role: "ADMIN"`, `isAdmin: true`, `passwordHash: "..."`), server sẽ lập tức ném lỗi **`400 Bad Request`**, ngăn chặn triệt để lỗ hổng Mass Assignment.
  - `transform: true`: Tự động ép kiểu dữ liệu đầu vào theo đúng metadata của DTO.

### 2.4. Bảo vệ Đường dẫn & Phân quyền (Route Protection Review)
- Mọi route được đánh dấu bằng `@UseGuards(JwtAuthGuard)` sẽ kích hoạt `JwtStrategy` kiểm tra:
  1. Header `Authorization: Bearer <token>` có tồn tại hay không. Nếu thiếu -> ném **`401 Unauthorized`**.
  2. Token có hợp lệ, đúng cấu trúc JWT 3 phần hay không. Nếu sai format -> ném **`401 Unauthorized`**.
  3. Chữ ký token có khớp với `JWT_SECRET` hay không. Nếu giả mạo -> ném **`401 Unauthorized`**.
  4. Token có còn trong thời hạn hay không (`ignoreExpiration: false`). Nếu hết hạn -> ném **`401 Unauthorized`**.
  5. Khi thành công, payload `{ sub, email }` được chuẩn hóa thành `AuthUser { userId, email }` và gắn vào `req.user`.

### 2.5. Cảnh báo Bảo mật Lưu trữ Token Phía Client (LocalStorage vs Cookie)
- **Hiện trạng:** Theo yêu cầu bài lab và Guide D, token được lưu tạm thời tại `localStorage` của trình duyệt (`localStorage.setItem('token', accessToken)`).
- **Cảnh báo rủi ro (Guide D):** Việc lưu trữ JWT trong `localStorage` tiềm ẩn nguy cơ bị đánh cắp token nếu ứng dụng xảy ra lỗ hổng Cross-Site Scripting (XSS).
- **Khuyến nghị Production:** Chuyển sang cơ chế lưu trữ JWT trong **`HttpOnly, Secure, SameSite=Lax/Strict Cookie`** để trình duyệt tự động gửi và ngăn chặn mã độc JavaScript truy cập trực tiếp vào token.

---

## 3. Hướng Dẫn Tích Hợp Dành Cho Module Khác (Consumer Integration Guide)

Các module khác (đặc biệt là **Owner E — Ordering** và **Owner F — Payments**) chỉ được phép import từ [backend/src/auth/public.ts](file:///c:/Users/Admin/Documents/brewlite/backend/src/auth/public.ts).

### 3.1. Hướng dẫn cho Module E (OrdersController)
Áp dụng bảo vệ các route `POST /orders` và `GET /orders/me`:

```typescript
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, CurrentUser, type AuthUser } from '../auth/public.js';
import { CreateOrderDto } from './orders.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard) // Bắt buộc đăng nhập
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    // Dùng user.userId từ token đã xác thực, không tin cậy client
    return this.orders.create(user.userId, dto);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    // Chỉ trả về danh sách đơn của user.userId
    return this.orders.findMine(user.userId);
  }
}
```

### 3.2. Hướng dẫn cho Module F (PaymentsController)
Áp dụng bảo vệ route `POST /payments`:

```typescript
import { Controller, Post, Body, Headers, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard, CurrentUser, type AuthUser } from '../auth/public.js';
import { PayDto } from './payments.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
@UseGuards(JwtAuthGuard) // Bắt buộc đăng nhập
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  pay(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PayDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Truyền user.userId vào để đảm bảo User B không thể thanh toán đơn của User A
    return this.payments.pay({
      userId: user.userId,
      orderId: dto.orderId,
      method: dto.method,
      idempotencyKey: key,
    });
  }
}
```

---

## 4. Danh Mục API & Mã Lỗi Chuẩn Hóa

| Endpoint | Method | Auth | Payload | Status | Mã lỗi thường gặp |
|---|---|---|---|---|---|
| `/auth/register` | `POST` | Public | `{ email, password }` | `201 Created` | `400` (Sai DTO / Thuộc tính lạ), `409` (Trùng email) |
| `/auth/login` | `POST` | Public | `{ email, password }` | `201/200 OK` | `400` (Sai DTO), `401` (Sai email hoặc mật khẩu) |
| Protected APIs | Any | `Bearer <JWT>` | Tùy nghiệp vụ | `200/201 OK` | `401` (Thiếu / Sai / Hết hạn token), `404/403` (Sai chủ sở hữu) |

---

## 5. Lệnh Kiểm Thử & Xác Minh (Test Verification)

Mọi thay đổi đều được kiểm thử tự động với độ bao phủ toàn diện:

```powershell
# 1. Chạy toàn bộ Unit Tests của Auth module
cd backend
npm test

# 2. Chạy toàn bộ 22 kịch bản E2E Tests (bao gồm Whitelist, Expiry, Concurrency, Ownership)
npx vitest run --config ./vitest.config.e2e.ts test/auth.e2e-spec.ts --reporter=verbose

# 3. Kiểm tra mã nguồn với Type-aware Linter (oxlint)
npm run lint

# 4. Kiểm tra Build NestJS
npm run build

# 5. Kiểm tra tính toàn vẹn của Ranh giới Hợp đồng Architecture Guard
cd ..
node scripts/verify-foundation.mjs
```
