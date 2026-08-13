-- ============================================================
-- Painel sem senha (decisão do Fred, temporária).
-- Em vez de abrir a tabela para o anônimo, exponho só uma função
-- de leitura. Assim, voltar a fechar é revogar uma linha:
--   revoke execute on function public.painel_aberto() from anon;
-- ============================================================
create or replace function public.painel_aberto()
returns table (id uuid, instagram text, nome text, telefone text,
               etapa text, progresso int, criado_em timestamptz,
               atualizado_em timestamptz, comunidade text,
               macro_nicho text, sub_nicho text, dados jsonb)
language sql security definer set search_path = public as $$
  select f.id, f.instagram, f.nome, f.telefone, f.etapa, f.progresso,
         f.criado_em, f.atualizado_em,
         coalesce(f.dados->>'comunidade','') as comunidade,
         coalesce(f.dados->>'macroNicho','') as macro_nicho,
         coalesce(f.dados->>'subNicho','')   as sub_nicho,
         f.dados
    from public.fichas f
   order by f.atualizado_em desc;
$$;
revoke all on function public.painel_aberto() from public;
grant execute on function public.painel_aberto() to anon, authenticated;
