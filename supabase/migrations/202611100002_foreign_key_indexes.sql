-- Índices para as chaves estrangeiras sinalizadas pelo Database Linter.
create index if not exists alerts_claimed_by_idx on public.alerts(claimed_by);
create index if not exists audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index if not exists enforcement_photos_enforcement_id_idx on public.enforcement_photos(enforcement_id);
create index if not exists enforcements_agent_id_idx on public.enforcements(agent_id);
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists parking_rules_created_by_idx on public.parking_rules(created_by);
create index if not exists parking_sessions_space_id_idx on public.parking_sessions(space_id);
create index if not exists parking_spaces_zone_id_idx on public.parking_spaces(zone_id);
