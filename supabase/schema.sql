-- Run once in Supabase dashboard -> SQL editor.
create table if not exists messages (
  id bigserial primary key,
  run_id text not null,
  phase int,
  turn int,
  sender text,
  type text,
  body jsonb not null,
  prev_hash text,
  hash text,
  created_at timestamptz default now()
);

-- Live updates for the web page
alter publication supabase_realtime add table messages;

-- Browser (anon key) can only read. Python backend uses the service key, which bypasses RLS.
alter table messages enable row level security;
create policy "public read" on messages for select using (true);
