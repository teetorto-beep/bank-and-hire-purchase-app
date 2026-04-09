-- Fix: transactions.created_by FK violation from collector app
-- Collectors are in the 'collectors' table, not 'users'.
-- Drop the FK so any UUID (user or collector) can be stored.
alter table transactions
  drop constraint if exists transactions_created_by_fkey;

-- Also fix loans.created_by for the same reason
alter table loans
  drop constraint if exists loans_created_by_fkey;
