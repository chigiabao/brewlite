-- Only one PENDING payment attempt may exist per order.
-- Older duplicate PENDING attempts (if any) are made non-payable before the
-- partial unique index is created.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "orderId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "Payment"
  WHERE "status" = 'PENDING'
)
UPDATE "Payment" AS p
SET "status" = 'FAILED', "updatedAt" = NOW()
FROM ranked AS r
WHERE p."id" = r."id" AND r.rn > 1;

CREATE UNIQUE INDEX "Payment_orderId_pending_key"
  ON "Payment" ("orderId")
  WHERE "status" = 'PENDING';
