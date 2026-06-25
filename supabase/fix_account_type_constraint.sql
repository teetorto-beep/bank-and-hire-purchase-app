-- Fix accounts type check constraint to include all product categories
-- Run in Supabase SQL Editor

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;

ALTER TABLE accounts ADD CONSTRAINT accounts_type_check 
  CHECK (type IN (
    'savings','current','hire_purchase','joint','fixed_deposit','micro_savings','susu',
    'personal','micro','mortgage','emergency','group'
  ));

SELECT 'accounts_type_check constraint updated with all types' AS status;
