-- ============================================================
-- Fix doubled account balances
-- Recalculates every account balance from its actual transactions
-- Run in Supabase SQL Editor
-- ============================================================

-- Step 1: Recalculate correct balance for each account
-- Balance = sum of credits - sum of debits from transactions table
UPDATE accounts a
SET balance = COALESCE((
  SELECT 
    SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END)
  FROM transactions t
  WHERE t.account_id = a.id
    AND t.reversed = false
), 0),
updated_at = now();

-- Step 2: Verify — show accounts with their recalculated balances
SELECT 
  a.account_number,
  a.balance AS new_balance,
  COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0) AS calculated_from_txns,
  COUNT(t.id) AS txn_count
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id AND t.reversed = false
GROUP BY a.id, a.account_number, a.balance
ORDER BY a.account_number;
