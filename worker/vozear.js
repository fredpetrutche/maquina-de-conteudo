#!/usr/bin/env node
/* ============================================================
   vozear.js — a correção do especialista vira regra de voz
   ------------------------------------------------------------
   Quando ele corrige um trecho, ficam guardados os dois lados:
   `txt`, o que a máquina escreveu, e `final`, o que ele de fato
   fala. O que ensina a voz é o PAR — o texto final sozinho não
   diz o que foi trocado.

   O trabalho todo está numa separação: correção de VOZ ensina
   como ele fala; correção de FATO é erro da máquina. Jogar as
   duas na mesma pilha ensina o modelo a inventar versículo,
   porque "alguém conserta depois".

   Roda na máquina do Fred pelo CLI do Claude (assinatura, não
   crédito de API), igual ao analisar.js.

     node vozear.js           # fica girando
     node vozear.js --seco    # classifica e mostra, sem gravar
     node vozear.js --uma     # uma volta e sai
   ============================================================ */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
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
const SECO = process.argv.includes('--seco');
const UMA = process.argv.includes('--uma');

if (!SERVICE) { console.error('falta SUPABASE_SERVICE_KEY'); process.exit(1); }
const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

/* ---------- os pares ---------- */

function digestão(t) {
  return crypto.createHash('sha1').update(String(t)).digest('hex').slice(0, 8);
}

/* Um par é identificado por roteiro:trecho + o conteúdo dos dois lados. Se ele
   corrigir o MESMO trecho de novo, o hash muda e o par volta para a fila — que é
   o certo: a segunda correção também ensina. */
function paresDe(roteiros) {
  const fora = [];
  (roteiros || []).forEach((r) => {
    (r.trechos || []).forEach((t, i) => {
      if (typeof t.final !== 'string') return;
      if (t.final === t.txt) return;
      if (!String(t.final).trim()) return;
      fora.push({
        chave: `${r.n}:${i}:${digestão(t.txt + '→' + t.final)}`,
        roteiro: r.titulo || `roteiro ${r.n}`,
        faixa: t.rot || '',
        antes: t.txt,
        depois: t.final,
      });
    });
  });
  return fora;
}

/* ---------- o modelo ---------- */

const CLASSIFICAR = `Você recebe correções que um especialista fez num roteiro escrito por
máquina. Cada correção é um par: o que a máquina escreveu e o que ele de fato fala.

Classifique CADA par em um destes três:

  voz   — ele trocou a palavra, o ritmo ou o jeito de dizer. Ensina como ELE fala.
          Exemplos: "portanto" virou "então"; cortou a explicação de um termo técnico;
          quebrou uma frase longa em duas; trocou "vocês" por "você".

  fato  — a máquina errou uma informação e ele consertou: versículo, nome, número,
          data, citação. NÃO ensina voz nenhuma. Ensina que a máquina inventou.

  ruido — vírgula, acento, digitação, espaço. Não ensina nada.

Esta separação é o trabalho inteiro. Se você chamar de "voz" o conserto de um
versículo errado, o próximo roteiro sai com versículo inventado de novo, porque o
modelo aprende que alguém conserta depois. **Na dúvida entre voz e fato, escolha
fato**: errar para o lado do fato custa uma regra; errar para o lado da voz ensina
a máquina a mentir.

Um par pode carregar as duas coisas — ele conserta o versículo E troca a palavra na
mesma frase. Nesse caso classifique como "voz" e escreva a regra só da parte de voz,
pondo em "sobre" o que era o erro de fato. Não deixe o erro de fato virar regra.

Para os pares de VOZ, escreva a regra em UMA linha, no imperativo, concreta o
bastante para outra máquina obedecer sem ver o exemplo:
  serve:     escreva "então" no lugar de "portanto"
  serve:     não explique termo bíblico no meio da frase; siga direto
  não serve: use uma linguagem mais natural
  não serve: escreva do jeito dele

Para os pares de FATO, deixe "regra" vazio e escreva em "sobre" o que a máquina errou,
com o certo do lado: "citou Provérbios 12:2; o certo é 12:1".

Devolva SÓ este JSON, sem cercas de código e sem comentário:

{"mudancas":[{"chave":"","tipo":"voz","regra":"","sobre":""}]}

Uma entrada por par recebido, na mesma ordem, com a mesma chave.`;

const JUNTAR = `Você recebe regras de voz extraídas uma a uma das correções de um
especialista. Devolva a lista limpa:

- junte as que dizem a mesma coisa numa regra só, somando quantas vezes apareceram;
- quando duas se contradizem, fique com a mais recente (as últimas da lista são as
  mais recentes) e descarte a outra;
- mantenha a redação concreta; não troque uma regra específica por uma genérica.

Não invente regra que não esteja na entrada, e não corte uma que esteja — juntar é
diferente de resumir.

Devolva SÓ este JSON, sem cercas e sem comentário:

{"regras":[{"regra":"","vezes":1}]}`;

function pensar(prompt) {
  let saida;
  try {
    saida = execFileSync(CLAUDE, ['-p', prompt, '--output-format', 'json'], {
      encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 600000,
    });
  } catch (e) {
    /* Sem isto o log guardava o COMANDO e jogava fora o MOTIVO: a mensagem do
       execFileSync é o prompt inteiro, e a razão da falha vive no stderr. */
    const porque = String(e.stderr || '').trim() || String(e.stdout || '').trim() ||
      (e.signal ? 'morreu com ' + e.signal : 'saiu com código ' + e.status);
    throw new Error('o CLI do Claude falhou: ' + porque.slice(0, 300));
  }
  const env = JSON.parse(saida);
  if (env.is_error) throw new Error(String(env.result || 'o modelo devolveu erro').slice(0, 200));
  let t = String(env.result || '').trim();
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (cerca) t = cerca[1].trim();
  const i = t.indexOf('{'), f = t.lastIndexOf('}');
  if (i < 0 || f < 0) throw new Error('não veio JSON: ' + t.slice(0, 160));
  return JSON.parse(t.slice(i, f + 1));
}

function classificar(pares) {
  const corpo = pares.map((p, i) => (
    `--- par ${i + 1} · chave ${p.chave} · ${p.roteiro}${p.faixa ? ' · ' + p.faixa : ''}\n` +
    `A máquina escreveu:\n${p.antes}\n\nEle fala:\n${p.depois}`
  )).join('\n\n');

  const s = pensar(`${CLASSIFICAR}\n\n${corpo}`);
  const lista = Array.isArray(s.mudancas) ? s.mudancas : [];
  const porChave = {};
  lista.forEach((m) => { if (m && m.chave) porChave[m.chave] = m; });

  /* o que o modelo não classificou não some calado: vira ruído com aviso */
  return pares.map((p) => {
    const m = porChave[p.chave];
    if (!m) return { chave: p.chave, tipo: 'ruido', regra: '', sobre: 'o modelo não classificou este par' };
    const tipo = ['voz', 'fato', 'ruido'].indexOf(m.tipo) >= 0 ? m.tipo : 'ruido';
    /* voz sem regra não ensina nada — não vale guardar como voz */
    if (tipo === 'voz' && !String(m.regra || '').trim()) {
      return { chave: p.chave, tipo: 'ruido', regra: '', sobre: 'veio como voz, mas sem regra' };
    }
    return { chave: p.chave, tipo, regra: String(m.regra || '').trim(), sobre: String(m.sobre || '').trim() };
  });
}

function juntar(regras) {
  if (regras.length < 2) return regras;
  const s = pensar(`${JUNTAR}\n\n${regras.map((r, i) => `${i + 1}. ${r.regra}`).join('\n')}`);
  const lista = (Array.isArray(s.regras) ? s.regras : [])
    .filter((r) => r && String(r.regra || '').trim())
    .map((r) => ({ regra: String(r.regra).trim(), vezes: Math.max(1, +r.vezes || 1) }));
  /* se a junção devolveu menos do que a metade, ela resumiu em vez de juntar —
     fico com a lista crua, que é feia mas verdadeira */
  if (!lista.length || lista.length < Math.ceil(regras.length / 2)) {
    console.log('  · a junção encolheu demais; mantive as regras cruas');
    return regras;
  }
  return lista;
}

/* ---------- banco ---------- */

/* O que muda entre uma volta e outra é o carimbo. Puxar os roteiros de todo
   mundo a cada volta é trazer texto grande — com a direção junto — para quase
   sempre descobrir que nada mudou. Então: primeiro o carimbo, que é minúsculo;
   os roteiros só de quem mexeu. */
const vistos = new Map();

async function fichasComCorrecao() {
  const r = await fetch(`${SUPA}/rest/v1/fichas?select=id,instagram,nome,atualizado_em`,
    { headers: h });
  if (!r.ok) throw new Error(`listar: ${r.status}`);
  const todas = await r.json();

  const mexeram = todas.filter((f) => vistos.get(f.id) !== f.atualizado_em);
  if (!mexeram.length) return [];

  const r2 = await fetch(
    `${SUPA}/rest/v1/fichas?id=in.(${mexeram.map((f) => f.id).join(',')})` +
    `&select=id,instagram,nome,atualizado_em,roteiros:dados->roteiros`,
    { headers: h },
  );
  if (!r2.ok) throw new Error(`roteiros: ${r2.status}`);
  const cheias = await r2.json();

  const comPares = cheias.map((f) => ({ ...f, pares: paresDe(f.roteiros) }));

  /* Quem mudou mas não tem correção nenhuma é marcado já: não há o que fazer
     com ela, e sem marcar voltaria a ser puxada inteira toda volta — que é
     justamente o desperdício que esta função existe para evitar.
     Quem TEM correção só é marcada depois de processada, lá embaixo: se a volta
     estourar no meio, a próxima olha de novo em vez de dar a ficha por lida. */
  cheias.forEach((f) => {
    if (!comPares.find((x) => x.id === f.id).pares.length) vistos.set(f.id, f.atualizado_em);
  });

  return comPares.filter((f) => f.pares.length);
}

/* Grava com trava otimista: o gatilho trg_touch mexe em atualizado_em a cada
   update, então filtrar por ele garante que ninguém escreveu no meio. Zero linha
   de volta = alguém escreveu; desisto e tento na próxima volta. */
async function gravar(id, carimbo, regrasVoz) {
  const r = await fetch(`${SUPA}/rest/v1/fichas?id=eq.${id}&select=dados`, { headers: h });
  if (!r.ok) throw new Error(`reler: ${r.status}`);
  const f = (await r.json())[0];
  if (!f) throw new Error('ficha sumiu');
  if (carimbo && f.atualizado_em && f.atualizado_em !== carimbo) throw new Error('MUDOU');

  const dados = f.dados || {};
  dados.regrasVoz = regrasVoz;

  const p = await fetch(
    `${SUPA}/rest/v1/fichas?id=eq.${id}&atualizado_em=eq.${encodeURIComponent(carimbo)}`,
    { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ dados }) },
  );
  if (!p.ok) throw new Error(`gravar: ${p.status} ${(await p.text()).slice(0, 120)}`);
  const linhas = await p.json();
  if (!linhas.length) throw new Error('MUDOU');
}

/* ---------- uma volta ---------- */

async function umaFicha(f) {
  const antes = f.regrasVoz || {};
  const jaLidos = new Set(antes.lidos || []);
  const novos = f.pares.filter((p) => !jaLidos.has(p.chave));
  if (!novos.length) return false;

  console.log(`▸ @${f.instagram} — ${novos.length} correção(ões) nova(s)`);
  const ditos = classificar(novos);

  const vozes = ditos.filter((d) => d.tipo === 'voz');
  const fatos = ditos.filter((d) => d.tipo === 'fato');
  const ruidos = ditos.filter((d) => d.tipo === 'ruido');
  console.log(`  voz ${vozes.length} · fato ${fatos.length} · ruído ${ruidos.length}`);
  vozes.forEach((v) => console.log(`    ✎ ${v.regra}`));
  fatos.forEach((v) => console.log(`    ⚠ a máquina errou: ${v.sobre || '(sem detalhe)'}`));

  const regras = juntar(
    (antes.regras || []).concat(vozes.map((v) => ({ regra: v.regra, vezes: 1 }))),
  );

  const regrasVoz = {
    em: new Date().toISOString(),
    lidos: (antes.lidos || []).concat(novos.map((p) => p.chave)),
    regras,
    /* os erros de fato não viram regra, mas ficam à vista: é assim que se
       descobre que a máquina inventa versículo */
    fatos: (antes.fatos || []).concat(
      fatos.map((v) => ({ sobre: v.sobre, quando: new Date().toISOString() })),
    ),
    contagem: {
      correcoes: (antes.lidos || []).length + novos.length,
      voz: ((antes.contagem || {}).voz || 0) + vozes.length,
      fato: ((antes.contagem || {}).fato || 0) + fatos.length,
      ruido: ((antes.contagem || {}).ruido || 0) + ruidos.length,
    },
  };

  if (SECO) {
    console.log('  (seco) ficaria assim:\n' + JSON.stringify(regrasVoz, null, 2).slice(0, 1800));
    return true;
  }
  try {
    await gravar(f.id, f.atualizado_em, regrasVoz);
    console.log(`  ✓ ${regras.length} regra(s) de voz guardada(s)`);
  } catch (e) {
    if (String(e.message) === 'MUDOU') {
      console.log('  · a ficha mudou no meio; tento na próxima volta');
      return true;
    }
    throw e;
  }
  return true;
}

async function umaVolta() {
  const fichas = await fichasComCorrecao();
  if (!fichas.length) return false;


  /* o que já foi processado mora no próprio `dados` — busco junto */
  const r = await fetch(
    `${SUPA}/rest/v1/fichas?id=in.(${fichas.map((f) => f.id).join(',')})&select=id,regrasVoz:dados->regrasVoz`,
    { headers: h },
  );
  const antes = {};
  if (r.ok) (await r.json()).forEach((x) => { antes[x.id] = x.regrasVoz || {}; });

  let fez = false;
  for (const f of fichas) {
    f.regrasVoz = antes[f.id] || {};
    try {
      fez = (await umaFicha(f)) || fez;
      vistos.set(f.id, f.atualizado_em);
    } catch (e) {
      console.log(`  ✗ @${f.instagram}: ${String(e.message || e).slice(0, 160)}`);
    }
  }
  return fez;
}

/* ---------- o laço ----------
   Sem relógio: o banco avisa quando uma ficha muda e ele olha. Se não houver
   correção nova, volta a calar sem gastar nada. */
const { ouvir } = require('./aviso');

if (SECO || UMA) {
  (async () => {
    console.log(SECO ? 'Voz das correções — modo seco, não grava nada.' : 'Uma volta e saio.');
    try { if (!(await umaVolta())) console.log('Nenhuma correção nova.'); }
    catch (e) { console.error('erro:', String(e.message || e).slice(0, 200)); }
  })();
} else {
  console.log('Voz das correções: esperando o banco avisar. Ctrl+C para parar.');
  ouvir({
    chave: SERVICE,
    tabela: 'fichas',
    /* tudo, não só UPDATE: ficha nova entra como INSERT, e ela pode já
       chegar com o que interessa */
    silencio: 10000,          // quem digita na Fase 0 salva a cada poucos segundos
    aoDizer: (m) => console.log('·', m),
    aoMexer: async () => { while (await umaVolta()) { /* drena */ } },
  });
}
