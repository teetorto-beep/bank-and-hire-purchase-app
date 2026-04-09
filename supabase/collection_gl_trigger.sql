-- ============================================================
-- Auto-post collections to GL via database trigger
-- Run this in your Supabase SQL Editor
--
-- When any collection is inserted (from collector app, web app,
-- or any other source), this trigger automatically creates the
-- corresponding GL journal entries.
--
-- GL Mapping:
--   Savings:  Dr 1000 Cash in Hand  / Cr 2010 Savings Accounts
--   Loan:     Dr 1000 Cash in Hand  / Cr 1100 Loan Receivables
--   HP:       Dr 1000 Cash in Hand  / Cr 1100 HP/Loan Receivables
-- ============================================================

create or replace function fn_collection_to_gl()
returns trigger language plpgsql as $$
declare
  v_amount      numeric;
  v_type        text;
  v_narr        text;
  v_dr_code     text := '1000';   -- Cash in Hand
  v_cr_code     text;
  v_ref         text;
  v_dr_id       uuid;
  v_cr_id       uuid;
  v_now         timestamptz := now();
  v_period_year int  := extract(year  from v_now)::int;
  v_period_mon  int  := extract(month from v_now)::int;
begin
  v_amount := NEW.amount;
  v_type   := coalesce(NEW.payment_type, 'savings');
  v_narr   := 'Collection (' || v_type || ') — '
              || coalesce(NEW.customer_name, 'customer')
              || ' via ' || coalesce(NEW.collector_name, 'collector');
  v_ref    := 'COL-' || NEW.id;

  -- Choose credit account based on payment type
  if v_type = 'savings' then
    v_cr_code := '2010';   -- Savings Accounts (liability)
  else
    v_cr_code := '1100';   -- Loan / HP Receivables (asset reduces)
  end if;

  -- Look up GL account IDs
  select id into v_dr_id from gl_accounts where code = v_dr_code limit 1;
  select id into v_cr_id from gl_accounts where code = v_cr_code limit 1;

  -- Only post if both GL accounts exist
  if v_dr_id is null or v_cr_id is null then
    return NEW;
  end if;

  -- Skip if already posted (idempotency)
  if exists (
    select 1 from gl_entries where source_type = 'collection' and source_id = NEW.id::text
  ) then
    return NEW;
  end if;

  -- Insert debit entry (Cash in Hand increases)
  insert into gl_entries (
    journal_ref,
    gl_account_id, gl_account_code, gl_account_name,
    entry_type, amount, narration,
    source_type, source_id, transaction_ref,
    period_year, period_month,
    posted_by, created_at
  )
  select
    v_ref, v_dr_id, g.code, g.name,
    'debit', v_amount, v_narr,
    'collection', NEW.id::text, v_ref,
    v_period_year, v_period_mon,
    coalesce(NEW.collector_name, 'system'), v_now
  from gl_accounts g where g.id = v_dr_id;

  -- Insert credit entry
  insert into gl_entries (
    journal_ref,
    gl_account_id, gl_account_code, gl_account_name,
    entry_type, amount, narration,
    source_type, source_id, transaction_ref,
    period_year, period_month,
    posted_by, created_at
  )
  select
    v_ref, v_cr_id, g.code, g.name,
    'credit', v_amount, v_narr,
    'collection', NEW.id::text, v_ref,
    v_period_year, v_period_mon,
    coalesce(NEW.collector_name, 'system'), v_now
  from gl_accounts g where g.id = v_cr_id;

  -- Update running balances on gl_accounts
  -- Debit increases asset (1000), credit increases liability (2010) or decreases asset (1100)
  update gl_accounts set
    balance = balance + v_amount,
    updated_at = v_now
  where id = v_dr_id;

  -- For savings: credit increases liability balance
  -- For loan/HP: credit decreases asset balance (receivable reduces)
  if v_type = 'savings' then
    update gl_accounts set balance = balance + v_amount, updated_at = v_now where id = v_cr_id;
  else
    update gl_accounts set balance = balance - v_amount, updated_at = v_now where id = v_cr_id;
  end if;

  return NEW;
end;
$$;

-- Drop existing trigger if any, then create
drop trigger if exists trg_collection_to_gl on collections;

create trigger trg_collection_to_gl
  after insert on collections
  for each row
  execute function fn_collection_to_gl();
