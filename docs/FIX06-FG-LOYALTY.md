# FIX 06 — F + G: Dùng Loyalty Points tại Checkout, REDEEM sau PAID

Phụ thuộc: FIX 01 → FIX 05 đã được áp dụng. ZIP này chỉ bao gồm các file sửa của FIX 06.

## Thay đổi

- Frontend `/checkout`: đọc số điểm từ `GET /rewards/me` (JWT), hiển thị balance; cho nhập điểm hoặc bấm **Dùng tối đa**. Giới hạn xem trước bằng `min(balance, tổng sau coupon)`; gửi `pointsToRedeem` trong `POST /orders`; hiện số điểm thực tế từ phản hồi backend khi Order đã tạo; 1 point = 1 VND. API lỗi/không đăng nhập không tự cấp điểm.
- E / Ordering: trong transaction tạo Order, vẫn reserve điểm/trừ `User.loyaltyPoints`, snapshot `Order.pointsRedeemed`. Không ghi `LoyaltyEntry(REDEEM)` khi trạng thái còn `PENDING`.
- F / Payments: sau khi `markPaid` trong cùng Prisma `$transaction`, lấy `pointsRedeemed` thực tế trên Order rồi gọi G.
- G / Rewards: `finalizeRewardsOnPaid` ghi `REDEEM` (nếu `pointsRedeemed > 0`) và `EARN` (nếu `floor(total / 100) > 0`), đảm bảo unique `(orderId, kind)` và kiểm tra mismatch khi replay. Nếu payment transaction rollback, cả Payment, Order, ledger và EARN balance đều rollback.
- Cancel trước PAID: vẫn hoàn coupon, stock, điểm dự trữ; dọn REDEEM ghi sớm của các order cũ nếu có, trong cùng transaction. Không thêm migration.

## Luồng đúng

1. User đã đăng nhập, balance ví dụ 20.000. Giỏ 57.000 và coupon giảm 30.000.
2. Người dùng yêu cầu dùng 20.000 điểm. Frontend preview 7.000 phải trả, gửi `pointsToRedeem: 20000`.
3. `POST /orders`: backend reserve 20.000 điểm và coupon trong transaction, tạo Order PENDING, pointsRedeemed=20.000, **chưa có REDEEM/EARN ledger**.
4. `POST /payments` success → PAID; trong cùng transaction ghi 1 REDEEM=20.000 + 1 EARN=70, cộng 70 vào balance.
5. Replay cùng payment key → không thêm Payment, REDEEM/EARN hay cộng điểm.
6. Nếu hủy ở PENDING/PAYMENT_FAILED → trả 20.000 điểm và quota coupon (không có EARN).

## Chạy kiểm tra trên máy có Node/npm/PostgreSQL/Docker

```powershell
node scripts/verify-foundation.mjs
cd backend
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
cd ..
cd frontend
npm.cmd run lint
npm.cmd run build
```

Test PostgreSQL `backend/test/order-checkout-flow.e2e-spec.ts` xác nhận REDEEM/EARN chỉ xuất hiện sau PAID. Cần đặt `DATABASE_URL` và `JWT_SECRET` trên DB **chuyên dùng kiểm thử** theo hướng dẫn FIX 04; không chạy với DB dữ liệu thật.

## Bằng chứng hiện có trong môi trường tạo bản vá

- Source TS/TSX: kiểm tra cú pháp TypeScript (`transpileModule`) thành công.
- `node scripts/verify-foundation.mjs`: PASS.
- Smoke chạy logic Rewards (giả lập transaction) xác nhận reserve → PAID → replay và reserve → cancel: PASS.
- Chưa chạy được full Vitest/PostgreSQL/Next build ở môi trường này (dependency thiếu trong snapshot và không có Docker daemon). Vì vậy chưa xác nhận release gate G1–G4.

## Lưu ý

Đơn PENDING trước FIX 06 có thể đã có REDEEM entry; nếu tiếp tục trả tiền, phương thức mới sẽ không tạo entry trùng khi snapshot khớp. Nếu hủy trước PAID, sẽ xóa REDEEM sớm và hoàn điểm trong transaction. Dữ liệu lịch sử cũ đã ở trạng thái CANCELLED nhưng có REDEEM phải kiểm tra riêng, không tự động sửa database trong bản vá.
