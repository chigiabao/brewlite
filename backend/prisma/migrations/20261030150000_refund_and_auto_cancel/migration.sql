-- Auto-cancel window for unpaid orders.
ALTER TABLE "Order" ADD COLUMN "cancelAfter" TIMESTAMP(3);
CREATE INDEX "Order_status_cancelAfter_idx" ON "Order"("status", "cancelAfter");

-- Full refunds are driven by Stripe webhooks (Dashboard/API).
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "LoyaltyKind" ADD VALUE IF NOT EXISTS 'REFUND';

CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "Refund" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "stripeRefundId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'vnd',
    "status" "RefundStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Refund_stripeRefundId_key" ON "Refund"("stripeRefundId");
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
