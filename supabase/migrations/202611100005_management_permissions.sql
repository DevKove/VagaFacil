-- Permite que a gestão atribua perfis e suspenda contas sem abrir autoelevação.
drop policy if exists "profiles update self or management" on public.profiles;

create policy "profiles update own safe fields" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (
  id = (select auth.uid())
  and role = private.current_app_role()
  and is_active = true
);

create policy "management update profiles" on public.profiles
for update to authenticated
using (private.current_app_role() in ('admin','supervisor'))
with check (private.current_app_role() in ('admin','supervisor'));

grant update (role, is_active) on public.profiles to authenticated;
