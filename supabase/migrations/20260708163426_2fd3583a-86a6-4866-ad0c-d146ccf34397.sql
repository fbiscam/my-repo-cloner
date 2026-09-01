create table public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  label text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index trusted_devices_user_idx on public.trusted_devices(user_id);
create index trusted_devices_expires_idx on public.trusted_devices(expires_at);

grant select, insert, update, delete on public.trusted_devices to authenticated;
grant all on public.trusted_devices to service_role;

alter table public.trusted_devices enable row level security;

create policy "own trusted devices select" on public.trusted_devices
  for select to authenticated using (auth.uid() = user_id);
create policy "own trusted devices insert" on public.trusted_devices
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own trusted devices update" on public.trusted_devices
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own trusted devices delete" on public.trusted_devices
  for delete to authenticated using (auth.uid() = user_id);