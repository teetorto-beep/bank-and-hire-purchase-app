-- Add push_token column to customers for Expo push notifications
alter table customers add column if not exists push_token text;
