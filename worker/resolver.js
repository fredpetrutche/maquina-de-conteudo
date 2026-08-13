#!/usr/bin/env node
/* ============================================================
   resolver.js — descobre os dados de um Reel a partir do link
   ------------------------------------------------------------
   A pessoa cola o link e pronto: autor, views, curtidas,
   comentários, COMPARTILHAMENTOS e duração vêm sozinhos.

   Roda na máquina do Fred porque usa a sessão logada do
   Instagram (cookies.txt). Sem o Mac ligado, os links ficam
   pendentes — é o preço de não pôr a sessão num servidor.

   API interna e não documentada: pode mudar sem aviso. Quando
   falhar, o link fica marcado e a pessoa digita à mão.
   ============================================================ */

const fs = require('fs');
const path = require('path');

(function env() {
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
})();

const SUPA = 'https://mkajvxyiyqxotiydkylq.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const COOKIES = process.env.IG_COOKIES ||
  '/Users/fredpetrutche/Documents/Claude Code/telegram-transcricao-video-instagram/cookies.txt';
const PAUSA_VAZIO = 12000;
const PAUSA_ENTRE = 2500;   // devagar de propósito: rajada derruba a sessão

if (!SERVICE) { console.error('falta SUPABASE_SERVICE_KEY'); process.exit(1); }
const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

/** o cookies.txt do yt-dlp vira cabeçalho Cookie */
function lerCookies() {
  if (!fs.existsSync(COOKIES)) return null;
  const pares = [];
  for (const l of fs.readFileSync(COOKIES, 'utf8').split('\n')) {
    if (!l.trim() || l.startsWith('#')) continue;
    const c = l.replace(/\n$/, '').split('\t');
    if (c.length >= 7 && /instagram/i.test(c[0])) pares.push(`${c[5]}=${c[6]}`);
  }
  return pares.length ? pares.join('; ') : null;
}

/* shortcode → media_id: base64 com o alfabeto do Instagram */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function mediaId(codigo) {
  let n = 0n;
  for (const ch of String(codigo || '')) {
    const i = ALFABETO.indexOf(ch);
    if (i < 0) return null;
    n = n * 64n + BigInt(i);
  }
  return n ? n.toString() : null;
}
function codigoDe(url) {
  const m = String(url || '').match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

async function buscar(codigo, cookie) {
  const id = mediaId(codigo);
  if (!id) throw new Error('não entendi o código do link');
  const r = await fetch(`https://www.instagram.com/api/v1/media/${id}/info/`, {
    headers: {
      Cookie: cookie,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'X-IG-App-ID': '936619743392459',
    },
  });
  if (r.status === 401 || r.status === 403) throw new Error('SESSAO');
  if (r.status === 429) throw new Error('RITMO');
  if (!r.ok) throw new Error(`instagram respondeu ${r.status}`);
  const d = await r.json();
  const it = (d.items || [])[0];
  if (!it) throw new Error('vídeo não encontrado ou está privado');

  const views = it.play_count || it.view_count || it.ig_play_count || 0;
  const compart = it.media_repost_count ?? null;
  return {
    perfil: (it.user || {}).username || null,
    perfil_nome: (it.user || {}).full_name || null,
    titulo: ((it.caption || {}).text || '').replace(/\s+/g, ' ').trim().slice(0, 280),
    metricas: {
      views,
      curtidas: it.like_count ?? null,
      comentarios: it.comment_count ?? null,
      compartilhamentos: compart,
      // quanto veio de cada plataforma — só o Instagram entrega isso
      views_instagram: it.ig_play_count ?? null,
      views_facebook: it.fb_play_count ?? null,
      taxa_compartilhamento: (compart && views) ? +((compart / views) * 100).toFixed(2) : null,
      duracao_s: it.video_duration ? Math.round(it.video_duration) : null,
      publicado_em: it.taken_at ? new Date(it.taken_at * 1000).toISOString() : null,
    },
  };
}

async function gravar(id, campos) {
  const r = await fetch(`${SUPA}/rest/v1/benchmarks?id=eq.${id}`, {
    method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(campos),
  });
  if (!r.ok) throw new Error(`gravar: ${r.status}`);
}

let avisouSessao = false;

async function umaVolta(cookie) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/pegar_benchmark`, { method: 'POST', headers: h, body: '{}' });
  if (!r.ok) throw new Error(`fila: ${r.status}`);
  const fila = await r.json();
  if (!Array.isArray(fila) || !fila.length) return false;

  const b = fila[0];
  const codigo = b.codigo || codigoDe(b.url);
  try {
    const d = await buscar(codigo, cookie);
    await gravar(b.id, { ...d, codigo, estado: 'pronto', erro: null });
    avisouSessao = false;
    console.log(`  ✓ @${d.perfil} · ${d.metricas.views} views · ${d.metricas.compartilhamentos ?? '—'} compart.`);
  } catch (e) {
    const msg = String(e.message || e);
    if (msg === 'SESSAO') {
      // não adianta insistir: devolve para a fila e avisa uma vez só
      await gravar(b.id, { estado: 'pendente', tentativas: 0, erro: 'sessão do Instagram expirada' });
      if (!avisouSessao) {
        console.error('\n  ⚠ A SESSÃO DO INSTAGRAM EXPIROU.');
        console.error('    Exporte cookies.txt de novo — até lá nenhum link resolve.\n');
        avisouSessao = true;
      }
      await new Promise((r) => setTimeout(r, 60000));
      return true;
    }
    if (msg === 'RITMO') {
      await gravar(b.id, { estado: 'pendente', tentativas: Math.max(0, b.tentativas - 1) });
      console.log('  · pediram calma; esperando 2 min');
      await new Promise((r) => setTimeout(r, 120000));
      return true;
    }
    const desiste = b.tentativas >= 3;
    await gravar(b.id, { estado: desiste ? 'erro' : 'pendente', erro: msg.slice(0, 200) });
    console.log(`  ✗ ${b.url.slice(-22)}: ${msg.slice(0, 70)}${desiste ? ' (desisti)' : ''}`);
  }
  return true;
}

(async function girar() {
  const cookie = lerCookies();
  if (!cookie) { console.error('não achei cookies do Instagram em ' + COOKIES); process.exit(1); }
  console.log(`Resolvedor de links no ar (${cookie.split(';').length} cookies). Ctrl+C para parar.`);
  for (;;) {
    let teve = false;
    try { teve = await umaVolta(cookie); }
    catch (e) { console.error('erro na volta:', String(e.message || e).slice(0, 140)); }
    await new Promise((r) => setTimeout(r, teve ? PAUSA_ENTRE : PAUSA_VAZIO));
  }
})();
