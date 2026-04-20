-- ── Add total_repayment column to loans ──────────────────────────────────────
-- Run this in Supabase SQL Editor

ALTER TABLE loans ADD COLUMN IF NOT EXISTS total_repayment numeric(15,2);

-- ── Backfill existing records: total_repayment = monthly_payment * tenure ────
-- This is the best we can do for existing records since we don't know
-- which calc method was used. For amortization loans this is correct.
UPDATE loans
SET total_repayment = ROUND((monthly_payment * tenure)::numeric, 2)
WHERE total_repayment IS NULL
  AND monthly_payment IS NOT NULL
  AND tenure IS NOT NULL
  AND monthly_payment > 0
  AND tenure > 0;

-- ── For loans with no monthly_payment, fall back to outstanding ───────────────
UPDATE loans
SET total_repayment = outstanding
WHERE total_repayment IS NULL;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT id, type, amount, outstanding, monthly_payment, tenure, total_repayment,
       ROUND((monthly_payment * tenure)::numeric, 2) AS computed_total
FROM loans
ORDER BY created_at DESC
LIMIT 20;
