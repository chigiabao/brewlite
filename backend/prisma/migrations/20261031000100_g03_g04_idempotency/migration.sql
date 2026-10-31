-- G-03/G-04: replay tạo đơn theo user/key và khóa một payment đang xử lý/đã thành công.
ALTER TABLE "Order" ADD COLUMN "createKey" TEXT, ADD COLUMN "createHash" TEXT;
CREATE UNIQUE INDEX "Order_userId_createKey_key" ON "Order"("userId", "createKey");
ALTER TABLE "Payment" ADD COLUMN "processingLeaseUntil" TIMESTAMP(3);
-- PostgreSQL partial index: retry được sau FAILED, nhưng không thể có hai attempt PENDING/SUCCEEDED.
-- Nếu DB cũ có nhiều payment active cho một order, cần đối soát trước khi migrate.
CREATE UNIQUE INDEX "Payment_one_active_per_order" ON "Payment"("orderId")
WHERE "status" IN ('PENDING', 'SUCCEEDED');

-- Dữ liệu lịch sử: ở PENDING / PAYMENT_FAILED chưa phải REDEEM thực sự.
-- Giữ nguyên balance đã reserve, chỉ dọn ledger ghi sai thời điểm.
DELETE FROM "LoyaltyEntry" AS ledger USING "Order" AS ord
WHERE ledger."orderId" = ord."id" AND ledger."kind" = 'REDEEM'
  AND ord."status" IN ('PENDING', 'PAYMENT_FAILED', 'CANCELLED');
