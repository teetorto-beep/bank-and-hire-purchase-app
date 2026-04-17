-- System settings table — stores key/value config including approval rules
create table if not exists system_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz default now(),
  updated_by  text
);

-- Insert default approval rules
insert into system_settings (key, value) values (
  'approval_rules',
  '{
    "credit_threshold":    { "enabled": true,  "amount": 10000, "roles": ["teller", "collector"] },
    "debit_threshold":     { "enabled": true,  "amount": 5000,  "roles": ["teller", "collector"] },
    "transfer_threshold":  { "enabled": true,  "amount": 5000,  "roles": ["teller","manager"] },
    "account_opening":     { "enabled": false, "roles": ["teller"] },
    "loan_creation":       { "enabled": true,  "roles": ["teller"] },
    "gl_entry":            { "enabled": true,  "roles": ["teller","manager"] },
    "customer_creation":   { "enabled": false, "roles": ["teller"] },
    "user_creation":       { "enabled": false, "roles": [] }
  }'::jsonb
) on conflict (key) do nothing;

-- RLS
alter table system_settings enable row level security;
create policy "allow_all_authenticated" on system_settings for all using (true) with check (true);
