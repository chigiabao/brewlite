/*
  Warnings:

  - A unique constraint covering the columns `[stripeSessionId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "stripeCheckoutUrl" TEXT,
ADD COLUMN     "stripePaymentIntentId" TEXT,
ADD COLUMN     "stripeSessionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "stripeSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeSessionId_key" ON "Payment"("stripeSessionId");
