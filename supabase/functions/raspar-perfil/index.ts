/* ============================================================
   raspar-perfil — busca os vídeos mais vistos de um perfil
   ------------------------------------------------------------
   O app é estático e público, então o token da Apify não pode
   ficar nele. Esta função guarda o token do lado do servidor e
   é a única que fala com a Apify.

   Duas chamadas, porque raspar demora mais do que uma requisição
   aguenta esperar:
     POST { perfil }        → { runId }
     POST { runId }         → { pronto, videos[] }
   ============================================================ */

const APIFY = 'https://api.apify.com/v2';
const ATOR = 'apify~instagram-scraper';
const LIMITE = 30;          // posts lidos por perfil
const TETO_POR_PERFIL = 30; // quantos devolvemos, já ordenados

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** aceita @perfil, perfil, ou qualquer link do Instagram */
function normalizarPerfil(bruto: string): string | null {
  let p = String(bruto || '').trim();
  const comLink = p.match(/instagram\.com\/([^/?#]+)/i);
  if (comLink) p = comLink[1];
  p = p.replace(/^@/, '').replace(/\/$/, '').trim();
  // caminhos que não são perfil
  if (!p || /^(p|reel|reels|tv|explore|stories|accounts)$/i.test(p)) return null;
  if (!/^[A-Za-z0-9._]{1,30}$/.test(p)) return null;
  return p.toLowerCase();
}

function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** a Apify muda nome de campo entre versões; lemos com tolerância */
function extrair(item: Record<string, unknown>) {
  const views = Math.max(
    numero(item.videoPlayCount),
    numero(item.videoViewCount),
    numero(item.playCount),
    numero(item.viewCount),
  );
  const legenda = String(item.caption ?? '').replace(/\s+/g, ' ').trim();
  return {
    url: String(item.url ?? ''),
    codigo: String(item.shortCode ?? ''),
    tipo: String(item.productType ?? item.type ?? ''),
    legenda: legenda.slice(0, 220),
    views,
    curtidas: numero(item.likesCount),
    comentarios: numero(item.commentsCount),
    quando: String(item.timestamp ?? ''),
    perfil: String(item.ownerUsername ?? ''),
    perfilNome: String(item.ownerFullName ?? ''),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ erro: 'use POST' }, 405);

  const token = Deno.env.get('APIFY_TOKEN');
  if (!token) return responder({ erro: 'servidor sem token configurado' }, 500);

  let corpo: { perfil?: string; runId?: string };
  try {
    corpo = await req.json();
  } catch {
    return responder({ erro: 'corpo inválido' }, 400);
  }

  try {
    /* ---------- 2ª chamada: como está a raspagem? ---------- */
    if (corpo.runId) {
      if (!/^[A-Za-z0-9]{6,32}$/.test(corpo.runId)) {
        return responder({ erro: 'runId inválido' }, 400);
      }
      const r = await fetch(`${APIFY}/actor-runs/${corpo.runId}?token=${token}`);
      if (!r.ok) return responder({ erro: 'não consegui consultar a raspagem' }, 502);
      const { data } = await r.json();

      if (data.status === 'RUNNING' || data.status === 'READY') {
        return responder({ pronto: false, status: data.status });
      }
      if (data.status !== 'SUCCEEDED') {
        return responder({ pronto: true, erro: 'a raspagem falhou (' + data.status + ')', videos: [] });
      }

      const d = await fetch(
        `${APIFY}/datasets/${data.defaultDatasetId}/items?token=${token}&clean=true&limit=200`,
      );
      if (!d.ok) return responder({ erro: 'não consegui ler o resultado' }, 502);
      const itens = await d.json();

      const videos = (Array.isArray(itens) ? itens : [])
        .map(extrair)
        .filter((v) => v.url && v.views > 0)
        .sort((a, b) => b.views - a.views)
        .slice(0, TETO_POR_PERFIL);

      // o nome do perfil vem de brinde: a pessoa não precisa digitar
      const nome = videos.find((v) => v.perfilNome)?.perfilNome ?? '';
      return responder({
        pronto: true, videos, nome,
        lidos: Array.isArray(itens) ? itens.length : 0,
      });
    }

    /* ---------- 1ª chamada: começar a raspagem ---------- */
    const perfil = normalizarPerfil(corpo.perfil ?? '');
    if (!perfil) return responder({ erro: 'perfil inválido' }, 400);

    const r = await fetch(`${APIFY}/acts/${ATOR}/runs?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${perfil}/`],
        resultsType: 'posts',
        resultsLimit: LIMITE,
        addParentData: false,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return responder({ erro: 'a Apify recusou: ' + t.slice(0, 160) }, 502);
    }
    const { data } = await r.json();
    return responder({ runId: data.id, perfil });
  } catch (e) {
    return responder({ erro: String(e).slice(0, 200) }, 500);
  }
});
