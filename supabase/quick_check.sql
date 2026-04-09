-- Quick check: Compare transaction count vs collection count
SELECT 
  (SELECT COUNT(*) FROM transactions WHERE narration LIKE '%DOMINIC%' AND created_at > CURRENT_DATE) as transaction_count,
  (SELECT COUNT(*) FROM collections WHERE collector_name = 'DOMINIC' AND created_at > CURRENT_DATE) as collection_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM transactions WHERE narration LIKE '%DOMINIC%' AND created_at > CURRENT_DATE) = 
         (SELECT COUNT(*) FROM collections WHERE collector_name = 'DOMINIC' AND created_at > CURRENT_DATE)
    THEN '✅ Counts match - collections ARE being written'
    ELSE '❌ Counts DO NOT match - collections table NOT being written'
  END as status;
