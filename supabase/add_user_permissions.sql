-- Add custom permissions column to users table
-- Stores a JSON array of module names the user can access.
-- NULL means "use role defaults".
alter table users add column if not exists permissions jsonb default null;
