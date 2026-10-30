# BrewLite — FIX 08: Hoàn thiện vòng đời pha chế (E — Ordering)

## Mục tiêu và phạm vi

Theo GUIDE-V2 E, trạng thái đơn đi theo luồng:

`PENDING → PAID → PREPARING → READY → COMPLETED`.

Ngoại lệ: `PENDING → PAYMENT_FAILED → PENDING` (thanh toán lại); `CANCELLED` là trạng thái kết thúc. `COMPLETED` cũng là trạng thái kết thúc.

**FIX 08 chỉ bổ sung nghiệp vụ pha chế của E.** Việc đổi `PENDING → PAID` và `PENDING → PAYMENT_FAILED` vẫn do F/Payments điều phối qua adapter hiện hữu; hủy đơn và hoàn stock/coupon/points vẫn giữ nguyên theo FIX 03/06.

## Những file đã sửa hoặc bổ sung

| File | Vai trò |
| --- | --- |
| `backend/src/orders/order-state.ts` | Máy trạng thái chuẩn; hàm kiểm tra đích pha chế hợp lệ |
| `backend/src/orders/orders.service.ts` | Thêm `advancePreparation(orderId, to)` với CAS trong PostgreSQL |
| `backend/src/orders/public.ts` | Export contract nội bộ cho các module khác |
| `backend/src/orders/order-state.spec.ts` | Thêm test phân loại đích pha chế |
| `backend/src/orders/orders.preparation.spec.ts` | Unit test luồng chuẩn, chuyển tiếp sai, race condition |
| `backend/test/orders-preparation.e2e-spec.ts` | E2E trực tiếp với PostgreSQL, không cần giả lập trạng thái trên UI |

## Cách triển khai

```ts
// Ví dụ gọi TRONG BACKEND bởi thành phần nội bộ có quyền.
await ordersService.advancePreparation(orderId, OrderStatus.PREPARING);
await ordersService.advancePreparation(orderId, OrderStatus.READY);
await ordersService.advancePreparation(orderId, OrderStatus.COMPLETED);
```

**Không mở HTTP route `PATCH /orders/:id/status` cho khách hàng.** GUIDE-V2 nói chức năng nhân viên quầy nằm ngoài MVP, và Identity hiện chưa có cơ chế RBAC cho nhân viên. Mở một route chỉ bảo vệ bằng JWT khách hàng sẽ khiến khách tự xác nhận đã nhận nước. Nếu mở màn hình quản lý sau này, bắt buộc bổ sung phân quyền nhân viên và audit trước.

## CAS: chống cập nhật đồng thời

Hệ thống đọc trạng thái hiện tại để xác minh chuyển tiếp hợp lệ, rồi dùng:

```ts
await prisma.order.updateMany({
  where: { id: orderId, status: current.status },
  data: { status: nextStatus },
});
```

Nếu `count !== 1`, trả HTTP 409 `ORDER_STATUS_CHANGED`; **không** ghi đè trạng thái mới của request khác. Không dùng thao tác `update({ where: { id } })` thiếu điều kiện trạng thái.

## Chạy kiểm thử trên máy của nhóm

Sau khi giải nén FIX 01–08 theo thứ tự, từ thư mục gốc:

```powershell
cd backend
npm.cmd ci
npx.cmd prisma generate
npm.cmd run build
npm.cmd test -- src/orders/order-state.spec.ts src/orders/orders.preparation.spec.ts
npm.cmd run test:e2e -- test/orders-preparation.e2e-spec.ts
```

E2E yêu cầu PostgreSQL test đã migrate, `DATABASE_URL` và các biến môi trường backend đầy đủ. **Không chạy E2E trên DB thật có dữ liệu quan trọng**. Chạy CI/Docker verification theo FIX 05 để nghiệm thu toàn luồng.

## Tiêu chí nghiệm thu

- [x] Có code chuyển từ PAID đến COMPLETED qua đúng các bước.
- [x] Không cho nhảy trạng thái, đi lùi hoặc đổi từ trạng thái kết thúc.
- [x] CAS chỉ cho một request thắng khi cùng chuyển một bước.
- [x] Không thể dùng phương thức pha chế để tự đánh dấu PAID/CANCELLED.
- [x] Có unit test và E2E test PostgreSQL tương ứng.
- [ ] Xác minh TypeScript build và Vitest PASS trong môi trường đã cài dependency.
- [ ] Xác minh E2E PASS với PostgreSQL trong Docker và CI sau khi merge.
