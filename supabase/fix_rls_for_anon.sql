-- ============================================================
-- Fix RLS Policies to Allow Anon Key Access
-- 
-- The collector app uses the anon key without authentication,
-- but the current RLS policies only allow authenticated users.
-- This script adds policies to allow anon key access for
-- operations that the collector app needs to perform.
-- ============================================================

-- Allow anon to read customers (needed for search)
drop policy if exists "allow_anon_read_customers" on customers;
create policy "allow_anon_read_customers"
  on customers for select
  using (true);

-- Allow anon to read and update accounts (needed for balance updates)
drop policy if exists "allow_anon_read_accounts" on accounts;
create policy "allow_anon_read_accounts"
  on accounts for select
  using (true);

drop policy if exists "allow_anon_update_accounts" on accounts;
create policy "allow_anon_update_accounts"
  on accounts for update
  using (true)
  with check (true);

-- Allow anon to insert transactions (needed for recording collections)
drop policy if exists "allow_anon_insert_transactions" on transactions;
create policy "allow_anon_insert_transactions"
  on transactions for insert
  with check (true);

drop policy if exists "allow_anon_read_transactions" on transactions;
create policy "allow_anon_read_transactions"
  on transactions for select
  using (true);

-- Allow anon to read and update loans (needed for loan repayments)
drop policy if exists "allow_anon_read_loans" on loans;
create policy "allow_anon_read_loans"
  on loans for select
  using (true);

drop policy if exists "allow_anon_update_loans" on loans;
create policy "allow_anon_update_loans"
  on loans for update
  using (true)
  with check (true);

-- Allow anon to read and update HP agreements (needed for HP payments)
drop policy if exists "allow_anon_read_hp_agreements" on hp_agreements;
create policy "allow_anon_read_hp_agreements"
  on hp_agreements for select
  using (true);

drop policy if exists "allow_anon_update_hp_agreements" on hp_agreements;
create policy "allow_anon_update_hp_agreements"
  on hp_agreements for update
  using (true)
  with check (true);

-- Allow anon to insert HP payments
drop policy if exists "allow_anon_insert_hp_payments" on hp_payments;
create policy "allow_anon_insert_hp_payments"
  on hp_payments for insert
  with check (true);

-- Allow anon to read and update collectors (needed for total_collected updates)
drop policy if exists "allow_anon_read_collectors" on collectors;
create policy "allow_anon_read_collectors"
  on collectors for select
  using (true);

drop policy if exists "allow_anon_update_collectors" on collectors;
create policy "allow_anon_update_collectors"
  on collectors for update
  using (true)
  with check (true);

-- Allow anon to insert collections (needed for recording collections)
drop policy if exists "allow_anon_insert_collections" on collections;
create policy "allow_anon_insert_collections"
  on collections for insert
  with check (true);

drop policy if exists "allow_anon_read_collections" on collections;
create policy "allow_anon_read_collections"
  on collections for select
  using (true);

-- Allow anon to insert notifications (already in enable_realtime.sql but included here for completeness)
drop policy if exists "allow_anon_insert_notifications" on notifications;
create policy "allow_anon_insert_notifications"
  on notifications for insert
  with check (true);

-- ============================================================
-- IMPORTANT: Run this script in your Supabase SQL Editor
-- after running schema.sql and enable_realtime.sql
-- ============================================================
