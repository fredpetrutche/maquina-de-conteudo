-- ============================================================
-- MÁQUINA DE CONTEÚDO — schema
-- Segurança: o cliente anônimo NÃO acessa a tabela diretamente.
-- Todo acesso passa por duas funções SECURITY DEFINER, que operam
-- em exatamente uma linha. Isso impede que alguém com a chave
-- pública (que fica visível no repositório) liste ou apague tudo.
-- ============================================================

create table if not exists public.fichas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  email         text not null,
  dados         jsonb not null default '{}'::jsonb,
  etapa         text  not null default 'briefing',
  progresso     int   not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists fichas_email_idx      on public.fichas (lower(email));
create index if not exists fichas_atualizado_idx on public.fichas (atualizado_em desc);

alter table public.fichas enable row level security;

-- Nenhuma policy para anon = tabela fechada para o cliente público.
-- Somente o admin autenticado enxerga tudo.
drop policy if exists "admin le tudo" on public.fichas;
create policy "admin le tudo" on public.fichas
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') = lower('fred.petrutche@gmail.com'));

-- ------------------------------------------------------------
-- atualizado_em automático
-- ------------------------------------------------------------
create or replace function public.touch_atualizado()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

drop trigger if exists trg_touch on public.fichas;
create trigger trg_touch before update on public.fichas
for each row execute function public.touch_atualizado();

-- ------------------------------------------------------------
-- salvar_ficha: cria ou atualiza UMA linha, sempre
-- ------------------------------------------------------------
create or replace function public.salvar_ficha(
  p_id        uuid,
  p_nome      text,
  p_email     text,
  p_dados     jsonb,
  p_etapa     text,
  p_progresso int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'nome obrigatorio';
  end if;
  if p_email is null or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'email invalido';
  end if;
  if length(coalesce(p_dados::text, '')) > 400000 then
    raise exception 'payload grande demais';
  end if;

  if p_id is not null then
    update public.fichas
       set dados = p_dados,
           etapa = coalesce(nullif(btrim(p_etapa), ''), etapa),
           progresso = greatest(0, least(3, coalesce(p_progresso, progresso))),
           nome  = btrim(p_nome),
           email = lower(btrim(p_email))
     where id = p_id
     returning id into v_id;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.fichas (id, nome, email, dados, etapa, progresso)
  values (coalesce(p_id, gen_random_uuid()), btrim(p_nome), lower(btrim(p_email)),
          coalesce(p_dados, '{}'::jsonb),
          coalesce(nullif(btrim(p_etapa), ''), 'briefing'),
          greatest(0, least(3, coalesce(p_progresso, 0))))
  returning id into v_id;

  return v_id;
end $$;

-- ------------------------------------------------------------
-- retomar_ficha: recupera a própria ficha em outro aparelho,
-- exigindo o código (o uuid, que só o dono tem)
-- ------------------------------------------------------------
create or replace function public.retomar_ficha(p_id uuid)
returns table (id uuid, nome text, email text, dados jsonb)
language sql security definer set search_path = public as $$
  select f.id, f.nome, f.email, f.dados
    from public.fichas f
   where f.id = p_id;
$$;

revoke all on function public.salvar_ficha(uuid, text, text, jsonb, text, int) from public;
revoke all on function public.retomar_ficha(uuid) from public;
grant execute on function public.salvar_ficha(uuid, text, text, jsonb, text, int) to anon, authenticated;
grant execute on function public.retomar_ficha(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- visão do painel (só admin enxerga, via RLS da tabela base)
-- ------------------------------------------------------------
create or replace view public.painel
with (security_invoker = true) as
select id, nome, email, etapa, progresso, criado_em, atualizado_em,
       coalesce(dados->>'comunidade','')  as comunidade,
       coalesce(dados->>'macroNicho','')  as macro_nicho,
       coalesce(dados->>'subNicho','')    as sub_nicho,
       dados
  from public.fichas
 order by atualizado_em desc;

grant select on public.painel to authenticated;
