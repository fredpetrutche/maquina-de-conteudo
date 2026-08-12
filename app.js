/* ============================================================
   MÁQUINA DE CONTEÚDO — motor do fluxo
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'maquina-conteudo.v1';
  var KEY_ID = 'maquina-conteudo.ident';
  var SUPA_URL = 'https://mkajvxyiyqxotiydkylq.supabase.co';
  var SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rYWp2eHlpeXF4b3RpeWRreWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NTgzNzcsImV4cCI6MjEwMjAzNDM3N30.vfHCb8BRcshufnp_7eAt9ch4aVEMpcbVA5u16IS0Kao';

  var ALVO_TEMAS = 10;
  var ALVO_CANAIS = 10;
  var ALVO_VIDEOS = 10;
  var TEMAS_INICIAIS = 3;

  var STEPS = [
    { id: 'briefing', ph: 'Etapa 0', nm: 'Briefing', grupo: 'Comece aqui' },
    { id: 'fase0', ph: 'Fase 0', nm: 'Definir o campo', grupo: 'Suas informações' },
    { id: 'fase1', ph: 'Fase 1', nm: 'Minerar benchmarks' },
    { id: 'fase2', ph: 'Fase 2', nm: 'Replicar o validado', lock: 1, grupo: 'Destrava depois' },
    { id: 'fase3', ph: 'Fase 3', nm: 'Retroalimentar a IA', lock: 1 },
    { id: 'fase4', ph: 'Fase 4', nm: 'Travar o formato', lock: 1 },
    { id: 'fase5', ph: 'Fase 5', nm: 'Industrializar', lock: 1 },
    { id: 'fase6', ph: 'Fase 6', nm: 'Monetizar', lock: 1 }
  ];

  var IC_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var IC_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';
  var IC_SETA = '<svg class="seta-c" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  var IC_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  var IC_MAIS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

  /* ---------- estado ---------- */
  function novoEstado() {
    var s = {
      v: 4, briefingOk: false, plataforma: '',
      macroNicho: '', subNicho: '',
      comunidade: '', comunidadeBandeira: '', comunidadeCausa: '',
      temas: [], sigNome: '', sigEntrega: '', sigPromessa: '',
      videos: []
    };
    for (var i = 0; i < TEMAS_INICIAIS; i++) s.temas.push('');
    return s;
  }

  var state = novoEstado();
  var ident = { id: null, nome: '', telefone: '' };

  /* ---------- celular ----------
     Guardamos sempre em E.164 sem o "+" (5511987654321), que é o
     formato que a Cloud API da Meta espera. Na tela, mostramos
     formatado. */
  function soDigitos(v) { return String(v || '').replace(/\D/g, ''); }
  function semDDI(d) {
    return ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') ? d.slice(2) : d;
  }
  function mascaraTel(v) {
    var d = semDDI(soDigitos(v)).slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function telE164(v) {
    var d = semDDI(soDigitos(v)).slice(0, 11);
    return d.length >= 10 ? '55' + d : '';
  }
  function telValido(e164) { return /^55[1-9][0-9][0-9]{8,9}$/.test(e164); }
  function telBonito(e164) {
    var d = semDDI(soDigitos(e164));
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return e164;
  }
  var atual = 'briefing';
  var abertos = { 0: true };
  var jaFestejou = {};

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function linhas(t) {
    return String(t || '').split('\n').map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });
  }
  function cheios(arr) {
    return arr.filter(function (t) { return String(t || '').trim(); }).length;
  }
  function totalVideos() { return state.videos.length; }

  /* agrupa os vídeos pelo canal que o YouTube devolveu */
  function agrupar() {
    var mapa = {}, ordem = [];
    state.videos.forEach(function (v, i) {
      if (v.fonte === 'ig' && !(v.canal.trim() && v.url.trim())) return;
      var chave = (v.canalUrl || v.canal || '').toLowerCase();
      if (!chave) return;
      if (!mapa[chave]) {
        mapa[chave] = { nome: v.canal || chave, url: v.canalUrl || '', videos: [] };
        ordem.push(chave);
      }
      mapa[chave].videos.push({ v: v, i: i });
    });
    return ordem.map(function (k) {
      var g = mapa[k];
      g.videos.sort(function (a, b) { return lerNumero(b.v.views) - lerNumero(a.v.views); });
      return g;
    });
  }
  function canaisOk() { return agrupar().length; }
  function naoLidos() {
    return state.videos.filter(function (v) { return v.estado === 'erro'; });
  }

  /* ---------- servidor ---------- */
  function rpc(fn, corpo) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || r.status); });
      return r.json();
    });
  }

  function progresso() {
    return ['briefing', 'fase0', 'fase1'].filter(concluida).length;
  }

  var syncTimer = null;
  function sincronizar() {
    if (!ident.nome || !ident.telefone) return;
    estadoSinc('mov');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      rpc('salvar_ficha', {
        p_id: ident.id, p_nome: ident.nome, p_telefone: ident.telefone,
        p_dados: state, p_etapa: atual, p_progresso: progresso()
      }).then(function (id) {
        if (id && !ident.id) { ident.id = id; salvarIdent(); pintarPe(); }
        estadoSinc('on');
      }).catch(function () { estadoSinc('erro'); });
    }, 1100);
  }

  function estadoSinc(st) {
    var el = $('sinc'); if (!el) return;
    el.className = 'sinc' + (st ? ' ' + st : '');
    el.querySelector('span').textContent =
      st === 'mov' ? 'Salvando…' :
      st === 'on' ? 'Salvo na nuvem' :
      st === 'erro' ? 'Sem conexão — salvo aqui' : 'Salvo neste aparelho';
  }

  /* ---------- persistência ---------- */
  function carregarIdent() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY_ID) || 'null');
      if (d && (d.telefone || d.email)) {
        ident = { id: d.id || null, nome: d.nome || '', telefone: d.telefone || '' };
      }
    } catch (e) {}
  }
  function salvarIdent() {
    try { localStorage.setItem(KEY_ID, JSON.stringify(ident)); } catch (e) {}
  }
  function carregar() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) aplicar(JSON.parse(raw));
    } catch (e) {}
  }
  function aplicar(d) {
    if (!d || typeof d !== 'object') return;
    state.briefingOk = !!d.briefingOk;
    state.plataforma = d.plataforma || '';
    state.macroNicho = d.macroNicho || '';
    state.subNicho = d.subNicho || '';
    state.comunidade = d.comunidade || '';
    state.comunidadeBandeira = d.comunidadeBandeira || '';
    state.comunidadeCausa = d.comunidadeCausa || '';
    state.sigNome = d.sigNome || '';
    state.sigEntrega = d.sigEntrega || '';
    state.sigPromessa = d.sigPromessa || '';
    if (Array.isArray(d.temas) && d.temas.length) {
      state.temas = d.temas.slice(0, ALVO_TEMAS).map(function (t) { return t || ''; });
    }
    if (Array.isArray(d.videos)) {
      state.videos = d.videos.filter(Boolean).map(function (v) {
        return {
          url: v.url || '', id: v.id || '', titulo: v.titulo || '',
          canal: v.canal || '', canalUrl: v.canalUrl || '',
          views: v.views || '', fonte: v.fonte || 'yt', estado: v.estado || 'novo'
        };
      });
    } else if (Array.isArray(d.canais)) {
      // formato antigo: canal com um bloco de links soltos
      d.canais.forEach(function (c) {
        if (!c) return;
        linhas(c.videos).forEach(function (u) {
          state.videos.push({
            url: u, id: idDoVideo(u) || '', titulo: '',
            canal: c.nome || '', canalUrl: c.url || '',
            estado: c.nome ? 'ok' : 'novo'
          });
        });
      });
    }
  }

  var salvarTimer = null;
  function salvar() {
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    }, 250);
    sincronizar();
  }

  /* ---------- conclusão ---------- */
  function concluida(id) {
    if (id === 'briefing') return state.briefingOk;
    if (id === 'fase0') {
      return !!(state.macroNicho.trim() && state.subNicho.trim() &&
        state.comunidade.trim() && state.comunidadeBandeira.trim() && state.comunidadeCausa.trim() &&
        cheios(state.temas) >= ALVO_TEMAS &&
        state.sigNome.trim() && state.sigEntrega.trim() && state.sigPromessa.trim());
    }
    if (id === 'fase1') return !!state.plataforma && canaisOk() >= ALVO_CANAIS;
    return false;
  }

  var MARCOS = {
    fase0: { t: 'Campo definido', p: 'Você já sabe onde joga, por quem fala e como se apresenta. Agora vamos atrás das referências.', b: 'Ir para a Fase 1', ir: 'fase1' },
    fase1: { t: 'Acervo montado', p: 'Os seus benchmarks estão prontos. É deles que saem os roteiros da Fase 2.', b: 'Continuar', ir: null }
  };

  function checarMarco() {
    ['fase0', 'fase1'].forEach(function (f) {
      if (concluida(f) && !jaFestejou[f]) {
        jaFestejou[f] = true;
        try { localStorage.setItem(KEY + '.marcos', JSON.stringify(jaFestejou)); } catch (e) {}
        var m = MARCOS[f];
        $('marcoTit').textContent = m.t;
        $('marcoTxt').textContent = m.p;
        var bt = $('btMarco');
        bt.textContent = m.b;
        bt.onclick = function () { $('marco').classList.remove('on'); if (m.ir) ir(m.ir); };
        $('marco').classList.add('on');
      }
    });
  }

  /* ---------- lateral ---------- */
  function pintarNav() {
    var html = '';
    STEPS.forEach(function (s, i) {
      if (s.grupo) html += '<span class="nav-rot">' + esc(s.grupo) + '</span>';
      var ok = concluida(s.id);
      html += '<button class="etapa' + (ok ? ' feito' : '') + '" data-go="' + s.id + '"' +
        (s.lock ? ' disabled' : '') + ' aria-current="' + (s.id === atual) + '">' +
        '<span class="et-ic">' + (s.lock ? IC_LOCK : ok ? IC_CHECK : '<span>' + i + '</span>') + '</span>' +
        '<span class="et-nm">' + esc(s.nm) + '</span></button>';
    });
    $('nav').innerHTML = html;

    var abertas = STEPS.filter(function (s) { return !s.lock; });
    var feitas = abertas.filter(function (s) { return concluida(s.id); }).length;
    $('progBarra').style.width = Math.round((feitas / abertas.length) * 100) + '%';
    $('progVal').textContent = feitas + ' de ' + abertas.length;

    var st = STEPS.filter(function (s) { return s.id === atual; })[0];
    if (st) { $('barraNm').textContent = st.nm; $('barraPh').textContent = st.ph; }
  }

  function pintarPe() {
    var q = $('quem');
    if (ident.nome) {
      q.style.display = '';
      $('quemAv').textContent = ident.nome.trim().charAt(0).toUpperCase();
      $('quemNm').textContent = ident.nome;
      $('quemEm').textContent = telBonito(ident.telefone);
    } else q.style.display = 'none';

    var c = $('codigoCx');
    if (ident.id) { c.style.display = ''; $('codigoVal').textContent = ident.id; }
    else c.style.display = 'none';

    estadoSinc(ident.nome ? 'on' : '');
  }

  /* ---------- navegação ---------- */
  function ir(id, quieto) {
    var st = STEPS.filter(function (s) { return s.id === id; })[0];
    if (!st || st.lock) return;
    atual = id;
    var v = document.querySelectorAll('.vista');
    for (var i = 0; i < v.length; i++) v[i].classList.toggle('on', v[i].id === 'v-' + id);
    pintarNav();
    fecharMenu();
    if (history.replaceState) history.replaceState(null, '', '#' + id);
    if (!quieto) window.scrollTo(0, 0);
  }
  function fecharMenu() {
    $('lateral').classList.remove('aberto');
    $('veu').classList.remove('on');
  }
  function fecharFolhas() {
    $('porta').classList.remove('on');
    $('marco').classList.remove('on');
    erroPorta('');
  }

  /* ---------- Fase 0: temas ---------- */
  function pintarTemas() {
    var h = '';
    state.temas.forEach(function (t, i) {
      h += '<div class="linha">' +
        '<span class="ord">' + (i + 1) + '</span>' +
        '<input type="text" data-tema="' + i + '" value="' + esc(t) + '" placeholder="' + esc(exTema(i)) + '" aria-label="Tema ' + (i + 1) + '">' +
        (state.temas.length > 1 ? '<button class="remover" data-rm-tema="' + i + '" aria-label="Remover tema">' + IC_X + '</button>' : '') +
        '</div>';
    });
    if (state.temas.length < ALVO_TEMAS) {
      h += '<div class="linha add" data-add-tema><span class="mais-ic">' + IC_MAIS + '</span>Adicionar tema</div>';
    }
    $('temasIlha').innerHTML = h;
    medidor('medTemas', cheios(state.temas), ALVO_TEMAS);
    if ($('chipsTemas')) atualizarPerguntas();
  }
  function exTema(i) {
    var e = ['empreendedorismo', 'lucro', 'delegação', 'produtividade', 'trabalhar menos',
      'liderança', 'vendas', 'marketing', 'contratação', 'gestão do tempo'];
    return e[i] || 'outro tema';
  }

  /* ---------- a conversa reage ao que já foi respondido ---------- */
  var SUGESTOES = {
    'negócios': ['lucro', 'delegação', 'vendas', 'liderança', 'contratação', 'gestão do tempo'],
    'saúde': ['sono', 'alimentação', 'ansiedade', 'energia', 'longevidade', 'hábitos'],
    'fé': ['oração', 'propósito', 'perdão', 'ansiedade', 'relacionamento', 'provisão'],
    'finanças': ['sair das dívidas', 'investir', 'renda extra', 'aposentadoria', 'orçamento'],
    'maternidade': ['sono do bebê', 'culpa materna', 'volta ao trabalho', 'birra', 'rotina'],
    'carreira': ['entrevista', 'promoção', 'salário', 'transição', 'currículo', 'chefe ruim'],
    '': ['dinheiro', 'tempo', 'hábitos', 'relacionamento', 'produtividade', 'medo']
  };

  function atualizarPerguntas() {
    var m = state.macroNicho.trim();
    var eco = m ? '<span class="p-eco">' + esc(m) + '</span>' : '';

    $('tit2').innerHTML = m
      ? 'Dentro de ' + eco + ', qual é o seu recorte?'
      : 'E dentro desse assunto, qual é o seu recorte?';

    $('tit4').innerHTML = m
      ? 'Sobre o que você vai falar dentro de ' + eco + '?'
      : 'Sobre o que você vai falar?';

    // sugestões de tema seguem o assunto escolhido
    var chave = SUGESTOES[m.toLowerCase()] ? m.toLowerCase() : '';
    var jaTem = state.temas.map(function (t) { return t.trim().toLowerCase(); });
    var livres = SUGESTOES[chave].filter(function (s) { return jaTem.indexOf(s) < 0; });
    $('chipsTemas').innerHTML = livres.map(function (s) {
      return '<button class="chip-ex" data-add-tema-txt="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
    $('sugTemas').style.display = livres.length ? '' : 'none';

    // cada pergunta respondida ganha a marca verde
    var feito = {
      pg1: !!m,
      pg2: !!state.subNicho.trim(),
      pg3: !!(state.comunidade.trim() && state.comunidadeBandeira.trim() && state.comunidadeCausa.trim()),
      pg4: cheios(state.temas) >= ALVO_TEMAS,
      pg5: !!(state.sigNome.trim() && state.sigEntrega.trim() && state.sigPromessa.trim())
    };
    Object.keys(feito).forEach(function (id) {
      var el = $(id); if (!el) return;
      el.classList.toggle('pronta', feito[id]);
      var ic = el.querySelector('.p-passo i');
      if (ic) {
        ic.innerHTML = feito[id]
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : id.replace('pg', '');
      }
    });
  }

  function primeiroTemaVazio() {
    for (var i = 0; i < state.temas.length; i++) {
      if (!state.temas[i].trim()) return i;
    }
    if (state.temas.length < ALVO_TEMAS) { state.temas.push(''); return state.temas.length - 1; }
    return -1;
  }
  function medidor(id, n, alvo) {
    var el = $(id); if (!el) return;
    el.className = 'medidor' + (n >= alvo ? ' pronto' : '');
    el.querySelector('.v').textContent = n + '/' + alvo;
    el.querySelector('i').style.width = Math.min(100, (n / alvo) * 100) + '%';
  }

  function pintarAssinatura() {
    var n = state.sigNome.trim(), e = state.sigEntrega.trim(), p = state.sigPromessa.trim();
    // enquanto faltar preencher, o "+" mostra que ali são dois campos
    // diferentes; com os dois prontos, some e vira frase corrida
    var elo = (e && p) ? ' ' : ' <span class="elo-vaga">+</span> ';
    $('sigTxt').innerHTML = 'Meu nome é ' +
      (n ? esc(n) : '<span class="vaga">seu nome</span>') + ' e eu ' +
      (e ? esc(e) : '<span class="vaga">o que você faz</span>') + elo +
      (p ? esc(p) : '<span class="vaga">a promessa</span>') +
      ' todos os dias. Se inscreve para não perder a próxima.';
    var limpo = ('Meu nome é ' + n + ' e eu ' + e + ' ' + p + ' todos os dias.').trim();
    var m = $('sigMeta');
    m.textContent = limpo.length + ' caracteres' + (limpo.length > 110 ? ' — está longa. Corte até caber em um fôlego.' : '');
    m.className = 'previa-m' + (limpo.length > 110 ? ' longa' : '');
  }

  /* ---------- Fase 1: canais ---------- */
  /* ============================================================
     FASE 1 — ler links e descobrir o canal sozinho
     O YouTube publica um endpoint aberto (oEmbed) que devolve
     título, nome e link do canal a partir de um link de vídeo.
     Não precisa de chave nem de servidor: ele libera CORS.
     ============================================================ */
  var PADROES = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/
  ];
  function idDoVideo(u) {
    for (var i = 0; i < PADROES.length; i++) {
      var m = String(u || '').match(PADROES[i]);
      if (m) return m[1];
    }
    return null;
  }

  function consultar(id) {
    var alvo = 'https://www.youtube.com/watch?v=' + id;
    return fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(alvo) + '&format=json')
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      });
  }

  var lendo = false;
  function lerLinks() {
    var cru = $('colaLinks').value;
    var achados = linhas(cru);
    if (!achados.length) return avisar('Cole pelo menos um link');

    var jaTem = {};
    state.videos.forEach(function (v) { if (v.id) jaTem[v.id] = true; });

    var novos = 0, repetidos = 0, invalidos = 0;
    achados.forEach(function (u) {
      var id = idDoVideo(u);
      if (!id) { 
        state.videos.push({ url: u, id: '', titulo: '', canal: '', canalUrl: '', estado: 'erro' });
        invalidos++; return;
      }
      if (jaTem[id]) { repetidos++; return; }
      jaTem[id] = true;
      state.videos.push({
        url: 'https://www.youtube.com/watch?v=' + id, id: id,
        titulo: '', canal: '', canalUrl: '', estado: 'novo'
      });
      novos++;
    });

    $('colaLinks').value = '';
    var resumo = [];
    if (novos) resumo.push(novos + (novos === 1 ? ' link novo' : ' links novos'));
    if (repetidos) resumo.push(repetidos + ' repetido' + (repetidos > 1 ? 's' : ''));
    if (invalidos) resumo.push(invalidos + ' não reconhecido' + (invalidos > 1 ? 's' : ''));
    avisar(resumo.join(' · ') || 'Nada novo');

    pintarAchados(); salvar(); pintarNav();
    processarFila();
  }

  /* consulta em fila, poucos de cada vez, para não afogar o YouTube */
  function processarFila() {
    if (lendo) return;
    var pendentes = state.videos.filter(function (v) { return v.estado === 'novo'; });
    if (!pendentes.length) { estadoCola(''); checarMarco(); return; }

    lendo = true;
    var i = 0, ativos = 0, LIMITE = 4;

    function proximo() {
      if (i >= pendentes.length) {
        if (ativos === 0) {
          lendo = false;
          pintarAchados(); salvar(); pintarNav(); checarMarco();
          estadoCola('');
        }
        return;
      }
      var v = pendentes[i++];
      ativos++;
      estadoCola('lendo', pendentes.length - i);
      consultar(v.id).then(function (d) {
        v.titulo = d.title || '';
        v.canal = d.author_name || '';
        v.canalUrl = d.author_url || '';
        v.estado = 'ok';
      }).catch(function () {
        v.estado = 'erro';
      }).then(function () {
        ativos--;
        pintarAchados();
        proximo();
      });
      if (ativos < LIMITE) proximo();
    }
    proximo();
  }

  function estadoCola(st, faltam) {
    var el = $('colaEstado'); if (!el) return;
    el.innerHTML = st === 'lendo'
      ? '<span class="lendo"><span class="giro"></span>Lendo… faltam ' + faltam + '</span>'
      : '';
  }

  function pintarAchados() {
    var grupos = agrupar();
    $('achados').innerHTML = grupos.map(function (g) {
      var completo = g.videos.length >= ALVO_VIDEOS;
      return '<div class="achado' + (completo ? ' completo' : '') + '">' +
        '<div class="achado-h">' +
        '<span class="av">' + esc((g.nome || '?').trim().charAt(0).toUpperCase()) + '</span>' +
        '<span class="achado-t"><b>' + esc(g.nome) + '</b>' +
        (g.url ? '<a href="' + esc(g.url) + '" target="_blank" rel="noopener">' + esc(g.url.replace(/^https?:\/\/(www\.)?/, '')) + '</a>' : '') +
        '</span>' +
        '<span class="achado-n">' + g.videos.length + '/' + ALVO_VIDEOS + '</span>' +
        '</div>' +
        '<ul class="achado-v">' + g.videos.map(function (item, k) {
          return '<li><span class="ord">' + (k + 1) + '</span>' +
            '<span class="tit">' + esc(item.v.titulo || item.v.url) + '</span>' +
            (item.v.views ? '<span class="views">' + esc(numeroBonito(lerNumero(item.v.views)) || item.v.views) + '</span>' : '') +
            '<button class="x" data-rm-video="' + item.i + '" aria-label="Remover vídeo">' + IC_X + '</button></li>';
        }).join('') + '</ul></div>';
    }).join('');

    var ruins = naoLidos();
    $('naoLidos').innerHTML = ruins.length
      ? '<div class="nao-lidos"><span class="k">' + ruins.length + ' link(s) que eu não consegui ler</span>' +
        '<ul>' + ruins.map(function (v) { return '<li>' + esc(v.url) + '</li>'; }).join('') + '</ul></div>'
      : '';

    var pendentes = state.videos.filter(function (v) { return v.estado === 'novo'; }).length;
    medidor('medCanais', grupos.length, ALVO_CANAIS);
    $('notaVideos').textContent = 'Meta: 10 canais, com os 10 vídeos mais vistos de cada. ' +
      'Você tem ' + grupos.length + ' canal(is) e ' + totalVideos() + ' vídeo(s).' +
      (pendentes ? ' ' + pendentes + ' ainda sendo lidos.' : '');

    var bt = $('btTranscrever');
    if (bt) {
      var prontos = state.videos.filter(function (v) { return v.estado === 'ok'; }).length;
      bt.disabled = prontos < 1;
      $('notaTransc').textContent = prontos >= 1
        ? prontos + ' vídeo(s) identificados. Esta função abre na próxima etapa.'
        : 'Cole pelo menos um vídeo para liberar.';
    }
  }


  /* ============================================================
     INSTAGRAM — entrada na mão
     A plataforma não permite ordenar por visualizações nem ler
     metadados de fora, então a pessoa anota o que viu.
     ============================================================ */
  function lerNumero(v) {
    var t = String(v || '').trim().toLowerCase().replace(/\s|visualizações|views/g, '');
    if (!t) return 0;
    var mult = 1;
    if (/(mi|mm|m)$/.test(t) && !/mil$/.test(t)) { mult = 1e6; t = t.replace(/(mi|mm|m)$/, ''); }
    else if (/(mil|k)$/.test(t)) { mult = 1e3; t = t.replace(/(mil|k)$/, ''); }
    var n;
    if (t.indexOf(',') > -1) n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = parseFloat(t.replace(/\./g, ''));
    else n = parseFloat(t);
    return isNaN(n) ? 0 : Math.round(n * mult);
  }
  function numeroBonito(n) {
    if (!n) return '';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' mi';
    if (n >= 1e3) return Math.round(n / 1e3) + ' mil';
    return String(n);
  }
  function perfilUrl(h) {
    var u = String(h || '').trim().replace(/^@/, '').replace(/\/$/, '');
    var m = u.match(/instagram\.com\/([^\/?#]+)/i);
    if (m) u = m[1];
    return u ? 'https://www.instagram.com/' + u : '';
  }

  function pintarIg() {
    var lista = state.videos.filter(function (v) { return v.fonte === 'ig'; });
    if (!lista.length) { state.videos.push(novoIg()); lista = [state.videos[state.videos.length - 1]]; }
    $('igLista').innerHTML = lista.map(function (v) {
      var i = state.videos.indexOf(v);
      var ok = v.canal.trim() && v.url.trim();
      return '<div class="ig-item' + (ok ? ' ok' : '') + '">' +
        '<div class="ig-topo"><span class="ig-n">' + (ok ? '✓' : lista.indexOf(v) + 1) + '</span>' +
        '<div class="ig-campos">' +
        '<div class="ig-campo"><label>Perfil</label>' +
        '<input type="text" data-ig-canal="' + i + '" value="' + esc(v.canal) + '" placeholder="@perfil"></div>' +
        '<div class="ig-campo"><label>Link do vídeo</label>' +
        '<input type="text" data-ig-url="' + i + '" value="' + esc(v.url) + '" placeholder="instagram.com/reel/..."></div>' +
        '<div class="ig-campo num"><label>Visualizações</label>' +
        '<input type="text" data-ig-views="' + i + '" value="' + esc(v.views) + '" placeholder="1,2 mi"></div>' +
        '</div></div>' +
        '<button class="ig-x" data-rm-video="' + i + '" aria-label="Remover">' + IC_X + '</button>' +
        '</div>';
    }).join('');
  }
  function novoIg() {
    return { url: '', id: '', titulo: '', canal: '', canalUrl: '', views: '', fonte: 'ig', estado: 'ok' };
  }

  /* ---------- alterna o caminho conforme a plataforma ---------- */
  function pintarPlataforma() {
    var p = state.plataforma;
    var bts = $('segPlat').querySelectorAll('button');
    for (var i = 0; i < bts.length; i++) {
      bts[i].setAttribute('aria-pressed', bts[i].getAttribute('data-plat') === p);
    }
    $('camYoutube').style.display = p === 'youtube' ? '' : 'none';
    $('camInstagram').style.display = p === 'instagram' ? '' : 'none';
    $('colaYoutube').style.display = p === 'youtube' ? '' : 'none';
    $('colaInstagram').style.display = p === 'instagram' ? '' : 'none';
    $('blocoAchados').style.display = p ? '' : 'none';
    if (p === 'instagram') pintarIg();
  }


  /* ============================================================
     COMPLETAR PERFIL — a pessoa escolhe o perfil, o servidor
     descobre quais vídeos dele realmente performaram.
     Rolar o Instagram mostra o recente, não o melhor.
     ============================================================ */
  var raspando = {};
  var sugestoes = {};

  function raspar(perfil, alvoBotao) {
    var chave = perfil.toLowerCase();
    if (raspando[chave]) return;
    raspando[chave] = true;
    if (alvoBotao) { alvoBotao.disabled = true; alvoBotao.textContent = 'Buscando…'; }

    fetch(SUPA_URL + '/functions/v1/raspar-perfil', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ perfil: perfil })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.erro || !d.runId) throw new Error(d.erro || 'sem resposta');
      esperar(chave, d.runId, 0);
    }).catch(function (e) {
      raspando[chave] = false;
      pintarAchados();
      avisar('Não consegui buscar: ' + String(e.message || e).slice(0, 60));
    });
  }

  function esperar(chave, runId, tentativa) {
    if (tentativa > 60) {
      raspando[chave] = false; pintarAchados();
      return avisar('A busca demorou demais. Tente de novo.');
    }
    setTimeout(function () {
      fetch(SUPA_URL + '/functions/v1/raspar-perfil', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runId })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d.pronto) return esperar(chave, runId, tentativa + 1);
        raspando[chave] = false;
        if (d.erro) { pintarAchados(); return avisar(d.erro); }
        var jaTem = {};
        state.videos.forEach(function (v) {
          if (v.url) jaTem[String(v.url).replace(/\/$/, '')] = true;
        });
        sugestoes[chave] = (d.videos || []).filter(function (v) {
          return !jaTem[String(v.url).replace(/\/$/, '')];
        }).slice(0, ALVO_VIDEOS).map(function (v) { return { v: v, marcado: true }; });
        pintarAchados();
        avisar(sugestoes[chave].length
          ? sugestoes[chave].length + ' vídeo(s) encontrados'
          : 'Você já tinha os melhores desse perfil');
      }).catch(function () {
        raspando[chave] = false; pintarAchados();
        avisar('Perdi a conexão com a busca');
      });
    }, tentativa === 0 ? 4000 : 3000);
  }

  function pintarSugestoes(chave) {
    var s = sugestoes[chave];
    if (!s || !s.length) return '';
    return '<div class="sugerido"><span class="k">Os mais vistos deste perfil — marque os que você falaria</span>' +
      '<ul class="sug-lista">' + s.map(function (item, k) {
        return '<li><button class="marca" data-marcar="' + chave + '|' + k + '" aria-pressed="' + item.marcado + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>' +
          '<span class="t">' + esc(item.v.legenda || item.v.url) + '</span>' +
          '<span class="v">' + numeroBonito(item.v.views) + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="sug-pe">' +
      '<button class="bt forte mini" data-aceitar="' + chave + '">Adicionar marcados</button>' +
      '<button class="bt simples mini" data-descartar="' + chave + '">Descartar</button>' +
      '</div></div>';
  }

  /* ---------- porta ---------- */
  function abrirPorta(modo) {
    $('porta').classList.add('on');
    trocarPorta(modo);
    if (modo !== 'retomar' && ident.telefone) $('gTel').value = telBonito(ident.telefone);
    setTimeout(function () {
      var f = $(modo === 'retomar' ? 'gCodigo' : 'gNome'); if (f) f.focus();
    }, 80);
  }
  function trocarPorta(modo) {
    $('portaNova').classList.toggle('on', modo !== 'retomar');
    $('portaRetomar').classList.toggle('on', modo === 'retomar');
    erroPorta('');
  }
  function erroPorta(m) {
    var e = $('portaErr'); e.textContent = m || ''; e.classList.toggle('on', !!m);
  }
  function entrar() {
    var n = $('gNome').value.trim(), tel = telE164($('gTel').value);
    if (n.length < 2) return erroPorta('Escreva o seu nome.');
    if (!telValido(tel)) return erroPorta('Confira o celular: precisa do DDD e do número completo.');
    ident.nome = n; ident.telefone = tel;
    salvarIdent();
    $('porta').classList.remove('on');
    pintarPe();
    state.briefingOk = true;
    salvar(); pintarNav(); ir('fase0');
  }

  function recuperar() {
    var c = $('gCodigo').value.trim();
    if (!/^[0-9a-f-]{36}$/i.test(c)) return erroPorta('Código inválido. Ele tem 36 caracteres.');
    erroPorta('');
    $('btRetomar').disabled = true;
    rpc('retomar_ficha', { p_id: c }).then(function (rows) {
      $('btRetomar').disabled = false;
      if (!rows || !rows.length) return erroPorta('Não encontrei nenhuma ficha com esse código.');
      var f = rows[0];
      ident = { id: f.id, nome: f.nome, telefone: f.telefone || '' };
      salvarIdent();
      if (f.dados && typeof f.dados === 'object') {
        state = novoEstado(); aplicar(f.dados);
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
      }
      $('porta').classList.remove('on');
      montar(); pintarPe();
      avisar('Ficha recuperada');
      ir(concluida('fase0') ? 'fase1' : 'fase0');
    }).catch(function () {
      $('btRetomar').disabled = false;
      erroPorta('Não consegui conectar. Tente de novo.');
    });
  }

  /* ---------- exportar ---------- */
  function texto() {
    var L = ['# MÁQUINA DE CONTEÚDO — Ficha de entrada', ''];
    if (ident.nome) L.push('**' + ident.nome + '** · ' + telBonito(ident.telefone), '');
    L.push('## Fase 0 — Definir o campo', '');
    L.push('- **Macro-nicho:** ' + (state.macroNicho.trim() || '(vazio)'));
    L.push('- **Subnicho:** ' + (state.subNicho.trim() || '(vazio)'), '');
    L.push('**Comunidade**');
    L.push('- Representa: ' + (state.comunidade.trim() || '(vazio)'));
    L.push('- Como se descreve: ' + (state.comunidadeBandeira.trim() || '(vazio)'));
    L.push('- Orgulho ferido: ' + (state.comunidadeCausa.trim() || '(vazio)'), '');
    L.push('**Assinatura**');
    L.push('> Meu nome é ' + state.sigNome.trim() + ' e eu ' + state.sigEntrega.trim() +
      ' ' + state.sigPromessa.trim() + ' todos os dias.', '');
    L.push('**Temas**');
    state.temas.forEach(function (t, i) { if (t.trim()) L.push((i + 1) + '. ' + t.trim()); });
    L.push('', '## Fase 1 — Benchmarks', '');
    L.push('Plataforma: ' + (state.plataforma === 'instagram' ? 'Instagram' : state.plataforma === 'youtube' ? 'YouTube' : '(não escolhida)'), '');
    agrupar().forEach(function (g, i) {
      L.push('### ' + (i + 1) + '. ' + g.nome);
      if (g.url) L.push(g.url);
      L.push('');
      g.videos.forEach(function (item, k) {
        L.push('  ' + (k + 1) + '. ' + (item.v.titulo || item.v.url) +
          (item.v.views ? '  — ' + numeroBonito(lerNumero(item.v.views)) + ' views' : ''));
        if (item.v.titulo) L.push('     ' + item.v.url);
      });
      L.push('');
    });
    L.push('---', 'Canais: ' + canaisOk() + '/' + ALVO_CANAIS + ' · Vídeos: ' + totalVideos());
    return L.join('\n');
  }

  function avisar(m) {
    var t = $('aviso'); t.textContent = m; t.classList.add('on');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('on'); }, 2400);
  }

  function copiar(txt, msg) {
    function alt() {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); avisar(msg); }
      catch (e) { avisar('Não consegui copiar'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { avisar(msg); }, alt);
    } else alt();
  }

  var MARCAS = new RegExp('[\\u0300-\\u036f]', 'g');
  function baixar() {
    var n = (ident.nome || state.sigNome || 'ficha').split(' ')[0].toLowerCase()
      .normalize('NFD').replace(MARCAS, '').replace(/[^a-z0-9]/g, '');
    var b = new Blob([texto()], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'maquina-de-conteudo-' + (n || 'ficha') + '.md';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    avisar('Arquivo baixado');
  }

  /* ---------- eventos ---------- */
  function ligar() {
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-go],[data-act],[data-add-tema],[data-rm-tema],[data-rm-video],[data-preenche],[data-add-tema-txt],[data-plat],[data-raspar],[data-marcar],[data-aceitar],[data-descartar],#btLer,#btAddIg') : null;
      if (!t) return;

      if (t.hasAttribute('data-go')) return ir(t.getAttribute('data-go'));

      // exemplo tocado preenche o campo
      if (t.hasAttribute('data-preenche')) {
        var campo = $(t.getAttribute('data-preenche'));
        campo.value = t.textContent.trim();
        state[t.getAttribute('data-preenche')] = campo.value;
        salvar(); pintarNav(); atualizarPerguntas(); checarMarco();
        campo.focus();
        return;
      }
      // sugestão de tema entra na primeira vaga livre
      if (t.hasAttribute('data-add-tema-txt')) {
        var vaga = primeiroTemaVazio();
        if (vaga < 0) return avisar('Você já tem os dez temas');
        state.temas[vaga] = t.getAttribute('data-add-tema-txt');
        pintarTemas(); salvar(); pintarNav(); checarMarco();
        return;
      }

      if (t.hasAttribute('data-add-tema')) {
        if (state.temas.length < ALVO_TEMAS) { state.temas.push(''); pintarTemas(); salvar();
          var ins = $('temasIlha').querySelectorAll('input'); ins[ins.length - 1].focus(); }
        return;
      }
      if (t.hasAttribute('data-rm-tema')) {
        state.temas.splice(+t.getAttribute('data-rm-tema'), 1);
        if (!state.temas.length) state.temas.push('');
        pintarTemas(); salvar(); pintarNav(); return;
      }
      if (t.hasAttribute('data-plat')) {
        state.plataforma = t.getAttribute('data-plat');
        pintarPlataforma(); pintarAchados(); salvar(); pintarNav();
        return;
      }
      if (t.hasAttribute('data-raspar')) {
        raspar(t.getAttribute('data-raspar').replace(/^@/, ''), t);
        pintarAchados();
        return;
      }
      if (t.hasAttribute('data-marcar')) {
        var pr = t.getAttribute('data-marcar').split('|');
        var it = sugestoes[pr[0]][+pr[1]];
        it.marcado = !it.marcado;
        t.setAttribute('aria-pressed', it.marcado);
        return;
      }
      if (t.hasAttribute('data-aceitar')) {
        var ch = t.getAttribute('data-aceitar');
        var escolhidos = (sugestoes[ch] || []).filter(function (x) { return x.marcado; });
        escolhidos.forEach(function (x) {
          state.videos.push({
            url: x.v.url, id: x.v.codigo || '', titulo: x.v.legenda || '',
            canal: '@' + ch, canalUrl: 'https://www.instagram.com/' + ch,
            views: String(x.v.views), fonte: 'ig', estado: 'ok'
          });
        });
        delete sugestoes[ch];
        if (state.plataforma === 'instagram') pintarIg();
        pintarAchados(); salvar(); pintarNav(); checarMarco();
        avisar(escolhidos.length + ' vídeo(s) adicionados');
        return;
      }
      if (t.hasAttribute('data-descartar')) {
        delete sugestoes[t.getAttribute('data-descartar')];
        pintarAchados();
        return;
      }
      if (t.id === 'btAddIg') {
        state.videos.push(novoIg());
        pintarIg(); salvar();
        var novos = $('igLista').querySelectorAll('[data-ig-canal]');
        if (novos.length) novos[novos.length - 1].focus();
        return;
      }
      if (t.id === 'btLer') { lerLinks(); return; }
      if (t.hasAttribute('data-rm-video')) {
        state.videos.splice(+t.getAttribute('data-rm-video'), 1);
        if (state.plataforma === 'instagram') pintarIg();
        pintarAchados(); salvar(); pintarNav(); checarMarco(); return;
      }

      var a = t.getAttribute('data-act');
      if (a === 'briefing-ok') {
        if (!ident.nome || !ident.telefone) return abrirPorta('nova');
        state.briefingOk = true; salvar(); pintarNav(); ir('fase0');
      }
      else if (a === 'porta-entrar') entrar();
      else if (a === 'porta-retomar') recuperar();
      else if (a === 'porta-modo-retomar') trocarPorta('retomar');
      else if (a === 'porta-modo-nova') trocarPorta('nova');
      else if (a === 'porta-fechar') fecharFolhas();
      else if (a === 'marco-fechar') fecharFolhas();
      else if (a === 'copiar-codigo') copiar(ident.id || '', 'Código copiado');
      else if (a === 'copiar') copiar(texto(), 'Ficha copiada');
      else if (a === 'baixar') baixar();
      else if (a === 'menu') {
        var ab = $('lateral').classList.toggle('aberto');
        $('veu').classList.toggle('on', ab);
      }
      else if (a === 'limpar') {
        if (confirm('Isto apaga tudo o que você preencheu neste aparelho. Continuar?')) {
          localStorage.removeItem(KEY); localStorage.removeItem(KEY_ID); localStorage.removeItem(KEY + '.marcos');
          state = novoEstado(); ident = { id: null, nome: '', telefone: '' };
          jaFestejou = {};
          montar(); pintarPe(); ir('briefing'); avisar('Tudo apagado');
        }
      }
    });

    document.addEventListener('input', function (ev) {
      var el = ev.target, v = el.value;
      if (el.id === 'gTel') { el.value = mascaraTel(v); return; }
      if (el.id === 'macroNicho') state.macroNicho = v;
      else if (el.id === 'subNicho') state.subNicho = v;
      else if (el.id === 'comunidade') state.comunidade = v;
      else if (el.id === 'comunidadeBandeira') state.comunidadeBandeira = v;
      else if (el.id === 'comunidadeCausa') state.comunidadeCausa = v;
      else if (el.id === 'sigNome' || el.id === 'sigEntrega' || el.id === 'sigPromessa') {
        state[el.id] = v; pintarAssinatura();
      }
      else if (el.hasAttribute('data-ig-canal')) {
        var iv = +el.getAttribute('data-ig-canal');
        state.videos[iv].canal = v.trim().replace(/^@/, '') ? '@' + v.trim().replace(/^@/, '') : '';
        state.videos[iv].canalUrl = perfilUrl(v);
        pintarAchados();
      }
      else if (el.hasAttribute('data-ig-url')) {
        state.videos[+el.getAttribute('data-ig-url')].url = v.trim();
        pintarAchados();
      }
      else if (el.hasAttribute('data-ig-views')) {
        state.videos[+el.getAttribute('data-ig-views')].views = v;
        pintarAchados();
      }
      else if (el.hasAttribute('data-tema')) {
        state.temas[+el.getAttribute('data-tema')] = v;
        medidor('medTemas', cheios(state.temas), ALVO_TEMAS);
      }
      else return;
      salvar(); pintarNav(); atualizarPerguntas(); checarMarco();
    });

    $('veu').addEventListener('click', fecharMenu);

    // toda folha fecha ao clicar no fundo, fora da caixa
    ['porta', 'marco'].forEach(function (id) {
      $(id).addEventListener('click', function (e) { if (e.target === this) fecharFolhas(); });
    });

    // e no Esc, venha de onde vier
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') { fecharFolhas(); fecharMenu(); }
    });

    $('porta').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        $('portaRetomar').classList.contains('on') ? recuperar() : entrar();
      }
    });
    window.addEventListener('beforeunload', function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    });
  }

  /* ---------- boot ---------- */
  function montar() {
    $('macroNicho').value = state.macroNicho;
    $('subNicho').value = state.subNicho;
    $('comunidade').value = state.comunidade;
    $('comunidadeBandeira').value = state.comunidadeBandeira;
    $('comunidadeCausa').value = state.comunidadeCausa;
    $('sigNome').value = state.sigNome;
    $('sigEntrega').value = state.sigEntrega;
    $('sigPromessa').value = state.sigPromessa;
    pintarTemas(); pintarAssinatura(); pintarPlataforma(); pintarAchados(); pintarNav(); atualizarPerguntas();
  }

  function boot() {
    carregarIdent(); carregar();
    try { jaFestejou = JSON.parse(localStorage.getItem(KEY + '.marcos') || '{}') || {}; } catch (e) {}
    montar(); pintarPe(); ligar();
    var h = (location.hash || '').replace('#', '');
    var alvo = STEPS.filter(function (s) { return s.id === h && !s.lock; })[0];
    ir(alvo ? h : 'briefing', true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
