-- Evidências fotográficas privadas e trilha de auditoria.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('enforcement-evidence', 'enforcement-evidence', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=5242880, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "operations upload own evidence" on storage.objects;
create policy "operations upload own evidence" on storage.objects for insert to authenticated
with check (bucket_id='enforcement-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text and private.current_app_role() in ('admin','supervisor','agent'));
drop policy if exists "operations read evidence" on storage.objects;
create policy "operations read evidence" on storage.objects for select to authenticated
using (bucket_id='enforcement-evidence' and private.current_app_role() in ('admin','supervisor','agent'));
drop policy if exists "operations delete own evidence" on storage.objects;
create policy "operations delete own evidence" on storage.objects for delete to authenticated
using (bucket_id='enforcement-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text and private.current_app_role() in ('admin','supervisor','agent'));

create or replace function private.write_audit_log()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := auth.uid(); v_id uuid; v_action text;
begin
  if tg_op='DELETE' then v_id:=old.id; v_action:=lower(tg_table_name)||'.delete';
  elsif tg_op='INSERT' then v_id:=new.id; v_action:=lower(tg_table_name)||'.insert';
  else v_id:=new.id; v_action:=lower(tg_table_name)||'.update'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_actor,v_action,tg_table_name,v_id,jsonb_build_object('source','database_trigger','operation',tg_op));
  if tg_op='DELETE' then return old; end if; return new;
end; $$;
revoke all on function private.write_audit_log() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array['profiles','parking_zones','parking_spaces','parking_rules','holidays','alerts','enforcements','enforcement_photos'] loop
    execute format('drop trigger if exists audit_%I on public.%I',t,t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t,t);
  end loop;
end; $$;
grant select,insert,delete on public.enforcement_photos to authenticated;
