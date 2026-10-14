# BrewLite – Backend

NestJS + Prisma + PostgreSQL.

## Cấu trúc

```
backend/
├── prisma.config.ts            # Cấu hình Prisma (đường dẫn schema, DATABASE_URL, lệnh seed)
├── prisma/
│   ├── schema.prisma           # Bảng: Product, User, Order, OrderItem, Payment, Coupon
│   ├── migrations/            # Baseline migration DB mới (A review)
│   └── seed.ts                 # Dữ liệu menu mẫu
├── src/
│   ├── main.ts                 # Khởi động server: CORS, ValidationPipe, cổng 3001
│   ├── app.module.ts           # Module gốc, gom các module bên dưới
│   ├── generated/prisma/       # Prisma Client (tự sinh, không commit)
│   ├── prisma/                 # PrismaService dùng chung toàn app
│   ├── common/
│   │   └── pricing.ts          # Phụ thu size/topping (giống frontend/lib/pricing.ts)
│   ├── products/               # Task 2 – GET /products, GET /products/:id
│   │   ├── products.controller.ts
│   │   └── products.service.ts
│   ├── auth/                   # Task 7 – đăng ký, đăng nhập, JWT
│   │   ├── auth.controller.ts  # POST /auth/register, /auth/login
│   │   ├── auth.service.ts
│   │   ├── auth.dto.ts         # Validate email, mật khẩu
│   │   ├── jwt.strategy.ts     # Đọc token từ header Authorization
│   │   ├── jwt-auth.guard.ts   # Guard bảo vệ route cần đăng nhập
│   │   └── current-user.decorator.ts
│   ├── orders/                 # Task 6, 9, 10
│   │   ├── orders.controller.ts  # POST /orders, GET /orders/me
│   │   ├── orders.service.ts
│   │   ├── orders.dto.ts         # Validate giỏ hàng gửi lên
│   │   ├── order-state.ts        # Task 10 – State machine (assertTransition)
│   │   ├── order-state.spec.ts   # Test (a)
│   │   └── stock.service.ts      # Task 10 – Tồn kho, optimistic locking
│   └── payments/               # Task 8, 10
│       ├── payments.controller.ts  # POST /payments (header Idempotency-Key)
│       ├── payments.service.ts
│       ├── payments.dto.ts
│       ├── mock-gateway.service.ts # Cổng thanh toán giả lập
│       └── payments.spec.ts        # Test (b), (c)
└── test/                       # Test e2e
```

Module Rewards mới: `src/rewards/` (G, coupon/loyalty), contract chung: `src/contracts/public.ts` (A). Chốt spec trong `../docs/FOUNDATION-V1.md` trước khi code.

Mỗi chỗ cần làm được đánh dấu `TODO(<người> – Task N)`. Endpoint chưa làm trả lỗi 501.
