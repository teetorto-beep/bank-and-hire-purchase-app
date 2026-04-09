-- ============================================================
-- Verify Collections Table Realtime Setup
-- Run this to check if collections table is properly configured
-- ============================================================

-- Check if collections is in realtime publication
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public'
        AND tablename = 'collections'
    ) THEN '✅ Collections is in realtime publication'
    ELSE '❌ Collections is NOT in realtime publication - Run enable_realtime.sql'
  END as realtime_status;

-- Check replica identity
SELECT 
  c.relname as table_name,
  CASE c.relreplident
    WHEN 'd' THEN '❌ DEFAULT (only primary key) - Run enable_realtime.sql to set to FULL'
    WHEN 'f' THEN '✅ FULL (all columns) - Good for realtime'
    WHEN 'i' THEN 'INDEX'
    WHEN 'n' THEN 'NOTHING'
  END as replica_identity_status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'collections';

-- Check RLS policies for anon access
SELECT 
  pol.polname as policy_name,
  CASE pol.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END as operation,
  CASE 
    WHEN pol.polroles = '{0}' THEN '✅ Allows anon access'
    ELSE '❌ Authenticated only'
  END as access_level
FROM pg_policy pol
JOIN pg_class c ON pol.polrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname = 'collections'
ORDER BY pol.polname;

-- Check recent collections
SELECT 
  id,
  collector_name,
  customer_name,
  amount,
  created_at,
  CASE 
    WHEN created_at > NOW() - INTERVAL '1 hour' THEN '✅ Recent (last hour)'
    WHEN created_at > NOW() - INTERVAL '1 day' THEN 'Today'
    ELSE 'Older'
  END as recency
FROM collections
ORDER BY created_at DESC
LIMIT 10;
