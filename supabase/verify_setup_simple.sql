-- ============================================================
-- Simple Verification Script
-- Run this with the RUN button (not EXPLAIN)
-- ============================================================

DO $$
DECLARE
  realtime_count INT;
  replica_full_count INT;
  anon_policy_count INT;
  rls_enabled_count INT;
BEGIN
  -- Count tables in realtime publication
  SELECT COUNT(*) INTO realtime_count
  FROM pg_publication_tables 
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
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
      'hp_agreements', 'hp_payments', 'customers', 'collectors', 'notifications'
    );

  -- Count tables with RLS enabled
  SELECT COUNT(*) INTO rls_enabled_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = true
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
  RAISE NOTICE 'Tables with RLS enabled: % / 8', rls_enabled_count;
  RAISE NOTICE '========================================';
  
  IF realtime_count = 10 AND replica_full_count = 10 AND anon_policy_count >= 10 THEN
    RAISE NOTICE '✅ ALL CHECKS PASSED - Configuration looks good!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Test by making a transaction in the collector app';
    RAISE NOTICE '2. Check if it appears in React app within 1-2 seconds';
    RAISE NOTICE '3. If not, check browser console for errors';
  ELSE
    RAISE NOTICE '⚠️  ISSUES FOUND:';
    IF realtime_count < 10 THEN
      RAISE NOTICE '  ❌ Only %/10 tables in realtime publication', realtime_count;
      RAISE NOTICE '     → Run enable_realtime.sql';
    END IF;
    IF replica_full_count < 10 THEN
      RAISE NOTICE '  ❌ Only %/10 tables have FULL replica identity', replica_full_count;
      RAISE NOTICE '     → Run enable_realtime.sql';
    END IF;
    IF anon_policy_count < 10 THEN
      RAISE NOTICE '  ❌ Only % anon access policies (need 10+)', anon_policy_count;
      RAISE NOTICE '     → Run fix_rls_for_anon.sql';
    END IF;
  END IF;
  RAISE NOTICE '========================================';
END $$;
