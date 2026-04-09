-- ============================================================
-- Migration: Create notifications table
-- Run this in your Supabase SQL Editor
-- ============================================================

create table if not exists notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null,          -- references users.id OR customers.id
  title       text not null,
  message     text not null,
  type        text not null default 'info'
                check (type in ('info','success','warning','error')),
  entity      text,                   -- e.g. 'transaction', 'loan', 'account'
  entity_id   text,                   -- UUID of the related record
  read        boolean not null default false,
  created_at  timestamptz default now()
);

-- Indexes for fast per-user queries
create index if not exists idx_notifications_user    on notifications(user_id);
create index if not exists idx_notifications_unread  on notifications(user_id, read) where read = false;
create index if not exists idx_notifications_created on notifications(created_at desc);

-- RLS
alter table notifications enable row level security;
create policy "allow_all_authenticated" on notifications for all using (true) with check (true);

-- Enable Realtime on this table (required for live push to customer app)
alter publication supabase_realtime add table notifications;
