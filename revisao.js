/* ============================================================
   revisao.js — monta a ficha inteira, para ler
   ------------------------------------------------------------
   A pessoa entra para revisar, não para preencher: a ficha se
   apresenta pronta e o fluxo com perguntas só aparece quando ela
   vai mexer em alguma coisa.

   Duas telas usam este arquivo — a perfil.html e o app — porque
   duas cópias do mesmo desenho divergem em um dia.
   ============================================================ */
(function () {
  'use strict';

  var SUPA_URL = 'https://mkajvxyiyqxotiydkylq.supabase.co';
  var SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rYWp2eHlpeXF4b3RpeWRreWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NTgzNzcsImV4cCI6MjEwMjAzNDM3N30.vfHCb8BRcshufnp_7eAt9ch4aVEMpcbVA5u16IS0Kao';

  /* Quem chama diz onde desenhar e de qual ficha. A página de perfil passa o
     #tela dela; o app passa a vista de revisão dele. */
  var tela = null;
  var codigo = null;
  var OPC = {};
  var VOZ = '';

  /* As mesmas etapas do app (app.js, STEPS). Aqui elas não navegam entre telas —
     rolam até a seção correspondente desta página, porque tudo já está aberto. */
  var STEPS = [
    { id: 'briefing', nm: 'Briefing', grupo: 'Comece aqui', ancora: 'p-numeros' },
    { id: 'fase0', nm: 'Definir o campo', grupo: 'Suas informações', ancora: 'p-fase0' },
    { id: 'fase1', nm: 'Minerar benchmarks', ancora: 'p-fase1' },
    { id: 'fase2', nm: 'Replicar o validado', grupo: 'Destrava depois', ancora: 'p-fase2' },
    { id: 'fase3', nm: 'Retroalimentar a IA', ancora: 'p-fase3' },
    { id: 'fase4', nm: 'Travar o formato', lock: 1 },
    { id: 'fase5', nm: 'Industrializar', lock: 1 },
    { id: 'fase6', nm: 'Monetizar', lock: 1 }
  ];

  var IC_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var IC_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';
  var IC_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
  var IC_COPIA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5.5A2.5 2.5 0 0 1 7.5 3H15"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* Texto de análise pode carregar negrito e quebra de linha. Escapamos tudo e
     devolvemos só essas três tags — o resto continua neutralizado. */
  function escRico(s) {
    return esc(s)
      .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
      .replace(/&lt;br&gt;/g, '<br>');
  }
  function num(v) {
    var n = Number(v) || 0;
    return n.toLocaleString('pt-BR');
  }
  function curto(v) {
    var n = Number(v) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' mi';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',') + ' mil';
    return String(n);
  }
  /* O retomar_ficha não devolve `progresso` — só id, instagram, telefone, nome
     e dados. Em vez de pedir o campo, deduzimos do que está preenchido: é mais
     honesto, porque um contador pode dessincronizar do conteúdo e a ficha não. */
  function concluida(fase, d) {
    d = d || {};
    switch (fase) {
      case 'briefing':
        return true;                       // a ficha existir já é o briefing feito
      case 'fase0':
        return !!(d.macroNicho && d.subNicho &&
          (d.temas || []).filter(function (t) { return t && t.trim(); }).length >= 3 &&
          (d.sigEntrega || d.sigPromessa));
      case 'fase1':
        return (d.videos || []).length > 0;
      case 'fase2':
        return (d.roteiros || []).length > 0;
      default:
        return false;
    }
  }

  function iniciais(nome) {
    var p = String(nome || '?').trim().split(/\s+/);
    return ((p[0] || '')[0] + (p.length > 1 ? (p[p.length - 1] || '')[0] : '')).toUpperCase();
  }

  function aviso(msg, sub) {
    tela.innerHTML =
      '<div class="topo-grande"><span class="eyebrow">Máquina de Conteúdo</span>' +
      '<h1>' + esc(msg) + '</h1>' +
      (sub ? '<p class="abre">' + esc(sub) + '</p>' : '') + '</div>' +
      '<div class="cartao"><p style="margin:0;font-size:15px;color:var(--rotulo-2)">' +
      'Abra o app pela porta principal para começar ou retomar a sua ficha.<br><br>' +
      '<a href="./" style="color:var(--tinta);text-decoration:none;font-weight:600">Ir para a Máquina de Conteúdo &rsaquo;</a>' +
      '</p></div>';
  }

  /* ---------- divisória de etapa ----------
     Os nomes das fases são os mesmos do app (app.js, STEPS): quem vê a página
     e quem preenche o formulário têm que estar falando da mesma coisa. */
  function divisor(etapa, nome, oque, estado, primeiro, id) {
    var marca = estado === 'feito' ? '&#10003;' : (estado === 'diag' ? '&#9679;' : etapa);
    return '<div class="pf-divisor' + (primeiro ? ' primeiro' : '') + '"' +
      (id ? ' id="' + id + '"' : '') + '>' +
      '<span class="pf-div-n ' + estado + '">' + marca + '</span>' +
      '<div class="pf-div-t">' +
      '<span class="et' + (estado === 'aberto' || estado === 'diag' ? ' cinza' : '') + '">' +
      (estado === 'diag' ? 'Ponto de partida' : 'Fase ' + etapa) +
      (estado === 'feito' ? ' &middot; concluída' : estado === 'agora' ? ' &middot; é aqui que você está' :
       estado === 'aberto' ? ' &middot; em aberto' : '') + '</span>' +
      '<h2>' + esc(nome) + '</h2><p>' + esc(oque) + '</p>' +
      /* Em revisão a pessoa lê. O botão de editar só existe quando quem chamou
         sabe levar para o fluxo — na perfil.html sozinha ele não aparece. E é
         por seção: quem está olhando os temas cai na Fase 0, não no começo. */
      (OPC.editar && (id === 'p-fase0' || id === 'p-fase1')
        ? '<button class="bt simples mini pf-editar" data-editar="' + id.slice(2) +
          '">Editar esta fase</button>'
        : '') +
      '</div></div>';
  }

  /* ---------- blocos ---------- */

  function blocoTopo(f, p) {
    var foto = p.foto
      ? '<img src="' + esc(p.foto) + '" alt="Foto de perfil de ' + esc(f.nome) + '">'
      : esc(iniciais(f.nome));
    var arroba = p.instagram
      ? '<a href="' + esc(p.url || ('https://www.instagram.com/' + p.instagram + '/')) +
        '" target="_blank" rel="noopener">@' + esc(p.instagram) + '</a>'
      : '';
    var meta = [arroba, p.plataforma || 'Instagram', p.posts ? num(p.posts) + ' posts' : '']
      .filter(Boolean).join(' &middot; ');

    var selos = '';
    if (f.dados.macroNicho) selos += '<span class="selo s2">' + esc(f.dados.macroNicho) + '</span>';
    if (f.dados.subNicho) selos += '<span class="selo s2">' + esc(f.dados.subNicho) + '</span>';
    var f0 = concluida('fase0', f.dados);
    var f1 = concluida('fase1', f.dados);
    selos += '<span class="selo' + (f0 ? ' s3' : '') + '">Fase 0 ' +
      (f0 ? 'concluída' : 'em aberto') + '</span>';
    selos += '<span class="selo' + (f1 ? ' s3' : '') + '">Fase 1 ' +
      (f1 ? 'concluída' : 'em aberto') + '</span>';
    if ((f.dados.roteiros || []).length) {
      selos += '<span class="selo s2">Fase 2 &middot; ' + f.dados.roteiros.length +
        ' roteiros a revisar</span>';
    }

    return '<div class="pf-topo">' +
      '<div class="pf-av">' + foto + '</div>' +
      '<div class="pf-id"><h1>' + esc(f.nome) +
      (p.verificado ? '<span class="pf-vf" title="Perfil verificado">&#10003;</span>' : '') +
      '</h1><p class="pf-arroba">' + meta + '</p>' +
      '<div class="pf-selos">' + selos + '</div></div></div>';
  }

  function blocoNumeros(p) {
    if (!p.medianaJanela && !p.tetoJanela) return '';
    function cel(rot, val, sub, dest) {
      return '<div><dt>' + esc(rot) + '</dt><dd' + (dest ? ' class="destacado"' : '') + '>' +
        esc(val) + (sub ? '<s>' + esc(sub) + '</s>' : '') + '</dd></div>';
    }
    var mult = p.medianaJanela ? (p.tetoJanela / p.medianaJanela).toFixed(1).replace('.', ',') : '';
    var cels =
      cel('Vídeos nos últimos ' + (p.diasJanela || '?') + ' dias', num(p.videosNaJanela),
          p.janela ? p.janela.replace(' a ', ' até ') : '') +
      cel('Mediana de views', num(p.medianaJanela), 'metade dos vídeos fica abaixo') +
      cel('Mais visto no período', num(p.tetoJanela) + ' views',
          mult ? mult + '× a mediana' : '', true) +
      cel('Mais visto de todos', num(p.tetoHistorico) + ' views', 'desde 2022');

    if (p.medianaCompart != null) {
      cels += cel('Mediana de compartilhamentos', num(p.medianaCompart),
                  p.taxaCompartMediana ? p.taxaCompartMediana + '% de quem viu' : '');
    }

    return '<div class="grupo">' +
      '<div class="kpi">' + cels + '</div>' +
      '<p class="pf-nota">A distância entre a mediana e o pico é a informação mais útil daqui: ' +
      'ela mostra que <b>o alcance existe</b>. O que falta é repetir o acerto.<br><br>' +
      '<b>Compartilhamento é a métrica que decide.</b> View diz que a pessoa assistiu; ' +
      'compartilhamento diz que ela se reconheceu a ponto de mandar pra alguém — e é ' +
      'isso que faz um vídeo viajar para fora de quem já te segue.</p>' +
      '</div>';
  }

  function blocoVirais(p) {
    var vs = (p.topVideos || []).filter(function (v) { return v && v.views; });
    if (!vs.length) return '';
    vs.sort(function (a, b) { return b.views - a.views; });
    var teto = vs[0].views;
    var med = p.medianaJanela || 0;

    var itens = vs.map(function (v) {
      var pct = Math.max(v.views / teto * 100, 1.2);
      var taxa = (v.compartilhamentos && v.views)
        ? (v.compartilhamentos / v.views * 100).toFixed(2).replace('.', ',') : '';
      var pe = [
        '<span class="v">' + num(v.views) + ' views</span>',
        v.compartilhamentos != null
          ? '<b class="pf-cmp">' + num(v.compartilhamentos) + ' compart.' +
            (taxa ? ' (' + taxa + '%)' : '') + '</b>' : '',
        v.curtidas ? num(v.curtidas) + ' curtidas' : '',
        v.comentarios ? num(v.comentarios) + ' comentários' : '',
        v.quando ? String(v.quando).slice(0, 4) : '',
        v.fixado ? 'fixado no topo' : '',
        v.url ? '<a href="' + esc(v.url) + '" target="_blank" rel="noopener">abrir</a>' : ''
      ].filter(Boolean).join('<span style="color:var(--rotulo-3)">&middot;</span>');
      return '<li class="bar-l"><b>' + esc(v.legenda || 'sem legenda') + '</b>' +
        '<span class="bar-t' + (med && v.views < med ? ' morno' : '') + '">' +
        '<i style="width:' + pct.toFixed(1) + '%"></i></span>' +
        '<span class="bar-pe">' + pe + '</span></li>';
    }).join('');

    return '<div class="grupo">' +
      '<span class="rotulo-bloco">O que mais viralizou</span>' +
      '<div class="cartao"><ul class="bar-lista">' + itens + '</ul>' +
      (med ? '<p class="pf-nota">Linha de corte: a mediana, <b>' + num(med) + ' views</b>. ' +
        'Barras em cinza ficaram abaixo dela.</p>' : '') +
      '</div></div>';
  }

  /* markdown mínimo — só o que a voz usa */
  function marcar(md) {
    var linhas = String(md).split('\n'), fora = [], tabela = null;
    function fechaTabela() {
      if (!tabela) return;
      var cab = tabela[0], corpo = tabela.slice(2);
      fora.push('<table><thead><tr>' + cab.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + corpo.map(function (l) {
          return '<tr>' + l.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>');
      tabela = null;
    }
    function inline(t) {
      return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
    }
    linhas.forEach(function (l) {
      var t = l.trim();
      if (/^\|/.test(t)) {
        var cels = t.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
        (tabela = tabela || []).push(cels); return;
      }
      fechaTabela();
      if (!t) return;
      if (/^#{1,2}\s/.test(t)) fora.push('<h2>' + inline(t.replace(/^#+\s*/, '')) + '</h2>');
      else if (/^#{3,}\s/.test(t)) fora.push('<h2>' + inline(t.replace(/^#+\s*/, '')) + '</h2>');
      else if (/^>\s?/.test(t)) fora.push('<blockquote>' + inline(t.replace(/^>\s?/, '')) + '</blockquote>');
      else if (/^[-*]\s/.test(t)) fora.push('<ul><li>' + inline(t.replace(/^[-*]\s/, '')) + '</li></ul>');
      else if (/^---+$/.test(t)) fora.push('<hr>');
      else fora.push('<p>' + inline(t) + '</p>');
    });
    fechaTabela();
    return fora.join('').replace(/<\/ul><ul>/g, '');
  }

  function porteClasse(p) {
    return /pequen/i.test(p) ? 'aperta' : /m[ée]di/i.test(p) ? 'meio' : 'larga';
  }

  /* Uma caixa para o que a máquina NÃO pôde afirmar. Hipótese tem que parecer
     hipótese, senão vira resposta por descuido de quem lê rápido. */
  function caixaHipotese(explica, itens) {
    return '<div class="pf-hip"><span class="k">Não foi possível determinar</span>' +
      '<p>' + explica + '</p><ul>' +
      itens.map(function (x) {
        return '<li>' + esc(x.texto) +
          (x.porte ? '<span class="pf-porte-tag ' + porteClasse(x.porte) + '">' +
            'alcance ' + esc(x.porte) + '</span>' : '') +
          (x.porque ? '<span class="pf-hip-p">' + esc(x.porque) + '</span>' : '') +
          '</li>';
      }).join('') + '</ul>' +
      '<p class="pf-hip-pe">Clique em <b>Editar esta fase</b> para escolher ou escrever a sua.</p>' +
      '</div>';
  }

  /* A palavra muda o tamanho da porta: "cristão bíblico" alcança todo mundo e
     diz pouco; "reformado" diz muito e fala com menos gente. Quem escolhe é a
     pessoa — a máquina só mostra o que cada escolha custa. */
  function bandeiras(d) {
    if (d.comunidadeBandeira) return '';
    var bs = (d.comunidadeBandeiras || []).filter(function (b) { return b && b.bandeira; });
    if (!bs.length) return '';
    return caixaHipotese(
      'Cada palavra abre uma porta de tamanho diferente, e a escolha é sua: a régua ' +
      'do método diz que <b>recorte fino demais mata a distribuição</b> — porta larga ' +
      'alcança mais e diz menos, porta estreita diz muito e alcança pouco.',
      bs.map(function (b) {
        return { texto: b.bandeira, porte: b.porte, porque: b.porque };
      }));
  }

  function blocoFase0(d) {
    var p = d.perfil || {};
    /* Cada campo carrega a pergunta que ele responde. Quem lê precisa saber o que
       está sendo perguntado, não só o rótulo do banco de dados. */
    function campo(rot, perg, val, opc) {
      opc = opc || {};
      return '<div class="pf-campo">' +
        '<span class="pf-rot">' + esc(rot) + '</span>' +
        '<span class="pf-perg">' + esc(perg) + '</span>' +
        '<span class="pf-val' + (opc.falta ? ' pf-falta' : '') + '">' +
        esc(val || opc.vazio || 'ainda não preenchido') + '</span>' +
        (opc.selo ? '<span class="selo s1" style="margin-top:.4rem">' + esc(opc.selo) + '</span>' : '') +
        (opc.nota ? '<span class="pf-como">' + opc.nota + '</span>' : '') +
        '</div>';
    }

    var h = '<div class="grupo">' +
      '<div class="cartao"><div class="cartao-h">' +
      '<p>Preenchida lendo o seu perfil, não perguntando. O seu trabalho aqui é corrigir.</p></div>' +

      campo('Macro-nicho', 'Qual é o grande assunto? O que alguém digitaria numa busca.',
            d.macroNicho) +

      campo('Recorte do nicho', 'Qual é o recorte dentro do macro-nicho? Pare na segunda camada.',
            d.subNicho) +

      '</div>';

    /* Por quem ela fala. Views não fazem viralizar, compartilhamento faz — e
       ninguém compartilha informação: as pessoas compartilham quem elas são. */
    h += '<div class="cartao" style="margin-top:1rem"><div class="cartao-h">' +
      '<h3 style="font-size:18px">Por quem você fala</h3>' +
      '<p>Quando alguém manda o seu vídeo para um amigo com um <i>"olha, é a gente"</i>, ' +
      'é porque você falou pela tribo dela.</p></div>' +
      campo('Que grupo é esse?', 'De quem você fala — não para quem você vende.',
            d.comunidade, { falta: !d.comunidade }) +
      campo('Que palavra essa gente usa para falar de si?',
            'Se ninguém se descreve assim, não é bandeira.',
            d.comunidadeBandeira,
            { falta: !d.comunidadeBandeira, vazio: 'não foi possível determinar' }) +
      bandeiras(d) +

      campo('O que essa gente comenta entre si, mas ninguém diz em público?',
            'A verdade que todo mundo daquele grupo sente e ninguém fala em voz alta.',
            d.comunidadeCausa,
            { falta: !d.comunidadeCausa, vazio: 'não foi possível determinar' }) +

      /* Esta última quase nunca sai dos vídeos: o que se lê é o que ELE
         publicou, não o que a audiência fala entre si. Então a máquina devolve
         hipóteses, e elas aparecem marcadas como hipótese — não como resposta. */
      (!d.comunidadeCausa && (d.comunidadeHipoteses || []).length
        ? caixaHipotese(
            'Isto é o que a sua audiência fala entre si, e o que eu li foi o que ' +
            '<b>você</b> publicou. Nenhuma destas é resposta — é você quem preenche.',
            d.comunidadeHipoteses.map(function (x) { return { texto: x }; }))
        : '') +
      '</div>';

    var temas = (d.temas || []).filter(function (t) { return t && t.trim(); });
    if (temas.length) {
      var rec = p.recortes || {};
      h += '<div class="cartao" style="margin-top:1rem"><div class="cartao-h">' +
        '<h3 style="font-size:18px">Os dez temas</h3>' +
        '<p>Um <b>tema</b> é amplo e pesquisável. O <b>recorte</b> é o ângulo dentro dele — ' +
        'é o recorte que vira vídeo, nunca o tema inteiro. Abaixo, os recortes que você ' +
        'já publicou, com o número que cada um fez.</p></div>' +
        '<ul class="pf-temas">' + temas.map(function (t, i) {
          var rs = rec[t] || [];
          return '<li><span class="n">' + (i + 1) + '</span>' +
            '<div class="pf-tema-cx"><span class="t">' + esc(t) + '</span>' +
            (rs.length
              ? '<span class="pf-rec">' + rs.map(function (r) {
                  return esc(r.o) + (r.v ? ' <b>' + esc(r.v) + '</b>' : '');
                }).join('<span class="pf-pt">&middot;</span>') + '</span>'
              : '') +
            '</div></li>';
        }).join('') + '</ul></div>';
    }

    if (d.sigNome || d.sigEntrega) {
      h += '<div class="cartao" style="margin-top:1rem"><div class="cartao-h">' +
        '<h3 style="font-size:18px">A sua assinatura</h3></div>' +
        '<p class="pf-assin">Meu nome é ' + esc(d.sigNome || '…') + ' e eu ' +
        esc(d.sigEntrega || '…') + ' ' + esc(d.sigPromessa || '') +
        ' todos os dias. Se inscreve para não perder a próxima.</p></div>';
    }

    /* O jeito de falar dela, tirado das transcrições dos próprios vídeos. Fecha
       a Fase 0 em vez de abrir: preenchendo ela seria pista, revisando ela é
       resultado. É contra ela que se confere se um roteiro soa como a pessoa. */
    if (VOZ) {
      h += '<details class="cartao" data-ch="voz" style="margin-top:1rem">' +
        '<summary class="tr-it"><div class="tr-linha" style="padding:.5rem .6rem">' +
        '<span class="tr-seta">&#9654;</span>' +
        '<span class="tr-cx"><span class="tr-nm">O seu jeito de falar</span>' +
        '<span class="tr-sub">tirado das transcrições dos seus próprios vídeos</span></span>' +
        '<span class="tr-ler">abrir &rsaquo;</span></div></summary>' +
        '<div class="tr-corpo pf-voz">' + marcar(VOZ) + '</div></details>';
    }
    return h + '</div>';
  }

  function blocoFase1(d, p) {
    var vs = (d.videos || []).filter(function (v) { return v && v.views; });
    if (!vs.length) {
      return '<div class="grupo">' +
        '<div class="cartao"><p style="margin:0;font-size:15px;color:var(--rotulo-2)">' +
        'Ainda não preenchida.</p></div></div>';
    }
    vs = vs.slice().sort(function (a, b) { return b.views - a.views; });
    var teto = vs[0].views;

    var canais = {};
    vs.forEach(function (v) {
      var k = v.canal || v.canalUrl;
      if (!canais[k]) canais[k] = { nome: v.canal, url: v.canalUrl, n: 0, pico: 0 };
      canais[k].n++;
      canais[k].pico = Math.max(canais[k].pico, v.views);
    });
    var lista = Object.keys(canais).map(function (k) { return canais[k]; })
      .sort(function (a, b) { return b.pico - a.pico; });

    var ord = vs.map(function (v) { return v.views; });
    var mediana = ord[Math.floor(ord.length / 2)];
    var minha = p.tetoHistorico || 0;
    /* foto e nome de cada canal, puxados uma vez pela API interna do Instagram */
    var refs = d.perfisRef || {};

    var itens = vs.map(function (v) {
      var pct = Math.max(v.views / teto * 100, 1.2);
      var tx = (v.compartilhamentos && v.views)
        ? (v.compartilhamentos / v.views * 100).toFixed(2).replace('.', ',') : '';
      var pe = [
        '<span class="v">' + num(v.views) + ' views</span>',
        v.compartilhamentos != null
          ? '<b class="pf-cmp">' + num(v.compartilhamentos) + ' compart.' +
            (tx ? ' (' + tx + '%)' : '') + '</b>' : '',
        v.duracao ? Math.round(v.duracao) + 's' : ''
      ].filter(Boolean).join('<span style="color:var(--rotulo-3)">&middot;</span>') +
      (v.url ? '<a class="rt-assistir mini" href="' + esc(v.url) + '" target="_blank" ' +
        'rel="noopener">' + IC_PLAY + 'assistir</a>' : '');
      var marca = v.idioma === 'en'
        ? '<span class="selo s3" style="margin-left:.4rem">roteiro pronto</span>'
        : '<span class="selo s1" style="margin-left:.4rem">fora da leva</span>';

      var quem = refs[v.canal] || {};
      var arroba = '@' + esc(v.canal) +
        (quem.verificado ? '<span class="ref-vf" title="Perfil verificado">&#10003;</span>' : '');

      return '<li class="bar-l"><div class="ref-cab">' +
        '<span class="ref-av">' + (quem.foto
          ? '<img src="' + esc(quem.foto) + '" alt="" loading="lazy">'
          : esc(iniciais(quem.nome || v.canal))) + '</span>' +
        '<span class="ref-cx">' +
        (v.canalUrl
          ? '<a class="ref-nm" href="' + esc(v.canalUrl) + '" target="_blank" ' +
            'rel="noopener">' + arroba + '</a>'
          : '<span class="ref-nm">' + arroba + '</span>') +
        marca +
        '<span class="ref-tit">' + esc(v.titulo || '') + '</span>' +
        '</span></div>' +
        '<span class="bar-t"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
        '<span class="bar-pe">' + pe + '</span></li>';
    }).join('');

    var razao = (p.medianaJanela && mediana) ? Math.round(mediana / p.medianaJanela) : 0;

    return '<div class="grupo">' +
      '<div class="kpi">' +
      '<div><dt>Vídeos de referência</dt><dd>' + vs.length + '<s>de ' + lista.length + ' perfis</s></dd></div>' +
      '<div><dt>Mediana de views</dt><dd class="destacado">' + curto(mediana) +
        (razao ? '<s>' + razao + '× a sua média</s>' : '') + '</dd></div>' +
      '<div><dt>Mais visto</dt><dd>' + curto(teto) + '<s>views — o alvo do topo</s></dd></div>' +
      '<div><dt>O seu recorde</dt><dd>' + curto(minha) +
        '<s>' + (minha ? (minha / teto * 100).toFixed(0) + '% do mais visto' : 'views') + '</s></dd></div>' +
      '</div>' +

      '<div class="cartao" style="margin-top:1rem"><div class="cartao-h">' +
      '<h3 style="font-size:18px">As referências que você escolheu</h3>' +
      '<p>Como foi você quem escolheu, o "eu falaria isso" já veio resolvido. ' +
      'O que se copia é a estrutura, nunca o assunto.</p></div>' +
      '<p class="pf-nota" style="margin:0 0 1rem;padding-top:0;border:0">' +
      '<b>Nove das dezessete são de perfis brasileiros</b> — e essas ficaram de fora da ' +
      'primeira leva. O método justifica a cópia dizendo que o conteúdo ainda não circulou ' +
      'aqui, então chega como novidade. Isso não vale para quem fala a mesma língua para ' +
      'a mesma audiência: ali não é novidade, é cópia visível. As oito em inglês viraram ' +
      'roteiro.</p>' +
      '<ul class="bar-lista">' + itens + '</ul></div>' +

      '<div class="cartao" style="margin-top:1rem"><div class="cartao-h">' +
      '<h3 style="font-size:18px">Os ' + lista.length + ' perfis</h3></div>' +
      '<div class="ilha" style="background:transparent">' + lista.map(function (c) {
        var q = refs[c.nome] || {};
        return '<div class="linha">' +
          '<span class="ref-av" style="flex:none">' + (q.foto
            ? '<img src="' + esc(q.foto) + '" alt="" loading="lazy">'
            : esc(iniciais(q.nome || c.nome))) + '</span>' +
          '<div style="flex:1;min-width:0">' +
          '<a href="' + esc(c.url || '#') + '" target="_blank" rel="noopener" ' +
          'style="color:var(--tinta);text-decoration:none;font-size:15px">@' + esc(c.nome) + '</a>' +
          (q.verificado ? '<span class="ref-vf" title="Perfil verificado">&#10003;</span>' : '') +
          (q.nome && q.nome !== c.nome
            ? '<span style="display:block;font-size:12px;color:var(--rotulo-2);' +
              'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
              esc(q.nome) + '</span>' : '') +
          '</div><span class="medidor">' + c.n + (c.n > 1 ? ' vídeos' : ' vídeo') +
          '<span style="color:var(--rotulo-3)">&middot;</span>' + curto(c.pico) + '</span></div>';
      }).join('') + '</div></div></div>';
  }

  /* As transcrições são o insumo do roteiro — quem revisa precisa poder LER,
     não só saber que existem. Por isso o texto abre na própria página. */
  function blocoTranscricoes(lista) {
    if (!lista || !lista.length) {
      return '<div class="grupo"><div class="cartao">' +
        '<p style="margin:0;font-size:15px;color:var(--rotulo-2)">' +
        'Nenhuma transcrição ainda.</p></div></div>';
    }

    function ehIngles(t) { return String(t.idioma || '').toLowerCase().indexOf('en') === 0; }

    function item(t) {
      const en = ehIngles(t);
      const titulo = (t.titulo || '').split('\n')[0].trim();
      const orig = t.texto || '';
      const pt = t.texto_pt || '';

      let corpo = '';
      /* o link vem antes do texto: quem abre a transcrição quase sempre quer
         ouvir a entonação do original antes de ler */
      if (t.url) {
        corpo += '<a class="rt-assistir" href="' + esc(t.url) + '" target="_blank" ' +
          'rel="noopener">' + IC_PLAY + 'Assistir o vídeo original</a>';
      }
      if (en) {
        corpo += '<span class="tr-rot">Original em inglês</span>' +
          '<p class="tr-txt orig">' + esc(orig) + '</p>';
        corpo += pt
          ? '<span class="tr-rot">Tradução</span><p class="tr-txt">' + esc(pt) + '</p>'
          : '<p class="tr-falta">Tradução ainda não foi feita — só o original está aqui.</p>';
      } else {
        corpo += '<p class="tr-txt">' + esc(orig) + '</p>';
      }
      return '<li><details data-ch="tr:' + esc(t.url || titulo) + '">' +
        '<summary class="tr-it"><div class="tr-linha">' +
        '<span class="tr-seta">&#9654;</span>' +
        '<span class="tr-cx"><span class="tr-nm">@' + esc(String(t.perfil || '?').replace(/^@+/, '')) + '</span>' +
        (titulo ? '<span class="tr-sub">' + esc(titulo) + '</span>' : '') + '</span>' +
        '<span class="tr-tag' + (en ? ' en' : '') + '">' +
        (en ? 'inglês' : 'português') + ' · ' + Math.round(orig.length / 100) / 10 + ' mil car.' +
        '</span>' +
        '<span class="tr-ler">ler &rsaquo;</span>' +
        '</div></summary>' +
        '<div class="tr-corpo">' + corpo + '</div></details></li>';
    }

    const ingles = lista.filter(ehIngles);
    const portugues = lista.filter(function (t) { return !ehIngles(t); });
    const semTraducao = ingles.filter(function (t) { return !t.texto_pt; }).length;

    let h = '<div class="grupo">';

    if (ingles.length) {
      h += '<div class="cartao"><div class="cartao-h">' +
        '<h3 style="font-size:18px">Em inglês — as ' + ingles.length + ' que viram roteiro</h3>' +
        '<p>Copiar um vídeo em outra língua produz conteúdo novo em português. ' +
        'Guardamos as duas versões porque, ao revisar, você vai querer trocar palavras — ' +
        'e para isso precisa ver o que a frase dizia no original.</p></div>' +
        '<ul class="tr-lista">' + ingles.map(item).join('') + '</ul>' +
        (semTraducao
          ? '<p class="pf-nota"><b>' + semTraducao + ' ainda sem tradução.</b> A importação ' +
            'trouxe os originais dos arquivos e o trabalhador foi parado, então o campo de ' +
            'tradução ficou vazio. Os roteiros já prontos não dependem disso — eles foram ' +
            'escritos a partir destes mesmos originais.</p>'
          : '') +
        '</div>';
    }

    if (portugues.length) {
      h += '<div class="cartao" style="margin-top:1rem"><div class="cartao-h">' +
        '<h3 style="font-size:18px">Em português — as ' + portugues.length + ' que ficam de fora</h3>' +
        '<p>Ficam registradas, mas não viram roteiro. Copiar quem fala a mesma língua ' +
        'para a mesma audiência não chega como novidade — chega como cópia visível.</p></div>' +
        '<ul class="tr-lista">' + portugues.map(item).join('') + '</ul></div>';
    }

    return h + '</div>';
  }

  /* O roteiro diz o que falar; isto diz como filmar. São dois leitores
     diferentes — o especialista e quem grava — por isso painel separado.
     Lê os frames do original: a direção que se copia é a de lá. */
  function corpoDirecao(dr) {
    var h = '';

    if (dr.headline) {
      h += '<div class="dr-headline"><span class="k">Headline — como o vídeo abre</span>' +
        '<span class="t">' + esc(dr.headline.texto || '') + '</span>' +
        (dr.headline.comoAparece
          ? '<span class="c">' + esc(dr.headline.comoAparece) + '</span>' : '') +
        '</div>';
    }

    if ((dr.frames || []).length) {
      h += '<div class="dr-tiras">' + dr.frames.map(function (f) {
        return '<a class="dr-tira" href="' + esc(f.img) + '" target="_blank" ' +
          'rel="noopener"><img src="' + esc(f.img) + '" alt="" loading="lazy">' +
          '<span>' + String(f.s).replace('.', ',') + 's</span></a>';
      }).join('') + '</div>';
    }

    function campo(k, v) {
      return v ? '<div class="dr-campo"><span class="dr-k">' + esc(k) + '</span>' +
        '<p class="dr-v">' + esc(v) + '</p></div>' : '';
    }

    h += campo('O formato', dr.formato) +
      campo('Cenário', dr.cenario) +
      campo('Enquadramento', dr.enquadramento);

    if ((dr.elementos || []).length) {
      h += '<div class="dr-campo"><span class="dr-k">Elementos em cena</span>' +
        '<ul class="dr-lista">' + dr.elementos.map(function (e) {
          var ess = /essencial/i.test(e.papel || '');
          return '<li' + (ess ? ' class="ess"' : '') + '><span>' + esc(e.o) +
            (e.papel ? ' <span class="dr-papel">· ' + esc(e.papel) + '</span>' : '') +
            '</span></li>';
        }).join('') + '</ul></div>';
    }

    if ((dr.porFaixa || []).length) {
      h += '<div class="dr-campo"><span class="dr-k">O que muda a cada faixa</span>' +
        dr.porFaixa.map(function (f) {
          return '<div class="dr-faixa"><b>' + esc(f.faixa) + '</b>' +
            '<span>' + esc(f.direcao) + '</span></div>';
        }).join('') + '</div>';
    }

    h += campo('Texto na tela', dr.textoNaTela) +
      campo('Corte e edição', dr.corte);

    if (dr.som) {
      h += '<div class="dr-campo"><span class="dr-k">Som</span>' +
        '<span class="dr-som"><b>' + esc(dr.som.tipo) + '</b>' +
        (dr.som.faixa ? '<span>' + esc(dr.som.faixa) + '</span>' : '') + '</span></div>';
    }

    if ((dr.comCelular || []).length) {
      h += '<div class="dr-campo"><span class="dr-k">O mínimo para gravar com celular</span>' +
        '<ul class="dr-lista">' + dr.comCelular.map(function (c) {
          return '<li><span>' + esc(c) + '</span></li>';
        }).join('') + '</ul></div>';
    }

    return h;
  }

  /* A quebra de linha de 88 colunas veio do arquivo de origem. Em tela estreita
     ela vira linha órfã, então some — o parágrafo é que importa. */
  function desdobrar(t) {
    return String(t || '').trim().split(/\n\s*\n/)
      .map(function (b) { return b.replace(/\s*\n\s*/g, ' ').trim(); })
      .join('\n\n');
  }

  function seg(s) { return String(Math.round(s * 10) / 10).replace('.', ','); }

  /* O roteiro em português vem antes do original — é ele que vai ser gravado.
     As duas línguas ficam lado a lado na MESMA faixa de tempo: assim o gancho
     de um se compara com o gancho do outro, não com o vídeo inteiro. */
  function corpoRoteiro(r, orig) {
    var h = '';

    var faixas = (r.trechos || []).length
      ? r.trechos
      : (r.texto ? [{ rot: 'Teleprompter', seg: '', txt: r.texto }] : []);
    if (!faixas.length) return h;

    /* No inglês não há estimativa: a duração do vídeo é conhecida e a
       transcrição é dele inteiro, então caractere por segundo é medido. */
    var cortes = r.cortesOrig;
    var cpsEn = (orig && r.duracao) ? orig.length / r.duracao : 0;
    var lados = (orig && cortes && faixas.length === 3)
      ? [orig.slice(0, cortes[0]), orig.slice(cortes[0], cortes[1]), orig.slice(cortes[1])]
      : null;

    /* A duração fica à vista porque ela é retenção: um roteiro que estica 50%
       além do original não é o mesmo vídeo, é outro. */
    var meus = faixas.reduce(function (a, t) {
      return a + (typeof t.final === 'string' ? t.final.length : (t.txt || '').length) / 16;
    }, 0);
    var sobra = r.duracao ? meus / r.duracao - 1 : 0;
    var barra = '<div class="rt-barra{onde}">' +
      '<button class="rt-copiar" data-cp="' + r.n + '">' + IC_COPIA +
      'Copiar para o teleprompter</button>' +
      (r.duracao
        ? '<span class="rt-dur">estimado <b>' + Math.round(meus) + 's</b> · ' +
          'o original tem ' + r.duracao + 's' +
          (sobra > 0.2
            ? ' · <span class="longo">' + Math.round(sobra * 100) + '% mais longo</span>'
            : '') + '</span>'
        : '') +
      '</div>';

    h += barra.replace('{onde}', '');

    if (lados) {
      h += '<div class="rt-colrot"><span>Português — é isto que você grava</span>' +
        '<span>Original em inglês</span></div>';
    } else {
      h += '<span class="tr-rot">Roteiro em português — leia exatamente assim</span>';
    }

    h += faixas.map(function (t, i) {
      var cls = faixas.length > 1 ? (['g', 'r', 'c'][i] || 'c') : 'c';
      var en = lados ? desdobrar(lados[i]) : '';
      var corrigido = typeof t.final === 'string' && t.final !== t.txt;
      var chave = r.n + ':' + i;

      var cabeca = '<div class="rt-cab"><span class="rt-nm">' + esc(t.rot) + '</span>' +
        (t.seg ? '<span class="rt-seg">' + esc(t.seg) + '</span>' : '') +
        /* os dois tempos sempre à vista, não só quando estoura: é a comparação
           que responde "o meu está mais longo que o dele?" */
        '<span class="rt-' + (t.estoura ? 'real' : 'seg') + '">seu ' +
        seg((typeof t.final === 'string' ? t.final.length : t.txt.length) / 16) + 's</span>' +
        (en && cpsEn ? '<span class="rt-seg">original ' +
          seg(lados[i].length / cpsEn) + 's</span>' : '') +
        (corrigido ? '<span class="rt-marca">corrigido</span>' : '') +
        '<button class="rt-editar" data-ed="' + chave + '">editar</button>' +
        '</div>';

      /* Com alinhamento, a faixa vira tabela de legenda: cada parágrafo ao
         lado da frase inglesa que deu origem a ele. Depois de corrigida ela
         volta ao texto corrido — o pareamento por frase não vale mais. */
      var linhas = corrigido
        ? []
        : (r.pares || []).filter(function (l) { return l.faixa === t.rot; });

      var miolo;
      if (linhas.length) {
        miolo = '<div class="rt-pt" data-cx="' + chave + '">' +
          linhas.map(function (l) {
            var so = !l.en ? ' novo' : (!l.pt ? ' fora' : '');
            return '<div class="lg-linha' + so + '">' +
              '<div class="lg-pt">' + (l.pt ? esc(l.pt)
                : '<span class="lg-vazio">cortei este trecho</span>') + '</div>' +
              '<div class="lg-en">' + (l.en ? esc(l.en)
                : '<span class="lg-vazio">acrescentei — não estava no original</span>') +
              '</div></div>';
          }).join('') + '</div>';
      } else {
        var pt = '<div class="rt-pt" data-cx="' + chave + '">' +
          '<p class="tr-txt" data-txt="' + chave + '">' +
          esc(corrigido ? t.final : t.txt) + '</p>' +
          (corrigido
            ? '<button class="rt-antes" data-antes="' + chave + '">ver o que a máquina ' +
              'tinha escrito</button><p class="tr-txt orig rt-oculto" data-orig="' + chave +
              '">' + esc(t.txt) + '</p>'
            : '') +
          '</div>';
        miolo = lados
          ? '<div class="rt-par">' + pt + '<div class="rt-en"><p class="tr-txt orig">' +
            esc(en) + '</p></div></div>'
          : pt;
      }

      return '<div class="rt-faixa ' + cls + '">' + cabeca + miolo + '</div>';
    }).join('');

    h += barra.replace('{onde}', ' pe');

    if (faixas.length > 1) {
      h += '<p class="rt-legenda">No inglês o tempo é medido — a duração do vídeo é ' +
        'conhecida. <b>No português ele é estimado</b> pela quantidade de texto, a 16 ' +
        'caracteres por segundo; quando aparece em laranja, o trecho está passando da ' +
        'faixa. Editando um trecho, o texto antigo não se perde: fica guardado para o ' +
        'app aprender o que você troca.</p>';
    }

    /* sem os cortes do original não dá para parear faixa a faixa — aí ele vai
       inteiro, embaixo, em vez de sumir */
    if (orig && !lados) {
      h += '<span class="tr-rot">O original, em inglês</span>' +
        '<p class="tr-txt orig">' + esc(desdobrar(orig)) + '</p>';
    }

    if (r.nota) {
      h += '<span class="tr-rot">O que eu mudei em relação ao original</span>' +
        '<p class="tr-txt orig">' + escRico(r.nota) + '</p>';
    }

    if ((r.conferencia || []).length) {
      h += '<span class="tr-rot">Conferir antes de gravar</span><ul class="rt-conf">' +
        r.conferencia.map(function (c) { return '<li>' + escRico(c) + '</li>'; }).join('') +
        '</ul>';
    }

    return h;
  }

  /* O que a máquina aprendeu corrigindo. Fica na Fase 2, não junto do card da
     voz, porque nasce de corrigir roteiro — cada coisa no lugar de onde vem. */
  function blocoRegrasVoz(d) {
    var v = d.regrasVoz || {};
    var regras = v.regras || [];
    if (!regras.length) return '';
    var c = v.contagem || {};
    return '<div class="cartao" style="margin-top:1rem"><div class="cartao-h">' +
      '<h3 style="font-size:18px">O que eu aprendi do seu jeito de falar</h3>' +
      '<p>Saiu das suas próprias correções: cada trecho reescrito vira uma regra que ' +
      'entra no próximo roteiro. ' + (c.correcoes || regras.length) +
      ' correção(ões) lidas até aqui.</p></div>' +
      '<ul class="rt-conf" style="margin:0">' + regras.map(function (r) {
        return '<li>' + esc(r.regra) +
          (r.vezes > 1 ? ' <b style="color:var(--rotulo-3)">· ' + r.vezes + '×</b>' : '') +
          '</li>';
      }).join('') + '</ul>' +
      /* erro de informação NÃO vira regra de voz — se virasse, o modelo
         aprenderia que pode inventar porque alguém conserta depois */
      ((v.fatos || []).length
        ? '<p class="rt-legenda" style="margin-top:.9rem"><b>Também errei ' +
          v.fatos.length + ' informação(ões)</b> que você consertou — versículo, nome, ' +
          'número. Isso eu não guardo como jeito de falar, guardo como erro meu. É por ' +
          'isso que conferir a citação antes de gravar continua valendo.</p>'
        : '') +
      '</div>';
  }

  function blocoFase2(d, transcricoes) {
    var rs = d.roteiros || [];
    if (!rs.length) {
      return '<div class="grupo">' +
        '<div class="cartao"><p style="margin:0;font-size:15px;color:var(--rotulo-2)">' +
        'Ainda não preenchida.</p></div></div>';
    }
    /* O original vive na tabela de transcrições, não na ficha. Casa pela url
       para não guardar o mesmo texto em dois lugares. */
    var porUrl = {};
    (transcricoes || []).forEach(function (t) { if (t.url) porUrl[t.url] = t; });

    var itens = rs.map(function (r) {
      var tr = porUrl[r.url];
      var orig = tr ? tr.texto : '';
      var tx = (r.compartilhamentos && r.views)
        ? (r.compartilhamentos / r.views * 100).toFixed(2).replace('.', ',') : '';
      return '<div class="linha" style="align-items:flex-start">' +
        '<span class="pf-rot" style="width:1.5rem;flex:none;color:var(--rotulo-2);' +
        'font-variant-numeric:tabular-nums;padding-top:.15rem">' + r.n + '</span>' +
        '<div style="flex:1;min-width:0">' +
        '<span style="display:block;font-size:15px;letter-spacing:-.018em">' + esc(r.titulo) + '</span>' +
        '<span style="display:block;font-size:12px;color:var(--rotulo-2);margin-top:.15rem">' +
        'de <a href="' + esc(r.url) + '" target="_blank" rel="noopener" ' +
        'style="color:var(--tinta);text-decoration:none">@' + esc(r.canal) + '</a> · ' +
        num(r.views) + ' views · <b class="pf-cmp">' + num(r.compartilhamentos) +
        ' compart.' + (tx ? ' (' + tx + '%)' : '') + '</b> · ' + r.duracao + 's</span>' +
        (r.porque ? '<span class="pf-como" style="margin-top:.4rem">' + escRico(r.porque) + '</span>' : '') +
        (r.aviso ? '<span class="pf-como" style="margin-top:.4rem;border-left-color:var(--laranja)">' +
          '<b style="color:var(--laranja)">Atenção.</b> ' + escRico(r.aviso) + '</span>' : '') +
        /* Uma linha só de comandos. Assistir vem antes de ler — ninguém devia
           precisar abrir o texto para achar o vídeo. Os painéis continuam
           <details> por baixo, com o <summary> escondido: é o `toggle` deles
           que faz a página lembrar o que estava aberto. */
        '<div class="rt-cmd">' +
        (r.url ? '<a class="bt mini" href="' + esc(r.url) + '" target="_blank" ' +
          'rel="noopener">' + IC_PLAY + 'Assistir o original</a>' : '') +
        (r.texto ? '<button class="bt mini" data-abre="rt:' + r.n + '" ' +
          'data-fecha="Fechar o roteiro">Ler o roteiro</button>' : '') +
        (r.direcao ? '<button class="bt mini" data-abre="dr:' + r.n + '" ' +
          'data-fecha="Fechar a direção">Ver a direção</button>' : '') +
        (r.texto ? '<button class="bt simples mini" data-cp="' + r.n + '">' +
          'Copiar o texto</button>' : '') +
        '</div>' +

        (r.texto ? '<details class="rt-painel" data-ch="rt:' + r.n + '">' +
          '<summary></summary><div class="tr-corpo">' +
          corpoRoteiro(r, orig) + '</div></details>' : '') +

        /* Painel separado: quem grava não precisa do teleprompter, e o
           especialista não precisa da lista de equipamento. */
        (r.direcao ? '<details class="rt-painel" data-ch="dr:' + r.n + '">' +
          '<summary></summary><div class="tr-corpo">' +
          corpoDirecao(r.direcao) + '</div></details>' : '') +
        '</div>' +
        '</div>';
    }).join('');

    return '<div class="grupo">' +
      '<div class="cartao"><div class="cartao-h">' +
      '<h3 style="font-size:18px">Oito roteiros prontos para você revisar</h3>' +
      '<p>Cada um foi transcrito do original, convertido em texto de teleprompter e passado ' +
      'para a sua voz. A ordem é por encaixe com o que você já provou que funciona, não por ' +
      'view. Nada aqui está gravável antes de você passar o olho.</p></div>' +
      '<div class="ilha" style="background:transparent">' + itens + '</div>' +
      blocoRegrasVoz(d) +
      '<p class="pf-nota">Abrindo um roteiro você tem, nesta ordem: o link para assistir o ' +
      'vídeo original, o texto em português cortado em <b>gancho</b> (os 3 primeiros ' +
      'segundos), <b>retenção</b> (3 a 10) e <b>corpo</b> (10 em diante), e por último o ' +
      'original em inglês — para trocar qualquer palavra sabendo o que estava escrito lá.</p>' +
      '</div></div>';
  }

  function blocoProximas() {
    return '<div class="grupo"><div class="cartao">' +
      '<p style="margin:0;font-size:15px;color:var(--rotulo-2);letter-spacing:-.015em">' +
      'Ainda não começou — e ela tem pré-requisito. Só destrava quando <b style="color:var(--rotulo)">' +
      '3 a 5 dos seus próprios vídeos</b> viralizarem. Aí a gente pega a transcrição só ' +
      'desses e pergunta o que eles têm em comum. O padrão que sair vira um agente que ' +
      'escreve os próximos por você.<br><br>' +
      'Só entra outlier nessa conta. Alimentar a IA com o acervo inteiro faz ela otimizar ' +
      'pela média — e a média é sempre puxada pelos vídeos que não foram a lugar nenhum.' +
      '</p></div></div>';
  }

  /* ---------- montagem ---------- */

  /* O sidebar é o mesmo do app, mas aqui ele orienta em vez de navegar: a
     pessoa vê onde está no fluxo inteiro e pula para a seção que quer ler. */
  function pintarLateral(f) {
    /* No app a lateral é do app.js, e ela navega entre telas em vez de rolar.
       Aqui saímos calados quando ela não é nossa. */
    if (OPC.lateral === false || !document.getElementById('nav')) return;
    var d = f.dados || {};
    var feito = {
      briefing: concluida('briefing', d),
      fase0: concluida('fase0', d),
      fase1: concluida('fase1', d),
      fase2: concluida('fase2', d),
      fase3: false
    };

    document.getElementById('nav').innerHTML = STEPS.map(function (s, i) {
      var rot = s.grupo ? '<span class="nav-rot">' + esc(s.grupo) + '</span>' : '';
      var ok = !!feito[s.id];
      var vazio = !s.lock && !s.ancora;
      return rot +
        '<button class="etapa' + (ok ? ' feito' : '') + '"' +
        (s.ancora ? ' data-ir="' + s.ancora + '"' : '') +
        (s.lock || vazio ? ' disabled' : '') + '>' +
        '<span class="et-ic">' +
        (s.lock ? IC_LOCK : ok ? IC_CHECK : '<span>' + i + '</span>') +
        '</span><span class="et-nm">' + esc(s.nm) + '</span></button>';
    }).join('');

    var abertas = STEPS.filter(function (s) { return !s.lock; });
    var feitas = abertas.filter(function (s) { return feito[s.id]; }).length;
    document.getElementById('progBarra').style.width =
      Math.round((feitas / abertas.length) * 100) + '%';
    document.getElementById('progVal').textContent = feitas + ' de ' + abertas.length;

    var p = (f.dados || {}).perfil || {};
    var quem = document.getElementById('quem');
    document.getElementById('quemAv').innerHTML = p.foto
      ? '<img src="' + esc(p.foto) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:99px">'
      : esc(iniciais(f.nome));
    document.getElementById('quemNm').textContent = f.nome || '';
    document.getElementById('quemEm').textContent = f.instagram ? '@' + f.instagram : '';
    quem.style.display = '';
  }

  /* ---------- correção do especialista ----------
     Duas versões convivem: `txt` é o que a máquina escreveu e nunca muda;
     `final` é o que ele de fato fala. O que ensina a voz é o par, não o texto
     final sozinho — por isso sobrescrever seria perder a informação toda. */

  var FICHA = null;

  function acharTrecho(dados, chave) {
    var p = chave.split(':');
    var r = (dados.roteiros || []).filter(function (x) {
      return String(x.n) === p[0];
    })[0];
    return (r && r.trechos && r.trechos[+p[1]]) ? { r: r, t: r.trechos[+p[1]] } : null;
  }

  /* CUIDADO: o app guarda a mesma ficha em memória e salva `dados` inteiro no
     autosave. Sem avisar que gravamos, o primeiro campo digitado depois de uma
     correção devolveria a versão velha por cima dela. */
  function salvarTrecho(chave, valor) {
    /* relê antes de escrever: o salvar_ficha grava `dados` inteiro, então
       partir de uma cópia velha apagaria o que outra tela salvou no meio. */
    return chamar('retomar_ficha', { p_id: codigo }).then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) throw new Error('ficha não encontrada');
      var f = rows[0];
      var d = f.dados || {};
      var achado = acharTrecho(d, chave);
      if (!achado) throw new Error('esse trecho não está mais na ficha');

      achado.t.final = valor;
      /* a versão final montada, para o app aprender a voz depois */
      achado.r.textoFinal = achado.r.trechos.map(function (x) {
        return typeof x.final === 'string' ? x.final : x.txt;
      }).join('\n\n');

      return chamar('salvar_ficha', {
        p_id: codigo,
        p_instagram: f.instagram,
        p_telefone: f.telefone,
        p_nome: f.nome,
        p_dados: d,
        p_etapa: null,      /* null preserva o que já está lá */
        p_progresso: null
      }).then(function (res) {
        if (typeof res !== 'string') {
          throw new Error((res && (res.message || res.hint)) || 'o banco recusou');
        }
        if (FICHA) FICHA.dados = d;
        /* quem chamou guarda a mesma ficha em memória e salva `dados` inteiro
           no autosave — sem este aviso, o primeiro campo digitado depois de
           uma correção devolveria a versão velha por cima dela */
        if (typeof OPC.aoGravar === 'function') OPC.aoGravar(d);
        return valor;
      });
    });
  }

  function abrirEdicao(chave) {
    var cx = document.querySelector('[data-cx="' + chave + '"]');
    if (!cx || cx.querySelector('.rt-area')) return;
    var achado = FICHA ? acharTrecho(FICHA.dados || {}, chave) : null;
    if (!achado) return;

    var atual = typeof achado.t.final === 'string' ? achado.t.final : achado.t.txt;
    var guardado = cx.innerHTML;

    var area = document.createElement('textarea');
    area.className = 'rt-area';
    area.value = atual;
    area.rows = Math.min(16, Math.ceil(atual.length / 60) + 1);

    var acoes = document.createElement('div');
    acoes.className = 'rt-acoes';
    var ok = document.createElement('button');
    ok.className = 'bt forte mini';
    ok.textContent = 'Salvar';
    var nao = document.createElement('button');
    nao.className = 'bt simples mini';
    nao.textContent = 'Cancelar';
    var recado = document.createElement('span');
    recado.className = 'rt-erro';
    acoes.appendChild(ok);
    acoes.appendChild(nao);
    acoes.appendChild(recado);

    cx.innerHTML = '';
    cx.appendChild(area);
    cx.appendChild(acoes);
    area.focus();

    nao.addEventListener('click', function () { cx.innerHTML = guardado; });

    ok.addEventListener('click', function () {
      var valor = area.value.trim();
      if (!valor) { recado.textContent = 'O trecho não pode ficar vazio.'; return; }
      ok.disabled = true;
      nao.disabled = true;
      recado.className = 'rt-erro';
      recado.style.color = 'var(--rotulo-2)';
      recado.textContent = 'salvando…';

      salvarTrecho(chave, valor).then(function () {
        var mudou = valor !== achado.t.txt;
        cx.innerHTML = '<p class="tr-txt" data-txt="' + chave + '">' + esc(valor) + '</p>' +
          (mudou
            ? '<button class="rt-antes" data-antes="' + chave + '">ver o que a máquina ' +
              'tinha escrito</button><p class="tr-txt orig rt-oculto" data-orig="' + chave +
              '">' + esc(achado.t.txt) + '</p>'
            : '');
        var cab = cx.closest('.rt-faixa').querySelector('.rt-cab');
        if (mudou && !cab.querySelector('.rt-marca')) {
          var m = document.createElement('span');
          m.className = 'rt-marca';
          m.textContent = 'corrigido';
          cab.insertBefore(m, cab.querySelector('.rt-editar'));
        }
      }).catch(function (e) {
        ok.disabled = false;
        nao.disabled = false;
        recado.style.color = '';
        recado.textContent = 'Não salvou: ' + (e.message || e) + ' — tente de novo.';
      });
    });
  }

  /* A área de transferência moderna só existe em https e com a aba em foco.
     O caminho antigo continua valendo como rede de segurança. */
  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto);
    }
    return new Promise(function (ok, erro) {
      var cx = document.createElement('textarea');
      cx.value = texto;
      cx.style.cssText = 'position:fixed;top:-9999px;opacity:0';
      document.body.appendChild(cx);
      cx.select();
      var deu = false;
      try { deu = document.execCommand('copy'); } catch (e) { deu = false; }
      document.body.removeChild(cx);
      deu ? ok() : erro(new Error('sem área de transferência'));
    });
  }

  function fecharMenu() {
    document.getElementById('lateral').classList.remove('aberto');
    document.getElementById('veu').classList.remove('on');
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;

    /* Quando a lateral não é nossa, o app já cuida do menu — os dois handlers
       juntos abriam e fechavam na mesma batida, e o menu não abria nunca. */
    if (e.target.closest('[data-act="menu"]') && OPC.lateral !== false) {
      var ab = document.getElementById('lateral').classList.toggle('aberto');
      document.getElementById('veu').classList.toggle('on', ab);
      return;
    }

    /* Botão e painel são separados de propósito: a linha de comandos fica em
       cima, e o <details> que ela abre vem logo abaixo, com o summary oculto. */
    var ab = e.target.closest('[data-abre]');
    if (ab) {
      e.preventDefault();
      var painel = document.querySelector('[data-ch="' + ab.getAttribute('data-abre') + '"]');
      if (painel) { painel.open = !painel.open; sincronizarComandos(); }
      return;
    }

    var cp = e.target.closest('[data-cp]');
    if (cp) {
      e.preventDefault();
      /* copia a versão corrigida quando ela existe — é ela que vai ser lida.
         Sem rótulo de faixa: o que vai para o teleprompter é só a fala. */
      var rr = ((FICHA.dados || {}).roteiros || []).filter(function (x) {
        return String(x.n) === cp.getAttribute('data-cp');
      })[0];
      if (!rr) return;
      var texto = (rr.trechos || []).length
        ? rr.trechos.map(function (t) {
            return typeof t.final === 'string' ? t.final : t.txt;
          }).join('\n\n')
        : (rr.texto || '');

      copiar(texto).then(function () {
        var antes = cp.innerHTML;
        cp.classList.add('ok');
        cp.innerHTML = IC_CHECK + 'Copiado';
        setTimeout(function () {
          cp.classList.remove('ok');
          cp.innerHTML = antes;
        }, 1800);
      }).catch(function () {
        cp.innerHTML = IC_COPIA + 'Não consegui copiar';
      });
      return;
    }

    var ed = e.target.closest('[data-ed]');
    if (ed) {
      e.preventDefault();
      abrirEdicao(ed.getAttribute('data-ed'));
      return;
    }

    var antes = e.target.closest('[data-antes]');
    if (antes) {
      var alvoOrig = document.querySelector(
        '[data-orig="' + antes.getAttribute('data-antes') + '"]');
      if (alvoOrig) {
        var escondido = alvoOrig.classList.toggle('rt-oculto');
        antes.textContent = escondido
          ? 'ver o que a máquina tinha escrito'
          : 'esconder o que a máquina tinha escrito';
      }
      return;
    }

    var bt = e.target.closest('[data-ir]');
    if (!bt) return;
    var alvo = document.getElementById(bt.getAttribute('data-ir'));
    /* Na gaveta, rolar sem fechar deixa a pessoa olhando para o menu em vez
       da seção que ela pediu. */
    fecharMenu();
    if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  var veu = document.getElementById('veu');
  if (veu) veu.addEventListener('click', fecharMenu);

  /* ---------- lembrar onde a pessoa estava ----------
     A página monta o conteúdo por JavaScript depois do fetch, então quando o
     navegador tenta devolver a rolagem sozinho o corpo ainda está vazio e ele
     desiste. Guardamos por conta própria.

     E guardamos também quais painéis estavam abertos: devolver a rolagem sem
     reabrir o painel deixa a pessoa num ponto cujo conteúdo fechou — pior que
     voltar ao topo. */

  var CHAVE = 'perfil:' + (location.hash || '').replace('#', '');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function lembrado() {
    try { return JSON.parse(sessionStorage.getItem(CHAVE)) || {}; }
    catch (e) { return {}; }
  }

  function guardar(mudar) {
    try {
      var m = lembrado();
      mudar(m);
      sessionStorage.setItem(CHAVE, JSON.stringify(m));
    } catch (e) { /* aba anônima, cota cheia — a página funciona sem isso */ }
  }

  var relogio = null;
  window.addEventListener('scroll', function () {
    if (relogio) return;
    relogio = setTimeout(function () {
      relogio = null;
      guardar(function (m) { m.y = Math.round(window.scrollY); });
    }, 250);
  }, { passive: true });

  /* `toggle` não sobe na árvore como clique — daí a captura */
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d || d.tagName !== 'DETAILS' || !d.dataset.ch) return;
    guardar(function (m) {
      var abertos = (m.abertos || []).filter(function (c) { return c !== d.dataset.ch; });
      if (d.open) abertos.push(d.dataset.ch);
      m.abertos = abertos;
    });
  }, true);

  /* O rótulo do botão tem que dizer o que o clique faz agora, não o que fazia
     quando a página montou — inclusive depois de devolver os painéis abertos. */
  function sincronizarComandos() {
    var bs = document.querySelectorAll('[data-abre]');
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      var painel = document.querySelector('[data-ch="' + b.getAttribute('data-abre') + '"]');
      var aberto = !!(painel && painel.open);
      var agora = b.getAttribute('data-fecha');
      var antes = b.getAttribute('data-abrir') || b.textContent;
      if (!b.getAttribute('data-abrir')) b.setAttribute('data-abrir', antes);
      b.textContent = aberto ? agora : b.getAttribute('data-abrir');
    }
  }

  function devolverLugar() {
    var m = lembrado();
    (m.abertos || []).forEach(function (c) {
      var d = document.querySelector('[data-ch="' + c.replace(/"/g, '\\"') + '"]');
      if (d) d.open = true;
    });
    sincronizarComandos();
    if (m.y) {
      /* dois quadros: o primeiro deixa o layout assentar depois de abrir os
         painéis, o segundo corrige o que as imagens empurraram */
      requestAnimationFrame(function () {
        window.scrollTo(0, m.y);
        setTimeout(function () { window.scrollTo(0, m.y); }, 120);
      });
    }
  }

  function pintar(f, transcricoes) {
    FICHA = f;
    var d = f.dados || {};
    var p = d.perfil || {};
    document.title = f.nome + ' — Máquina de Conteúdo';
    var temRoteiros = concluida('fase2', d);
    pintarLateral(f);
    tela.innerHTML =
      blocoTopo(f, p) +

      divisor('', 'Estes são os seus números',
        'O que o seu perfil entrega hoje, medido — não achado. É a régua contra a qual ' +
        'tudo daqui pra frente vai ser comparado.', 'diag', true, 'p-numeros') +
      blocoNumeros(p) +
      blocoVirais(p) +

      divisor('0', 'Definir o campo',
        'Escolher o tamanho da porta de entrada: o assunto na altura que o algoritmo ' +
        'consegue ler, dez temas amplos o bastante para virar busca, e a frase que faz ' +
        'quem passa decidir se te segue.',
        concluida('fase0', d) ? 'feito' : 'agora', false, 'p-fase0') +
      blocoFase0(d) +

      divisor('1', 'Minerar benchmarks',
        'Responder "o que é conteúdo bom?" com dado em vez de opinião. Você não procura ' +
        'canal de que gosta — procura o vídeo que já ganhou.',
        concluida('fase1', d) ? 'feito' : 'aberto', false, 'p-fase1') +
      blocoFase1(d, p) +

      ((transcricoes || []).length
        ? divisor('', 'As transcrições',
            'O texto falado de cada referência, do jeito que saiu. É daqui que o roteiro ' +
            'nasce — e é aqui que você confere se a tradução diz o que o original dizia.',
            'diag', false, 'p-transc') + blocoTranscricoes(transcricoes)
        : '') +

      divisor('2', 'Replicar o validado',
        'Pegar o vídeo que já provou que funciona, transformar em roteiro de teleprompter ' +
        'e gravar palavra por palavra. É a fase que todo mundo quer pular.',
        temRoteiros ? 'agora' : 'aberto', false, 'p-fase2') +
      blocoFase2(d, transcricoes) +

      divisor('3', 'Retroalimentar a IA',
        'Extrair o padrão dos seus próprios virais e transformar em um agente que escreve ' +
        'os próximos. É onde a curva vira.', 'aberto', false, 'p-fase3') +
      blocoProximas() +
      '<p class="pf-nota" style="margin-top:1.5rem">Ficha <span class="mono">' + esc(f.id) + '</span>' +
      (p.raspadoEm ? ' &middot; números lidos em ' + esc(p.raspadoEm) : '') +
      '<br><a href="./" style="color:var(--tinta);text-decoration:none">Voltar para a Máquina de Conteúdo &rsaquo;</a></p>';

    devolverLugar();
  }

  function chamar(fn, corpo) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'apikey': SUPA_ANON,
        'Authorization': 'Bearer ' + SUPA_ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(corpo)
    }).then(function (r) { return r.json(); });
  }

  /* ---------- a porta ----------
     Duas telas montam a mesma revisão: a perfil.html, que é só uma casca, e o
     app, que a usa como tela de entrada. O código é um só de propósito — duas
     cópias do mesmo desenho divergem, e foi o que aconteceu antes. */
  window.Revisao = {
    /* Desenha a partir de uma ficha que quem chamou já tem em mãos. */
    montar: function (alvo, ficha, transcricoes, opcoes) {
      tela = alvo;
      codigo = ficha && ficha.id;
      OPC = opcoes || {};
      VOZ = OPC.voz || '';
      pintar(ficha, transcricoes || []);
    },

    /* Busca a ficha e as transcrições e desenha. As transcrições vivem em outra
       tabela, então são outra chamada; se ela falhar a página abre mesmo assim,
       porque a ficha é o que importa. */
    carregar: function (alvo, fichaId, opcoes) {
      tela = alvo;
      codigo = String(fichaId || '').trim();
      OPC = opcoes || {};
      if (!/^[0-9a-f-]{36}$/i.test(codigo)) {
        aviso('Sem código de ficha', 'O endereço precisa terminar com o código de 36 caracteres.');
        return Promise.resolve(null);
      }
      /* A voz mora em coluna própria, não no `dados` — por isso a terceira
         chamada. Se ela falhar, a ficha abre do mesmo jeito e o card some. */
      return Promise.all([
        chamar('retomar_ficha', { p_id: codigo }),
        chamar('minhas_transcricoes', { p_ficha: codigo }).catch(function () { return []; }),
        chamar('minha_voz', { p_ficha: codigo }).catch(function () { return []; })
      ]).then(function (res) {
        var rows = res[0];
        var trans = Array.isArray(res[1]) ? res[1] : [];
        VOZ = ((res[2] || [])[0] || {}).voz || '';
        if (!Array.isArray(rows) || !rows.length) {
          aviso('Não encontrei essa ficha', 'Confira o código no endereço.');
          return null;
        }
        pintar(rows[0], trans);
        return rows[0];
      }).catch(function () {
        aviso('Não consegui conectar', 'Tente de novo daqui a pouco.');
        return null;
      });
    }
  };
})();
