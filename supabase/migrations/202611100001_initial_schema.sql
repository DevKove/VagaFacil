-- VagaFácil | Migration inicial
-- Revise os parâmetros regulamentares com o município antes de ativar em produção.
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','supervisor','agent','citizen');
create type public.parking_category as enum ('conventional','elderly','accessible');
create type public.parking_status as enum ('active','expired','finished','cancelled');
create type public.alert_status as enum ('open','claimed','resolved','dismissed');
create type public.enforcement_status as enum ('in_progress','regular','irregular','closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  cpf text unique,
  phone text,
  role public.app_role not null default 'citizen',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plate text not null,
  make text,
  model text,
  color text,
  vehicle_type text,
  created_at timestamptz not null default now(),
  unique(owner_id, plate),
  check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$')
);
create table public.parking_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  boundary jsonb,
  created_at timestamptz not null default now()
);
create table public.parking_spaces (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid references public.parking_zones(id) on delete set null,
  code text not null unique,
  category public.parking_category not null default 'conventional',
  latitude double precision,
  longitude double precision,
  active boolean not null default true,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);
create table public.parking_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Sao_Paulo',
  weekdays smallint[] not null default array[1,2,3,4,5],
  start_time time not null default '09:00',
  end_time time not null default '18:00',
  saturday_start time default '09:00',
  saturday_end time default '13:00',
  conventional_minutes integer not null default 60 check (conventional_minutes > 0),
  special_minutes integer not null default 120 check (special_minutes > 0),
  grace_minutes integer not null default 0 check (grace_minutes >= 0),
  enabled boolean not null default true,
  effective_from date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  scope text not null check (scope in ('national','state','municipal')),
  free_parking boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.parking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  vehicle_id uuid not null references public.vehicles(id),
  space_id uuid references public.parking_spaces(id),
  plate_snapshot text not null,
  category public.parking_category not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  status public.parking_status not null default 'active',
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  check (expires_at > started_at),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);
create unique index one_active_session_per_vehicle on public.parking_sessions(vehicle_id) where status = 'active';
create index parking_sessions_expiry_idx on public.parking_sessions(status, expires_at);
create index parking_sessions_user_idx on public.parking_sessions(user_id, started_at desc);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.parking_sessions(id) on delete cascade,
  status public.alert_status not null default 'open',
  severity text not null check (severity in ('attention','expired','enforcement')),
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(session_id, severity)
);
create table public.enforcements (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null unique references public.alerts(id),
  agent_id uuid not null references public.profiles(id),
  status public.enforcement_status not null default 'in_progress',
  result text,
  notes text,
  verified_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.enforcement_photos (
  id uuid primary key default gen_random_uuid(),
  enforcement_id uuid not null references public.enforcements(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Função privilegiada isolada em schema não exposto: evita recursão de RLS
-- ao consultar o perfil usado pelas próprias políticas.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create or replace function private.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active = true
$;
revoke all on function private.current_app_role() from public, anon;
grant execute on function private.current_app_role() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    'citizen'
  );
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.parking_zones enable row level security;
alter table public.parking_spaces enable row level security;
alter table public.parking_rules enable row level security;
alter table public.holidays enable row level security;
alter table public.parking_sessions enable row level security;
alter table public.alerts enable row level security;
alter table public.enforcements enable row level security;
alter table public.enforcement_photos enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles read self or management" on public.profiles for select to authenticated
using (id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor'));
create policy "profiles update self or management" on public.profiles for update to authenticated
using (id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor'))
with check (id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor'));

create policy "vehicles owner or management read" on public.vehicles for select to authenticated
using (owner_id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor','agent'));
create policy "vehicles owner manage" on public.vehicles for all to authenticated
using (owner_id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor'))
with check (owner_id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor'));

create policy "active spaces readable" on public.parking_spaces for select to authenticated using (active or private.current_app_role() in ('admin','supervisor','agent'));
create policy "management spaces write" on public.parking_spaces for all to authenticated
using (private.current_app_role() in ('admin','supervisor'))
with check (private.current_app_role() in ('admin','supervisor'));
create policy "zones authenticated read" on public.parking_zones for select to authenticated using (true);
create policy "management zones write" on public.parking_zones for all to authenticated
using (private.current_app_role() in ('admin','supervisor'))
with check (private.current_app_role() in ('admin','supervisor'));
create policy "rules authenticated read" on public.parking_rules for select to authenticated using (enabled or private.current_app_role() in ('admin','supervisor'));
create policy "management rules write" on public.parking_rules for all to authenticated
using (private.current_app_role() in ('admin','supervisor'))
with check (private.current_app_role() in ('admin','supervisor'));
create policy "holidays authenticated read" on public.holidays for select to authenticated using (true);
create policy "management holidays write" on public.holidays for all to authenticated
using (private.current_app_role() in ('admin','supervisor'))
with check (private.current_app_role() in ('admin','supervisor'));

create policy "sessions owner or operations read" on public.parking_sessions for select to authenticated
using (user_id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor','agent'));
create policy "citizen creates own session" on public.parking_sessions for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));
create policy "owner ends own session or management" on public.parking_sessions for update to authenticated
using (user_id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor','agent'))
with check (user_id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor','agent'));

create policy "operations alerts read" on public.alerts for select to authenticated
using (private.current_app_role() in ('admin','supervisor','agent'));
create policy "operations alerts update" on public.alerts for update to authenticated
using (private.current_app_role() in ('admin','supervisor','agent'))
with check (private.current_app_role() in ('admin','supervisor','agent'));
create policy "enforcements operations read" on public.enforcements for select to authenticated
using (private.current_app_role() in ('admin','supervisor','agent'));
create policy "agents create enforcement" on public.enforcements for insert to authenticated
with check (agent_id = (select auth.uid()) and private.current_app_role() in ('admin','supervisor','agent'));
create policy "agents update own enforcement" on public.enforcements for update to authenticated
using (agent_id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor'))
with check (agent_id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor'));
create policy "photos operations read" on public.enforcement_photos for select to authenticated
using (private.current_app_role() in ('admin','supervisor','agent'));
create policy "photos operations write" on public.enforcement_photos for all to authenticated
using (private.current_app_role() in ('admin','supervisor','agent'))
with check (private.current_app_role() in ('admin','supervisor','agent'));
create policy "notifications own read" on public.notifications for select to authenticated
using (user_id = (select auth.uid()) or private.current_app_role() in ('admin','supervisor'));
create policy "notifications own update" on public.notifications for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "audit management read" on public.audit_logs for select to authenticated
using (private.current_app_role() in ('admin','supervisor'));
create policy "audit authenticated insert" on public.audit_logs for insert to authenticated
with check (actor_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, delete on public.profiles to authenticated;
grant update(full_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on public.vehicles, public.parking_zones, public.parking_spaces, public.parking_rules, public.holidays, public.alerts, public.enforcements, public.enforcement_photos, public.notifications, public.audit_logs to authenticated;
-- Sessões não aceitam INSERT/UPDATE direto do navegador. O fluxo de criação/encerramento
-- deverá ser implementado por RPC transacional que calcule expiração no servidor.
grant select on public.parking_sessions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- IMPORTANTE: o papel inicial é cidadão. Promova o primeiro administrador manualmente,
-- por canal administrativo seguro, após criar a conta. Nunca aceite role enviado pelo navegador.
