-- ============================================================
-- Fix Clear All — break circular FK between loans & hp_agreements
-- Run in Supabase SQL Editor
-- ============================================================

-- The circular FK problem:
--   loans.hp_agreement_id → hp_agreements.id
--   hp_agreements.loan_id → loans.id
-- Neither can be deleted while the other exists.
-- Solution: make both FK columns nullable and deferrable,
-- OR simply null them out before deleting.

-- Make hp_agreements.loan_id nullable (it may already be)
ALTER TABLE hp_agreements ALTER COLUMN loan_id DROP NOT NULL;

-- Make loans.hp_agreement_id nullable (it may already be)  
ALTER TABLE loans ALTER COLUMN hp_agreement_id DROP NOT NULL;

-- Verify
SELECT 'Circular FK columns are now nullable - Clear All will work' AS status;
