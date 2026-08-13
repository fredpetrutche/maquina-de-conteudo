/*
  analisar-perfil — lê os vídeos raspados e devolve a Fase 0 preenchida.

  Existe porque perguntar "sobre o que você fala?" para quem tem mil posts é
  fazer a pessoa trabalhar para devolver o que ela já entregou. Pior: ela
  responde o que gostaria de ser, não o que é. Os vídeos têm a resposta
  factual, com métrica junto.

  POST { videos: [{legenda, views, ...}], perfil? } → ficha da Fase 0
*/

import Anthropic from 'npm:@anthropic-ai/sdk@0.116.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/* O que a pessoa vai receber para corrigir. Cada campo é um palpite com
   evidência, nunca uma afirmação. */
const FORMATO = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      macroNicho: {
        type: 'string',
        description: 'O grande assunto, em uma ou duas palavras. O que alguém digitaria numa busca. Não é a profissão nem o produto.',
      },
      subNicho: {
        type: 'string',
        description: 'O recorte dentro do macro-nicho. Pare na segunda camada — o algoritmo precisa ler isso em milissegundos.',
      },
      temas: {
        type: 'array',
        description: 'Exatamente 10 temas amplos e pesquisáveis. Um TEMA é macro (ex: "dinheiro"); um RECORTE é o ângulo dentro dele (ex: "dízimo"). Nunca coloque um recorte no lugar do tema.',
        items: {
          type: 'object',
          properties: {
            tema: { type: 'string', description: 'O tema, na altura macro' },
            recortes: {
              type: 'array',
              description: 'Recortes que a pessoa JÁ publicou dentro desse tema, com o número que fizeram',
              items: {
                type: 'object',
                properties: {
                  o: { type: 'string', description: 'O recorte, como ele apareceu no vídeo' },
                  v: { type: 'string', description: 'Views do vídeo, abreviado (ex: "850 mil")' },
                },
                required: ['o', 'v'],
                additionalProperties: false,
              },
            },
          },
          required: ['tema', 'recortes'],
          additionalProperties: false,
        },
      },
      sigEntrega: {
        type: 'string',
        description: 'O verbo da assinatura: "Meu nome é X e eu [ENTREGA] [PROMESSA] todos os dias". Resultado, nunca processo.',
      },
      sigPromessa: {
        type: 'string',
        description: 'O complemento da assinatura. Junto com a entrega, não passe de ~110 caracteres.',
      },
      leitura: {
        type: 'string',
        description: 'Duas a quatro frases explicando o que separa os vídeos que subiram dos que ficaram no chão, citando números.',
      },
    },
    required: ['macroNicho', 'subNicho', 'temas', 'sigEntrega', 'sigPromessa', 'leitura'],
    additionalProperties: false,
  },
};

const INSTRUCOES = `Você lê o acervo de um criador de conteúdo e devolve a ficha dele preenchida.

O trabalho é LER, não inventar. Cada campo sai do que os vídeos mostram — e a
pessoa vai corrigir o que estiver errado, então prefira o palpite honesto ao
palpite bonito.

Três regras que decidem a qualidade da ficha:

1. NICHO NA ALTURA CERTA. Macro-nicho é o assunto que alguém digitaria numa
   busca — não a profissão, não o produto, não o método. O recorte para na
   segunda camada: "mulheres de negócios" serve, "empresárias com mais de 10
   funcionários que querem sair do operacional" é ótimo cliente e péssimo
   filtro, porque o algoritmo não lê isso em milissegundos.

2. TEMA NÃO É RECORTE. Tema é macro e pesquisável; recorte é o ângulo dentro
   dele. "Dízimo" não é tema — o tema é "dinheiro". "Paulo" não é tema — o tema
   é "história dos personagens bíblicos". Tema errado fecha o assunto em cinco
   vídeos; tema certo abre em cinquenta. Sob cada tema, liste os recortes que a
   pessoa JÁ publicou, com o número de cada um: é assim que ela entende a
   diferença sem que ninguém precise explicar.

3. ASSINATURA É RESULTADO, NÃO PROCESSO. "Ensino mulheres a terem mais lucro"
   serve; "ajudo a sair do operacional delegando com assertividade" não. Corte
   redundância e fique abaixo de ~110 caracteres no total.

Para a leitura: compare o topo com o chão. O que os vídeos que subiram têm em
comum que os que ficaram embaixo não têm? Cite números. Se um contraexemplo
enfraquecer a sua tese, diga isso em vez de escondê-lo.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ erro: 'use POST' }, 405);

  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) return responder({ erro: 'servidor sem chave configurada' }, 500);

  let corpo: { videos?: unknown[]; perfil?: string };
  try {
    corpo = await req.json();
  } catch {
    return responder({ erro: 'corpo inválido' }, 400);
  }

  const videos = Array.isArray(corpo.videos) ? corpo.videos : [];
  if (videos.length < 3) {
    return responder({ erro: 'preciso de pelo menos 3 vídeos com contagem para ler o perfil' }, 400);
  }

  /* Mandamos só o que informa a leitura. Ordenado por views: o modelo precisa
     ver o topo e o chão lado a lado para achar o que os separa. */
  const lista = videos
    .map((v) => v as Record<string, unknown>)
    .filter((v) => Number(v.views) > 0)
    .sort((a, b) => Number(b.views) - Number(a.views))
    .slice(0, 40)
    .map((v, i) =>
      `${i + 1}. ${Number(v.views).toLocaleString('pt-BR')} views` +
      (v.curtidas ? ` · ${Number(v.curtidas).toLocaleString('pt-BR')} curtidas` : '') +
      (v.comentarios ? ` · ${Number(v.comentarios).toLocaleString('pt-BR')} comentários` : '') +
      (v.compartilhamentos ? ` · ${Number(v.compartilhamentos).toLocaleString('pt-BR')} compart.` : '') +
      (v.quando ? ` · ${String(v.quando).slice(0, 10)}` : '') +
      `\n   ${String(v.legenda ?? '').slice(0, 220)}`
    )
    .join('\n');

  try {
    const anthropic = new Anthropic({ apiKey: chave });
    const resposta = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: FORMATO },
      system: INSTRUCOES,
      messages: [{
        role: 'user',
        content:
          `Perfil: ${corpo.perfil ?? '(não informado)'}\n` +
          `Vídeos, do mais visto ao menos visto:\n\n${lista}`,
      }],
    });

    if (resposta.stop_reason === 'refusal') {
      return responder({ erro: 'não consegui analisar este perfil' }, 422);
    }

    const texto = resposta.content.find((b) => b.type === 'text');
    if (!texto || texto.type !== 'text') {
      return responder({ erro: 'resposta vazia do modelo' }, 502);
    }

    const ficha = JSON.parse(texto.text);
    return responder({ ficha, lidos: videos.length });
  } catch (e) {
    return responder({ erro: String(e).slice(0, 220) }, 500);
  }
});
