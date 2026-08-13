-- ============================================================
-- Fila de análise de perfil (item 3.2 + 2.1)
-- O app pede; o trabalhador na máquina do Fred lê, roda o CLI do
-- Claude e devolve a ficha preenchida. Aditivo: não mexe em
-- nenhuma coluna nem assinatura existente.
-- ============================================================

alter table public.fichas add column if not exists analise_estado text;   -- pedida|fazendo|pronta|erro
alter table public.fichas add column if not exists analise_em     timestamptz;
alter table public.fichas add column if not exists analise_erro   text;
alter table public.fichas add column if not exists sugestao       jsonb;  -- o que a IA propôs, antes de a pessoa corrigir

comment on column public.fichas.sugestao is
  'ficha proposta pela análise; a pessoa corrige e o resultado vai para dados';

create index if not exists fichas_analise_idx on public.fichas (analise_estado, analise_em);

-- o app pede a análise
create or replace function public.pedir_analise(p_ficha uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select analise_estado into v from public.fichas where id = p_ficha;
  if v in ('pedida','fazendo') then return v; end if;
  update public.fichas
     set analise_estado = 'pedida', analise_em = now(), analise_erro = null
   where id = p_ficha;
  return 'pedida';
end $$;

-- o app pergunta como está
create or replace function public.estado_analise(p_ficha uuid)
returns table (estado text, erro text, sugestao jsonb)
language sql security definer set search_path = public as $$
  select f.analise_estado, f.analise_erro, f.sugestao
    from public.fichas f where f.id = p_ficha;
$$;

revoke all on function public.pedir_analise(uuid)  from public;
revoke all on function public.estado_analise(uuid) from public;
grant execute on function public.pedir_analise(uuid)  to anon, authenticated;
grant execute on function public.estado_analise(uuid) to anon, authenticated;

-- o trabalhador pega uma por vez, sem dois pegarem a mesma
create or replace function public.pegar_analise()
returns setof public.fichas
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.fichas f set analise_estado = 'fazendo'
   where f.id = (
     select id from public.fichas
      where analise_estado = 'pedida'
      order by analise_em asc limit 1 for update skip locked
   )
  returning f.*;
end $$;
revoke all on function public.pegar_analise() from public, anon, authenticated;
