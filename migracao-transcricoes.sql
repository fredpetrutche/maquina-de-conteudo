-- ============================================================
-- Fila de transcrição
-- A pessoa manda os vídeos; os dez primeiros entram na frente,
-- porque com dez ela já começa a gravar. O resto vai atrás.
-- ============================================================

create table if not exists public.transcricoes (
  id            uuid primary key default gen_random_uuid(),
  ficha_id      uuid references public.fichas(id) on delete cascade,
  url           text not null,
  perfil        text,
  titulo        text,
  ordem         int  not null default 999,   -- 1..10 = primeira leva
  estado        text not null default 'pendente', -- pendente|fazendo|pronto|erro
  texto         text,
  erro          text,
  tentativas    int  not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (ficha_id, url)
);

create index if not exists transcricoes_fila_idx
  on public.transcricoes (estado, ordem, criado_em);

alter table public.transcricoes enable row level security;

-- visitante não toca na tabela direto; só o dono lê tudo
drop policy if exists "admin le transcricoes" on public.transcricoes;
create policy "admin le transcricoes" on public.transcricoes
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') = lower('fred.petrutche@gmail.com'));

drop trigger if exists trg_touch_tr on public.transcricoes;
create trigger trg_touch_tr before update on public.transcricoes
for each row execute function public.touch_atualizado();

-- ------------------------------------------------------------
-- enfileirar: o app manda a lista, a função cuida da ordem
-- ------------------------------------------------------------
create or replace function public.enfileirar(p_ficha uuid, p_videos jsonb)
returns table (pendentes int, prontos int)
language plpgsql security definer set search_path = public as $$
declare v record; i int := 0;
begin
  if p_ficha is null then raise exception 'ficha obrigatoria'; end if;

  for v in select * from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as e(item)
  loop
    i := i + 1;
    insert into public.transcricoes (ficha_id, url, perfil, titulo, ordem)
    values (p_ficha,
            v.item->>'url',
            v.item->>'perfil',
            left(coalesce(v.item->>'titulo', ''), 300),
            i)
    on conflict (ficha_id, url) do update
      set ordem = least(public.transcricoes.ordem, excluded.ordem),
          titulo = coalesce(nullif(excluded.titulo, ''), public.transcricoes.titulo);
  end loop;

  return query
    select count(*) filter (where estado in ('pendente','fazendo'))::int,
           count(*) filter (where estado = 'pronto')::int
      from public.transcricoes where ficha_id = p_ficha;
end $$;

-- ------------------------------------------------------------
-- como está a minha fila (o app pergunta de tempos em tempos)
-- ------------------------------------------------------------
create or replace function public.estado_fila(p_ficha uuid)
returns table (total int, prontos int, fazendo int, erros int)
language sql security definer set search_path = public as $$
  select count(*)::int,
         count(*) filter (where estado = 'pronto')::int,
         count(*) filter (where estado = 'fazendo')::int,
         count(*) filter (where estado = 'erro')::int
    from public.transcricoes where ficha_id = p_ficha;
$$;

revoke all on function public.enfileirar(uuid, jsonb) from public;
revoke all on function public.estado_fila(uuid) from public;
grant execute on function public.enfileirar(uuid, jsonb) to anon, authenticated;
grant execute on function public.estado_fila(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- o trabalhador pega um item por vez, sem dois pegarem o mesmo
-- (chamada só com service_role, de dentro da máquina do Fred)
-- ------------------------------------------------------------
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
