-- ============================================================
-- Troca o identificador de e-mail para celular.
-- O telefone é guardado normalizado em E.164 sem o "+"
-- (ex: 5511987654321), que é o formato que a Cloud API da Meta
-- espera — assim o disparo futuro por WhatsApp não precisa
-- converter nada.
-- ============================================================

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='fichas' and column_name='email') then
    alter table public.fichas rename column email to telefone;
  end if;
end $$;

drop index if exists fichas_email_idx;
create index if not exists fichas_telefone_idx on public.fichas (telefone);

-- as funções precisam cair antes: não dá para renomear parâmetro
-- nem coluna de retorno com CREATE OR REPLACE
drop view if exists public.painel;
drop function if exists public.salvar_ficha(uuid, text, text, jsonb, text, int);
drop function if exists public.retomar_ficha(uuid);

-- salvar_ficha agora valida celular brasileiro
create function public.salvar_ficha(
  p_id        uuid,
  p_nome      text,
  p_telefone  text,
  p_dados     jsonb,
  p_etapa     text,
  p_progresso int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tel text;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'nome obrigatorio';
  end if;

  v_tel := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  -- aceita com ou sem o código do país e completa quando falta
  if length(v_tel) in (10, 11) then
    v_tel := '55' || v_tel;
  end if;
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
           nome = btrim(p_nome),
           telefone = v_tel
     where id = p_id
     returning id into v_id;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.fichas (id, nome, telefone, dados, etapa, progresso)
  values (coalesce(p_id, gen_random_uuid()), btrim(p_nome), v_tel,
          coalesce(p_dados, '{}'::jsonb),
          coalesce(nullif(btrim(p_etapa), ''), 'briefing'),
          greatest(0, least(3, coalesce(p_progresso, 0))))
  returning id into v_id;

  return v_id;
end $$;

create function public.retomar_ficha(p_id uuid)
returns table (id uuid, nome text, telefone text, dados jsonb)
language sql security definer set search_path = public as $$
  select f.id, f.nome, f.telefone, f.dados
    from public.fichas f
   where f.id = p_id;
$$;

revoke all on function public.salvar_ficha(uuid, text, text, jsonb, text, int) from public;
revoke all on function public.retomar_ficha(uuid) from public;
grant execute on function public.salvar_ficha(uuid, text, text, jsonb, text, int) to anon, authenticated;
grant execute on function public.retomar_ficha(uuid) to anon, authenticated;

create view public.painel
with (security_invoker = true) as
select id, nome, telefone, etapa, progresso, criado_em, atualizado_em,
       coalesce(dados->>'comunidade','') as comunidade,
       coalesce(dados->>'macroNicho','') as macro_nicho,
       coalesce(dados->>'subNicho','')   as sub_nicho,
       dados
  from public.fichas
 order by atualizado_em desc;

grant select on public.painel to authenticated;
