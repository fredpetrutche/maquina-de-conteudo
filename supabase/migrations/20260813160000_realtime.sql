-- ============================================================
-- Realtime nas duas tabelas que os trabalhadores vigiavam
-- ------------------------------------------------------------
-- Antes: maquina-analise e maquina-resolver perguntavam ao banco
-- de 12 em 12 segundos — 14 mil consultas por dia para quase
-- sempre ouvir "não tem nada".
--
-- Depois: o banco avisa quando a linha muda, e eles ficam calados.
--
-- Não altera dado, coluna nem RLS. Quem escuta continua sendo só
-- quem já tinha permissão de ler: as políticas seguem valendo, e
-- `fichas` não tem política nenhuma para anon.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fichas'
  ) then
    alter publication supabase_realtime add table public.fichas;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'benchmarks'
  ) then
    alter publication supabase_realtime add table public.benchmarks;
  end if;
end $$;
