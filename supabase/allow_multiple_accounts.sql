-- Allow customers to open multiple accounts of any type
-- Remove any unique constraint on (customer_id, type)

-- Drop if exists (may not exist but safe to run)
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_customer_id_type_key;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_customer_type_unique;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS uq_customer_account_type;

-- Update type constraint to allow all product categories
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_type_check
  CHECK (type IN (
    'savings','current','hire_purchase','joint','fixed_deposit','micro_savings','susu',
    'personal','micro','mortgage','emergency','group'
  ));

SELECT 'Done — customers can now open multiple accounts of any type' AS status;
