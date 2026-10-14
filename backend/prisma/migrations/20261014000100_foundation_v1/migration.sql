-- FOUNDATION V1: baseline schema cho DB mới, không áp trực tiếp lên DB đã có dữ liệu.
-- Quy tắc dùng DB cũ được giải thích trong docs/FOUNDATION-V1.md.
CREATE TYPE "OrderStatus" AS ENUM ('PENDING','PAID','PAYMENT_FAILED','PREPARING','READY','COMPLETED','CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('WALLET','CARD');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','SUCCEEDED','FAILED');
CREATE TYPE "LoyaltyKind" AS ENUM ('EARN','REDEEM');

CREATE TABLE "Product" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 100,
  "version" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "User" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "loyaltyPoints" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Coupon" (
  "code" TEXT PRIMARY KEY,
  "discountPercent" INTEGER,
  "discountAmount" INTEGER,
  "minOrderValue" INTEGER NOT NULL DEFAULT 0,
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "Order" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "subtotal" INTEGER NOT NULL DEFAULT 0,
  "discountTotal" INTEGER NOT NULL DEFAULT 0,
  "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
  "total" INTEGER NOT NULL,
  "couponCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId","createdAt");
CREATE TABLE "OrderItem" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "size" TEXT NOT NULL,
  "toppings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "qty" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "lineTotal" INTEGER NOT NULL
);
CREATE TABLE "Payment" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "transactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE TABLE "LoyaltyEntry" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "orderId" INTEGER NOT NULL,
  "kind" "LoyaltyKind" NOT NULL,
  "points" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "LoyaltyEntry_orderId_kind_key" ON "LoyaltyEntry"("orderId","kind");
CREATE INDEX "LoyaltyEntry_userId_idx" ON "LoyaltyEntry"("userId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponCode_fkey" FOREIGN KEY ("couponCode") REFERENCES "Coupon"("code") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
