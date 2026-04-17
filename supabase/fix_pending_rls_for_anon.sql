-- ============================================================
-- Fix: Allow anon key access to pending_transactions,
--      pending_approvals, and system_settings tables.
--
-- The web app and collector app use the Supabase anon key
-- without a Supabase auth session, so all queries run as
-- the 'anon' role. The existing 'allow_all_authenticated'
-- policies only cover the 'authenticated' role — blocking
-- reads/writes for anon users silently.
--
-- Root causes fixed here:
--   1. Teller pending transactions not visible in Approvals page
--   2. Collector cash collections not submitted for approval
--      (system_settings unreadable → needsApproval always false)
--   3. Collector pending_approvals inserts silently blocked
--
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- ── pending_transactions ─────────────────────────────────────────────────────
drop policy if exists "allow_anon_select_pending_transactions" on pending_transactions;
create policy "allow_anon_select_pending_transactions"
  on pending_transactions for select using (true);

drop policy if exists "allow_anon_insert_pending_transactions" on pending_transactions;
create policy "allow_anon_insert_pending_transactions"
  on pending_transactions for insert with check (true);

drop policy if exists "allow_anon_update_pending_transactions" on pending_transactions;
create policy "allow_anon_update_pending_transactions"
  on pending_transactions for update using (true) with check (true);

-- ── pending_approvals ────────────────────────────────────────────────────────
alter table if exists pending_approvals enable row level security;

drop policy if exists "allow_anon_select_pending_approvals" on pending_approvals;
create policy "allow_anon_select_pending_approvals"
  on pending_approvals for select using (true);

drop policy if exists "allow_anon_insert_pending_approvals" on pending_approvals;
create policy "allow_anon_insert_pending_approvals"
  on pending_approvals for insert with check (true);

drop policy if exists "allow_anon_update_pending_approvals" on pending_approvals;
create policy "allow_anon_update_pending_approvals"
  on pending_approvals for update using (true) with check (true);

-- ── system_settings ──────────────────────────────────────────────────────────
-- Collector app reads approval_rules from here to decide if a cash
-- collection needs approval. Without anon read access the query fails
-- silently and needsApproval always falls back to false — so collections
-- bypass approval entirely and post directly.
drop policy if exists "allow_anon_select_system_settings" on system_settings;
create policy "allow_anon_select_system_settings"
  on system_settings for select using (true);

-- ── Verify ───────────────────────────────────────────────────────────────────
select
  c.relname  as table_name,
  pol.polname as policy_name,
  case pol.polcmd
    when 'r' then 'SELECT'
    when 'a' then 'INSERT'
    when 'w' then 'UPDATE'
    when 'd' then 'DELETE'
    else 'ALL'
  end as command
from pg_policy pol
join pg_class c on pol.polrelid = c.oid
where c.relname in ('pending_transactions', 'pending_approvals', 'system_settings')
order by c.relname, pol.polname;

-- ── Update approval_rules to include 'collector' role ────────────────────────
-- Without this, collector cash collections never trigger approval even when
-- the rules load correctly — the roles array only had 'teller'.
update system_settings
set value = jsonb_set(
              jsonb_set(
                value,
                '{credit_threshold,roles}',
                '["teller","collector"]'::jsonb
              ),
              '{debit_threshold,roles}',
              '["teller","collector"]'::jsonb
            ),
    updated_at = now()
where key = 'approval_rules';
