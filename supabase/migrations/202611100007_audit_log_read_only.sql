-- Impede que clientes autenticados fabriquem eventos na trilha de auditoria.
drop policy if exists "audit authenticated insert" on public.audit_logs;
revoke insert, update, delete on public.audit_logs from authenticated;
