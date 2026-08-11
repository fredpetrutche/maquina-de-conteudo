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
      v: 3, briefingOk: false,
      macroNicho: '', subNicho: '',
      comunidade: '', comunidadeBandeira: '', comunidadeCausa: '',
      temas: [], sigNome: '', sigEntrega: '', sigPromessa: '',
      canais: []
    };
    for (var i = 0; i < TEMAS_INICIAIS; i++) s.temas.push('');
    s.canais.push({ nome: '', url: '', videos: '' });
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
  function canaisOk() {
    return state.canais.filter(function (c) { return c.nome.trim() && c.url.trim(); }).length;
  }
  function totalVideos() {
    return state.canais.reduce(function (n, c) { return n + linhas(c.videos).length; }, 0);
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
    if (Array.isArray(d.canais) && d.canais.length) {
      state.canais = d.canais.slice(0, ALVO_CANAIS).map(function (c) {
        c = c || {};
        return { nome: c.nome || '', url: c.url || '', videos: c.videos || '' };
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
    if (id === 'fase1') {
      return canaisOk() >= ALVO_CANAIS && state.canais.every(function (c) {
        return !c.nome.trim() || linhas(c.videos).length >= 1;
      });
    }
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
    $('sigTxt').innerHTML = 'Meu nome é ' +
      (n ? esc(n) : '<span class="vaga">seu nome</span>') + ' e eu ' +
      (e ? esc(e) : '<span class="vaga">o que você faz</span>') + ' ' +
      (p ? esc(p) : '<span class="vaga">a promessa</span>') +
      ' todos os dias. Se inscreve para não perder a próxima.';
    var limpo = ('Meu nome é ' + n + ' e eu ' + e + ' ' + p + ' todos os dias.').trim();
    var m = $('sigMeta');
    m.textContent = limpo.length + ' caracteres' + (limpo.length > 110 ? ' — está longa. Corte até caber em um fôlego.' : '');
    m.className = 'previa-m' + (limpo.length > 110 ? ' longa' : '');
  }

  /* ---------- Fase 1: canais ---------- */
  function pintarCanais() {
    var h = '';
    state.canais.forEach(function (c, i) {
      var nv = linhas(c.videos).length;
      var full = c.nome.trim() && c.url.trim() && nv >= 1;
      h += '<div class="canal' + (full ? ' cheio' : '') + (abertos[i] ? ' aberto' : '') + '" data-canal="' + i + '">' +
        '<button class="canal-h" data-abrir="' + i + '" aria-expanded="' + !!abertos[i] + '">' +
        '<span class="canal-n">' + (full ? '✓' : i + 1) + '</span>' +
        '<span class="canal-t"><b class="' + (c.nome.trim() ? '' : 'vazio') + '">' +
        esc(c.nome.trim() || 'Canal ' + (i + 1)) + '</b>' +
        '<s>' + nv + ' de ' + ALVO_VIDEOS + ' vídeos</s></span>' + IC_SETA + '</button>' +
        '<div class="canal-b">' +
        '<div class="canal-campo"><label for="cn' + i + '">Nome do canal</label>' +
        '<input type="text" id="cn' + i + '" data-c-nome="' + i + '" value="' + esc(c.nome) + '" placeholder="Cody Sanchez"></div>' +
        '<div class="canal-campo"><label for="cu' + i + '">Link do canal</label>' +
        '<input type="text" id="cu' + i + '" data-c-url="' + i + '" value="' + esc(c.url) + '" placeholder="https://youtube.com/@..."></div>' +
        '<div class="canal-campo"><label for="cv' + i + '">Vídeos mais vistos — um link por linha</label>' +
        '<textarea id="cv' + i + '" data-c-videos="' + i + '" rows="5" placeholder="https://youtube.com/watch?v=...">' + esc(c.videos) + '</textarea></div>' +
        (state.canais.length > 1 ? '<button class="bt simples perigo mini" data-rm-canal="' + i + '">Remover canal</button>' : '') +
        '</div></div>';
    });
    $('canaisCx').innerHTML = h;
    $('btAddCanal').style.display = state.canais.length < ALVO_CANAIS ? '' : 'none';
    atualizarCanais();
  }

  function atualizarCanais() {
    medidor('medCanais', canaisOk(), ALVO_CANAIS);
    var nv = totalVideos();
    $('notaVideos').textContent = 'Cole os links dos vídeos mais vistos de cada canal, um por linha. ' +
      nv + ' de ' + (ALVO_CANAIS * ALVO_VIDEOS) + ' vídeos coletados até agora.';
    var bt = $('btTranscrever');
    bt.disabled = nv < 1;
    $('notaTransc').textContent = nv >= 1
      ? nv + ' vídeo(s) prontos. Esta função abre na próxima etapa.'
      : 'Importe pelo menos um vídeo para liberar.';
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
    state.canais.forEach(function (c, i) {
      if (!c.nome.trim() && !c.url.trim()) return;
      L.push('### ' + (i + 1) + '. ' + (c.nome.trim() || 'sem nome'));
      if (c.url.trim()) L.push(c.url.trim());
      var vs = linhas(c.videos);
      if (vs.length) { L.push(''); vs.forEach(function (v, k) { L.push('  ' + (k + 1) + '. ' + v); }); }
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
      var t = ev.target.closest ? ev.target.closest('[data-go],[data-act],[data-abrir],[data-add-tema],[data-rm-tema],[data-rm-canal],[data-preenche],[data-add-tema-txt],#btAddCanal') : null;
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

      if (t.hasAttribute('data-abrir')) {
        var i = +t.getAttribute('data-abrir');
        abertos[i] = !abertos[i];
        var card = document.querySelector('[data-canal="' + i + '"]');
        card.classList.toggle('aberto', !!abertos[i]);
        t.setAttribute('aria-expanded', !!abertos[i]);
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
      if (t.id === 'btAddCanal') {
        if (state.canais.length < ALVO_CANAIS) {
          state.canais.push({ nome: '', url: '', videos: '' });
          abertos[state.canais.length - 1] = true;
          pintarCanais(); salvar();
          var el = document.querySelector('[data-canal="' + (state.canais.length - 1) + '"] input');
          if (el) el.focus();
        }
        return;
      }
      if (t.hasAttribute('data-rm-canal')) {
        state.canais.splice(+t.getAttribute('data-rm-canal'), 1);
        if (!state.canais.length) state.canais.push({ nome: '', url: '', videos: '' });
        abertos = {}; pintarCanais(); salvar(); pintarNav(); return;
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
          abertos = { 0: true }; jaFestejou = {};
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
      else if (el.hasAttribute('data-tema')) {
        state.temas[+el.getAttribute('data-tema')] = v;
        medidor('medTemas', cheios(state.temas), ALVO_TEMAS);
      }
      else if (el.hasAttribute('data-c-nome')) {
        var i = +el.getAttribute('data-c-nome');
        state.canais[i].nome = v;
        var b = document.querySelector('[data-canal="' + i + '"] .canal-t b');
        b.textContent = v.trim() || 'Canal ' + (i + 1);
        b.className = v.trim() ? '' : 'vazio';
        atualizarCanais(); marcarCanal(i);
      }
      else if (el.hasAttribute('data-c-url')) {
        var j = +el.getAttribute('data-c-url');
        state.canais[j].url = v; atualizarCanais(); marcarCanal(j);
      }
      else if (el.hasAttribute('data-c-videos')) {
        var k = +el.getAttribute('data-c-videos');
        state.canais[k].videos = v;
        document.querySelector('[data-canal="' + k + '"] .canal-t s').textContent =
          linhas(v).length + ' de ' + ALVO_VIDEOS + ' vídeos';
        atualizarCanais(); marcarCanal(k);
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

  function marcarCanal(i) {
    var c = state.canais[i];
    var card = document.querySelector('[data-canal="' + i + '"]');
    if (!card) return;
    var full = c.nome.trim() && c.url.trim() && linhas(c.videos).length >= 1;
    card.classList.toggle('cheio', !!full);
    card.querySelector('.canal-n').textContent = full ? '✓' : (i + 1);
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
    pintarTemas(); pintarAssinatura(); pintarCanais(); pintarNav(); atualizarPerguntas();
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
