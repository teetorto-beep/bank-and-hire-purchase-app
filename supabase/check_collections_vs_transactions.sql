-- ============================================================
-- Compare Collections vs Transactions
-- This shows if transactions exist without matching collections
-- ============================================================

-- Show recent transactions from DOMINIC
SELECT 
  'TRANSACTION' as type,
  reference,
  amount,
  narration,
  created_at,
  channel
FROM transactions
WHERE narration LIKE '%DOMINIC%'
  AND created_at > CURRENT_DATE
ORDER BY created_at DESC;

-- Show recent collections from DOMINIC
SELECT 
  'COLLECTION' as type,
  'N/A' as reference,
  amount,
  collector_name || ' - ' || customer_name as narration,
  created_at,
  payment_type as channel
FROM collections
WHERE collector_name = 'DOMINIC'
  AND created_at > CURRENT_DATE
ORDER BY created_at DESC;

-- Count comparison
SELECT 
  (SELECT COUNT(*) FROM transactions WHERE narration LIKE '%DOMINIC%' AND created_at > CURRENT_DATE) as transaction_count,
  (SELECT COUNT(*) FROM collections WHERE collector_name = 'DOMINIC' AND created_at > CURRENT_DATE) as collection_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM transactions WHERE narration LIKE '%DOMINIC%' AND created_at > CURRENT_DATE) = 
         (SELECT COUNT(*) FROM collections WHERE collector_name = 'DOMINIC' AND created_at > CURRENT_DATE)
    THEN '✅ Counts match'
    ELSE '❌ Counts DO NOT match - collections table not being written'
  END as status;
