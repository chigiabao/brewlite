# BrewLite – Frontend

Next.js (App Router) + TailwindCSS + Zustand + React Query.

## Cấu trúc

```
frontend/
├── app/
│   ├── layout.tsx                  # Khung chung: header, menu điều hướng
│   ├── providers.tsx               # React Query provider
│   ├── globals.css
│   ├── page.tsx                    # (1) Menu – Task 3
│   ├── products/[id]/page.tsx      # (2) Chi tiết, chọn size/topping – Task 4
│   ├── cart/page.tsx               # (3) Giỏ hàng – Task 5
│   ├── login/page.tsx              # Đăng nhập / đăng ký – Task 7
│   ├── checkout/page.tsx           # (4) Thanh toán – Task 8
│   └── orders/
│       ├── page.tsx                # Lịch sử đơn – Task 9
│       └── [id]/confirmed/page.tsx # (5) Xác nhận đơn – Task 9
├── lib/
│   ├── api.ts                      # Hàm gọi API, tự gắn JWT
│   └── pricing.ts                  # Phụ thu size/topping (giống backend/src/common/pricing.ts)
├── store/
│   └── cart.ts                     # Giỏ hàng Zustand, lưu localStorage
└── public/                         # Hình ảnh, file tĩnh
```

Số (1)–(5) ứng với 5 màn hình wireframe ở mục 7 của đề. Chỗ cần làm được đánh dấu `TODO(<người> – Task N)`.
