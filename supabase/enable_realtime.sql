-- ============================================================
-- Enable Supabase Realtime on all tables used by the apps
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Add tables to realtime publication (skip if already added)
DO $$
BEGIN
  -- notifications
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;

  -- transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
  END IF;

  -- accounts
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE accounts;
  END IF;

  -- loans
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'loans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE loans;
  END IF;

  -- collections
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'collections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE collections;
  END IF;

  -- customers
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'customers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE customers;
  END IF;

  -- pending_transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'pending_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pending_transactions;
  END IF;

  -- pending_approvals
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'pending_approvals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pending_approvals;
  END IF;

  -- hp_agreements
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'hp_agreements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE hp_agreements;
  END IF;

  -- hp_payments
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'hp_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE hp_payments;
  END IF;
END $$;

-- ============================================================
-- Required for UPDATE events to include full row data
-- (needed so client-side filtering on customer_id works)
-- ============================================================
alter table transactions   replica identity full;
alter table loans          replica identity full;
alter table hp_agreements  replica identity full;
alter table accounts       replica identity full;
alter table collections    replica identity full;
alter table notifications  replica identity full;
alter table pending_approvals replica identity full;
alter table customers      replica identity full;
alter table pending_transactions replica identity full;
alter table hp_payments    replica identity full;

-- ============================================================
-- Allow anon key to INSERT notifications (web app uses anon key)
-- The existing policy only covers authenticated sessions.
-- ============================================================
drop policy if exists "allow_anon_insert_notifications" on notifications;
create policy "allow_anon_insert_notifications"
  on notifications for insert
  with check (true);
