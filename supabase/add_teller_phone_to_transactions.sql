-- Add teller phone number to transactions table
-- This helps track which teller posted each transaction

-- Add poster_phone column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS poster_phone text;

-- Add comment for documentation
COMMENT ON COLUMN transactions.poster_phone IS 'Phone number of the teller/user who posted this transaction';
COMMENT ON COLUMN transactions.poster_name  IS 'Full name of the teller/user who posted this transaction';

-- Update existing transactions with phone AND name from users table
UPDATE transactions t
SET 
  poster_phone = u.phone,
  poster_name  = COALESCE(t.poster_name, u.full_name, u.name)
FROM users u
WHERE t.created_by = u.id
  AND u.phone IS NOT NULL;

-- Create index for faster queries by teller phone
CREATE INDEX IF NOT EXISTS idx_transactions_poster_phone 
ON transactions(poster_phone) 
WHERE poster_phone IS NOT NULL;

-- Verify the update
SELECT 
  COUNT(*)                          AS total_transactions,
  COUNT(poster_name)                AS transactions_with_name,
  COUNT(poster_phone)               AS transactions_with_phone,
  COUNT(*) - COUNT(poster_name)     AS transactions_without_name,
  COUNT(*) - COUNT(poster_phone)    AS transactions_without_phone
FROM transactions;

-- Show sample of updated transactions
SELECT 
  id,
  reference,
  poster_name,
  poster_phone,
  amount,
  created_at
FROM transactions
WHERE poster_phone IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
