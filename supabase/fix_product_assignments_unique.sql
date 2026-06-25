-- Fix product_assignments unique constraint to allow one customer
-- to have multiple accounts under the same product (e.g. multiple HP accounts)
-- Run in Supabase SQL Editor

-- Drop the old unique constraint that blocked (product_id, customer_id) duplicates
ALTER TABLE product_assignments
  DROP CONSTRAINT IF EXISTS product_assignments_product_id_customer_id_key;

-- Drop the account_id unique if it already exists (so we can re-apply cleanly)
ALTER TABLE product_assignments
  DROP CONSTRAINT IF EXISTS product_assignments_account_id_key;

-- Add a new unique constraint per account
-- (one assignment row per account — a customer can have many)
ALTER TABLE product_assignments
  ADD CONSTRAINT product_assignments_account_id_key UNIQUE (account_id);

-- The capacity count query uses COUNT(*) per product_id, so it still works correctly.
-- Each HP account opened for a customer creates its own row, and the count
-- reflects total accounts under that product, not unique customers.

SELECT 'product_assignments unique constraint updated — multiple HP accounts per customer now allowed' AS status;
