# BrewLite - Module C: Cart Evidence & Delivery Report

- **Module**: C - Cart (Task 5: Giỏ hàng)
- **Version**: GUIDE-V2
- **Date**: 2026-10-15
- **Branch**: `feature/c-cart`
- **Owner**: Developer C

---

## 1. Tóm Tắt Thực Hiện (Executive Summary)
Module C phụ trách trọn vẹn nghiệp vụ Giỏ hàng của BrewLite:
1. Nhận cấu hình sản phẩm từ màn hình Catalog / Product Detail (`useCartStore.getState().add()`).
2. Lưu giỏ hàng trên trình duyệt bằng **Zustand + `localStorage`** (key: `brewlite-cart-v1`, version: 1).
3. Hỗ trợ tăng/giảm số lượng (từ 1 đến 99, chặn min/max ở cả logic và UI), xóa món.
4. Tự động nhóm cùng variant (`productId + size + sorted_unique_toppings`), khác variant thì tạo dòng mới.
5. Giữ nguyên giỏ hàng sau khi refresh trang (Persistence).
6. Hiển thị badge tổng số lượng ly (`total qty`) trên header qua Client Component `<CartLink />` với hydration guard.
7. Điều hướng người dùng sang `/checkout` khi bấm "Thanh toán".
8. **Tuân thủ triệt để phân định giá**: Frontend Cart chỉ tính giá xem trước (`pricing.ts`), không phải giá thẩm quyền. Backend Ordering (E) tự tính lại từ DB.
9. **Tuân thủ quy tắc xóa giỏ**: Giỏ hàng chỉ clear sau khi Payment thành công. Khi Payment thất bại hoặc stock conflict, giỏ hàng được giữ nguyên.

---

## 2. Danh Sách File Bàn Giao (Ownership)
| File | Loại | Mô tả |
| :--- | :--- | :--- |
| `frontend/store/cart.ts` | OWN / EDIT | Quản lý state giỏ hàng, actions `add`, `remove`, `setQty`, `clear`, `total`, `count`, persist |
| `frontend/lib/pricing.ts` | OWN / EDIT | Logic tính giá preview phía client (size + topping surcharges) |
| `frontend/app/cart/page.tsx` | OWN / EDIT | Giao diện trang Cart, hiển thị danh sách, +/- qty, xóa, tổng tiền, empty state, nút thanh toán |
| `frontend/components/cart-link.tsx` | NEW / OWN | Component badge số lượng giỏ hàng trên header với hydration guard |
| `frontend/app/layout.tsx` | EDIT NHẸ | Tích hợp `<CartLink />` vào Header |
| `frontend/tests/unit/pricing.test.ts` | OWN | Unit test bộ tính giá frontend |
| `frontend/tests/unit/cart.test.ts` | OWN | Unit test 12 ca kiểm thử CART-U01 -> CART-U12 |
| `frontend/e2e/cart.spec.ts` | OWN | Playwright E2E test 10 ca kiểm thử CART-E01 -> CART-E10 |
| `BrewLite_GUIDE-V2_C-Cart_2026-10-15.manifest.json` | OWN | Manifest nghiệm thu module C |

---

## 3. Nhật Ký Bằng Chứng (Evidence Files)
- `01-foundation-guard.log`: Kết quả chạy script kiểm tra guard `scripts/verify-foundation.mjs` (PASS).
- `02-frontend-lint.log`: Kết quả chạy `npm run lint` (0 errors, 0 warnings).
- `03-frontend-build.log`: Kết quả Next.js production build (`npm run build`).
- `04-cart-unit-tests.log`: Kết quả chạy toàn bộ unit tests (Vitest: CART-U01 -> CART-U12 + pricing tests).
- `05-cart-e2e-tests.log`: Kết quả chạy E2E tests (Playwright: CART-E01 -> CART-E10).
- `10-product-add.png`: Minh chứng thêm món từ Product Detail có chọn size và topping.
- `11-cart-page.png`: Minh chứng giao diện trang Giỏ hàng với đầy đủ thông tin món, giá và tổng tiền.
- `12-cart-after-refresh.png`: Minh chứng giỏ hàng tồn tại nguyên vẹn sau khi reload trình duyệt.
- `13-cart-qty-total.png`: Minh chứng tính năng tăng giảm số lượng (+/-) và tính lại tổng tiền tức thì.
- `14-cart-localstorage.png`: Minh chứng dữ liệu trong LocalStorage trình duyệt dưới key `brewlite-cart-v1`.
