-- ============================================================
-- O identificador passa a ser o @ do Instagram.
-- O nome sai da porta de entrada: a gente puxa do próprio perfil
-- na raspagem, um campo a menos para a pessoa preencher.
-- ============================================================

alter table public.fichas add column if not exists instagram text;
alter table public.fichas alter column nome drop not null;
create index if not exists fichas_instagram_idx on public.fichas (lower(instagram));

drop view if exists public.painel;
drop function if exists public.salvar_ficha(uuid, text, text, jsonb, text, int);
drop function if exists public.retomar_ficha(uuid);

create function public.salvar_ficha(
  p_id        uuid,
  p_instagram text,
  p_telefone  text,
  p_nome      text,
  p_dados     jsonb,
  p_etapa     text,
  p_progresso int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tel text; v_ig text;
begin
  -- aceita @perfil, perfil ou link; guarda sempre sem o @
  v_ig := lower(btrim(coalesce(p_instagram, '')));
  v_ig := regexp_replace(v_ig, '^https?://(www\.)?instagram\.com/', '');
  v_ig := regexp_replace(v_ig, '[/?#].*$', '');
  v_ig := regexp_replace(v_ig, '^@', '');
  if v_ig !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'instagram invalido';
  end if;

  v_tel := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if length(v_tel) in (10, 11) then v_tel := '55' || v_tel; end if;
  if v_tel !~ '^55[1-9][0-9][0-9]{8,9}$' then
    raise exception 'celular invalido';
  end if;

  if length(coalesce(p_dados::text, '')) > 400000 then
    raise exception 'payload grande demais';
  end if;

  if p_id is not null then
    update public.fichas
       set dados = p_dados,
           etapa = coalesce(nullif(btrim(p_etapa), ''), etapa),
           progresso = greatest(0, least(3, coalesce(p_progresso, progresso))),
           instagram = v_ig,
           telefone = v_tel,
           nome = coalesce(nullif(btrim(p_nome), ''), nome)
     where id = p_id
     returning id into v_id;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.fichas (id, instagram, telefone, nome, dados, etapa, progresso)
  values (coalesce(p_id, gen_random_uuid()), v_ig, v_tel,
          nullif(btrim(coalesce(p_nome, '')), ''),
          coalesce(p_dados, '{}'::jsonb),
          coalesce(nullif(btrim(p_etapa), ''), 'briefing'),
          greatest(0, least(3, coalesce(p_progresso, 0))))
  returning id into v_id;

  return v_id;
end $$;

create function public.retomar_ficha(p_id uuid)
returns table (id uuid, instagram text, telefone text, nome text, dados jsonb)
language sql security definer set search_path = public as $$
  select f.id, f.instagram, f.telefone, f.nome, f.dados
    from public.fichas f where f.id = p_id;
$$;

revoke all on function public.salvar_ficha(uuid, text, text, text, jsonb, text, int) from public;
revoke all on function public.retomar_ficha(uuid) from public;
grant execute on function public.salvar_ficha(uuid, text, text, text, jsonb, text, int) to anon, authenticated;
grant execute on function public.retomar_ficha(uuid) to anon, authenticated;

create view public.painel
with (security_invoker = true) as
select id, instagram, nome, telefone, etapa, progresso, criado_em, atualizado_em,
       coalesce(dados->>'comunidade','') as comunidade,
       coalesce(dados->>'macroNicho','') as macro_nicho,
       coalesce(dados->>'subNicho','')   as sub_nicho,
       dados
  from public.fichas
 order by atualizado_em desc;

grant select on public.painel to authenticated;
