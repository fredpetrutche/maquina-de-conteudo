-- lista as transcrições de uma ficha, para a pessoa ver as prontas
create or replace function public.minhas_transcricoes(p_ficha uuid)
returns table (url text, perfil text, titulo text, idioma text,
               estado text, texto text, texto_pt text, ordem int)
language sql security definer set search_path = public as $$
  select t.url, t.perfil, t.titulo, t.idioma, t.estado, t.texto, t.texto_pt, t.ordem
    from public.transcricoes t
   where t.ficha_id = p_ficha
   order by (t.estado = 'pronto') desc, t.ordem asc;
$$;
revoke all on function public.minhas_transcricoes(uuid) from public;
grant execute on function public.minhas_transcricoes(uuid) to anon, authenticated;
