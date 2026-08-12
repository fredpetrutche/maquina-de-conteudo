#!/usr/bin/env node
/* ============================================================
   Trabalhador de transcrição — roda na máquina do Fred
   ------------------------------------------------------------
   Por que aqui e não no servidor: baixar vídeo do Instagram
   exige yt-dlp com cookies de sessão, e yt-dlp e ffmpeg são
   binários — não rodam numa função do Supabase.

   Reusa o que o bot do Telegram já usa: yt-dlp + Groq whisper.

   Pega sempre o item de menor "ordem": os dez primeiros que a
   pessoa mandou saem na frente, para ela já começar a gravar.
   ============================================================ */

const { execSync } = require('child_process');
const YTDLP = process.env.YTDLP || '/opt/homebrew/bin/yt-dlp';
const fs = require('fs');
const os = require('os');
const path = require('path');

const SUPA = 'https://mkajvxyiyqxotiydkylq.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const GROQ = process.env.GROQ_API_KEY;
const COOKIES = process.env.IG_COOKIES ||
  '/Users/fredpetrutche/Documents/Claude Code/telegram-transcricao-video-instagram/cookies.txt';

const PAUSA_VAZIO = 15000; // sem trabalho: espera 15s
const PAUSA_ENTRE = 1500;  // entre um e outro

if (!SERVICE || !GROQ) {
  console.error('Faltam variáveis: SUPABASE_SERVICE_KEY e GROQ_API_KEY');
  process.exit(1);
}

const cabecalhos = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
};

async function rpc(fn, corpo = {}) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: cabecalhos, body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function concluir(id, campos) {
  const r = await fetch(`${SUPA}/rest/v1/transcricoes?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...cabecalhos, Prefer: 'return=minimal' },
    body: JSON.stringify(campos),
  });
  if (!r.ok) throw new Error(`gravar: ${r.status}`);
}

/** baixa só o áudio; com cookies quando for Instagram */
function baixarAudio(url, destino) {
  // O YouTube bloqueia download automatizado sem cookies próprios.
  // Falhamos na hora em vez de deixar o yt-dlp pendurado por minutos.
  if (/youtube\.com|youtu\.be/i.test(url) && !process.env.YT_COOKIES) {
    throw new Error('YouTube exige cookies próprios (defina YT_COOKIES) — baixar bloqueado');
  }
  const usaCookies = /instagram\.com/i.test(url) && fs.existsSync(COOKIES);
  const cookieArg = usaCookies ? `--cookies ${JSON.stringify(COOKIES)}` : '';
  execSync(
    `${YTDLP} -x --audio-format mp3 --audio-quality 5 ${cookieArg} ` +
    `-o ${JSON.stringify(destino)} ${JSON.stringify(url)} 2>/dev/null`,
    { stdio: 'pipe', timeout: 120000 },
  );
}

async function transcrever(arquivo) {
  const dados = new FormData();
  dados.append('file', new Blob([fs.readFileSync(arquivo)]), path.basename(arquivo));
  dados.append('model', 'whisper-large-v3');
  dados.append('response_format', 'verbose_json'); // precisamos do idioma detectado

  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ}` },
    body: dados,
  });
  if (!r.ok) throw new Error(`groq ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const j = await r.json();
  return { texto: String(j.text || '').trim(), idioma: String(j.language || '').toLowerCase() };
}

/* Guardamos original e tradução porque o especialista, lendo o
   roteiro em português, costuma querer trocar uma palavra — e
   para isso precisa ver o que a frase dizia no original. */
async function traduzir(texto) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      messages: [
        { role: 'system', content:
          'Traduza para português do Brasil. Mantenha o ritmo de fala e a força do gancho — ' +
          'é roteiro para ser lido em voz alta, não texto acadêmico. Preserve números, nomes ' +
          'e marcas. Responda só com a tradução, sem comentário.' },
        { role: 'user', content: texto },
      ],
    }),
  });
  if (!r.ok) throw new Error(`tradução ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const j = await r.json();
  return String(j.choices?.[0]?.message?.content || '').trim();
}

/* pt-BR e pt-PT chegam do whisper como 'portuguese' ou 'pt' */
function ehPortugues(idioma) {
  return /^(pt|portuguese|português)/i.test(String(idioma || ''));
}

async function umaVolta() {
  const fila = await rpc('pegar_trabalho');
  if (!Array.isArray(fila) || !fila.length) return false;

  const item = fila[0];
  const rotulo = `#${item.ordem} ${item.perfil || ''} ${item.url.slice(-24)}`;
  const tmp = path.join(os.tmpdir(), `mc-${item.id}.mp3`);

  try {
    console.log(`▸ ${rotulo}`);
    baixarAudio(item.url, tmp);
    if (!fs.existsSync(tmp)) throw new Error('yt-dlp não gerou áudio');

    const { texto, idioma } = await transcrever(tmp);
    if (!texto) throw new Error('transcrição vazia');

    if (ehPortugues(idioma)) {
      // Benchmark tem que ser em outra língua: copiado ipsis litteris,
      // vira conteúdo novo em português. Em português já é o idioma
      // final, então não serve de benchmark — fica registrado e para aqui.
      await concluir(item.id, {
        estado: 'portugues', idioma, texto, texto_pt: null,
        erro: 'referência já está em português — não serve de benchmark',
      });
      console.log('  ↷ português: guardado, sem traduzir');
      return true;
    }

    const texto_pt = await traduzir(texto);
    await concluir(item.id, { estado: 'pronto', idioma, texto, texto_pt, erro: null });
    console.log(`  ✓ ${idioma} · ${texto.length} car. → pt ${texto_pt.length} car.`);
  } catch (e) {
    const msg = String(e.message || e).slice(0, 300);
    const desiste = item.tentativas >= 3;
    await concluir(item.id, { estado: desiste ? 'erro' : 'pendente', erro: msg });
    console.log(`  ✗ ${msg}${desiste ? ' (desisti)' : ' (tento de novo)'}`);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
  return true;
}

(async function girar() {
  console.log('Trabalhador de transcrição no ar. Ctrl+C para parar.');
  for (;;) {
    let teve = false;
    try {
      teve = await umaVolta();
    } catch (e) {
      console.error('erro na volta:', String(e.message || e).slice(0, 160));
    }
    await new Promise((r) => setTimeout(r, teve ? PAUSA_ENTRE : PAUSA_VAZIO));
  }
})();
