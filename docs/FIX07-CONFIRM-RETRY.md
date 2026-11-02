# BrewLite FIX 07 — Confirmed + Retry/Reload

**Input:** Source BrewLite sau FIX 01–06. **Phạm vi:** frontend (không migration).

## Lỗi và bản vá

1. `frontend/app/orders/[id]/confirmed/page.tsx` từng hiển thị `PAID` và "thành công" theo tham số URL, không kiểm tra cơ sở dữ liệu. Bản vá đọc **GET /orders/:id**, được NestJS bảo vệ bằng JwtAuthGuard và kiểm tra chủ đơn. Chỉ `PAID`, `PREPARING`, `READY`, `COMPLETED` được coi là đã thanh toán; `PENDING`, `PAYMENT_FAILED`, `CANCELLED`, 401 và 404 không hiển thị thành công.
2. Checkout từng giữ `orderId`/idempotency key trong `useRef`. Reload làm mất chúng; lỗi mạng cũng làm mất payment key. Bản vá dùng **sessionStorage** trong cùng tab, scope theo JWT `sub` (phân tách UI, KHÔNG dùng làm xác thực) và lưu `orderKey + orderRequest` **trước** `POST /orders`. Backend sẽ tiếp tục kiểm tra JWT và idempotency.
3. Sau khi tạo đơn, lưu `orderId`, tổng tiền và điểm đã giữ. Trước `POST /payments`, lưu `paymentKey`, phương thức và cờ demo. Nếu mất mạng, HTTP 5xx hoặc 409 `PAYMENT_IN_PROGRESS`, retry **cùng key + cùng body**, không tạo order lần nữa.
4. Nếu backend khẳng định `PAYMENT_DECLINED` (402) hoặc `GATEWAY_TIMEOUT` (504, xử lý thất bại trong mock backend), attempt được reset để người dùng thử lần khác bằng **payment key mới**, vẫn giữ Order và Cart. Đối với 409 `ORDER_ALREADY_PAID`, frontend kiểm tra `GET /orders/:id` trước khi xóa giỏ/đi tới xác nhận.
5. Chặn tạo Order mới khi giỏ đã thay đổi so với checkout session chưa hoàn tất, hiển thị đường dẫn lịch sử đơn; không tự xóa đơn cũ. Các lỗi tạo đơn rõ ràng 400/404/409/422 giải phóng checkout session để người dùng sửa payload.
6. `frontend/lib/api.ts` bổ sung `ApiError.status` và `.code`, giữ nguyên API gọi của module khác.

## Giới hạn rõ ràng

- `sessionStorage` chỉ giữ phiên qua reload trong **cùng tab**. Đóng tab hoặc dọn storage làm mất thông tin khôi phục ở frontend; backend vẫn bảo vệ idempotency của cùng key, nhưng frontend không thể suy ra key cũ nếu nó bị xóa. Có thể xem `/orders` để biết đơn đã được tạo.
- Nếu backend crash sau khi gateway đã thành công nhưng trước khi transaction settle, payment có thể ở trạng thái PENDING; FIX 07 **không** tự quyết định có thể charge lại. Hiện backend cần một cơ chế reconciliation/timeout recovery riêng để tự khôi phục terminal state an toàn. Không claim xử lý triệt để case này.
- Không có bằng chứng chạy `npm run build` của Next.js và E2E PostgreSQL/Docker trên môi trường tạo bản vá vì thiếu dependencies frontend/runtime. Đã chạy kiểm tra cú pháp và unit logic độc lập.

## Kiểm tra trên Windows

Trước tiên giải nén bản ChangeOnly vào thư mục dự án **đã áp dụng FIX 01–06**. Trong thư mục `frontend`:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run build
node --experimental-strip-types --test tests/*.test.mjs
```

Khởi chạy Docker/DB theo README. Đăng nhập và thử các case:

- Tạo đơn, trả tiền thành công → `/orders/:id/confirmed` báo chính xác `PAID`.
- Mở thủ công `/orders/:id/confirmed` cho đơn `PENDING`/`PAYMENT_FAILED`/`CANCELLED`, hoặc ID người khác → tuyệt đối không hiện "Thành công".
- Mất mạng ngay sau `POST /orders` → bật mạng, reload cùng tab, thử lại phải dùng đúng `orderKey` cũ và không tạo đơn trùng.
- Mất mạng ngay khi `POST /payments` đang xử lý → reload cùng tab, retry cùng `paymentKey` và phương thức; xác minh chỉ 1 Payment với key đó.
- Mô phỏng decline → Order `PAYMENT_FAILED` và Cart còn nguyên; retry mới dùng key mới.
- Đổi tài khoản → checkout session của người cũ không được mở cho tài khoản mới.

Không xóa database hoặc xóa giỏ dữ liệu thật để chạy test này nếu chưa sao lưu.
