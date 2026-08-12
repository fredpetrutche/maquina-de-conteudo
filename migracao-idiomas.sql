-- ============================================================
-- Princípio do benchmark em outra língua
-- ------------------------------------------------------------
-- Copiar ipsis litteris um vídeo em outro idioma produz conteúdo
-- NOVO em português — não há risco de plágio. Por isso:
--   · vídeo em outra língua  → transcreve, guarda original E tradução
--   · vídeo em português     → fica registrado, mas não é processado
-- Guardamos as duas versões porque o especialista, ao ler o
-- roteiro em português, costuma querer trocar palavras — e para
-- isso ele precisa ver o que a frase dizia no original.
-- ============================================================

alter table public.transcricoes add column if not exists idioma   text;
alter table public.transcricoes add column if not exists texto_pt text;

comment on column public.transcricoes.texto    is 'transcrição no idioma original';
comment on column public.transcricoes.texto_pt is 'tradução para português; nulo quando o original já é pt';
comment on column public.transcricoes.idioma   is 'idioma detectado pelo whisper (en, es, pt...)';

-- português não entra na fila de trabalho
create or replace function public.pegar_trabalho()
returns setof public.transcricoes
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.transcricoes t
     set estado = 'fazendo', tentativas = t.tentativas + 1
   where t.id = (
     select id from public.transcricoes
      where estado = 'pendente' and tentativas < 3
      order by ordem asc, criado_em asc
      limit 1
      for update skip locked
   )
  returning t.*;
end $$;
revoke all on function public.pegar_trabalho() from public, anon, authenticated;

-- o painel de estado passa a separar o que ficou de fora por ser pt
drop function if exists public.estado_fila(uuid);
create function public.estado_fila(p_ficha uuid)
returns table (total int, prontos int, fazendo int, erros int, em_portugues int)
language sql security definer set search_path = public as $$
  select count(*)::int,
         count(*) filter (where estado = 'pronto')::int,
         count(*) filter (where estado = 'fazendo')::int,
         count(*) filter (where estado = 'erro')::int,
         count(*) filter (where estado = 'portugues')::int
    from public.transcricoes where ficha_id = p_ficha;
$$;
revoke all on function public.estado_fila(uuid) from public;
grant execute on function public.estado_fila(uuid) to anon, authenticated;
