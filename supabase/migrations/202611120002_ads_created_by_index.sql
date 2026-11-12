-- Indexa a chave estrangeira usada para auditoria de autoria dos anúncios.
create index if not exists ads_created_by_idx on public.ads(created_by);
