-- Thêm giá trị VNPAY vào enum PaymentMethod
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'VNPAY';

-- Tạo enum PaymentGateway
CREATE TYPE "PaymentGateway" AS ENUM ('STRIPE', 'VNPAY');

-- Bổ sung các cột VNPay vào bảng Payment
ALTER TABLE "Payment" ADD COLUMN "gateway" "PaymentGateway" NOT NULL DEFAULT 'STRIPE';
ALTER TABLE "Payment" ADD COLUMN "vnpTxnRef" TEXT;
ALTER TABLE "Payment" ADD COLUMN "vnpTransactionNo" TEXT;
ALTER TABLE "Payment" ADD COLUMN "vnpBankCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN "vnpCardType" TEXT;
ALTER TABLE "Payment" ADD COLUMN "vnpPayDate" TIMESTAMP(3);

-- Unique index cho vnpTxnRef
CREATE UNIQUE INDEX "Payment_vnpTxnRef_key" ON "Payment"("vnpTxnRef");
