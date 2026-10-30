# FIX 09 — Catalog (B) + Cart (C)

**Mốc:** 30/10/2026. **Nền áp dụng:** BrewLite đã cài FIX 01–08.

## 1. Phạm vi sửa

### B — Catalog

- `GET /products` chỉ lấy dữ liệu thực tế từ NestJS. HTTP 500, mất kết nối, dữ liệu sai cấu trúc đều báo lỗi cho UI, **không dùng 10 sản phẩm mock**.
- API trả `[]` thì hiển thị **menu trống** (khác với trường hợp tìm kiếm không khớp từ khóa).
- `GET /products/:id` dùng ID thật. HTTP 404 được phân biệt với lỗi mạng, không tìm trong danh sách giả.
- Dữ liệu sản phẩm bắt buộc: ID số nguyên dương, tên không rỗng, giá và stock không âm, URL ảnh là chuỗi. Không tự gán rating, badge hoặc giá gốc do backend chưa cung cấp.
- Ô sản phẩm nổi bật ở trang chủ chọn từ **danh sách API**, không ghim tên/ID/giá giả. Hình cà phê trên hero chỉ là hình minh họa.
- Thay các con số tiếp thị không có dữ liệu xác minh bằng đặc điểm từ Master Contract (3 size, 2 topping, Ví/Thẻ giả lập).

### C — Cart

- Khóa nhận diện một dòng: `productId + size + tập topping đã loại trùng và sắp xếp`.
- Hai dòng cùng cấu hình gộp quantity; không vượt quá **99 ly/dòng** kể cả khi gọi `add()` lặp; nút +/- tuân theo giới hạn này.
- Chỉ dùng topping hợp lệ trong Master Contract: **Trân châu**, **Kem**.
- Mỗi dòng hợp lệ có tên, ID, size, topping, đơn giá preview và qty hợp lệ.
- Store chỉ persist `items`, vẫn giữ storage key cũ `brewlite-cart` để không mất giỏ khi cập nhật; dữ liệu cũ được lọc và gộp lại lúc hydrate.
- Cart UI không hiển thị giả 'Giỏ trống' trước khi đọc xong localStorage.
- `add()` trả `false` khi một dòng đã đạt 99; Product Detail hiển thị cảnh báo thay vì báo thêm thành công sai.
- Giá cart chỉ để hiển thị; Ordering backend phải tự lấy giá thực và kiểm tra tồn kho.

## 2. Danh sách file của ChangeOnly ZIP

1. `frontend/lib/products-api.ts` — API Catalog.
2. `frontend/app/page.tsx` — Menu và sản phẩm nổi bật.
3. `frontend/app/products/[id]/page.tsx` — Chi tiết sản phẩm và thông báo Cart.
4. `frontend/store/cart-rules.ts` — Quy tắc thuần của Cart (mới).
5. `frontend/store/cart.ts` — Zustand store và persist.
6. `frontend/app/cart/page.tsx` — Giỏ hàng, badge dòng, và hydrate.
7. `frontend/tests/catalog.test.mjs` — Bài test API Catalog (mới).
8. `frontend/tests/cart-rules.test.mjs` — Bài test quy tắc Cart (mới).
9. `docs/FIX09-CATALOG-CART.md` — Hướng dẫn và kết quả kiểm tra.

## 3. Kiểm tra đã chạy

| Phép kiểm | Kết quả |
|---|---|
| `node scripts/verify-foundation.mjs` | PASS |
| `node --experimental-strip-types --test frontend/tests/*.test.mjs` | **25/25 PASS** (18 test FIX09 + 7 test từ trước) |
| Kiểm tra cú pháp các file TS/TSX thay đổi | PASS |
| Type-check 2 file thuần `cart-rules.ts`, `products-api.ts` với global `process` stub cho môi trường không có @types/node | PASS |
| `npm ci`, `next build`, ESLint, Docker/Playwright trên browser thật | **Chưa thực thi trong môi trường dựng bản vá** |

## 4. Cách cài và nghiệm thu trên máy Windows

Giải nén ZIP **vào thư mục gốc BrewLite** đã có FIX 01–08. Giữ cấu trúc thư mục và cho phép ghi đè.

```powershell
cd frontend
npm.cmd ci
npm.cmd run lint
npm.cmd run build
node --experimental-strip-types --test tests/*.test.mjs
cd ..
node scripts/verify-foundation.mjs
```

Chạy Docker/DB như quy trình FIX05 để xác minh trên hệ thống thật. Bốn tình huống cần tự kiểm tra:

1. Tắt backend, reload menu: hiển thị thông báo lỗi, **không có danh sách mock**.
2. Xóa dữ liệu Product trên DB thử nghiệm, reload: báo **menu trống** (không phải lỗi mạng).
3. Thêm cùng món có topping đảo thứ tự: chỉ có một dòng; không vượt 99 ly.
4. Refresh trang `/cart`: các dòng hợp lệ vẫn còn; không báo giỏ trống giả trong lúc hydrate.

**Ghi chú:** Khi thử xóa Product, chỉ làm trên database demo riêng; không xóa dữ liệu có đơn hàng liên kết. `GET /products` phản ánh DB được seed bởi B/A.

## 5. Hạn chế còn lại

- Không có test trình duyệt tự động mới vì không có dependency Next/React và Docker chạy trong môi trường tạo bản vá.
- Quy tắc giỏ hàng được kiểm tra bằng unit test thuần. Toàn bộ luồng Product → Cart → Checkout → Order vẫn cần E2E nghiệm thu.
- Không đổi API/DB/schema/backend; không cần migration.
