#!/usr/bin/env node
/* ============================================================
   analisar.js — monta a ficha a partir do que a pessoa já postou
   ------------------------------------------------------------
   Perguntar "sobre o que você fala?" para quem tem centenas de
   posts é pedir que ela devolva o que já entregou — e ela
   responde o que gostaria de ser, não o que é. A raspagem tem a
   resposta factual, com métrica junto.

   Roda na máquina do Fred pelo CLI do Claude (assinatura, não
   crédito de API). Processo próprio no pm2, separado do
   transcrever.js.
   ============================================================ */

const { execFileSync } = require('child_process');
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
const CLAUDE = process.env.CLAUDE_BIN || '/opt/homebrew/bin/claude';
const PAUSA = 12000;

if (!SERVICE) { console.error('falta SUPABASE_SERVICE_KEY'); process.exit(1); }
const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

async function rpc(fn, corpo = {}) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h, body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${(await r.text()).slice(0, 140)}`);
  return r.json();
}
async function gravar(id, campos) {
  const r = await fetch(`${SUPA}/rest/v1/fichas?id=eq.${id}`, {
    method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(campos),
  });
  if (!r.ok) throw new Error(`gravar: ${r.status}`);
}

const INSTRUCAO = `Você recebe os vídeos que um especialista já publicou no Instagram, com as
visualizações de cada um. Monte a Fase 0 da ficha dele a partir DISSO — do que ele
demonstrou, não do que seria bonito dizer.

Regras que não podem ser quebradas:

1. MACRO-NICHO: o território amplo, o que alguém digitaria numa busca. Duas palavras no
   máximo. Não é a profissão dele nem o produto.

2. RECORTE: um só, dentro do macro-nicho. Pare na segunda camada. "mulheres de negócios"
   serve; "empresárias com mais de 10 funcionários que querem sair do operacional" não —
   o algoritmo não lê isso em milissegundos.

3. TEMAS: até 10 — quantos os vídeos sustentarem, e cada um com os RECORTES que ele já
   publicou dentro dele. Se der 6, entregue 6. Se der 10, entregue 10. Não invente tema
   para fechar a conta, e não pare antes se houver material. A meta é 10; o teto é o que
   os vídeos provam.
   Esta distinção é o que mais erra:
     - "Dízimo" é RECORTE. O TEMA é "Dinheiro".
     - "Paulo — vida, cartas, prisão" é RECORTE. O TEMA é "História dos personagens bíblicos".
     - "Sexo antes do casamento" é RECORTE. O TEMA é "Namoro e casamento".
   Tema errado fecha o assunto em cinco vídeos; tema certo abre em cinquenta.
   Em cada recorte, cite o vídeo que o comprova e as views dele.
   Ordene os temas pela soma de views que eles já provaram.

4. ASSINATURA: proponha DUAS opções, na fórmula
   "Meu nome é [NOME] e eu [ENTREGA] [PROMESSA] todos os dias."
   A promessa é RESULTADO, nunca processo. "ensino mulheres a terem mais lucro" serve;
   "ajudo a sair do operacional delegando com assertividade" não.
   Cada uma tem que caber num fôlego — até uns 110 caracteres.

5. LEITURA: em 2 ou 3 frases, o que separa os vídeos do topo dos de baixo. Aponte o padrão
   concreto (formato de abertura, tipo de assunto, duração), não elogio genérico.

6. RESSALVAS: preencha a ficha SEMPRE, mas diga em voz alta onde a leitura ficou fraca.
   Uma ressalva é um aviso honesto de que aquela parte pode estar errada, com o motivo.
   Levante ressalva quando:
     - houver poucos vídeos para sustentar a conclusão;
     - os assuntos forem divergentes demais para caber num nicho só — diga quais grupos
       você viu, em vez de forçar um nicho que não existe;
     - der para perceber que a pessoa mudou de assunto ao longo do tempo, e os vídeos
       recentes não combinarem com os antigos;
     - as visualizações forem baixas demais para servirem de prova de alguma coisa;
     - um tema aparecer com um vídeo só — não dá para chamar de tema com uma amostra.
   Se não houver ressalva de verdade, devolva lista vazia. Não invente ressalva para
   parecer cuidadoso, e não amenize uma que exista.

Responda SÓ com este JSON, sem cercas de código e sem comentário:

{
  "macroNicho": "",
  "subNicho": "",
  "temas": [
    {"tema": "", "recortes": [{"recorte": "", "prova": "", "views": 0}]}
  ],
  "assinaturas": [
    {"sigNome": "", "sigEntrega": "", "sigPromessa": ""},
    {"sigNome": "", "sigEntrega": "", "sigPromessa": ""}
  ],
  "leitura": "",
  "ressalvas": [{"sobre": "", "aviso": ""}]
}`;

function pensar(prompt) {
  const saida = execFileSync(CLAUDE, ['-p', prompt, '--output-format', 'json'], {
    encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 600000,
  });
  const env = JSON.parse(saida);
  if (env.is_error) throw new Error(String(env.result || 'o modelo devolveu erro').slice(0, 200));
  let t = String(env.result || '').trim();
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (cerca) t = cerca[1].trim();
  const i = t.indexOf('{'), f = t.lastIndexOf('}');
  if (i < 0 || f < 0) throw new Error('não veio JSON: ' + t.slice(0, 160));
  return JSON.parse(t.slice(i, f + 1));
}

function conferir(s) {
  const erros = [];
  if (!s.macroNicho) erros.push('sem macro-nicho');
  if (!s.subNicho) erros.push('sem recorte');
  if (!Array.isArray(s.temas) || !s.temas.length) erros.push('nenhum tema');
  if (!Array.isArray(s.assinaturas) || !s.assinaturas.length) erros.push('sem assinatura');
  (s.assinaturas || []).forEach((a, i) => {
    const frase = `Meu nome é ${a.sigNome} e eu ${a.sigEntrega} ${a.sigPromessa} todos os dias.`;
    if (frase.length > 130) erros.push(`assinatura ${i + 1} longa demais (${frase.length})`);
  });
  if (erros.length) throw new Error(erros.join(' · '));
  return s;
}

async function umaVolta() {
  const fila = await rpc('pegar_analise');
  if (!Array.isArray(fila) || !fila.length) return false;
  const f = fila[0];

  /* Preferimos as transcrições dos vídeos DELE: é o texto inteiro do
     que ele falou, não só a legenda. Só caímos para as legendas
     raspadas quando ainda não houver transcrição. */
  const r = await fetch(
    `${SUPA}/rest/v1/transcricoes?ficha_id=eq.${f.id}&tipo=eq.proprio&select=titulo,texto,metricas`,
    { headers: h },
  );
  const trs = r.ok ? await r.json() : [];
  let videos = trs.filter((t) => t.texto).map((t) => ({
    views: (t.metricas || {}).views || 0,
    texto: `${t.titulo ? t.titulo + ' — ' : ''}${String(t.texto).slice(0, 1200)}`,
  }));

  if (videos.length < 5) {
    videos = ((f.dados || {}).meusVideos || [])
      .filter((v) => v && (v.legenda || v.titulo))
      .map((v) => ({ views: v.views || 0, texto: String(v.legenda || v.titulo || '').slice(0, 300) }));
  }
  videos = videos.sort((a, b) => b.views - a.views).slice(0, 25);

  console.log(`▸ @${f.instagram} — ${videos.length} vídeo(s) para ler`);
  try {
    if (!videos.length) throw new Error('não achei nenhum vídeo no perfil para ler');
    const prompt = `${INSTRUCAO}\n\nNome: ${f.nome || '(não informado)'}\n\nVídeos publicados, do mais visto para o menos:\n${
      videos.map((v, i) => `${i + 1}. [${v.views} views] ${v.texto}`).join('\n')}`;
    const s = conferir(pensar(prompt));
    s.ressalvas = Array.isArray(s.ressalvas) ? s.ressalvas : [];
    s.lidos = videos.length;
    if (videos.length < 8) {
      s.ressalvas.unshift({
        sobre: 'Tamanho da amostra',
        aviso: `Li ${videos.length} vídeo(s) do seu perfil. É pouco para afirmar com segurança — trate isto como ponto de partida, não como diagnóstico.`,
      });
    }
    await gravar(f.id, {
      sugestao: s, analise_estado: 'pronta', analise_em: new Date().toISOString(), analise_erro: null,
    });
    console.log(`  ✓ ${s.macroNicho} · ${s.subNicho} · ${s.temas.length} temas · ${s.ressalvas.length} ressalva(s)`);
  } catch (e) {
    const msg = String(e.message || e).slice(0, 280);
    await gravar(f.id, { analise_estado: 'erro', analise_erro: msg });
    console.log(`  ✗ ${msg}`);
  }
  return true;
}

(async function girar() {
  console.log('Analisador de perfil no ar. Ctrl+C para parar.');
  for (;;) {
    let teve = false;
    try { teve = await umaVolta(); }
    catch (e) { console.error('erro na volta:', String(e.message || e).slice(0, 160)); }
    await new Promise((r) => setTimeout(r, teve ? 2000 : PAUSA));
  }
})();
