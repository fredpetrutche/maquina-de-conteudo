#!/usr/bin/env node
/* ============================================================
   Importa para o sistema o que já foi transcrito em arquivo.
   Os .md têm mais informação do que a minha fila produzia —
   compartilhamentos, curtidas, duração — então eles mandam.

     node importar-arquivos.js <@perfil>
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
const BASE = path.resolve(__dirname, '..', '..');
const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

const num = (s) => parseInt(String(s ?? '').replace(/\D/g, ''), 10) || 0;

/** os arquivos de benchmark trazem métricas no cabeçalho */
function lerBenchmark(txt, arquivo) {
  const perfil = (txt.match(/^#\s*@?([^\s—]+)/) || [])[1] || path.basename(arquivo).split('-')[0];
  const url = (txt.match(/\*\*Link:\*\*\s*(\S+)/) || [])[1] || '';
  const corpo = txt.split(/##\s*Transcri[çc][ãa]o/i)[1] || txt.split(/\n---\n/).slice(-1)[0] || '';
  return {
    perfil, url,
    titulo: ((txt.match(/\*\*Legenda:\*\*\s*(.+)/) || [])[1] || '').trim().slice(0, 280),
    texto: corpo.trim(),
    metricas: {
      views: num((txt.match(/—\s*([\d.]+)\s*views/) || [])[1]),
      compartilhamentos: num((txt.match(/\*\*Compartilhamentos:\*\*\s*([\d.]+)/) || [])[1]),
      taxa_compartilhamento: (txt.match(/\(([\d.,]+)%\s*de quem viu\)/) || [])[1] || null,
      curtidas: num((txt.match(/\*\*Curtidas:\*\*\s*([\d.]+)/) || [])[1]),
      comentarios: num((txt.match(/\*\*Coment[áa]rios:\*\*\s*([\d.]+)/) || [])[1]),
      duracao_s: num((txt.match(/\*\*Dura[çc][ãa]o:\*\*\s*(\d+)/) || [])[1]),
    },
  };
}

/** os do próprio perfil são mais simples: título, link, texto */
function lerProprio(txt) {
  const titulo = ((txt.match(/^#\s*(.+?)\s*—/) || [])[1] || '').trim();
  const url = (txt.match(/(https:\/\/www\.instagram\.com\/\S+)/) || [])[1] || '';
  const corpo = txt.split(/\n---\n/).slice(1).join('\n---\n');
  return {
    perfil: null, url, titulo,
    texto: corpo.trim(),
    metricas: { views: num((txt.match(/—\s*([\d.]+)\s*views/) || [])[1]) },
  };
}

function ehPortugues(t) {
  const amostra = t.slice(0, 900).toLowerCase();
  const marcas = [' que ', ' você ', ' não ', ' uma ', ' para ', ' está ', ' são ', ' com '];
  return marcas.filter((m) => amostra.includes(m)).length >= 4;
}

async function api(caminho, metodo, corpo) {
  const r = await fetch(`${SUPA}/rest/v1${caminho}`, {
    method: metodo, headers: { ...h, Prefer: 'return=representation' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : null;
}

(async function () {
  const alvo = (process.argv[2] || '').replace(/^@/, '').toLowerCase();
  if (!alvo) { console.error('uso: node importar-arquivos.js <@perfil>'); process.exit(1); }

  const fichas = await api(`/fichas?instagram=eq.${alvo}&select=id,nome`, 'GET');
  if (!fichas.length) { console.error(`não achei ficha de @${alvo}`); process.exit(1); }
  const ficha = fichas[0];
  console.log(`ficha de @${alvo} (${ficha.nome || 'sem nome'})\n`);

  /* o nome das pastas segue o primeiro nome da pessoa, não o @ —
     então detectamos em vez de adivinhar */
  const dirs = fs.readdirSync(BASE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^transcricoes-/i.test(d.name)).map((d) => d.name);
  const bench = process.argv[3] || dirs.filter((d) => /benchmark/i.test(d));
  const prop = process.argv[4] || dirs.filter((d) => !/benchmark/i.test(d));
  const escolher = (v, rotulo) => {
    const a = Array.isArray(v) ? v : [v];
    if (a.length === 1) return a[0];
    console.log(`· ${rotulo}: ${a.length ? 'ambíguo (' + a.join(', ') + ')' : 'nenhuma pasta'} — passe por argumento`);
    return null;
  };
  const pastas = [
    { dir: escolher(bench, 'benchmarks'), tipo: 'benchmark', ler: lerBenchmark },
    { dir: escolher(prop, 'próprios'), tipo: 'proprio', ler: lerProprio },
  ].filter((p) => p.dir);

  for (const p of pastas) {
    const dir = path.join(BASE, p.dir);
    if (!fs.existsSync(dir)) { console.log(`· ${p.dir}: pasta não encontrada`); continue; }
    const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    console.log(`· ${p.dir} — ${arquivos.length} arquivo(s), tipo "${p.tipo}"`);

    let i = 0, pt = 0, ok = 0;
    for (const a of arquivos) {
      i++;
      const bruto = fs.readFileSync(path.join(dir, a), 'utf8');
      const d = p.ler(bruto, a);
      if (!d.url || !d.texto) { console.log(`   ✗ ${a}: sem link ou sem texto`); continue; }
      const emPt = ehPortugues(d.texto);
      if (emPt) pt++; else ok++;

      // o arquivo manda: apaga o que a fila tinha feito para esta url
      await api(`/transcricoes?ficha_id=eq.${ficha.id}&url=eq.${encodeURIComponent(d.url)}`, 'DELETE');
      await api('/transcricoes', 'POST', {
        ficha_id: ficha.id, url: d.url, perfil: d.perfil || `@${alvo}`,
        titulo: d.titulo, ordem: i, tipo: p.tipo, origem: 'arquivo',
        estado: p.tipo === 'proprio' ? 'pronto' : (emPt ? 'portugues' : 'pronto'),
        idioma: emPt ? 'portuguese' : 'english',
        texto: d.texto, texto_pt: emPt ? null : null,
        erro: emPt && p.tipo === 'benchmark' ? 'referência em português — não vira roteiro' : null,
        metricas: d.metricas,
      });
    }
    console.log(`   → ${ok} em outra língua · ${pt} em português`);
  }

  const vozes = fs.readdirSync(BASE).filter((f) => /^voz-do-.*\.md$/i.test(f));
  const vozArq = path.join(BASE, process.argv[5] || vozes[0] || 'nao-existe.md');
  if (fs.existsSync(vozArq)) {
    await fetch(`${SUPA}/rest/v1/rpc/guardar_voz`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ p_ficha: ficha.id, p_voz: fs.readFileSync(vozArq, 'utf8') }),
    });
    console.log(`\n· voz importada de ${path.basename(vozArq)}`);
  } else {
    console.log(`\n· voz não encontrada em ${path.basename(vozArq)}`);
  }
  console.log('\npronto.');
})();
