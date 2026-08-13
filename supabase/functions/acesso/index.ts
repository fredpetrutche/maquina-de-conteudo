/* ============================================================
   acesso — cadastro e primeiro acesso do especialista
   ------------------------------------------------------------
   A pessoa entra com o @ dela e uma senha. Por dentro, o @ vira
   um endereço técnico e quem guarda a senha é o Supabase Auth —
   não escrevo guarda de senha à mão, esse é o tipo de código que
   parece simples e vaza depois.

     POST { acao: 'criar',   instagram, telefone, nome, senha }
     POST { acao: 'primeiro', instagram, telefone, senha }
     POST { acao: 'existe',  instagram }
   ============================================================ */

const URL_SUPA = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DOMINIO = 'ig.maquinadeconteudo.app'; // só interno, nunca recebe e-mail

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (c: unknown, s = 200) =>
  new Response(JSON.stringify(c), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
};

function limparInsta(v: string): string | null {
  let p = String(v || '').trim().toLowerCase();
  const m = p.match(/instagram\.com\/([^/?#]+)/);
  if (m) p = m[1];
  p = p.replace(/^@/, '').replace(/[/?#].*$/, '');
  return /^[a-z0-9._]{1,30}$/.test(p) ? p : null;
}
function limparTel(v: string): string | null {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return /^55[1-9][0-9][0-9]{8,9}$/.test(d) ? d : null;
}
const enderecoDe = (ig: string) => `${ig}@${DOMINIO}`;

async function acharUsuario(email: string) {
  const r = await fetch(
    `${URL_SUPA}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: admin },
  );
  if (!r.ok) return null;
  const d = await r.json();
  const lista = d.users ?? d ?? [];
  return lista.find((u: { email?: string }) => (u.email || '').toLowerCase() === email) ?? null;
}

async function acharFicha(ig: string) {
  const r = await fetch(
    `${URL_SUPA}/rest/v1/fichas?instagram=eq.${encodeURIComponent(ig)}&select=id,nome,telefone`,
    { headers: admin },
  );
  if (!r.ok) return null;
  const l = await r.json();
  return l[0] ?? null;
}

/** entra de verdade e devolve a sessão, com refresh para não expirar */
async function entrar(email: string, senha: string) {
  const r = await fetch(`${URL_SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SERVICE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  return { ok: r.ok, corpo: await r.json() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ erro: 'use POST' }, 405);

  let c: Record<string, string>;
  try { c = await req.json(); } catch { return responder({ erro: 'corpo inválido' }, 400); }

  const ig = limparInsta(c.instagram ?? '');
  if (!ig) return responder({ erro: 'Confira o @ do Instagram.' }, 400);
  const email = enderecoDe(ig);

  try {
    /* ---------- só conferir o estado do @ ---------- */
    if (c.acao === 'existe') {
      const [u, f] = await Promise.all([acharUsuario(email), acharFicha(ig)]);
      return responder({ temConta: !!u, temFicha: !!f, nome: f?.nome ?? null });
    }

    const senha = String(c.senha ?? '');
    if (senha.length < 6) return responder({ erro: 'A senha precisa de pelo menos 6 caracteres.' }, 400);

    /* ---------- primeiro acesso de quem já tem ficha ---------- */
    if (c.acao === 'primeiro') {
      const f = await acharFicha(ig);
      if (!f) return responder({ erro: 'Não encontrei ficha para esse @.' }, 404);
      if (await acharUsuario(email)) {
        return responder({ erro: 'Esse @ já tem senha. Use "Entrar".' }, 409);
      }
      const tel = limparTel(c.telefone ?? '');
      if (!tel || tel !== f.telefone) {
        return responder({ erro: 'O celular não confere com o que está na ficha.' }, 403);
      }
      const r = await fetch(`${URL_SUPA}/auth/v1/admin/users`, {
        method: 'POST', headers: admin,
        body: JSON.stringify({
          email, password: senha, email_confirm: true,
          user_metadata: { instagram: ig, ficha_id: f.id, nome: f.nome },
        }),
      });
      if (!r.ok) return responder({ erro: 'Não consegui criar o acesso.' }, 502);
      const s = await entrar(email, senha);
      return responder({ ok: true, ficha_id: f.id, sessao: s.corpo });
    }

    /* ---------- cadastro novo ---------- */
    if (c.acao === 'criar') {
      if (await acharUsuario(email)) {
        return responder({ erro: 'Esse @ já tem acesso. Use "Entrar".' }, 409);
      }
      const tel = limparTel(c.telefone ?? '');
      if (!tel) return responder({ erro: 'Confira o celular: precisa do DDD e do número completo.' }, 400);
      const nome = String(c.nome ?? '').trim();
      if (nome.length < 2) return responder({ erro: 'Escreva o seu nome.' }, 400);

      const jaTem = await acharFicha(ig);
      const fichaId = jaTem?.id ?? crypto.randomUUID();

      const r = await fetch(`${URL_SUPA}/auth/v1/admin/users`, {
        method: 'POST', headers: admin,
        body: JSON.stringify({
          email, password: senha, email_confirm: true,
          user_metadata: { instagram: ig, ficha_id: fichaId, nome },
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        return responder({ erro: 'Não consegui criar o acesso: ' + t.slice(0, 120) }, 502);
      }

      if (jaTem) {
        /* CUIDADO: salvar_ficha sobrescreve `dados` inteiro. Chamar com {}
           aqui apagaria a ficha de quem já preencheu — foi assim que a do
           Matheus sumiu. Em ficha existente, mexo só em nome e telefone. */
        await fetch(`${URL_SUPA}/rest/v1/fichas?id=eq.${fichaId}`, {
          method: 'PATCH',
          headers: { ...admin, Prefer: 'return=minimal' },
          body: JSON.stringify({ nome, telefone: tel }),
        });
      } else {
        await fetch(`${URL_SUPA}/rest/v1/rpc/salvar_ficha`, {
          method: 'POST', headers: admin,
          body: JSON.stringify({
            p_id: fichaId, p_instagram: ig, p_telefone: tel, p_nome: nome,
            p_dados: {}, p_etapa: 'briefing', p_progresso: 0,
          }),
        });
      }

      const s = await entrar(email, senha);
      return responder({ ok: true, ficha_id: fichaId, sessao: s.corpo });
    }

    return responder({ erro: 'ação desconhecida' }, 400);
  } catch (e) {
    return responder({ erro: String(e).slice(0, 200) }, 500);
  }
});
