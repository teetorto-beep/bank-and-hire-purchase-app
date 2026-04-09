-- ============================================================
-- Migration: Add customer app login credentials
-- Run this in your Supabase SQL Editor
-- ============================================================

alter table customers
  add column if not exists app_username text unique,
  add column if not exists app_password text;

create index if not exists idx_customers_app_username on customers(app_username);
