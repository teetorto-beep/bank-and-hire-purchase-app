-- Add Item Loan 1-8 to the loans type check constraint
-- Run in Supabase SQL Editor

ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_type_check;

ALTER TABLE loans ADD CONSTRAINT loans_type_check
  CHECK (type IN (
    'personal','hire_purchase','micro','mortgage','emergency','group',
    'item_loan_1','item_loan_2','item_loan_3','item_loan_4',
    'item_loan_5','item_loan_6','item_loan_7','item_loan_8'
  ));

SELECT 'loans_type_check updated with item loan types' AS status;
