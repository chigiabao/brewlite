# BrewLite – Artisan Coffee & Cashless Ordering Platform

> **BrewLite** là hệ thống đặt cà phê và thanh toán không tiền mặt hiện đại, xây dựng theo kiến trúc Micro-modular Monorepo với khả năng chịu tải, phân tách ranh giới module chặt chẽ và cơ chế thanh toán an toàn (Idempotency).

[![Foundation & Sprint 2 CI](https://github.com/chigiabao/brewlite/actions/workflows/foundation.yml/badge.svg)](https://github.com/chigiabao/brewlite/actions/workflows/foundation.yml)
[![Node.js](https://img.shields.io/badge/Node.js-24%20LTS-green.svg)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/Backend-NestJS%2012-ea2849.svg)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%20-black.svg)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/ORM-Prisma%207-2d3748.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-336791.svg)](https://www.postgresql.org/)

---

## 📑 Mục lục

1. [Tổng quan kiến trúc](#-tổng-quan-kiến-trúc)
2. [Cấu trúc thư mục](#-cấu-trúc-thư-mục)
3. [Công nghệ sử dụng](#-công-nghệ-sử-dụng)
4. [Bảng tiến độ tính năng (Task 1 – 10)](#-bảng-tiến-độ-tính-năng-task-1--10)
5. [Hướng dẫn cài đặt & Khởi chạy](#-hướng-dẫn-cài-đặt--khởi-chạy)
   - [Cách 1: Khởi chạy nhanh bằng Docker Compose](#cách-1-khởi-chạy-toàn-bộ-hệ-thống-bằng-docker-compose-khuyên-dùng)
   - [Cách 2: Chạy trực tiếp trên máy (Local Development)](#cách-2-khởi-chạy-từng-dịch-vụ-trực-tiếp-local-development)
6. [Tài khoản thử nghiệm (Demo Accounts)](#-tài-khoản-thử-nghiệm-demo-accounts)
7. [Kiểm thử & Đảm bảo chất lượng (QA & Testing)](#-kiểm-thử--đảm-bảo-chất-lượng-qa--testing)

---

## 🏛 Tổng quan kiến trúc

Hệ thống hoạt động theo mô hình Client-Server phân tách độc lập:

```
[ Frontend: Next.js App Router ] (Port 3000)
             │
             │ REST API / JSON (Bearer JWT Token)
             ▼
[ Backend: NestJS Micro-modular API ] (Port 3001)
   ├── Auth (JWT + Bcrypt)
   ├── Products (Danh mục & Menu)
   ├── Orders (State Machine & Stock concurrency)
   ├── Payments (Mock Gateway & Idempotency)
   └── Rewards (Voucher GIAM10 & Loyalty points)
             │
             │ Prisma ORM
             ▼
[ Database: PostgreSQL 16 ] (Port 5432)
```

- **Ranh giới module (Module Boundary Guard):** Không cho phép các module backend import nội bộ của nhau; giao tiếp bắt buộc qua `public.ts` (được bảo vệ nghiêm ngặt bằng script `verify-foundation.mjs`).
- **An toàn giao dịch (Idempotency):** Thanh toán hỗ trợ header `Idempotency-Key` ngăn chặn trừ tiền 2 lần khi mạng chập chờn hoặc người dùng click liên tục.
- **Tính giá nhất quán:** Cả Frontend và Backend đều tuân thủ hợp đồng đơn giá tại `contracts/brewlite-v1.json`.

---

## 📂 Cấu trúc thư mục

```
brewlite/
├── contracts/                  # Hợp đồng chuẩn dữ liệu & định nghĩa nghiệp vụ
│   └── brewlite-v1.json        # Contract enum, size extra, topping price, module owners
├── backend/                    # NestJS API Server
│   ├── src/
│   │   ├── auth/               # Module xác thực (Đăng ký, Đăng nhập, JWT Passport Guard)
│   │   ├── products/           # Module sản phẩm & danh mục đồ uống
│   │   ├── orders/             # Module đơn hàng, máy trạng thái (Order State Machine), trừ tồn kho
│   │   ├── payments/           # Module thanh toán, mock cổng thanh toán, idempotency replay
│   │   ├── rewards/            # Module điểm thưởng thành viên & áp dụng mã giảm giá (GIAM10)
│   │   ├── prisma/             # Prisma Service & Client connection
│   │   └── common/             # Logic tính giá tập trung (pricing rules)
│   ├── prisma/
│   │   ├── schema.prisma       # Định nghĩa Schema cơ sở dữ liệu PostgreSQL
│   │   ├── migrations/         # Lịch sử migration CSDL
│   │   └── seed.ts             # Dữ liệu mẫu (sản phẩm, tài khoản, coupon, tồn kho)
│   └── test/                   # Kiểm thử tích hợp E2E (Vitest)
├── frontend/                   # Next.js Web Application
│   ├── app/
│   │   ├── page.tsx            # Trang chủ & Menu hiển thị sản phẩm theo danh mục
│   │   ├── products/[id]/      # Trang chi tiết sản phẩm (chọn size S/M/L, chọn topping)
│   │   ├── cart/               # Trang giỏ hàng (LocalStorage Zustand)
│   │   ├── checkout/           # Trang thanh toán (Mã giảm giá, Điểm thưởng, Cổng thanh toán)
│   │   ├── orders/             # Trang lịch sử đơn hàng
│   │   │   └── [id]/confirmed/ # Trang thông báo và chi tiết đơn hàng thành công
│   │   └── login/              # Trang đăng nhập / đăng ký tài khoản
│   ├── components/             # Reusable UI components (AuthHeader, CartLink, ...)
│   ├── lib/                    # API Client, logic tính giá, định dạng tiền tệ
│   ├── store/                  # Quản lý state toàn cục (Cart Store Zustand)
│   └── public/                 # Ảnh sản phẩm thật và tài nguyên tĩnh
├── docs/                       # Tài liệu đồ án & báo cáo
│   ├── AGILE_SCRUM_REPORT.md   # Báo cáo quy trình Agile/Scrum & tiến độ các Sprint
│   ├── FOUNDATION-V1.md        # Đặc tả Foundation V1 & Release Gates
│   ├── diagrams/               # Sơ đồ kiến trúc, tuần tự (Sequence), Use Case (SVG)
│   ├── erd-latex/              # Mã nguồn LaTeX Overleaf vẽ ERD & mô hình hệ thống
│   └── evidence/               # Log và kết quả kiểm thử các Sprint
├── scripts/
│   ├── verify-foundation.mjs   # Script bảo vệ contract và ranh giới module
│   └── collect-sprint2-a-evidence.ps1
├── docker-compose.yml          # Cấu hình Docker chạy DB, Backend và Frontend
├── .github/workflows/          # Quy trình CI tự động kiểm thử trên GitHub Actions
├── .env.example                # Mẫu biến môi trường
└── README.md                   # Tài liệu hướng dẫn dự án
```

---

## 🛠 Công nghệ sử dụng

| Tầng | Công nghệ | Chi tiết sử dụng |
| :--- | :--- | :--- |
| **Frontend** | Next.js (App Router), React 19, Tailwind CSS | Giao diện phong cách Luxury Artisan Coffee, responsive trên mọi thiết bị. |
| **State & Client** | Zustand, Lucide React, Fetch API | Quản lý giỏ hàng offline-first qua LocalStorage, tương tác mượt mà. |
| **Backend** | NestJS 12, Express, TypeScript | Micro-modular, dependency injection, DTO validation (class-validator). |
| **Database & ORM** | PostgreSQL 16, Prisma ORM 7 | Quản lý quan hệ dữ liệu, migrations tự động, atomic transaction. |
| **Security** | Passport JWT, Bcrypt | Mã hóa mật khẩu 12 rounds, bảo vệ endpoint bằng JwtAuthGuard. |
| **Testing** | Vitest, Supertest, Custom Scripts | 114 Unit tests, 56 E2E tests, 100% test suites pass. |
| **DevOps** | Docker, Docker Compose, GitHub Actions | Container hóa toàn bộ hệ sinh thái, CI tự động kiểm tra mỗi commit. |

---

## 🚀 Bảng tiến độ tính năng (Task 1 – 10)

Toàn bộ 10 nhiệm vụ của dự án đã được hoàn thiện 100%:

| Task | Tên nhiệm vụ | Trạng thái | Vị trí triển khai chính |
| :---: | :--- | :---: | :--- |
| **1** | Khởi tạo dự án & Hợp đồng Foundation | ✅ Hoàn thành | `contracts/brewlite-v1.json`, `scripts/verify-foundation.mjs` |
| **2** | Quản lý & API Sản phẩm | ✅ Hoàn thành | `backend/src/products/`, `backend/prisma/` |
| **3** | Giao diện Menu & Danh mục đồ uống | ✅ Hoàn thành | `frontend/app/page.tsx`, ảnh thật tại `frontend/public/img/` |
| **4** | Chi tiết sản phẩm (Tùy chọn Size & Topping) | ✅ Hoàn thành | `frontend/app/products/[id]/page.tsx` |
| **5** | Quản lý Giỏ hàng (Cart) | ✅ Hoàn thành | `frontend/store/cart.ts`, `frontend/app/cart/page.tsx` |
| **6** | API Tạo & Quản lý Đơn hàng | ✅ Hoàn thành | `backend/src/orders/`, tính giá nguyên tử, lưu snapshot đơn |
| **7** | Xác thực & Quản lý Tài khoản (Auth) | ✅ Hoàn thành | `backend/src/auth/`, `frontend/app/login/page.tsx` |
| **8** | Thanh toán & Idempotency Key | ✅ Hoàn thành | `backend/src/payments/`, `frontend/app/checkout/page.tsx` |
| **9** | Xác nhận đơn hàng, Lịch sử & Bàn giao | ✅ Hoàn thành | `frontend/app/orders/[id]/confirmed/`, `docker-compose.yml` |
| **10** | Nghiệp vụ nâng cao (State Machine, Concurrency) | ✅ Hoàn thành | `backend/src/orders/order-state.ts`, `stock.service.ts` |

---

## ⚡ Hướng dẫn cài đặt & Khởi chạy

### Cách 1: Khởi chạy toàn bộ hệ thống bằng Docker Compose (Khuyên dùng)

Yêu cầu máy đã cài đặt [Docker Desktop](https://www.docker.com/).

```bash
# 1. Khởi động toàn bộ CSDL, Backend và Frontend
docker compose up -d --build

# 2. Kiểm tra trạng thái các container
docker compose ps

# 3. Xem log khi cần thiết
docker compose logs -f
```

- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **Backend API:** [http://localhost:3001](http://localhost:3001)
- **Dừng hệ thống:** `docker compose down`

---

### Cách 2: Khởi chạy từng dịch vụ trực tiếp (Local Development)

Yêu cầu: **Node.js 24 LTS** và dịch vụ **PostgreSQL 16** đang chạy ở cổng `5432`.

#### 1. Cấu hình biến môi trường
Tạo file `.env` ở thư mục gốc và `backend/.env`:
```env
DATABASE_URL="postgresql://brew:brew@localhost:5432/brewlite?schema=public"
JWT_SECRET="brewlite-super-secure-jwt-secret-key-256bit-random-value"
FRONTEND_URL="http://localhost:3000"
PORT=3001
```

#### 2. Khởi tạo Cơ sở dữ liệu (Backend)
```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
```

#### 3. Khởi động Backend
```bash
# Đang ở thư mục backend
npm run start:dev
# Backend chạy tại http://localhost:3001
```

#### 4. Khởi động Frontend
Mở một cửa sổ Terminal mới:
```bash
cd frontend
npm install
npm run dev
# Frontend chạy tại http://localhost:3000
```

---

## 👥 Tài khoản thử nghiệm (Demo Accounts)

Hệ thống đã chuẩn bị sẵn các tài khoản mẫu trong cơ sở dữ liệu để kiểm thử toàn diện:

| Phân loại | Email | Mật khẩu | Điểm tích lũy (`loyaltyPoints`) | Mục đích kiểm thử |
| :--- | :--- | :--- | :---: | :--- |
| **Khách hàng thân thiết** | `customer@brewlite.vn` | `password123` | **50** | Đặt món, áp dụng đổi điểm loyalty |
| **Quản trị viên (Admin)** | `admin@brewlite.vn` | `password123` | **100** | Kiểm tra quyền quản trị & điểm cao |
| **Tài khoản mới** | `demo@brewlite.vn` | `password123` | **0** | Kiểm thử đăng ký & đơn hàng đầu tiên |

> **Voucher mẫu:** Nhập mã `GIAM10` tại trang thanh toán để được giảm 10% giá trị đơn hàng.

---

## 🧪 Kiểm thử & Đảm bảo chất lượng (QA & Testing)

Dự án có độ phủ kiểm thử cao, kiểm soát chặt chẽ cả tầng logic, tích hợp và ranh giới hệ thống:

```bash
# 1. Kiểm tra ranh giới Module và tính toàn vẹn của Contract
node scripts/verify-foundation.mjs

# 2. Chạy toàn bộ 114 Unit Tests của Backend
cd backend
npm test

# 3. Chạy 56 E2E Integration Tests (yêu cầu PostgreSQL đang chạy)
npm run test:e2e

# 4. Kiểm tra mã nguồn Frontend (Linting & Build)
cd ../frontend
npm run lint
npm run build
```

---
*Dự án được xây dựng và hoàn thiện theo chuẩn công nghệ phần mềm hiện đại.*
