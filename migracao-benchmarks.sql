-- ============================================================
-- Benchmarks em tabela própria (item 3.3)
-- Estavam dentro de fichas.dados. O worker precisa escrever neles,
-- e salvar_ficha sobrescreve `dados` inteiro — é assim que ficha
-- some. Tabela separada = uma fonte só, sem corrida.
-- ============================================================

create table if not exists public.benchmarks (
  id          uuid primary key default gen_random_uuid(),
  ficha_id    uuid not null references public.fichas(id) on delete cascade,
  url         text not null,
  codigo      text,                       -- shortcode do Instagram
  perfil      text,
  perfil_nome text,
  titulo      text,
  metricas    jsonb,                      -- views, curtidas, comentários, compartilhamentos…
  estado      text not null default 'pendente',  -- pendente|pronto|erro
  erro        text,
  tentativas  int  not null default 0,
  criado_em   timestamptz not null default now(),
  unique (ficha_id, url)
);
create index if not exists benchmarks_fila_idx on public.benchmarks (estado, criado_em);
create index if not exists benchmarks_ficha_idx on public.benchmarks (ficha_id);

alter table public.benchmarks enable row level security;
drop policy if exists "admin le benchmarks" on public.benchmarks;
create policy "admin le benchmarks" on public.benchmarks
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') = lower('fred.petrutche@gmail.com'));

-- o app entrega os links colados
create or replace function public.guardar_benchmarks(p_ficha uuid, p_urls jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v text; n int := 0; cod text;
begin
  if p_ficha is null then raise exception 'ficha obrigatoria'; end if;
  for v in select jsonb_array_elements_text(coalesce(p_urls, '[]'::jsonb))
  loop
    v := btrim(v);
    continue when v = '' or length(v) > 500;
    cod := (regexp_match(v, '/(?:reel|reels|p|tv)/([A-Za-z0-9_-]+)'))[1];
    insert into public.benchmarks (ficha_id, url, codigo)
    values (p_ficha, v, cod)
    on conflict (ficha_id, url) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.meus_benchmarks(p_ficha uuid)
returns table (url text, perfil text, perfil_nome text, titulo text,
               metricas jsonb, estado text, erro text)
language sql security definer set search_path = public as $$
  select b.url, b.perfil, b.perfil_nome, b.titulo, b.metricas, b.estado, b.erro
    from public.benchmarks b
   where b.ficha_id = p_ficha
   order by coalesce((b.metricas->>'views')::bigint, 0) desc, b.criado_em;
$$;

create or replace function public.tirar_benchmark(p_ficha uuid, p_url text)
returns void language sql security definer set search_path = public as $$
  delete from public.benchmarks where ficha_id = p_ficha and url = p_url;
$$;

revoke all on function public.guardar_benchmarks(uuid, jsonb) from public;
revoke all on function public.meus_benchmarks(uuid) from public;
revoke all on function public.tirar_benchmark(uuid, text) from public;
grant execute on function public.guardar_benchmarks(uuid, jsonb) to anon, authenticated;
grant execute on function public.meus_benchmarks(uuid) to anon, authenticated;
grant execute on function public.tirar_benchmark(uuid, text) to anon, authenticated;

-- o worker pega um por vez
create or replace function public.pegar_benchmark()
returns setof public.benchmarks
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.benchmarks b set tentativas = b.tentativas + 1
   where b.id = (
     select id from public.benchmarks
      where estado = 'pendente' and tentativas < 3
      order by criado_em limit 1 for update skip locked
   )
  returning b.*;
end $$;
revoke all on function public.pegar_benchmark() from public, anon, authenticated;
