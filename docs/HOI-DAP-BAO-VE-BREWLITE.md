# 🎯 BrewLite — 40 Câu Hỏi Phản Biện & Bí Kíp Trả Lời Bảo Vệ Đồ Án

> [!TIP]
> **Chiến thuật trả lời trước hội đồng:**
> 1. Trả lời thẳng vào trọng tâm trong 1–2 câu đầu tiên (nói rõ: Có hay Không, Vì sao).
> 2. Dẫn chứng trực tiếp vào giải pháp kỹ thuật trong mã nguồn (Transaction, OCC, Idempotency, Guard).
> 3. Tuyệt đối không phỏng đoán tính năng ngoài phạm vi code thực tế.

---

## 🏛 Nhóm 1: Kiến Trúc & Tổ Chức Hệ Thống

### ❓ Câu 1: Hệ thống của nhóm là Microservices hay Monolith?
* **🎯 Trả lời ngay:** *"Dạ thưa thầy/cô, hệ thống là **Modular Monolith** triển khai trong một **Monorepo**, không phải Microservices ạ."*
* **🔍 Chi tiết kỹ thuật:** Toàn bộ backend chạy chung một tiến trình NestJS và kết nối chung 1 Database PostgreSQL. Nhóm chia các module độc lập theo nghiệp vụ (`auth`, `products`, `orders`, `payments`, `rewards`) và chỉ cho phép giao tiếp qua **Port / public.ts**. Kiến trúc này giúp nhóm tận dụng triệt để ACID Transaction của PostgreSQL để xử lý dòng tiền và tồn kho mà không gặp rủi ro của Distributed Transactions (Saga/2PC).

### ❓ Câu 2: Phân biệt Monorepo và Modular Monolith?
* **🎯 Trả lời ngay:** *"Monorepo là cách tổ chức mã nguồn; Modular Monolith là cách thiết kế kiến trúc backend."*
* **🔍 Chi tiết kỹ thuật:** Monorepo nghĩa là cả Frontend (Next.js) và Backend (NestJS) nằm chung 1 Git repository để đồng bộ contract và pipeline CI/CD. Modular Monolith là việc phân tách cấu trúc module rành mạch bên trong 1 ứng dụng backend duy nhất.

### ❓ Câu 3: Làm sao đảm bảo các thành viên không import bừa bãi vào code của nhau?
* **🎯 Trả lời ngay:** *"Nhóm xây dựng script bảo vệ tự động [`scripts/verify-foundation.mjs`](file:///c:/Users/Gtvkun/Documents/GitHub/brewlite/scripts/verify-foundation.mjs) chặn ngay ở bước CI/CD."*
* **🔍 Chi tiết kỹ thuật:** Script kiểm tra tĩnh (AST regex) toàn bộ câu lệnh import: nếu Module này import file nằm ngoài `public.ts` của Module khác, pipeline GitHub Actions sẽ báo đỏ (Fail) ngay lập tức và chặn không cho merge code.

---

## 🛒 Nhóm 2: Catalog, Giỏ Hàng & Tính Giá

### ❓ Câu 4: Thêm món vào giỏ hàng đã trừ tồn kho chưa? Vì sao?
* **🎯 Trả lời ngay:** *"Chưa ạ. Giỏ hàng chỉ là ý định tạm thời trên trình duyệt, chỉ khi bấm **Đặt hàng** (`POST /orders`) thành công thì server mới khóa tồn kho."*
* **🔍 Chi tiết kỹ thuật:** Nếu trừ kho ngay khi thêm vào giỏ, người dùng vãng lai thêm vào rồi đóng tab bỏ đi sẽ chiếm dụng tồn kho, gây ra hiện tượng hết hàng ảo (Denial of Inventory), khiến khách hàng thật không thể mua được.

### ❓ Câu 5: Giỏ hàng được lưu ở đâu? Tại sao không có bảng `Cart` trong Database?
* **🎯 Trả lời ngay:** *"Giỏ hàng được lưu ở **LocalStorage** của trình duyệt thông qua Zustand store."*
* **🔍 Chi tiết kỹ thuật:** Giỏ hàng là dữ liệu tạm thời (ephemeral data). Việc lưu giỏ ở LocalStorage giúp giảm tải truy vấn cho Database và cho phép khách chưa đăng nhập vẫn cấu hình món mượt mà. Server chỉ chịu trách nhiệm lưu trữ khi giỏ hàng biến thành `Order`.

### ❓ Câu 6: Client có thể sửa giá sản phẩm trước khi gửi lên không?
* **🎯 Trả lời ngay:** *"Dạ hoàn toàn không thể gian lận, vì server áp dụng cơ chế **Server-authoritative Pricing**."*
* **🔍 Chi tiết kỹ thuật:** Request tạo đơn từ client chỉ gửi `productId, size, toppings, qty`. Server tự đọc giá gốc từ bảng `Product` trong CSDL, cộng phụ thu Size và Topping theo công thức chuẩn tại `backend/src/common/pricing.ts`. Dù client có can thiệp sửa request hay giá hiển thị trên UI thì server vẫn chỉ tính giá theo dữ liệu chuẩn trong DB.

---

## 🔐 Nhóm 3: Xác Thực & Bảo Mật (Identity)

### ❓ Câu 7: Mật khẩu người dùng được lưu trữ thế nào?
* **🎯 Trả lời ngay:** *"Mật khẩu được băm một chiều bằng thư viện **Bcrypt** với cost factor là 12 rounds."*
* **🔍 Chi tiết kỹ thuật:** Salt ngẫu nhiên được nhúng kèm trong chuỗi băm. Server không bao giờ lưu mật khẩu bản rõ (plaintext) và không có cơ chế giải mã ngược. Khi đăng nhập, server dùng `bcrypt.compare` để đối chiếu.

### ❓ Câu 8: Token JWT chứa những gì và hết hạn trong bao lâu?
* **🎯 Trả lời ngay:** *"JWT chứa `sub` (userId), `email` và có thời hạn hiệu lực là **1 ngày**."*
* **🔍 Chi tiết kỹ thuật:** Token được ký điện tử bằng thuật toán HS256 với `JWT_SECRET`. Server dùng `JwtAuthGuard` để giải mã và gán danh tính vào request qua decorator `@CurrentUser()`. Mọi API truy vấn dữ liệu cá nhân (như `/orders/me`) đều lấy `userId` từ token này, tuyệt đối không tin cậy `userId` do client gửi trong body.

---

## ⚡ Nhóm 4: Concurrency, Tồn Kho & Transaction

### ❓ Câu 9: Transaction trong `POST /orders` bảo vệ những gì?
* **🎯 Trả lời ngay:** *"Transaction bảo vệ tính nguyên tử của 4 thao tác: Khóa tồn kho, Tạm giữ quota voucher, Trừ điểm thưởng và Tạo đơn hàng."*
* **🔍 Chi tiết kỹ thuật:** Toàn bộ logic chạy trong `prisma.$transaction`. Nếu một trong các bước thất bại (ví dụ: phát hiện hết hàng hoặc điểm thưởng không đủ), toàn bộ transaction sẽ rollback 100%, không bao giờ có tình trạng mất điểm/voucher mà không sinh ra đơn hàng.

### ❓ Câu 10: Hai khách hàng cùng mua ly nước cuối cùng thì xử lý thế nào?
* **🎯 Trả lời ngay:** *"Hệ thống sử dụng câu lệnh cập nhật có điều kiện nguyên tử (Atomic Conditional Update) để chống overselling."*
* **🔍 Chi tiết kỹ thuật:**
  ```sql
  UPDATE "Product" 
  SET stock = stock - :qty, version = version + 1 
  WHERE id = :id AND stock >= :qty;
  ```
  - Khách hàng nào có transaction chạm DB trước sẽ cập nhật thành công (ảnh hưởng 1 dòng).
  - Khách hàng đến sau thấy điều kiện `stock >= :qty` không còn thỏa mãn (ảnh hưởng 0 dòng) ➔ Server phát hiện và ném ngay lỗi `409 Conflict (OUT_OF_STOCK)`, rollback transaction.

### ❓ Câu 11: Tại sao phải sắp xếp `productId` tăng dần trước khi trừ kho?
* **🎯 Trả lời ngay:** *"Để phòng chống hiện tượng **Deadlock** giữa các transaction đồng thời."*
* **🔍 Chi tiết kỹ thuật:** Nếu Transaction 1 khóa món A rồi chờ khóa món B, trong khi Transaction 2 khóa món B rồi chờ khóa món A, hệ thống sẽ rơi vào vòng lặp khóa chết (Deadlock). Bằng cách sắp xếp `productId` tăng dần (A trước, B sau), mọi transaction đều xin cấp khóa theo cùng một thứ tự.

---

## 🔄 Nhóm 5: Idempotency Key & Xử Lý Lặp

### ❓ Câu 12: Idempotency Key giải quyết vấn đề gì?
* **🎯 Trả lời ngay:** *"Ngăn chặn việc trừ tiền hoặc tạo đơn hàng bị lặp lại khi mạng bị lag hoặc người dùng nhấn nút nhiều lần."*
* **🔍 Chi tiết kỹ thuật:** Client sinh UUID gắn vào header `Idempotency-Key`. Server kiểm tra:
  - Nếu Key đã tồn tại và đúng payload: Trả về kết quả đơn hàng cũ đã tạo trước đó, **không trừ kho và không tạo thêm bản ghi mới**.
  - Nếu Key đã tồn tại nhưng payload bị thay đổi: Trả về lỗi `409 Conflict (IDEMPOTENCY_KEY_PAYLOAD_MISMATCH)`.

### ❓ Câu 13: Tại sao cần băm SHA-256 `requestHash` mà không chỉ so sánh Idempotency Key?
* **🎯 Trả lời ngay:** *"Để phát hiện hành vi tái sử dụng key sai mục đích hoặc gian lận thay đổi nội dung đơn hàng."*
* **🔍 Chi tiết kỹ thuật:** Idempotency Key định danh một **ý định giao dịch cụ thể**. Băm SHA-256 nội dung giỏ hàng (`items, coupon, points`) giúp server đảm bảo chắc chắn rằng client đang gửi lại đúng giao dịch cũ, chứ không phải dùng lại key cũ để mua một món hàng mới.

---

## 💳 Nhóm 6: Thanh Toán & Webhook

### ❓ Câu 14: Tại sao quan hệ giữa `Order` và `Payment` là 1 : N thay vì 1 : 1?
* **🎯 Trả lời ngay:** *"Để phục vụ cơ chế **Thử lại thanh toán (Retry)** khi khách hàng bị từ chối thẻ."*
* **🔍 Chi tiết kỹ thuật:** Nếu khách quét mã thất bại (`PAYMENT_FAILED`), đơn hàng vẫn giữ nguyên ID và tồn kho vẫn được bảo lưu. Khách có thể thanh toán lại lần 2 bằng thẻ khác (sinh bản ghi `Payment` thứ 2 cho cùng 1 `Order`).

### ❓ Câu 15: Khác biệt giữa Return URL và Webhook/IPN là gì?
* **🎯 Trả lời ngay:** *"Return URL chỉ để điều hướng giao diện cho người dùng xem; còn Webhook/IPN là kênh chính thức để server chốt trạng thái thanh toán."*
* **🔍 Chi tiết kỹ thuật:** Dữ liệu trên Return URL (query parameters) có thể bị người dùng chỉnh sửa trên thanh địa chỉ. Ngược lại, Webhook/IPN là lời gọi trực tiếp từ máy chủ cổng thanh toán sang backend NestJS, có kèm theo **chữ ký số mật mã (Signature)** để xác thực tính toàn vẹn.

### ❓ Câu 16: Nếu Webhook gửi lặp lại 2 lần thì sao?
* **🎯 Trả lời ngay:** *"Hệ thống kiểm tra trạng thái đơn hàng: nếu đơn đã là `PAID`, server bỏ qua và không cộng điểm thưởng lần 2."*
* **🔍 Chi tiết kỹ thuật:** Thao tác cập nhật trạng thái sử dụng điều kiện `WHERE status = 'PENDING'`. Khi Webhook thứ hai tới, trạng thái đã là `PAID` nên không thỏa mãn điều kiện cập nhật, ngăn chặn hoàn toàn việc nhân đôi số điểm thưởng hoặc ghi đè kết quả.

---

## 🎁 Nhóm 7: Voucher & Điểm Thưởng (Rewards)

### ❓ Câu 17: Mã giảm giá `GIAM10` và Điểm thưởng được áp dụng theo thứ tự nào?
* **🎯 Trả lời ngay:** *"Voucher được tính trước, Điểm thưởng được tính sau trên số tiền còn lại."*
* **🔍 Chi tiết kỹ thuật:** `GIAM10` giảm 10% trên `subtotal`. Sau đó, điểm thưởng (`pointsToRedeem`) được trừ tiếp vào số tiền còn lại sau khi đã giảm voucher. Điểm thưởng tối đa được đổi không được vượt quá số tiền còn lại của đơn hàng.

### ❓ Câu 18: Khi nào khách hàng được cộng điểm tích lũy (`EARN`)?
* **🎯 Trả lời ngay:** *"Chỉ khi đơn hàng chuyển sang trạng thái `PAID` thành công thì khách mới được cộng điểm tích lũy."*
* **🔍 Chi tiết kỹ thuật:** Lúc đơn mới tạo (`PENDING`), hệ thống chỉ tạm giữ điểm đổi (`RESERVE`). Khi nhận Webhook thanh toán thành công, hệ thống mới ghi sổ cái `REDEEM` và ghi `EARN` (1% giá trị đơn hàng thực trả) trong cùng một transaction.

---

## 🛠 Nhóm 8: Quản Trị & Kiểm Thử (Admin & QA)

### ❓ Câu 19: Làm sao bảo vệ trang Admin không cho khách thường truy cập?
* **🎯 Trả lời ngay:** *"Kết hợp cả 2 tầng: `JwtAuthGuard` (kiểm tra đăng nhập) và `AdminRoleGuard` (truy vấn CSDL kiểm tra role `ADMIN`)."*
* **🔍 Chi tiết kỹ thuật:** Guard đọc trực tiếp cột `role` trong bảng `User` tại Database trên mỗi request quản trị. Việc chỉnh sửa role ở LocalStorage hay trên giao diện React hoàn toàn không có tác dụng đối với backend.

### ❓ Câu 20: Dự án có bao nhiêu automated tests và kiểm tra những gì?
* **🎯 Trả lời ngay:** *"Hệ thống có **197 Unit Tests** (chạy bằng Vitest trong ~5.9s) và đầy đủ các kịch bản kiểm thử E2E tích hợp CSDL."*
* **🔍 Chi tiết kỹ thuật:** Bộ test bao phủ từ công thức tính giá, trừ kho đồng thời, băm Idempotency Key, máy trạng thái đơn hàng đến việc xác thực chữ ký Webhook của VNPay và Stripe.
