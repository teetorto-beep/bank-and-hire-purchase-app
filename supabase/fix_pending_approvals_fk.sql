-- ============================================================
-- Fix: pending_approvals.submitted_by FK violation
-- The collector app submits approvals but collectors are in
-- the 'collectors' table, not 'users'. Drop the FK so any
-- UUID (user or collector) can be stored.
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- Drop the FK constraint (name may vary — this covers both common names)
alter table pending_approvals
  drop constraint if exists pending_approvals_submitted_by_fkey;

alter table pending_approvals
  drop constraint if exists pending_approvals_submitted_by_fkey1;

-- Also ensure the column is nullable so system-generated approvals work
alter table pending_approvals
  alter column submitted_by drop not null;
