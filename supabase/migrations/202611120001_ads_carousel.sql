-- VagaFácil | anúncios administráveis
create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  alt_text text not null,
  image_path text not null,
  link_url text,
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ads_active_order_idx on public.ads(active, sort_order, created_at);
alter table public.ads enable row level security;
create policy "citizens read active ads and admins read all" on public.ads
for select to authenticated
using (active = true or private.current_app_role() = 'admin');
create policy "admins insert ads" on public.ads
for insert to authenticated
with check (private.current_app_role() = 'admin' and (created_by is null or created_by = (select auth.uid())));
create policy "admins update ads" on public.ads
for update to authenticated
using (private.current_app_role() = 'admin')
with check (private.current_app_role() = 'admin');
create policy "admins delete ads" on public.ads
for delete to authenticated
using (private.current_app_role() = 'admin');
grant select, insert, update, delete on public.ads to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vagafacil-ads', 'vagafacil-ads', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy "admins read ad images" on storage.objects
for select to authenticated
using (bucket_id = 'vagafacil-ads' and private.current_app_role() = 'admin');
create policy "admins upload ad images" on storage.objects
for insert to authenticated
with check (bucket_id = 'vagafacil-ads' and private.current_app_role() = 'admin');
create policy "admins update ad images" on storage.objects
for update to authenticated
using (bucket_id = 'vagafacil-ads' and private.current_app_role() = 'admin')
with check (bucket_id = 'vagafacil-ads' and private.current_app_role() = 'admin');
create policy "admins delete ad images" on storage.objects
for delete to authenticated
using (bucket_id = 'vagafacil-ads' and private.current_app_role() = 'admin');
