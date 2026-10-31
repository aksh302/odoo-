-- Apply after prisma migrate
-- File: prisma/sql/001_constraints.sql

-- Sequences for number generation
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;
CREATE SEQUENCE IF NOT EXISTS subscription_seq START 1;

-- Partial unique index: prevent billing a period twice for the same subscription
-- (ignoring Cancelled and synthetic invoices)
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_period
  ON "Invoice" ("subscriptionId", "periodStart")
  WHERE status <> 'CANCELLED' AND "isSynthetic" = false;

-- Ensure amountPaid never exceeds total (guarded for re-runs)
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS paid_not_over_total;
ALTER TABLE "Invoice" ADD CONSTRAINT paid_not_over_total
  CHECK ("amountPaid" >= 0 AND "amountPaid" <= total);

-- Percent discounts must be 0-100 (guarded for re-runs)
ALTER TABLE "Discount" DROP CONSTRAINT IF EXISTS discount_percent_range;
ALTER TABLE "Discount" ADD CONSTRAINT discount_percent_range
  CHECK (type <> 'PERCENT' OR (value BETWEEN 0 AND 100));

-- usedCount must not exceed usageLimit (guarded for re-runs)
ALTER TABLE "Discount" DROP CONSTRAINT IF EXISTS discount_usage_cap;
ALTER TABLE "Discount" ADD CONSTRAINT discount_usage_cap
  CHECK ("usageLimit" IS NULL OR "usedCount" <= "usageLimit");

-- Payments must be positive (guarded for re-runs)
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS payment_positive;
ALTER TABLE "Payment" ADD CONSTRAINT payment_positive
  CHECK (amount > 0);

-- Default settings
INSERT INTO "Setting"(key, value) VALUES ('auto_confirm_invoices', 'true') ON CONFLICT DO NOTHING;
