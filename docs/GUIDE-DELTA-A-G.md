# Ghi chú bổ sung áp dụng cho 7 PDF phân công gốc

> Không phải viết lại 7 PDF. Mỗi bạn dùng PDF mình nhận + `docs/FOUNDATION-V1.md` + `contracts/brewlite-v1.json`. Nơi mâu thuẫn thì phải họp/duyệt Master Contract trước; không tự suy diễn.

| Guide | Phải sửa / làm rõ trước PR | Test chứng minh |
|---|---|---|
| **A** | Không tạo lại NestJS/Next.js; nhận CI, baseline migration, health DB, contract guard, chung file. `npm ci` phải chạy từ clean clone. | New DB migrate + seed; cả frontend/backend build/test; Docker 3 services |
| **B** | Đồng bộ dữ liệu `Product` và DTO; giá/topping theo contract; không sửa prisma schema trực tiếp; asset hình phải tồn tại. | `/products` 200, `/:id` 404, loading/empty/error, size/topping |
| **C** | Bổ sung badge trong shared layout qua PR A; cartKey phải theo productId-size-toppings sorted; không gửi unitPrice khi đặt. | cùng combo gộp đúng; combo khác tách; reload persist; qty >= 1 |
| **D** | Guide yêu cầu localStorage, cần ghi rủi ro XSS; JWT strategy, guard owner của order/payment, email unique, token 401/expired. | register/login/duplicate/401, guard chặn request thiếu token |
| **E** | Trạng thái cuối đúng là `COMPLETED`, không phải `PICKED_UP`; giữ state+stock thuộc E; server tự tính giá, order snapshot; thêm `GET /orders/:id` theo guide. | invalid transition; optimistic locking 10 request stock=3; ownership/order snapshot |
| **F** | Đúng owner của idempotency là F; không dùng random không tái tạo được khi test; retry không tạo order mới, xử lý cùng key khác payload, ambiguous response. | 2 request đồng thời cùng key => 1 record; retry failed, same key diff payload 409 |
| **G** | Bổ sung schema Coupon: fixed/percent, maxUses, usedCount; không viết thẳng vào `orders.service.ts` hoặc `payments.service.ts`; phối hợp via interface & PR owner. | coupon expiry/cap/concurrent, loyalty on PAID exactly once, không cộng khi lỗi |

**Các bất nhất đã xử lý trong bản khung:** comment owner sai giữa E/D và C/D; trạng thái cuối `COMPLETED`; bổ sung RewardsModule skeleton; schema Coupon/Payment/Order/LoyaltyEntry đủ chỗ triển khai; CI và script contract guard; checkout reuse orderId trong phiên hiện tại. **Các service TODO 501 vẫn chưa được hiện thực:** không xem đây là hoàn thành các feature.
