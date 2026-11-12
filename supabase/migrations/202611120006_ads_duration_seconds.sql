alter table public.ads
  add column if not exists duration_seconds integer not null default 5;

alter table public.ads
  drop constraint if exists ads_duration_seconds_check;

alter table public.ads
  add constraint ads_duration_seconds_check
  check (duration_seconds between 1 and 120);
