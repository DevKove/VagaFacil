create policy "notifications admin insert"
on public.notifications
for insert
to authenticated
with check (
  private.current_app_role() = 'admin'::public.app_role
);
