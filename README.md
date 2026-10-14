# BrewLite

> **Foundation V1:** Đọc [Master Contract + Release Gates](docs/FOUNDATION-V1.md), [Bổ sung guide A–G](docs/GUIDE-DELTA-A-G.md), [Contract JSON](contracts/brewlite-v1.json). Kiểm tra nhanh: `node scripts/verify-foundation.mjs`.
>
> Đây là **khung**, không phải bản release hoàn chỉnh: API nghiệp vụ vẫn còn TODO/501. Các guide PDF chỉ bắt đầu triển khai sau khi nhóm phê duyệt Gate 0.

Ứng dụng đặt cà phê không dùng tiền mặt – Bài tập lớn môn Công nghệ Phần mềm.

## Cấu trúc dự án

```
brewlite/
├── README.md               # Tổng quan cấu trúc dự án
├── docker-compose.yml      # Chạy cả 3 dịch vụ: db, backend, frontend
├── .gitignore
├── backend/                # NestJS + Prisma + PostgreSQL (REST API)
│   ├── README.md           # Cấu trúc backend
│   ├── Dockerfile
│   ├── .env.example        # Biến môi trường mẫu
│   ├── prisma.config.ts    # Cấu hình Prisma
│   ├── prisma/             # Schema CSDL + dữ liệu mẫu
│   ├── src/                # Mã nguồn API (chia theo module)
│   └── test/               # Test tích hợp (e2e)
└── frontend/               # Next.js + TailwindCSS + Zustand + React Query
    ├── README.md           # Cấu trúc frontend
    ├── Dockerfile
    ├── .env.example
    ├── app/                # Các trang (App Router)
    ├── lib/                # API client, bảng giá
    ├── store/              # State giỏ hàng
    └── public/             # File tĩnh (hình ảnh)
```

## Liên kết giữa các phần

```
frontend (Next.js) ──REST/JSON──▶ backend (NestJS) ──Prisma──▶ PostgreSQL
                                        │
                                        └──▶ Mock Payment Gateway
```

## Task theo thư mục

| Task | Nội dung | Vị trí |
|------|----------|--------|
| 1 | Khởi tạo dự án | toàn bộ repo |
| 2 | API sản phẩm | `backend/src/products/`, `backend/prisma/` |
| 3 | Trang Menu | `frontend/app/page.tsx`, `frontend/app/layout.tsx` |
| 4 | Chi tiết sản phẩm | `frontend/app/products/[id]/` |
| 5 | Giỏ hàng | `frontend/store/cart.ts`, `frontend/app/cart/` |
| 6 | API tạo đơn | `backend/src/orders/` |
| 7 | Đăng ký / Đăng nhập | `backend/src/auth/`, `frontend/app/login/` |
| 8 | Thanh toán | `backend/src/payments/`, `frontend/app/checkout/` |
| 9 | Xác nhận, lịch sử, bàn giao | `frontend/app/orders/`, `docker-compose.yml` |
| 10 | Nghiệp vụ nâng cao | `backend/src/orders/order-state.ts`, `stock.service.ts`, `backend/src/payments/` |

Chi tiết: [backend/README.md](backend/README.md) · [frontend/README.md](frontend/README.md)
