-- ============================================================
-- Add missing fields for collector app flows
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. pending_approvals: add account_number_created so collector
--    can make deposit after admin approves and creates the account
alter table pending_approvals
  add column if not exists account_number_created text;

-- 2. collections: add collector_name for display purposes
alter table collections
  add column if not exists collector_name text;

-- 3. Update RLS on collections to allow anon/collector inserts
--    (collectors use anon key, not auth users)
drop policy if exists "collectors_insert_collections" on collections;
create policy "collectors_insert_collections"
  on collections for insert
  with check (true);

drop policy if exists "collectors_select_collections" on collections;
create policy "collectors_select_collections"
  on collections for select
  using (true);

-- 4. Allow collectors to update account balances
drop policy if exists "collectors_update_accounts" on accounts;
create policy "collectors_update_accounts"
  on accounts for update
  using (true)
  with check (true);

-- 5. Allow collectors to read accounts and customers
drop policy if exists "collectors_select_accounts" on accounts;
create policy "collectors_select_accounts"
  on accounts for select
  using (true);

drop policy if exists "collectors_select_customers" on customers;
create policy "collectors_select_customers"
  on customers for select
  using (true);

-- 6. Allow collectors to insert/select pending_approvals
drop policy if exists "collectors_pending_approvals" on pending_approvals;
create policy "collectors_pending_approvals"
  on pending_approvals for all
  using (true)
  with check (true);

-- 7. Allow collectors to insert notifications
drop policy if exists "collectors_insert_notifications" on notifications;
create policy "collectors_insert_notifications"
  on notifications for insert
  with check (true);

-- 8. Allow collectors to read products
drop policy if exists "collectors_select_products" on products;
create policy "collectors_select_products"
  on products for select
  using (true);

-- 9. Allow collectors to read users (to notify admins)
drop policy if exists "collectors_select_users" on users;
create policy "collectors_select_users"
  on users for select
  using (true);

-- 10. Allow collectors to read system_settings
drop policy if exists "collectors_select_settings" on system_settings;
create policy "collectors_select_settings"
  on system_settings for select
  using (true);
