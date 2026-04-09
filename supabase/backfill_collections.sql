-- ============================================================
-- Backfill Collections Table from Transactions
-- This creates collection records from existing transactions
-- ============================================================

-- Insert collections from transactions where narration contains collector name
INSERT INTO collections (
  collector_id,
  collector_name,
  customer_id,
  customer_name,
  account_id,
  amount,
  payment_type,
  loan_id,
  hp_agreement_id,
  status,
  notes,
  created_at
)
SELECT 
  col.id as collector_id,
  COALESCE(
    SUBSTRING(t.narration FROM '—\s*([^(]+?)(?:\s*\(|$)'),
    'Unknown'
  ) as collector_name,
  a.customer_id,
  c.name as customer_name,
  t.account_id,
  t.amount,
  CASE 
    WHEN t.narration LIKE '%Loan%' THEN 'loan'
    WHEN t.narration LIKE '%HP%' THEN 'hp'
    ELSE 'savings'
  END as payment_type,
  NULL as loan_id,
  NULL as hp_agreement_id,
  'completed' as status,
  t.narration as notes,
  t.created_at
FROM transactions t
JOIN accounts a ON t.account_id = a.id
JOIN customers c ON a.customer_id = c.id
LEFT JOIN collectors col ON SUBSTRING(t.narration FROM '—\s*([^(]+?)(?:\s*\(|$)') = col.name
WHERE t.channel = 'collection'
  AND t.type = 'credit'
  AND t.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM collections col2 
    WHERE col2.account_id = t.account_id 
      AND col2.amount = t.amount 
      AND ABS(EXTRACT(EPOCH FROM (col2.created_at - t.created_at))) < 5
  )
ORDER BY t.created_at;

-- Show results
SELECT 
  COUNT(*) as collections_created,
  SUM(amount) as total_amount,
  MIN(created_at) as earliest,
  MAX(created_at) as latest
FROM collections;

-- Show by collector
SELECT 
  collector_name,
  COUNT(*) as count,
  SUM(amount) as total
FROM collections
GROUP BY collector_name
ORDER BY total DESC;
