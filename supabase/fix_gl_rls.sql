-- ============================================================
-- Fix RLS for GL Tables - Allow Collector App Access
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "allow_all_authenticated" ON gl_entries;
DROP POLICY IF EXISTS "allow_anon_insert_gl_entries" ON gl_entries;
DROP POLICY IF EXISTS "allow_anon_read_gl_entries" ON gl_entries;
DROP POLICY IF EXISTS "allow_anon_read_gl_accounts" ON gl_accounts;
DROP POLICY IF EXISTS "allow_anon_update_gl_accounts" ON gl_accounts;

-- Allow anon to read GL accounts (needed to look up account IDs)
CREATE POLICY "allow_anon_read_gl_accounts"
  ON gl_accounts FOR SELECT
  USING (true);

-- Allow anon to update GL account balances
CREATE POLICY "allow_anon_update_gl_accounts"
  ON gl_accounts FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow anon to insert GL entries
CREATE POLICY "allow_anon_insert_gl_entries"
  ON gl_entries FOR INSERT
  WITH CHECK (true);

-- Allow anon to read GL entries
CREATE POLICY "allow_anon_read_gl_entries"
  ON gl_entries FOR SELECT
  USING (true);

-- Allow authenticated users full access
DROP POLICY IF EXISTS "allow_authenticated_all_gl_entries" ON gl_entries;
CREATE POLICY "allow_authenticated_all_gl_entries"
  ON gl_entries FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "allow_authenticated_all_gl_accounts" ON gl_accounts;
CREATE POLICY "allow_authenticated_all_gl_accounts"
  ON gl_accounts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Verify
SELECT 
  'GL RLS Policies Created' as status,
  (SELECT COUNT(*) FROM pg_policy WHERE polrelid = 'gl_entries'::regclass) as gl_entries_policies,
  (SELECT COUNT(*) FROM pg_policy WHERE polrelid = 'gl_accounts'::regclass) as gl_accounts_policies;
