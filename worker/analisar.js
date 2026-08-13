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

4. COMUNIDADE: por quem ele fala — não para quem ele vende. Views não fazem viralizar;
   compartilhamento faz, e ninguém compartilha informação: as pessoas compartilham quem
   elas são. Quando alguém manda o vídeo para um amigo com um "olha, é a gente", é porque
   ele falou pela tribo dela.

   - "comunidade": que grupo é esse. Tire do que ele já publicou: para quem ele fala,
     quem ele defende, contra o que ele se coloca.
   - "comunidadeBandeiras": 2 ou 3 OPÇÕES de palavra que essa gente usa para falar de si.
     NÃO escolha por ele — a escolha é dele, e cada palavra abre uma porta de tamanho
     diferente. Para cada opção devolva "porte" ("grande", "média" ou "pequena") e
     "porque", em uma frase, com o que se ganha e o que se perde escolhendo aquela.
     A régua vem da regra do nicho: o filtro tem que ser algo que a plataforma consiga
     aplicar num scroll de 3 segundos, e recorte fino demais mata a distribuição. Porta
     larga alcança mais e diz menos; porta estreita diz muito e alcança pouco.
     Cuidado com um erro comum: você enxerga como ELE chama o grupo. Se o grupo não se
     descreve com aquela palavra, não é bandeira — prefira a que aparece na boca dele
     falando COM eles, não SOBRE eles.
   - "comunidadeCausa": o que essa gente comenta entre si mas ninguém diz em público.
     ISTO QUASE NUNCA ESTÁ NO TEXTO — o que você lê é o que ele publicou, não o que a
     audiência dele fala entre si. Então: deixe "comunidadeCausa" VAZIO e devolva 2 ou 3
     hipóteses em "comunidadeHipoteses", cada uma plausível a partir do que ele confronta
     nos vídeos. Só preencha "comunidadeCausa" se algum vídeo disser isso com todas as
     letras. Inventar aqui é pior do que deixar em branco.

5. ASSINATURA: proponha DUAS opções, na fórmula
   "Meu nome é [NOME] e eu [ENTREGA] [PROMESSA] todos os dias."
   A promessa é RESULTADO, nunca processo. "ensino mulheres a terem mais lucro" serve;
   "ajudo a sair do operacional delegando com assertividade" não.
   Cada uma tem que caber num fôlego — até uns 110 caracteres.

6. LEITURA: em 2 ou 3 frases, o que separa os vídeos do topo dos de baixo. Aponte o padrão
   concreto (formato de abertura, tipo de assunto, duração), não elogio genérico.
   Quando vierem comentários e compartilhamentos, olhe os TRÊS números, não só as views:
   view conta quem assistiu; compartilhamento conta quem se reconheceu a ponto de mandar
   para alguém; comentário conta quem parou para responder. O vídeo que lidera num deles
   costuma não liderar no outro — se for esse o caso, diga qual puxa o quê.

7. RESSALVAS: preencha a ficha SEMPRE, mas diga em voz alta onde a leitura ficou fraca.
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
  "comunidade": "",
  "comunidadeBandeiras": [{"bandeira": "", "porte": "", "porque": ""}],
  "comunidadeCausa": "",
  "comunidadeHipoteses": ["", ""],
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

function conferir(s) {
  const erros = [];
  if (!s.macroNicho) erros.push('sem macro-nicho');
  if (!s.subNicho) erros.push('sem recorte');
  if (!Array.isArray(s.temas) || !s.temas.length) erros.push('nenhum tema');
  if (!Array.isArray(s.assinaturas) || !s.assinaturas.length) erros.push('sem assinatura');
  if (!s.comunidade) erros.push('sem comunidade');
  /* causa vazia é o esperado — mas aí as hipóteses são obrigatórias, senão a
     ficha fica com um campo mudo e ninguém sabe se faltou ou se não dava */
  if (!s.comunidadeCausa && !(s.comunidadeHipoteses || []).length) {
    erros.push('sem causa e sem hipótese de causa');
  }
  /* uma bandeira só seria a máquina escolhendo pela pessoa — e a escolha muda o
     tamanho da porta, então é dela */
  if ((s.comunidadeBandeiras || []).length < 2) erros.push('menos de duas bandeiras');
  (s.comunidadeBandeiras || []).forEach(function (b, i) {
    if (!b.porte) erros.push('bandeira ' + (i + 1) + ' sem porte');
  });
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
  /* Views contam alcance; comentário e compartilhamento contam o que a pessoa
     FEZ depois de assistir. Sem eles, a leitura de "o que separa os seus
     melhores" enxerga só o vídeo que muita gente viu, não o que pegou. */
  let videos = trs.filter((t) => t.texto).map((t) => {
    const m = t.metricas || {};
    return {
      views: m.views || 0,
      comentarios: m.comentarios ?? null,
      compartilhamentos: m.compartilhamentos ?? null,
      texto: `${t.titulo ? t.titulo + ' — ' : ''}${String(t.texto).slice(0, 1200)}`,
    };
  });

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
      videos.map((v, i) => {
        const extra = [
          v.comentarios != null ? `${v.comentarios} comentários` : '',
          v.compartilhamentos != null ? `${v.compartilhamentos} compart.` : '',
        ].filter(Boolean).join(', ');
        return `${i + 1}. [${v.views} views${extra ? ' · ' + extra : ''}] ${v.texto}`;
      }).join('\n')}`;
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

/* ---------- o laço ----------
   Antes: perguntava de 12 em 12 segundos, 7.200 vezes por dia, para quase
   sempre ouvir "não tem nada". Agora o banco avisa quando alguém pede a
   análise — e é o próprio pedido que muda a ficha. */
const { ouvir } = require('./aviso');

console.log('Analisador de perfil: esperando o banco avisar. Ctrl+C para parar.');
ouvir({
  chave: SERVICE,
  tabela: 'fichas',
  /* tudo, não só UPDATE: ficha nova entra como INSERT */
  silencio: 2000,      // o pedido é um clique; não precisa esperar muito
  aoDizer: (m) => console.log('·', m),
  aoMexer: async () => { while (await umaVolta()) { /* drena a fila */ } },
});
