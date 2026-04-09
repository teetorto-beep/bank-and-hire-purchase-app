-- ============================================================
-- FINAL FIX: Enable Collections Table for Collector App
-- Run this script to fix the collector report issue
-- ============================================================

-- 1. Check if collections table exists and show its structure
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'collections'
ORDER BY ordinal_position;

-- 2. Add collections to realtime if not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'collections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE collections;
    RAISE NOTICE '✅ Added collections to realtime';
  ELSE
    RAISE NOTICE '✅ Collections already in realtime';
  END IF;
END $$;

-- 3. Set replica identity to FULL
ALTER TABLE collections REPLICA IDENTITY FULL;

-- 4. Enable RLS on collections
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies
DROP POLICY IF EXISTS "allow_all_authenticated" ON collections;
DROP POLICY IF EXISTS "allow_anon_read_collections" ON collections;
DROP POLICY IF EXISTS "allow_anon_insert_collections" ON collections;

-- 6. Create new policies for anon access
CREATE POLICY "allow_anon_read_collections"
  ON collections FOR SELECT
  USING (true);

CREATE POLICY "allow_anon_insert_collections"
  ON collections FOR INSERT
  WITH CHECK (true);

CREATE POLICY "allow_authenticated_all_collections"
  ON collections FOR ALL
  USING (true)
  WITH CHECK (true);

-- 7. Verify setup
DO $$
DECLARE
  in_realtime BOOLEAN;
  has_anon_policy BOOLEAN;
BEGIN
  -- Check realtime
  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'collections'
  ) INTO in_realtime;

  -- Check anon policy
  SELECT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON pol.polrelid = c.oid
    WHERE c.relname = 'collections' AND pol.polroles = '{0}'
  ) INTO has_anon_policy;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'VERIFICATION RESULTS:';
  RAISE NOTICE '========================================';
  
  IF in_realtime THEN
    RAISE NOTICE '✅ Collections in realtime publication';
  ELSE
    RAISE NOTICE '❌ Collections NOT in realtime publication';
  END IF;

  IF has_anon_policy THEN
    RAISE NOTICE '✅ Anon access policies exist';
  ELSE
    RAISE NOTICE '❌ No anon access policies';
  END IF;

  IF in_realtime AND has_anon_policy THEN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅✅✅ ALL CHECKS PASSED ✅✅✅';
    RAISE NOTICE 'Collections table is ready!';
    RAISE NOTICE '========================================';
  ELSE
    RAISE NOTICE '========================================';
    RAISE NOTICE '⚠️  ISSUES FOUND - Check messages above';
    RAISE NOTICE '========================================';
  END IF;
END $$;

-- 8. Show recent collections (if any)
SELECT 
  COUNT(*) as total_collections,
  MAX(created_at) as most_recent_collection
FROM collections;

SELECT 
  id,
  collector_name,
  customer_name,
  amount,
  payment_type,
  created_at
FROM collections
ORDER BY created_at DESC
LIMIT 5;
