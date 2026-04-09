-- ============================================================
-- Verification Script: Check Realtime and RLS Setup
-- Run this to verify your Supabase configuration is correct
-- ============================================================

-- Check which tables are in the realtime publication
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
ORDER BY tablename;

-- Expected output should include:
-- accounts, collections, customers, hp_agreements, hp_payments,
-- loans, notifications, pending_approvals, pending_transactions, transactions

-- ============================================================

-- Check replica identity for key tables
SELECT 
  n.nspname as schemaname,
  c.relname as tablename,
  CASE 
    WHEN c.relreplident = 'd' THEN 'DEFAULT (primary key only)'
    WHEN c.relreplident = 'f' THEN 'FULL (all columns)'
    WHEN c.relreplident = 'i' THEN 'INDEX'
    WHEN c.relreplident = 'n' THEN 'NOTHING'
  END as replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'accounts', 'transactions', 'loans', 'collections',
    'hp_agreements', 'hp_payments', 'customers', 
    'pending_transactions', 'pending_approvals', 'notifications'
  )
ORDER BY c.relname;

-- Expected: All should show 'FULL (all columns)' for realtime to work properly

-- ============================================================

-- Check RLS policies for anon access
SELECT 
  n.nspname as schemaname,
  c.relname as tablename,
  pol.polname as policyname,
  CASE 
    WHEN pol.polroles = '{0}' THEN 'Anon Access ✓'
    ELSE 'Authenticated Only'
  END as access_level,
  CASE pol.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END as operation
FROM pg_policy pol
JOIN pg_class c ON pol.polrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname IN (
    'accounts', 'transactions', 'loans', 'collections',
    'hp_agreements', 'hp_payments', 'customers', 'collectors'
  )
ORDER BY c.relname, pol.polname;

-- Expected: Should see policies with 'Anon Access ✓' for:
-- - customers (SELECT)
-- - accounts (SELECT, UPDATE)
-- - transactions (INSERT, SELECT)
-- - loans (SELECT, UPDATE)
-- - hp_agreements (SELECT, UPDATE)
-- - hp_payments (INSERT)
-- - collectors (SELECT, UPDATE)
-- - collections (INSERT, SELECT)

-- ============================================================

-- Check if RLS is enabled on key tables
SELECT 
  n.nspname as schemaname,
  c.relname as tablename,
  c.relrowsecurity as rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'accounts', 'transactions', 'loans', 'collections',
    'hp_agreements', 'hp_payments', 'customers', 'collectors'
  )
ORDER BY c.relname;

-- Expected: All should show 'true' for rls_enabled

-- ============================================================
-- Summary Check
-- ============================================================

DO $$
DECLARE
  realtime_count INT;
  replica_full_count INT;
  anon_policy_count INT;
BEGIN
  -- Count tables in realtime publication
  SELECT COUNT(*) INTO realtime_count
  FROM pg_publication_tables 
  WHERE pubname = 'supabase_realtime'
    AND tablename IN (
      'accounts', 'transactions', 'loans', 'collections',
      'hp_agreements', 'hp_payments', 'customers', 
      'pending_transactions', 'pending_approvals', 'notifications'
    );

  -- Count tables with FULL replica identity
  SELECT COUNT(*) INTO replica_full_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relreplident = 'f'
    AND c.relname IN (
      'accounts', 'transactions', 'loans', 'collections',
      'hp_agreements', 'hp_payments', 'customers', 
      'pending_transactions', 'pending_approvals', 'notifications'
    );

  -- Count anon policies (role OID 0 = public/anon)
  SELECT COUNT(*) INTO anon_policy_count
  FROM pg_policy pol
  JOIN pg_class c ON pol.polrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND pol.polroles = '{0}'
    AND c.relname IN (
      'accounts', 'transactions', 'loans', 'collections',
      'hp_agreements', 'hp_payments', 'customers', 'collectors'
    );

  RAISE NOTICE '========================================';
  RAISE NOTICE 'VERIFICATION SUMMARY';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables in realtime publication: % / 10', realtime_count;
  RAISE NOTICE 'Tables with FULL replica identity: % / 10', replica_full_count;
  RAISE NOTICE 'Anon access policies: % (should be 10+)', anon_policy_count;
  RAISE NOTICE '========================================';
  
  IF realtime_count = 10 AND replica_full_count = 10 AND anon_policy_count >= 10 THEN
    RAISE NOTICE '✅ ALL CHECKS PASSED - Configuration looks good!';
  ELSE
    RAISE NOTICE '⚠️  ISSUES FOUND:';
    IF realtime_count < 10 THEN
      RAISE NOTICE '  - Run enable_realtime.sql to add tables to publication';
    END IF;
    IF replica_full_count < 10 THEN
      RAISE NOTICE '  - Run enable_realtime.sql to set replica identity';
    END IF;
    IF anon_policy_count < 10 THEN
      RAISE NOTICE '  - Run fix_rls_for_anon.sql to add anon access policies';
    END IF;
  END IF;
  RAISE NOTICE '========================================';
END $$;
