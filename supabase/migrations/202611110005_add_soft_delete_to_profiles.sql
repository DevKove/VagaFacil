alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_active_not_deleted_idx
  on public.profiles (full_name)
  where deleted_at is null and is_active = true;
