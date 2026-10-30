# BrewLite — Rà soát mã nguồn sau FIX 01–09 (30/10/2026)

## Phạm vi và bằng chứng
- Nguồn: bộ source tích hợp trong `_fix09_work`, được đối chiếu với nội dung ChangeOnly ZIP của FIX 01–09. Các file đã bị những FIX sau ghi đè được phân biệt với file thiếu thật.
- `node scripts/verify-foundation.mjs`: **PASS**.
- `node --experimental-strip-types --test tests/*.test.mjs` (frontend): **25/25 PASS**.
- TypeScript parser: **92/92 file TS/TSX không có lỗi cú pháp**. Đây **không** phải kiểm tra type/build hoàn chỉnh.
- Backend/frontend build, Vitest backend và PostgreSQL/Docker E2E: **chưa kiểm chứng** (môi trường không có dependency đã cài và không có Docker daemon; `npm ci --offline` không có đủ cache).

## Lỗi đã khắc phục trong ChangeOnly của đợt audit
1. `frontend/app/checkout/page.tsx`: thay `savedOrder.id` bằng `savedOrder.orderId`; kiểu `CheckoutSession` không có `id`.
2. Cùng file: `savedOrder.pointsRedeemed` có thể `null`; dùng `?? 0` trước khi format. Tránh lỗi `.toLocaleString` trên null và vấn đề kiểm tra kiểu.
3. Cùng file: kiểm tra tường minh `attempt` trước khi đọc `.key/.method/.demoDecline` để đảm bảo kiểu không-null, fail-closed khi phiên thanh toán bị lỗi.

## Vấn đề chưa sửa — phải xử lý trước khi xác nhận release
### Cao — Thanh toán đồng thời khác idempotency key
- `backend/src/payments/payments.service.ts` khoảng dòng 92–125: chỉ kiểm tra duy nhất `idempotencyKey`, đọc Order ở `PENDING`, sau đó tạo Payment và gọi gateway ngoài transaction; không có cơ chế claim một payment đang xử lý trên cùng `orderId`.
- Hai request đồng thời cho cùng đơn nhưng **khác key** đều có thể đọc `PENDING` và gọi `gateway.charge` trước khi một request chuyển Order sang `PAID`. Unique constraint trên key không giải quyết trường hợp này.
- Khuyến nghị: bổ sung ràng buộc/claim nguyên tử một attempt in-flight trên mỗi Order, kèm test tích hợp 2 key khác nhau, đảm bảo `gateway.charge` tối đa một lần.

### Trung bình — Payment PENDING mắc kẹt sau crash
- `PaymentsService.chargeAndSettle()` tạo Payment PENDING trước khi gọi gateway và settlement. Nếu tiến trình crash ở giữa, retry cùng key trả `PAYMENT_IN_PROGRESS` mãi (`replay`, khoảng dòng 235–241).
- Đã có ghi chú giới hạn này trong FIX 07; đây là điểm mở về đối soát/khôi phục, không khẳng định gateway đã thu tiền.

### Nhỏ — Báo thành công thêm giỏ khi số lượng bị cắt ngưỡng
- `frontend/store/cart.ts`: khi dòng có 98 ly và thêm `qty=3`, `mergeCartItems` chỉ giữ 99 nhưng `add()` vẫn trả `true`. Nếu UI diễn giải `true` là đã thêm đủ thì thông báo sẽ sai. Backend vẫn tính lại giá và số lượng theo data thực.

## Điều kiện nghiệm thu còn thiếu
- Cài dependency với Node 24 phù hợp lockfile; chạy backend lint/build/unit/E2E, frontend lint/build.
- Test PostgreSQL tình huống hai payment key khác nhau cho cùng order.
- Test Docker với database sạch và chạy lại seed 2 lần.
- Sau đó người dùng kiểm tra luồng UI thực tế theo kế hoạch.
