/* ============================================================
   MÁQUINA DE CONTEÚDO — motor do fluxo
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'maquina-conteudo.v1';
  var KEY_ID = 'maquina-conteudo.ident';
  var KEY_SESSAO = 'maquina-conteudo.sessao';
  var SUPA_URL = 'https://mkajvxyiyqxotiydkylq.supabase.co';
  var SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rYWp2eHlpeXF4b3RpeWRreWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NTgzNzcsImV4cCI6MjEwMjAzNDM3N30.vfHCb8BRcshufnp_7eAt9ch4aVEMpcbVA5u16IS0Kao';

  var ALVO_TEMAS = 10;   // a meta
  var MIN_TEMAS = 3;     // o piso — mesma regra da tela de perfil (item 1.13),
                         // para as duas telas nunca discordarem sobre o que está feito
  var ALVO_CANAIS = 10;
  var ALVO_VIDEOS = 10;
  var TEMAS_INICIAIS = 3;

  var STEPS = [
    /* A revisão é a casa: a pessoa entra para ler a ficha pronta, e o fluxo
       com perguntas só aparece quando ela vai mexer em alguma coisa. */
    { id: 'revisao', ph: 'A sua ficha', nm: 'A sua ficha', revisao: 1, grupo: 'Comece aqui' },
    { id: 'briefing', ph: 'Etapa 0', nm: 'Briefing' },
    { id: 'fase0', ph: 'Fase 0', nm: 'Definir o campo', grupo: 'Suas informações' },
    { id: 'fase1', ph: 'Fase 1', nm: 'Minerar benchmarks' },
    /* A Fase 2 não é preenchida, é entregue: destrava sozinha quando os
       roteiros chegam na ficha. Por isso `entrega` em vez de `lock`. */
    { id: 'fase2', ph: 'Fase 2', nm: 'Replicar o validado', entrega: 1, grupo: 'Destrava depois' },
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
  var ident = { id: null, instagram: '', telefone: '', nome: '' };
  var meusVideos = null;
  var soLeitura = false;

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

  /* aceita @perfil, perfil ou link; guarda sem o @ */
  function limparInsta(v) {
    var p = String(v || '').trim().toLowerCase();
    var m = p.match(/instagram\.com\/([^/?#]+)/);
    if (m) p = m[1];
    p = p.replace(/^@/, '').replace(/[/?#].*$/, '');
    return /^[a-z0-9._]{1,30}$/.test(p) ? p : '';
  }
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
    if (soLeitura) return;
    if (!ident.instagram) return;
    estadoSinc('mov');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      rpc('salvar_ficha', {
        p_id: ident.id, p_instagram: ident.instagram, p_telefone: ident.telefone, p_nome: ident.nome,
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
      if (d && (d.instagram || d.telefone)) {
        ident = { id: d.id || null, instagram: d.instagram || '',
                  telefone: d.telefone || '', nome: d.nome || '' };
      }
      try { meusVideos = JSON.parse(localStorage.getItem(KEY + '.meus') || 'null'); } catch (e) {}
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
    /* A ficha pode carregar coisas que o formulário não edita — as métricas do
       perfil, a foto, os recortes de cada tema. Copiamos essas chaves de volta
       antes de tudo; sem isso o primeiro salvamento daqui as apagaria. */
    Object.keys(d).forEach(function (k) {
      if (!(k in state)) state[k] = d[k];
    });
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
    if (soLeitura) return;
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    }, 250);
    sincronizar();
    enfileirar();
  }

  /* ---------- conclusão ---------- */
  function concluida(id) {
    if (id === 'briefing') return state.briefingOk;
    if (id === 'fase0') {
      return !!(state.macroNicho.trim() && state.subNicho.trim() &&
        state.comunidade.trim() && state.comunidadeBandeira.trim() && state.comunidadeCausa.trim() &&
        cheios(state.temas) >= MIN_TEMAS &&
        state.sigNome.trim() && state.sigEntrega.trim() && state.sigPromessa.trim());
    }
    if (id === 'fase1') return !!state.plataforma && perfisProntos() >= ALVO_CANAIS;
    return false;
  }

  function temRoteiros() { return ((state.roteiros || []).length) > 0; }

  /* Trancada é o estado, não uma propriedade fixa: a Fase 2 abre sozinha
     quando os roteiros chegam. As outras continuam presas no `lock`. */
  /* Sem ficha na mão não há o que revisar — aí a lateral esconde a revisão e a
     pessoa começa pelo briefing, como antes. */
  function temFicha() { return !!(ident.id && (state.macroNicho || (state.videos || []).length)); }
  function travada(s) {
    if (s.revisao) return !temFicha();
    return s.entrega ? !temRoteiros() : !!s.lock;
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
      /* com roteiros na mão a Fase 2 sai de "destrava depois" e vira seção
         da pessoa; o rótulo antigo desce uma linha, para a Fase 3 */
      var rot = s.grupo;
      if (s.id === 'fase2' && temRoteiros()) rot = 'Os seus roteiros';
      if (s.id === 'fase3' && temRoteiros()) rot = 'Destrava depois';
      if (rot) html += '<span class="nav-rot">' + esc(rot) + '</span>';

      var preso = travada(s);
      var ok = concluida(s.id);
      html += '<button class="etapa' + (ok ? ' feito' : '') + '" data-go="' + s.id + '"' +
        (preso ? ' disabled' : '') + ' aria-current="' + (s.id === atual) + '">' +
        '<span class="et-ic">' + (preso ? IC_LOCK : ok ? IC_CHECK : '<span>' + i + '</span>') + '</span>' +
        '<span class="et-nm">' + esc(s.nm) + '</span></button>';
    });
    $('nav').innerHTML = html;

    /* a barra mede o que a PESSOA preenche. A Fase 2 é entrega: contá-la
       daria progresso por trabalho que não é dela. */
    var abertas = STEPS.filter(function (s) { return !travada(s) && !s.entrega && !s.revisao; });
    var feitas = abertas.filter(function (s) { return concluida(s.id); }).length;
    $('progBarra').style.width = Math.round((feitas / abertas.length) * 100) + '%';
    $('progVal').textContent = feitas + ' de ' + abertas.length;

    var st = STEPS.filter(function (s) { return s.id === atual; })[0];
    if (st) { $('barraNm').textContent = st.nm; $('barraPh').textContent = st.ph; }
  }

  function pintarPe() {
    var q = $('quem');
    if (ident.instagram) {
      q.style.display = '';
      $('quemAv').textContent = ident.instagram.charAt(0).toUpperCase();
      $('quemNm').textContent = ident.nome || '@' + ident.instagram;
      $('quemEm').textContent = ident.nome ? '@' + ident.instagram : telBonito(ident.telefone);
    } else q.style.display = 'none';

    estadoSinc(ident.nome ? 'on' : '');
  }

  /* ---------- a revisão ----------
     Desenhada pelo revisao.js, o mesmo arquivo que a perfil.html usa. Duas
     cópias do mesmo desenho divergem — aqui é um só, de propósito.

     A lateral fica com o app: lá ela navega entre telas; na perfil.html ela
     rola até a âncora, porque tudo já está aberto na mesma página. */
  var vozTexto = '';

  function pintarRevisao() {
    var alvo = $('revisaoTela');
    if (!alvo || !window.Revisao || !ident.id) return;
    Revisao.montar(alvo, {
      id: ident.id, nome: ident.nome || ('@' + ident.instagram),
      instagram: ident.instagram, telefone: ident.telefone, dados: state
    }, transcricoes, {
      lateral: false, editar: true, voz: vozTexto,
      /* a correção de um trecho grava direto no banco; sem trazer de volta,
         o próximo autosave daqui devolveria o texto antigo por cima */
      aoGravar: function (dados) { if (dados) aplicar(dados); }
    });
  }

  /* ---------- lembrar onde a pessoa estava ----------
     A tela é montada por JavaScript depois que a ficha chega, então quando o
     navegador tenta devolver a rolagem sozinho o corpo ainda está vazio e ele
     desiste. Guardamos por conta própria.

     E guardamos junto quais painéis estavam abertos: devolver o ponto sem
     reabrir o painel deixa a pessoa num lugar cujo conteúdo fechou — pior do
     que voltar ao topo. Em sessionStorage, não localStorage: é "onde eu
     estava agora", não uma preferência que sobrevive à semana. */
  var CHAVE_LUGAR = 'maquina-conteudo.lugar';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function lugarLido() {
    try { return JSON.parse(sessionStorage.getItem(CHAVE_LUGAR)) || {}; }
    catch (e) { return {}; }
  }
  function abertos(mapa) {
    return Object.keys(mapa).filter(function (k) { return mapa[k]; });
  }
  function guardarLugar() {
    try {
      sessionStorage.setItem(CHAVE_LUGAR, JSON.stringify({
        etapa: atual, y: Math.round(window.scrollY),
        rot: abertos(rtAbertos), dir: abertos(rtDirecao),
        tr: abertos(trAbertas), voz: vozAberta
      }));
    } catch (e) { /* aba anônima, cota cheia — a tela funciona sem isso */ }
  }

  var relogioLugar = null;
  window.addEventListener('scroll', function () {
    if (relogioLugar) return;
    relogioLugar = setTimeout(function () { relogioLugar = null; guardarLugar(); }, 250);
  }, { passive: true });

  /* Só devolve o lugar quando a tela aberta é a mesma de onde a pessoa saiu.
     Reabrir os painéis da Fase 2 estando na Fase 0 não ajuda ninguém. */
  function restaurarLugar() {
    var m = lugarLido();
    if (!m.etapa || m.etapa !== atual) return;
    (m.rot || []).forEach(function (i) { rtAbertos[i] = true; });
    (m.dir || []).forEach(function (i) { rtDirecao[i] = true; });
    (m.tr || []).forEach(function (i) { trAbertas[i] = true; });
    vozAberta = !!m.voz;
    pintarFase2();
    if (m.y) setTimeout(function () { window.scrollTo(0, m.y); }, 120);
  }

  /* ---------- navegação ---------- */
  function ir(id, quieto) {
    var st = STEPS.filter(function (s) { return s.id === id; })[0];
    if (!st || travada(st)) return;

    /* A Fase 2 é só leitura, e a revisão já a desenha. Manter as duas telas
       seria voltar a ter dois códigos para os mesmos roteiros — então o
       lateral leva para a seção de lá. */
    if (id === 'fase2' && temFicha()) {
      ir('revisao');
      setTimeout(function () {
        var el = document.getElementById('p-fase2');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return;
    }
    atual = id;
    var v = document.querySelectorAll('.vista');
    for (var i = 0; i < v.length; i++) v[i].classList.toggle('on', v[i].id === 'v-' + id);
    pintarNav();
    fecharMenu();
    if (history.replaceState) history.replaceState(null, '', '#' + id);
    if (!quieto) window.scrollTo(0, 0);
    guardarLugar();
    clearInterval(filaPoll);
    if (ident.id) buscarVoz();
    if (id === 'fase1' && ident.id) { olharBenchmarks(); enfileirar(); olharFila(); filaPoll = setInterval(olharFila, 12000); }
    if (id === 'revisao') {
      pintarRevisao();
      if (ident.id && !transcricoes.length) olharFila().then(pintarRevisao);
    }
    if (id === 'fase2') {
      pintarFase2();
      /* o texto original de cada roteiro mora nas transcrições. Se a pessoa
         entrou direto na Fase 2, ainda não passamos por lá. */
      if (ident.id && !transcricoes.length) olharFila().then(pintarFase2);
    }
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
        '</div>' +
        recortesDe(t);
    });
    if (state.temas.length < ALVO_TEMAS) {
      h += '<div class="linha add" data-add-tema><span class="mais-ic">' + IC_MAIS + '</span>Adicionar tema</div>';
    }
    $('temasIlha').innerHTML = h;
    medidor('medTemas', cheios(state.temas), ALVO_TEMAS);
    if ($('chipsTemas')) atualizarPerguntas();
  }
  /* os recortes que a análise achou, como prova do tema */
  function recortesDe(tema) {
    var r = (state.recortes || {})[String(tema || '').trim()];
    if (!r || !r.length) return '';
    return '<ul class="recortes">' + r.slice(0, 4).map(function (x) {
      return '<li><span>' + esc(x.recorte || '') + '</span>' +
        (x.views ? '<span class="rv">' + numeroBonito(x.views) + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
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
      pg4: cheios(state.temas) >= MIN_TEMAS,
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
    // a digitação manual saiu da tela: agora o Instagram é colar link
    if (!$('igLista')) return;
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
        var achados = (d.videos || []).filter(function (v) {
          return !jaTem[String(v.url).replace(/\/$/, '')];
        }).slice(0, ALVO_VIDEOS).map(function (v) { return { v: v, marcado: true }; });
        achados.lidos = d.lidos || 0;
        achados.comVideo = (d.videos || []).length;
        sugestoes[chave] = achados;
        pintarAchados();
        avisar(achados.length
          ? achados.length + ' vídeo(s) encontrados'
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
    var nota = '';
    if (s.lidos && s.comVideo < ALVO_VIDEOS) {
      nota = '<span class="sug-nota">Dos ' + s.lidos + ' posts recentes, só ' + s.comVideo +
        ' eram vídeo com contagem visível — foto e carrossel não entram. ' +
        'Se quiser mais deste perfil, procure os antigos na mão.</span>';
    }
    return '<div class="sugerido"><span class="k">Os mais vistos deste perfil — marque os que você falaria</span>' + nota +
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


  /* ---------- fila de transcrição ----------
     A pessoa não aperta nada: assim que os vídeos entram, os dez
     primeiros vão para a fila e ela já pode começar a gravar. */
  var filaTimer = null, filaPoll = null;

  function enfileirar() {
    if (soLeitura || !ident.id) return;
    var lista = state.videos
      .filter(function (v) { return v.url && (v.fonte !== 'ig' || v.canal); })
      .map(function (v) {
        return { url: v.url, perfil: v.canal || '', titulo: v.titulo || '' };
      });
    if (!lista.length) return;
    clearTimeout(filaTimer);
    filaTimer = setTimeout(function () {
      rpc('enfileirar', { p_ficha: ident.id, p_videos: lista })
        .then(olharFila)
        .catch(function (e) {
          var n = $('notaTransc');
          if (n) n.textContent = 'Não consegui enfileirar as transcrições: ' +
            String(e.message || e).slice(0, 90);
        });
    }, 1500);
  }

  var trAbertas = {};
  var transcricoes = [];

  function olharFila() {
    if (!ident.id) return Promise.resolve();
    return rpc('minhas_transcricoes', { p_ficha: ident.id })
      .then(pintarTranscricoes)
      .catch(function (e) {
        var n = $('notaTransc');
        if (n) n.textContent = 'Não consegui carregar as transcrições agora.';
      });
  }

  function pintarTranscricoes(lista) {
    lista = Array.isArray(lista) ? lista : [];
    transcricoes = lista;   // a Fase 2 lê daqui o original de cada roteiro
    var bloco = $('blocoTranscricoes');
    if (!bloco) return;
    if (!lista.length) { bloco.style.display = 'none'; return; }
    bloco.style.display = '';

    var prontas = lista.filter(function (t) { return t.estado === 'pronto'; });
    var pt = lista.filter(function (t) { return t.estado === 'portugues'; }).length;
    var ruins = lista.filter(function (t) { return t.estado === 'erro'; }).length;
    var uteis = lista.length - pt;

    medidor('medTransc', prontas.length, Math.max(uteis, 1));
    $('medTransc').querySelector('.v').textContent = prontas.length + '/' + uteis;

    var faltam = uteis - prontas.length - ruins;
    $('notaTransc').innerHTML = faltam > 0
      ? '<span class="lendo"><span class="giro"></span>Transcrevendo — ' + prontas.length +
        ' de ' + uteis + ' prontas. As que já saíram você pode gravar agora.</span>' +
        (pt ? '<br><span style="color:var(--rotulo-2)">' + pt + ' em português ficaram de fora: referência precisa ser em outra língua.</span>' : '')
      : 'Prontas. Cada uma vem no idioma original e em português — se quiser trocar uma palavra, dá para ver o que a frase dizia antes.' +
        (pt ? ' ' + pt + ' em português ficaram de fora.' : '') +
        (ruins ? ' ' + ruins + ' não deram certo.' : '');

    $('listaTransc').innerHTML = lista.map(function (t, i) {
      var cls = t.estado === 'pronto' ? '' :
                t.estado === 'portugues' ? ' fora' :
                t.estado === 'erro' ? ' ruim' : ' esperando';
      var marca = t.estado === 'pronto' ? '✓' :
                  t.estado === 'portugues' ? 'pt' :
                  t.estado === 'erro' ? '!' : (i + 1);
      var sub = t.estado === 'pronto' ? ((t.idioma || 'original') + ' · com tradução')
              : t.estado === 'portugues' ? 'já está em português — não vira roteiro'
              : t.estado === 'erro' ? 'não consegui transcrever'
              : t.estado === 'fazendo' ? 'transcrevendo agora…' : 'na fila';
      var podeAbrir = t.estado === 'pronto' || t.estado === 'portugues';
      return '<div class="tr-item' + cls + (trAbertas[i] ? ' aberto' : '') + '" data-tr="' + i + '">' +
        '<button class="tr-h"' + (podeAbrir ? ' data-abrir-tr="' + i + '"' : ' disabled') + '>' +
        '<span class="tr-n">' + marca + '</span>' +
        '<span class="tr-t"><b>' + esc('@' + String(t.perfil || '').replace(/^@/, '')) + '</b>' +
        '<s>' + esc(sub) + '</s></span></button>' +
        (podeAbrir ? '<div class="tr-b">' +
          (t.texto_pt ? bloquinho('Em português', t.texto_pt, i, 'pt') : '') +
          (t.texto ? bloquinho(t.texto_pt ? 'Original' : 'Texto', t.texto, i, 'or') : '') +
          '</div>' : '') +
        '</div>';
    }).join('');
  }

  function bloquinho(rotulo, texto, i, tipo) {
    return '<div class="tr-texto' + (tipo === 'or' ? ' orig' : '') + '">' +
      '<span class="k">' + esc(rotulo) +
      '<button class="tr-copiar" data-copiar-tr="' + i + '|' + tipo + '">copiar</button></span>' +
      '<p>' + esc(texto) + '</p></div>';
  }

  /* ---------- Fase 2: os roteiros prontos ----------
     Aqui não se preenche nada. O trabalho já foi feito: a pessoa lê,
     confere se soa como ela e grava. Editar é da tela de quem revisa —
     nesta, mostramos o texto já corrigido e ponto. */
  var rtAbertos = {};
  var rtDirecao = {};   // o roteiro e a direção abrem separados: leitores diferentes

  /* o negrito das notas é escrito em <b>; escapamos tudo e devolvemos
     só essas duas tags, o resto continua neutralizado */
  function escRico(s) {
    return esc(s)
      .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>');
  }
  function juntarLinhas(t) {
    return String(t || '').trim().split(/\n\s*\n/)
      .map(function (b) { return b.replace(/\s*\n\s*/g, ' ').trim(); })
      .join('\n\n');
  }
  function seg(s) { return String(Math.round(s * 10) / 10).replace('.', ','); }

  /* Copiar tem que entregar o que está na tela: se um trecho foi corrigido,
     é o corrigido que vai — senão a pessoa grava a versão velha. */
  function textoFalado(r) {
    var ts = (r.trechos || []).filter(function (t) { return t && (t.final || t.txt); });
    if (!ts.length) return r.texto || '';
    return ts.map(function (t) {
      return typeof t.final === 'string' ? t.final : t.txt;
    }).join('\n\n');
  }

  /* A duração fica à vista porque ela é retenção: um roteiro que estica 50%
     além do original não é o mesmo vídeo, é outro. No original o tempo é
     medido; no português é estimado a 16 caracteres por segundo. */
  function barraTempo(r, faixas, comBotao) {
    var meus = faixas.reduce(function (a, t) {
      return a + (typeof t.final === 'string' ? t.final.length : (t.txt || '').length) / 16;
    }, 0);
    var sobra = r.duracao ? meus / r.duracao - 1 : 0;
    var i = (state.roteiros || []).indexOf(r);
    return '<div class="rt-barra' + (comBotao ? ' pe' : '') + '">' +
      (comBotao && i >= 0
        ? '<button class="bt mini" data-copiar-rot="' + i + '">Copiar para o teleprompter</button>'
        : '') +
      (r.duracao
        ? '<span class="rt-dur">estimado <b>' + Math.round(meus) + 's</b> · ' +
          'o original tem ' + r.duracao + 's' +
          (sobra > 0.2
            ? ' · <span class="longo">' + Math.round(sobra * 100) + '% mais longo</span>'
            : '') + '</span>'
        : '') +
      '</div>';
  }

  /* O português vem antes do original — é ele que vai ser gravado. As duas
     línguas ficam na MESMA faixa de tempo: assim o gancho de um se compara
     com o gancho do outro, não com o vídeo inteiro. */
  function corpoRoteiro(r, orig) {
    var faixas = (r.trechos || []).length
      ? r.trechos
      : (r.texto ? [{ rot: 'Teleprompter', seg: '', txt: r.texto }] : []);
    if (!faixas.length) return '';

    /* No original o tempo é medido: a duração do vídeo é conhecida e a
       transcrição é dele inteiro, então caractere por segundo sai da conta. */
    var cortes = r.cortesOrig;
    var cps = (orig && r.duracao) ? orig.length / r.duracao : 0;
    var lados = (orig && cortes && cortes.length === 2 && faixas.length === 3)
      ? [orig.slice(0, cortes[0]), orig.slice(cortes[0], cortes[1]), orig.slice(cortes[1])]
      : null;

    var duasColunas = !!lados || ((r.pares || []).length > 0);
    var h = barraTempo(r, faixas, false) + (duasColunas
      ? '<div class="rt-colrot"><span>Português — é isto que você grava</span>' +
        '<span>Original</span></div>'
      : '<span class="rt-rot">Roteiro em português — leia exatamente assim</span>');

    h += faixas.map(function (t, i) {
      var cls = faixas.length > 1 ? (['g', 'r', 'c'][i] || 'c') : 'c';
      var en = lados ? juntarLinhas(lados[i]) : '';
      var corrigido = typeof t.final === 'string' && t.final !== t.txt;
      var pt = '<p class="rt-txt">' +
        esc(corrigido ? t.final : t.txt) + '</p>';

      /* Alinhamento por parágrafo: cada frase do original na linha do
         parágrafo que nasceu dela, como legenda. Depois que a pessoa
         reescreve o trecho o pareamento por frase não vale mais — aí o
         texto volta a ser corrido. */
      var linhas = corrigido ? [] : (r.pares || []).filter(function (l) {
        return l.faixa === t.rot;
      });

      var miolo;
      if (linhas.length) {
        miolo = '<div class="lg">' + linhas.map(function (l) {
          var falta = !l.en ? ' novo' : (!l.pt ? ' fora' : '');
          return '<div class="lg-linha' + falta + '">' +
            '<div class="lg-pt">' + (l.pt ? esc(l.pt)
              : '<span class="lg-vazio">cortado</span>') + '</div>' +
            '<div class="lg-en">' + (l.en ? esc(l.en)
              : '<span class="lg-vazio">sem original</span>') + '</div>' +
            '</div>';
        }).join('') + '</div>';
      } else if (lados) {
        miolo = '<div class="rt-par">' + pt +
          '<div class="rt-en"><p class="rt-txt orig">' + esc(en) + '</p></div></div>';
      } else {
        miolo = pt;
      }

      /* Os dois tempos SEMPRE à vista, não só quando estoura: é a comparação
         que responde "o meu está mais longo que o dele?". Com o alinhamento
         por parágrafo o lado inglês da faixa é a soma das frases dela. */
      var meuS = (typeof t.final === 'string' ? t.final.length : (t.txt || '').length) / 16;
      /* O tempo do original sai do corte do PRÓPRIO original em três faixas.
         Assim ele existe até quando a faixa em português é toda nova e não
         tem frase inglesa pareada — o vídeo original correu naquele intervalo
         de qualquer jeito. Somar os pares fica de reserva. */
      var chEn = lados ? lados[i].length
        : linhas.reduce(function (a, l) { return a + (l.en || '').length; }, 0);
      var origS = (chEn && cps) ? chEn / cps : 0;

      return '<div class="rt-faixa ' + cls + '">' +
        '<div class="rt-cab"><span class="rt-nm">' + esc(t.rot || '') + '</span>' +
        (t.seg ? '<span class="rt-seg">' + esc(t.seg) + '</span>' : '') +
        '<span class="rt-' + (t.estoura ? 'real' : 'seg') + '">seu ' + seg(meuS) + 's</span>' +
        (origS ? '<span class="rt-seg">original ' + seg(origS) + 's</span>' : '') +
        '</div>' + miolo +
        '</div>';
    }).join('');

    /* de novo embaixo, com o botão: quem leu o roteiro inteiro não vai rolar
       de volta só para copiar */
    h += barraTempo(r, faixas, true);

    if (faixas.length > 1) {
      h += '<p class="rt-legenda">No original o tempo é medido — a duração do vídeo é ' +
        'conhecida. <b>No português ele é estimado</b> pela quantidade de texto, a 16 ' +
        'caracteres por segundo; quando aparece em laranja, o trecho está passando da faixa.</p>';
    }

    /* sem os cortes do original não dá para parear faixa a faixa — aí ele vai
       inteiro, embaixo, em vez de sumir */
    if (orig && !lados) {
      h += '<span class="rt-rot">O original</span>' +
        '<p class="rt-txt orig">' + esc(juntarLinhas(orig)) + '</p>';
    }
    if (r.nota) {
      h += '<span class="rt-rot">O que mudou em relação ao original</span>' +
        '<p class="rt-txt orig">' + escRico(r.nota) + '</p>';
    }
    if ((r.conferencia || []).length) {
      h += '<span class="rt-rot">Conferir antes de gravar</span><ul class="rt-conf">' +
        r.conferencia.map(function (c) { return '<li>' + escRico(c) + '</li>'; }).join('') +
        '</ul>';
    }
    return h;
  }

  /* ---------- o briefing de direção ----------
     Um roteiro não é um vídeo: entre os dois há câmera, cenário, tipografia
     e corte. Quem vai filmar não vai assistir ao original, então o painel
     precisa dizer o que fazer sem depender de ver o vídeo. Fica separado do
     roteiro porque o leitor é outro — o teleprompter é de quem fala, a
     direção é de quem grava. */
  function blocoDirecao(d) {
    if (!d) return '';
    var h = '';

    /* a tira vem primeiro: é o jeito mais rápido de entender o vídeo */
    if ((d.frames || []).length) {
      h += '<div class="dr-tira">' + d.frames.map(function (f) {
        return '<a class="dr-fr" href="' + esc(f.img) + '" target="_blank" rel="noopener">' +
          '<img src="' + esc(f.img) + '" alt="" loading="lazy">' +
          '<span>' + String(f.s).replace('.', ',') + 's</span></a>';
      }).join('') + '</div>';
    }

    function campo(rot, txt, sub) {
      if (!txt) return '';
      return '<div class="dr-campo"><span class="rt-rot">' + esc(rot) + '</span>' +
        '<p class="dr-txt">' + esc(txt) + '</p>' +
        (sub ? '<p class="dr-txt fraco">' + esc(sub) + '</p>' : '') + '</div>';
    }

    var hl = d.headline || {};
    if (hl.texto) {
      h += '<div class="dr-campo"><span class="rt-rot">O texto que abre o vídeo</span>' +
        '<p class="dr-headline">' + esc(hl.texto) + '</p>' +
        (hl.comoAparece ? '<p class="dr-txt fraco">' + esc(hl.comoAparece) + '</p>' : '') +
        '</div>';
    }

    h += campo('Formato', d.formato);
    h += campo('Enquadramento', d.enquadramento);
    h += campo('Cenário', d.cenario);

    /* essencial e decoração em listas separadas: numa lista só, com etiqueta
       do lado, ninguém percebe o que pode faltar sem estragar o vídeo */
    var els = d.elementos || [];
    if (els.length) {
      ['essencial', 'decoração'].forEach(function (papel) {
        var quais = els.filter(function (e) {
          return String(e.papel || '').toLowerCase().indexOf(papel.slice(0, 6)) === 0;
        });
        if (!quais.length) return;
        h += '<div class="dr-campo"><span class="rt-rot">' +
          (papel === 'essencial' ? 'Sem isto não é o mesmo vídeo' : 'Dá para trocar') +
          '</span><ul class="dr-el' + (papel === 'essencial' ? ' ess' : '') + '">' +
          quais.map(function (e) { return '<li>' + esc(e.o) + '</li>'; }).join('') +
          '</ul></div>';
      });
    }

    if ((d.porFaixa || []).length) {
      h += '<div class="dr-campo"><span class="rt-rot">O que muda em cada faixa</span>' +
        d.porFaixa.map(function (f, i) {
          return '<div class="rt-faixa ' + (['g', 'r', 'c'][i] || 'c') + '">' +
            '<div class="rt-cab"><span class="rt-nm">' + esc(f.faixa) + '</span></div>' +
            '<p class="dr-txt">' + esc(f.direcao) + '</p></div>';
        }).join('') + '</div>';
    }

    h += campo('Texto na tela', d.textoNaTela);
    h += campo('Corte e ritmo', d.corte);

    /* a música não sai de olhar frame: veio da API do Instagram */
    var som = d.som || {};
    if (som.tipo || som.faixa) {
      h += campo('Som', [som.tipo, som.faixa].filter(Boolean).join(' — '));
    }

    if ((d.comCelular || []).length) {
      h += '<div class="dr-campo"><span class="rt-rot">O mínimo para gravar com o celular</span>' +
        '<ul class="rt-conf">' +
        d.comCelular.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') +
        '</ul></div>';
    }
    return h;
  }

  function pintarFase2() {
    var vazio = $('fase2Vazio'), corpo = $('fase2Corpo');
    if (!vazio || !corpo) return;
    var lista = state.roteiros || [];
    if (!lista.length) {
      vazio.style.display = ''; corpo.style.display = 'none';
      return;
    }
    vazio.style.display = 'none'; corpo.style.display = '';

    /* o original vive na tabela de transcrições, não na ficha. Casa pela url
       para não guardar o mesmo texto em dois lugares. */
    var porUrl = {};
    transcricoes.forEach(function (t) { if (t.url) porUrl[t.url] = t; });

    $('fase2Cont').textContent = lista.length === 1
      ? 'Um roteiro pronto para você revisar'
      : lista.length + ' roteiros prontos para você revisar';

    $('fase2Lista').innerHTML = lista.map(function (r, i) {
      var tr = porUrl[r.url] || {};
      var aberto = !!rtAbertos[i];
      var taxa = (r.compartilhamentos && r.views)
        ? (r.compartilhamentos / r.views * 100).toFixed(2).replace('.', ',') : '';
      var ficha = [
        r.views ? numeroBonito(r.views) + ' views' : '',
        r.compartilhamentos != null
          ? numeroBonito(r.compartilhamentos) + ' compart.' + (taxa ? ' (' + taxa + '%)' : '') : '',
        r.duracao ? r.duracao + 's' : ''
      ].filter(Boolean).join(' · ');

      return '<div class="rt' + (aberto ? ' aberto' : '') + '">' +
        '<div class="rt-h"><span class="rt-ord">' + (r.n || i + 1) + '</span>' +
        '<span class="rt-tit"><b>' + esc(r.titulo || 'Sem título') + '</b>' +
        '<s>de @' + esc(r.canal || '?') + (ficha ? ' · ' + ficha : '') + '</s></span></div>' +
        (r.porque ? '<p class="rt-por">' + escRico(r.porque) + '</p>' : '') +
        (r.aviso ? '<p class="rt-por alerta"><b>Atenção.</b> ' + escRico(r.aviso) + '</p>' : '') +
        '<div class="acoes">' +
        /* assistir vem antes de ler: ninguém devia precisar abrir o texto
           para achar o vídeo que deu origem a ele */
        (r.url ? '<a class="bt mini" href="' + esc(r.url) + '" target="_blank" ' +
          'rel="noopener">Assistir o original</a>' : '') +
        (r.texto ? '<button class="bt mini" data-abrir-rot="' + i + '">' +
          (aberto ? 'Fechar o roteiro' : 'Ler o roteiro') + '</button>' : '') +
        (r.direcao ? '<button class="bt mini" data-abrir-dir="' + i + '">' +
          (rtDirecao[i] ? 'Fechar a direção' : 'Ver a direção') + '</button>' : '') +
        (r.texto ? '<button class="bt simples mini" data-copiar-rot="' + i + '">Copiar o texto</button>' : '') +
        '</div>' +
        (aberto ? '<div class="rt-b">' + corpoRoteiro(r, tr.texto || '') + '</div>' : '') +
        (rtDirecao[i] ? '<div class="rt-b dr">' +
          '<p class="dr-quem">Isto é para quem <b>grava</b> — o roteiro acima é para quem ' +
          'fala. Quem for filmar não vai assistir ao original, então está tudo descrito.</p>' +
          blocoDirecao(r.direcao) + '</div>' : '') +
        '</div>';
    }).join('');

    pintarRegrasVoz();
  }

  /* ---------- o laço: a correção vira voz ----------
     Cada trecho que a pessoa reescreve deixa um par (o que a máquina
     escreveu → o que ela fala). O trabalhador lê o par, separa o que é
     jeito de falar do que é erro de informação, e só o primeiro vira
     regra. Aqui a gente mostra o que ele aprendeu — quem corrige tem
     que ver que a correção foi para algum lugar. */
  function pintarRegrasVoz() {
    var el = $('fase2Voz'); if (!el) return;
    var v = state.regrasVoz || {};
    var regras = v.regras || [];
    if (!regras.length) { el.innerHTML = ''; return; }

    var c = v.contagem || {};
    el.innerHTML = '<div class="voz aberta" style="margin:1.4rem 0 0">' +
      '<span class="k">O laço fechando</span>' +
      '<h3>O que eu aprendi do seu jeito de falar</h3>' +
      '<p>Saiu das suas próprias correções: cada trecho que você reescreveu virou uma ' +
      'regra que entra no próximo roteiro. ' + (c.correcoes || regras.length) +
      ' correção(ões) lidas até aqui.</p>' +
      '<div class="voz-corpo"><ul class="rt-conf" style="margin:0">' +
      regras.map(function (r) {
        return '<li>' + esc(r.regra) +
          (r.vezes > 1 ? ' <b style="color:var(--rotulo-3)">· ' + r.vezes + '×</b>' : '') +
          '</li>';
      }).join('') + '</ul>' +
      /* o erro de informação NÃO vira regra de voz — se virasse, o modelo
         aprenderia que pode inventar porque alguém conserta depois */
      ((v.fatos || []).length
        ? '<p class="rt-legenda" style="margin-top:.9rem"><b>Também errei ' +
          v.fatos.length + ' informação(ões)</b> que você consertou — versículo, nome, ' +
          'número. Isso eu não guardo como jeito de falar, guardo como erro meu. ' +
          'É por isso que conferir a citação antes de gravar continua valendo.</p>'
        : '') +
      '</div></div>';
  }

  /* ---------- o que já funcionou com a própria pessoa ----------
     Com o @ em mãos, mostramos os vídeos dela ordenados por
     visualizações. Ela vê de cara o que já deu certo — e isso
     ajuda a responder o assunto e os temas logo abaixo. */
  function buscarMeuPerfil() {
    if (soLeitura || !ident.instagram || meusVideos) return;
    pintarMeuPerfil('buscando');
    fetch(SUPA_URL + '/functions/v1/raspar-perfil', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ perfil: ident.instagram })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.runId) throw new Error(d.erro || 'sem resposta');
      esperarMeu(d.runId, 0);
    }).catch(function () { pintarMeuPerfil('erro'); });
  }

  function esperarMeu(runId, n) {
    if (n > 40) return pintarMeuPerfil('erro');
    setTimeout(function () {
      fetch(SUPA_URL + '/functions/v1/raspar-perfil', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runId })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d.pronto) return esperarMeu(runId, n + 1);
        if (d.erro) return pintarMeuPerfil('erro');
        meusVideos = (d.videos || []).slice(0, 5);
        if (d.nome && !ident.nome) { ident.nome = d.nome; salvarIdent(); pintarPe(); }
        try { localStorage.setItem(KEY + '.meus', JSON.stringify(meusVideos)); } catch (e) {}
        pintarMeuPerfil();
      }).catch(function () { pintarMeuPerfil('erro'); });
    }, n === 0 ? 4000 : 3000);
  }

  function pintarMeuPerfil(estado) {
    var el = $('meuPerfil'); if (!el) return;
    if (estado === 'buscando') {
      el.style.display = '';
      el.innerHTML = '<div class="meu"><span class="k">Um instante</span>' +
        '<h3>Vendo o que já funcionou com você</h3>' +
        '<p><span class="lendo"><span class="giro"></span>Lendo o seu perfil @' +
        esc(ident.instagram) + '…</span></p></div>';
      return;
    }
    if (estado === 'erro' || !meusVideos || !meusVideos.length) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = '<div class="meu"><span class="k">Antes de começar</span>' +
      '<h3>O que já funcionou com você</h3>' +
      '<p>Estes são os seus vídeos mais vistos. Repare no que eles têm em comum — é uma pista forte para as respostas aqui embaixo.</p>' +
      '<ul class="meu-lista">' + meusVideos.map(function (v, i) {
        return '<li><span class="p">' + (i + 1) + '</span>' +
          '<span class="t">' + esc(v.legenda || v.url) + '</span>' +
          '<span class="v">' + numeroBonito(v.views) + '</span></li>';
      }).join('') + '</ul></div>';
  }


  /* ---------- a voz: como a pessoa fala ----------
     Extraída das transcrições dos vídeos do perfil dela. Serve
     para conferir se um roteiro copiado soa como ela antes de
     gravar — e para alimentar o agente roteirista depois. */
  var vozAberta = false;

  function buscarVoz() {
    if (!ident.id) return;
    rpc('minha_voz', { p_ficha: ident.id }).then(function (r) {
      var v = (r && r[0]) || {};
      vozTexto = v.voz || '';
      pintarVoz(v.voz);
      if (atual === 'revisao') pintarRevisao();   // chegou depois da tela montar
    }).catch(function () {});
  }

  function pintarVoz(texto) {
    var el = $('minhaVoz'); if (!el) return;
    if (!texto) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = '<div class="voz' + (vozAberta ? ' aberta' : '') + '">' +
      '<span class="k">O seu jeito de falar</span>' +
      '<h3>A sua voz</h3>' +
      '<p>Isto foi tirado das transcrições dos seus próprios vídeos. Use para conferir se um roteiro copiado soa como você <b>antes</b> de gravar.</p>' +
      '<button class="bt mini" data-act="voz">' + (vozAberta ? 'Fechar' : 'Ler a minha voz') + '</button>' +
      '<div class="voz-corpo">' + marcar(texto) + '</div></div>';
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



  /* ============================================================
     BENCHMARKS — uma tabela só para os dois caminhos
     YouTube o navegador resolve na hora pelo oEmbed. Instagram
     depende do worker, porque exige a sessão logada. Os dois
     gravam no mesmo lugar, para não haver duas verdades.
     ============================================================ */
  var bms = [];
  var bmPoll = null;

  function colarLinks(cru, botao) {
    if (!ident.id) return avisar('Entre primeiro para eu guardar os seus links');
    var urls = linhas(cru);
    if (!urls.length) return avisar('Cole pelo menos um link');
    if (botao) { botao.disabled = true; botao.textContent = 'Guardando…'; }
    rpc('guardar_benchmarks', { p_ficha: ident.id, p_urls: urls }).then(function (n) {
      if (botao) { botao.disabled = false; botao.textContent = 'Ler os links'; }
      var novos = typeof n === 'number' ? n : (n && n[0]) || 0;
      avisar(novos ? novos + ' link(s) novos' : 'Esses links eu já tinha');
      if ($('colaLinks')) $('colaLinks').value = '';
      if ($('colaIg')) $('colaIg').value = '';
      olharBenchmarks();
    }).catch(function (e) {
      if (botao) { botao.disabled = false; botao.textContent = 'Ler os links'; }
      avisar('Não consegui guardar: ' + String(e.message || e).slice(0, 60));
    });
  }

  function olharBenchmarks() {
    if (!ident.id) return;
    clearTimeout(bmPoll);
    rpc('meus_benchmarks', { p_ficha: ident.id }).then(function (lista) {
      bms = Array.isArray(lista) ? lista : [];
      pintarBenchmarks();
      resolverPeloNavegador();
      var faltam = bms.filter(function (b) {
        return b.estado === 'pendente' || b.estado === 'navegador';
      }).length;
      if (faltam) bmPoll = setTimeout(olharBenchmarks, 6000);
    }).catch(function () {});
  }

  /* o que é do YouTube o próprio navegador resolve, de graça */
  function resolverPeloNavegador() {
    var alvo = bms.filter(function (b) { return b.estado === 'navegador'; })[0];
    if (!alvo) return;
    var id = idDoVideo(alvo.url);
    var terminar = function (perfil, titulo) {
      return rpc('resolver_benchmark', {
        p_ficha: ident.id, p_url: alvo.url,
        p_perfil: perfil || null, p_titulo: titulo || null, p_metricas: {}
      }).then(olharBenchmarks);
    };
    if (!id) return terminar(null, null);
    consultar(id).then(function (d) {
      return terminar((d.author_url || '').split('/@')[1] || d.author_name, d.title || '');
    }).catch(function () { return terminar(null, null); });
  }


  /* ---------- compartilhamento (item 2.5) ----------
     O contador de repost do Instagram é recente e não retroage:
     vídeo antigo pode marcar quase nada sem ter deixado de ser
     compartilhado. Não dá para distinguir "ninguém compartilhou"
     de "o contador não existia" — então a tela diz isso em vez
     de deixar a pessoa concluir errado. */
  var MESES_CONFIAVEL = 12;

  function velho(m) {
    if (!m || !m.publicado_em) return false;
    var d = new Date(m.publicado_em);
    if (isNaN(d)) return false;
    return (Date.now() - d.getTime()) > MESES_CONFIAVEL * 30.5 * 864e5;
  }

  function selCompart(m) {
    if (!m || m.taxa_compartilhamento == null) return '';
    var t = String(m.taxa_compartilhamento).replace('.', ',');
    var duvida = velho(m);
    return '<span class="views' + (duvida ? ' duvida' : '') + '"' +
      (duvida ? ' title="Publicado há mais de um ano. O contador de compartilhamento é recente e não retroage, então este número pode estar subestimado."' : '') +
      '>' + t + '% compart.' + (duvida ? ' ?' : '') + '</span>';
  }

  function agruparBms() {
    var mapa = {}, ordem = [];
    bms.forEach(function (b) {
      var k = (b.perfil || '?').toLowerCase();
      if (!mapa[k]) { mapa[k] = { nome: b.perfil || 'ainda lendo', videos: [] }; ordem.push(k); }
      mapa[k].videos.push(b);
    });
    return ordem.map(function (k) { return mapa[k]; });
  }

  function perfisProntos() {
    return agruparBms().filter(function (g) { return g.nome !== 'ainda lendo'; }).length;
  }

  function pintarBenchmarks() {
    var alvo = $('achados'); if (!alvo) return;
    var grupos = agruparBms();

    alvo.innerHTML = grupos.map(function (g) {
      var completo = g.videos.length >= ALVO_VIDEOS;
      return '<div class="achado' + (completo ? ' completo' : '') + '">' +
        '<div class="achado-h">' +
        '<span class="av">' + esc((g.nome || '?').charAt(0).toUpperCase()) + '</span>' +
        '<span class="achado-t"><b>@' + esc(g.nome) + '</b>' +
        '<a href="https://www.instagram.com/' + esc(g.nome) + '" target="_blank" rel="noopener">ver o perfil</a></span>' +
        '<span class="achado-n">' + g.videos.length + '/' + ALVO_VIDEOS + '</span>' +
        '</div><ul class="achado-v">' + g.videos.map(function (b, k) {
          var m = b.metricas || {};
          var num = b.estado === 'pendente' ? '<span class="views">na fila</span>'
                  : b.estado === 'erro' ? '<span class="views">não li</span>'
                  : (m.views ? '<span class="views">' + numeroBonito(m.views) + '</span>' : '');
          var comp = selCompart(m);
          return '<li><span class="ord">' + (k + 1) + '</span>' +
            '<span class="tit">' + esc(b.titulo || b.url) + '</span>' + comp + num +
            '<button class="x" data-rm-bm="' + esc(b.url) + '" aria-label="Remover">' + IC_X + '</button></li>';
        }).join('') + '</ul></div>';
    }).join('');

    var pend = bms.filter(function (b) {
      return b.estado === 'pendente' || b.estado === 'navegador';
    }).length;
    var ruins = bms.filter(function (b) { return b.estado === 'erro'; });
    $('naoLidos').innerHTML = ruins.length
      ? '<div class="nao-lidos"><span class="k">' + ruins.length + ' link(s) que eu não consegui ler</span><ul>' +
        ruins.map(function (b) { return '<li>' + esc(b.url) + '</li>'; }).join('') + '</ul></div>'
      : '';

    var duvidosos = bms.filter(function (b) { return velho(b.metricas); }).length;
    $('avisoCompart').innerHTML = duvidosos
      ? '<div class="obs"><b>' + duvidosos + ' vídeo(s) têm mais de um ano.</b> ' +
        'O contador de compartilhamento do Instagram é recente e não retroage — nesses, ' +
        'um número baixo pode significar que ninguém compartilhou <b>ou</b> que o contador ' +
        'ainda não existia. Não dá para saber qual. Compare compartilhamento só entre vídeos ' +
        'da mesma época.</div>'
      : '';

    medidor('medCanais', perfisProntos(), ALVO_CANAIS);
    $('notaVideos').innerHTML = 'Meta: ' + ALVO_CANAIS + ' perfis, com os ' + ALVO_VIDEOS +
      ' vídeos mais vistos de cada. Você tem ' + perfisProntos() + ' perfil(is) e ' + bms.length + ' vídeo(s).' +
      (pend ? ' <span class="lendo"><span class="giro"></span>' + pend + ' sendo lidos</span>' : '');
  }

  /* ---------- oferta de preencher pelo perfil ----------
     Nunca automático. Preencher sozinho assume que a pessoa quer
     continuar o que já faz — e muita gente procura um método
     justamente para mudar de rota. Então é escolha dela. */
  var analisePoll = null;

  function pintarOferta(estado, dados) {
    var el = $('oferta'); if (!el) return;
    if (soLeitura && !(dados && dados.ressalvas)) { el.innerHTML = ''; return; }

    if (estado === 'rodando') {
      el.innerHTML = '<div class="oferta"><span class="k">Lendo o seu perfil</span>' +
        '<h3>Montando a sua ficha</h3>' +
        '<p><span class="lendo"><span class="giro"></span>Isto leva um ou dois minutos. Pode deixar aberto.</span></p></div>';
      return;
    }

    if (estado === 'pronta' && dados) {
      var r = dados.ressalvas || [];
      el.innerHTML = '<div class="oferta"><span class="k">Preenchi a partir do seu perfil</span>' +
        '<h3>Confira e corrija o que eu errei</h3>' +
        '<p>Li ' + (dados.lidos || 0) + ' vídeo(s) seus. Tudo aqui embaixo é <b>proposta</b> — mude o que não for verdade.</p>' +
        (dados.leitura ? '<div class="leitura-cx"><span class="k">O que separa os seus melhores dos outros</span><p>' +
          esc(dados.leitura) + '</p></div>' : '') +
        (r.length ? '<div class="ressalvas"><span class="k">Onde a minha leitura é fraca</span><ul>' +
          r.map(function (x) {
            return '<li><b>' + esc(x.sobre || '') + '</b>' + esc(x.aviso || '') + '</li>';
          }).join('') + '</ul></div>' : '') +
        '</div>';
      return;
    }

    if (estado === 'erro') {
      el.innerHTML = '<div class="oferta"><span class="k">Não deu certo</span>' +
        '<h3>Não consegui ler o seu perfil</h3>' +
        '<p>' + esc(dados || 'Tente de novo daqui a pouco.') + '</p>' +
        '<button class="bt" data-act="analisar">Tentar de novo</button></div>';
      return;
    }

    el.innerHTML = '<div class="oferta"><span class="k">Atalho</span>' +
      '<h3>Posso preencher isto a partir do seu perfil?</h3>' +
      '<p>Eu leio os seus vídeos e monto o nicho, os temas e a assinatura a partir do que você <b>já publicou</b> — com o número de views que prova cada um.</p>' +
      '<div class="aviso-uso"><b>Só faz sentido se você quiser continuar no caminho que já vem fazendo.</b> ' +
      'Se a ideia é mudar de rumo, responda você mesmo: o que você postou até aqui não diz para onde você quer ir.</div>' +
      '<button class="bt forte" data-act="analisar">Analisar o meu perfil</button></div>';
  }

  function pedirAnalise() {
    if (!ident.id) return avisar('Entre primeiro para eu poder ler o seu perfil');
    pintarOferta('rodando');
    rpc('pedir_analise', { p_ficha: ident.id })
      .then(function () { vigiarAnalise(0); })
      .catch(function () { pintarOferta('erro', 'Não consegui pedir a análise.'); });
  }

  function vigiarAnalise(n) {
    clearTimeout(analisePoll);
    if (n > 60) return pintarOferta('erro', 'Demorou demais. Tente de novo.');
    analisePoll = setTimeout(function () {
      rpc('estado_analise', { p_ficha: ident.id }).then(function (rows) {
        var d = (rows && rows[0]) || {};
        if (d.estado === 'pronta' && d.sugestao) return usarSugestao(d.sugestao);
        if (d.estado === 'erro') return pintarOferta('erro', d.erro);
        vigiarAnalise(n + 1);
      }).catch(function () { vigiarAnalise(n + 1); });
    }, n === 0 ? 5000 : 4000);
  }

  /* a sugestão preenche o formulário, mas fica guardada à parte —
     assim dá para ver depois onde a pessoa discordou */
  function usarSugestao(s) {
    state.sugestao = s;
    if (s.macroNicho) state.macroNicho = s.macroNicho;
    if (s.subNicho) state.subNicho = s.subNicho;

    if (Array.isArray(s.temas) && s.temas.length) {
      state.temas = s.temas.slice(0, ALVO_TEMAS).map(function (t) {
        return typeof t === 'string' ? t : (t.tema || '');
      });
      state.recortes = {};
      s.temas.forEach(function (t) {
        if (t && t.tema && Array.isArray(t.recortes)) state.recortes[t.tema] = t.recortes;
      });
    }
    var a = (s.assinaturas || [])[0];
    if (a) {
      state.sigNome = state.sigNome || a.sigNome || '';
      state.sigEntrega = state.sigEntrega || a.sigEntrega || '';
      state.sigPromessa = state.sigPromessa || a.sigPromessa || '';
    }
    montar(); salvar(); pintarNav(); checarMarco();
    pintarOferta('pronta', s);
    avisar('Ficha preenchida — confira e corrija');
  }

  /* ---------- porta: entrar, criar acesso, primeira senha ---------- */
  function abrirPorta(modo) {
    $('porta').classList.add('on');
    trocarPorta(modo || 'entrar');
  }
  function trocarPorta(modo) {
    ['Entrar', 'Criar', 'Primeiro'].forEach(function (m) {
      $('porta' + m).classList.toggle('on', m.toLowerCase() === modo);
    });
    erroPorta('');
    setTimeout(function () {
      var f = modo === 'criar' ? $('gNome') : modo === 'primeiro' ? $('pInsta') : $('eInsta');
      if (f) f.focus();
    }, 80);
  }
  function erroPorta(m) {
    var e = $('portaErr'); e.textContent = m || ''; e.classList.toggle('on', !!m);
  }
  function limparInsta(v) {
    var p = String(v || '').trim().toLowerCase();
    var m = p.match(/instagram\.com\/([^/?#]+)/);
    if (m) p = m[1];
    p = p.replace(/^@/, '').replace(/[/?#].*$/, '');
    return /^[a-z0-9._]{1,30}$/.test(p) ? p : '';
  }

  function chamarAcesso(corpo, botao) {
    if (botao) { botao._t = botao.textContent; botao.textContent = 'Um instante…'; botao.disabled = true; }
    return fetch(SUPA_URL + '/functions/v1/acesso', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (botao) { botao.textContent = botao._t; botao.disabled = false; }
      if (d.erro) throw new Error(d.erro);
      return d;
    }).catch(function (e) {
      if (botao) { botao.textContent = botao._t; botao.disabled = false; }
      throw e;
    });
  }

  function depoisDeEntrar(d, ig, nome, tel) {
    if (d.sessao) Sessao.gravar(KEY_SESSAO, d.sessao);
    ident.id = d.ficha_id || ident.id;
    ident.instagram = ig;
    if (nome) ident.nome = nome;
    if (tel) ident.telefone = tel;
    salvarIdent();
    $('porta').classList.remove('on');
    pintarPe();
    buscarMeuPerfil();
    buscarVoz();
    // traz o que já existe na ficha antes de deixar editar
    return rpc('retomar_ficha', { p_id: ident.id }).then(function (rows) {
      if (rows && rows.length) {
        var f = rows[0];
        ident.telefone = f.telefone || ident.telefone;
        ident.nome = f.nome || ident.nome;
        if (f.dados && typeof f.dados === 'object' && Object.keys(f.dados).length) {
          state = novoEstado(); aplicar(f.dados);
          try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
        }
        salvarIdent();
      }
      montar(); pintarPe();
      /* Entra para revisar. A ficha se apresenta pronta e a pessoa desce lendo;
         o fluxo com perguntas só aparece quando ela clica em editar. Quem ainda
         não tem o que revisar começa pelo briefing. */
      ir(temFicha() ? 'revisao' : 'briefing');
    }).catch(function () { montar(); ir('briefing'); });
  }

  function entrar(bt) {
    var ig = limparInsta($('eInsta').value), senha = $('eSenha').value;
    if (!ig) return erroPorta('Confira o @ do Instagram.');
    if (!senha) return erroPorta('Digite a sua senha.');
    erroPorta('');
    if (bt) { bt._t = bt.textContent; bt.textContent = 'Entrando…'; bt.disabled = true; }
    Sessao.entrar(KEY_SESSAO, ig + '@ig.maquinadeconteudo.app', senha)
      .then(function (s) {
        if (bt) { bt.textContent = bt._t; bt.disabled = false; }
        /* O ficha_id vem do token, que o Auth carimba no cadastro — não do
           localStorage. Em aparelho novo não há localStorage nenhum, e sem
           esse id o app abriria uma ficha vazia e o primeiro autosave
           criaria uma SEGUNDA ficha para o mesmo @. */
        var meta = (s && s.user && s.user.user_metadata) || {};
        return chamarAcesso({ acao: 'existe', instagram: ig }).then(function (d) {
          var id = meta.ficha_id || ident.id || null;
          if (d.temFicha && !id) {
            throw new Error('Achei a sua ficha, mas não consegui abrir. Fala com o Fred.');
          }
          return depoisDeEntrar({ ficha_id: id }, ig, meta.nome || d.nome, null);
        });
      })
      .catch(function (e) {
        if (bt) { bt.textContent = bt._t; bt.disabled = false; }
        erroPorta(/incorret|invalid/i.test(String(e.message))
          ? 'Senha incorreta para esse @.' : String(e.message || e));
      });
  }

  function criarAcesso(bt) {
    var nome = $('gNome').value.trim();
    var ig = limparInsta($('gInsta').value);
    var tel = telE164($('gTel').value);
    var senha = $('gSenha').value;
    if (nome.length < 2) return erroPorta('Escreva o seu nome.');
    if (!ig) return erroPorta('Confira o @ do Instagram.');
    if (!telValido(tel)) return erroPorta('Confira o celular: precisa do DDD e do número completo.');
    if (senha.length < 6) return erroPorta('A senha precisa de pelo menos 6 caracteres.');
    erroPorta('');
    chamarAcesso({ acao: 'criar', instagram: ig, telefone: tel, nome: nome, senha: senha }, bt)
      .then(function (d) { return depoisDeEntrar(d, ig, nome, tel); })
      .catch(function (e) { erroPorta(String(e.message || e)); });
  }

  function primeiraSenha(bt) {
    var ig = limparInsta($('pInsta').value);
    var tel = telE164($('pTel').value);
    var senha = $('pSenha').value;
    if (!ig) return erroPorta('Confira o @ do Instagram.');
    if (!telValido(tel)) return erroPorta('Confira o celular.');
    if (senha.length < 6) return erroPorta('A senha precisa de pelo menos 6 caracteres.');
    erroPorta('');
    chamarAcesso({ acao: 'primeiro', instagram: ig, telefone: tel, senha: senha }, bt)
      .then(function (d) { return depoisDeEntrar(d, ig, null, tel); })
      .catch(function (e) { erroPorta(String(e.message || e)); });
  }

  /* ---------- exportar ---------- */
  function texto() {
    var L = ['# MÁQUINA DE CONTEÚDO — Ficha de entrada', ''];
    if (ident.instagram) L.push('**@' + ident.instagram + '**' +
      (ident.nome ? ' · ' + ident.nome : '') + ' · ' + telBonito(ident.telefone), '');
    L.push('## Fase 0 — Definir o campo', '');
    L.push('- **Macro-nicho:** ' + (state.macroNicho.trim() || '(vazio)'));
    L.push('- **Subnicho:** ' + (state.subNicho.trim() || '(vazio)'), '');
    L.push('**Comunidade**');
    L.push('- Representa: ' + (state.comunidade.trim() || '(vazio)'));
    L.push('- Como se descreve: ' + (state.comunidadeBandeira.trim() || '(vazio)'));
    L.push('- O que comentam entre si: ' + (state.comunidadeCausa.trim() || '(vazio)'), '');
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
    L.push('---', 'Perfis: ' + canaisOk() + '/' + ALVO_CANAIS + ' · Vídeos de referência: ' + bms.length);
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
      var t = ev.target.closest ? ev.target.closest('[data-go],[data-act],[data-add-tema],[data-rm-tema],[data-rm-video],[data-rm-bm],#btLerIg,[data-preenche],[data-add-tema-txt],[data-plat],[data-abrir-tr],[data-copiar-tr],[data-abrir-rot],[data-abrir-dir],[data-copiar-rot],[data-editar],[data-raspar],[data-marcar],[data-aceitar],[data-descartar],#btLer,#btAddIg') : null;
      if (!t) return;

      if (t.hasAttribute('data-go')) return ir(t.getAttribute('data-go'));

      /* o botão que a revisão desenha em cada divisória */
      if (t.hasAttribute('data-editar')) return ir(t.getAttribute('data-editar'));

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
      if (t.hasAttribute('data-abrir-tr')) {
        var it = +t.getAttribute('data-abrir-tr');
        trAbertas[it] = !trAbertas[it];
        document.querySelector('[data-tr="' + it + '"]').classList.toggle('aberto', !!trAbertas[it]);
        guardarLugar();
        return;
      }
      if (t.hasAttribute('data-copiar-tr')) {
        var pr = t.getAttribute('data-copiar-tr').split('|');
        var cx = t.closest('.tr-texto');
        copiar(cx.querySelector('p').textContent, 'Texto copiado');
        return;
      }
      if (t.hasAttribute('data-abrir-rot')) {
        var ro = +t.getAttribute('data-abrir-rot');
        rtAbertos[ro] = !rtAbertos[ro];
        pintarFase2(); guardarLugar();
        return;
      }
      if (t.hasAttribute('data-abrir-dir')) {
        var rd = +t.getAttribute('data-abrir-dir');
        rtDirecao[rd] = !rtDirecao[rd];
        pintarFase2(); guardarLugar();
        return;
      }
      if (t.hasAttribute('data-copiar-rot')) {
        var rr = (state.roteiros || [])[+t.getAttribute('data-copiar-rot')];
        if (rr) copiar(textoFalado(rr), 'Roteiro copiado');
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
      if (t.id === 'btLer') { colarLinks($('colaLinks').value, t); return; }
      if (t.id === 'btLerIg') { colarLinks($('colaIg').value, t); return; }
      if (t.hasAttribute('data-rm-bm')) {
        rpc('tirar_benchmark', { p_ficha: ident.id, p_url: t.getAttribute('data-rm-bm') })
          .then(olharBenchmarks);
        return;
      }
      if (t.hasAttribute('data-rm-video')) {
        state.videos.splice(+t.getAttribute('data-rm-video'), 1);
        if (state.plataforma === 'instagram') pintarIg();
        pintarAchados(); salvar(); pintarNav(); checarMarco(); return;
      }

      var a = t.getAttribute('data-act');
      if (a === 'briefing-ok') {
        if (!ident.instagram) return abrirPorta(Sessao.tem(KEY_SESSAO) ? 'entrar' : 'criar');
        state.briefingOk = true; salvar(); pintarNav(); ir('fase0');
      }




      else if (a === 'entrar') entrar(t);
      else if (a === 'criar') criarAcesso(t);
      else if (a === 'primeiro') primeiraSenha(t);
      else if (a === 'modo-entrar') trocarPorta('entrar');
      else if (a === 'modo-criar') trocarPorta('criar');
      else if (a === 'modo-primeiro') trocarPorta('primeiro');
      else if (a === 'porta-fechar') fecharFolhas();
      else if (a === 'marco-fechar') fecharFolhas();
      else if (a === 'voz') { vozAberta = !vozAberta; buscarVoz(); guardarLugar(); }
      else if (a === 'analisar') pedirAnalise();
      else if (a === 'copiar') copiar(texto(), 'Ficha copiada');
      else if (a === 'baixar') baixar();
      else if (a === 'menu') {
        var ab = $('lateral').classList.toggle('aberto');
        $('veu').classList.toggle('on', ab);
      }
      else if (a === 'limpar') {
        if (confirm('Isto apaga tudo o que você preencheu neste aparelho. Continuar?')) {
          localStorage.removeItem(KEY); localStorage.removeItem(KEY_ID);
          localStorage.removeItem(KEY + '.marcos'); localStorage.removeItem(KEY + '.meus');
          meusVideos = null;
          state = novoEstado(); ident = { id: null, instagram: '', telefone: '', nome: '' };
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
        var qual = $('portaCriar').classList.contains('on') ? criarAcesso
                 : $('portaPrimeiro').classList.contains('on') ? primeiraSenha : entrar;
        qual();
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
    pintarTemas(); pintarAssinatura(); pintarMeuPerfil(); pintarOferta(state.sugestao ? 'pronta' : '', state.sugestao); pintarPlataforma(); pintarAchados(); pintarFase2(); pintarNav(); atualizarPerguntas();
  }

  function abrirLeitura(fichaId) {
    soLeitura = true;
    document.body.classList.add('leitura');
    var faixa = $('faixaLeitura');
    faixa.style.display = '';
    faixa.innerHTML = 'Carregando…';
    return rpc('retomar_ficha', { p_id: fichaId }).then(function (rows) {
      if (!rows || !rows.length) { faixa.textContent = 'Ficha não encontrada'; return false; }
      var f = rows[0];
      ident = { id: f.id, instagram: f.instagram || '', telefone: f.telefone || '', nome: f.nome || '' };
      state = novoEstado();
      if (f.dados && typeof f.dados === 'object') aplicar(f.dados);
      faixa.innerHTML = 'Você está vendo a tela de ' + esc(f.nome || '@' + f.instagram) +
        ' <span>· somente leitura</span>';
      return true;
    }).catch(function () { faixa.textContent = 'Não consegui carregar a ficha'; return false; });
  }

  function boot() {
    var qs = new URLSearchParams(location.search);
    var alvoFicha = qs.get('ficha');
    if (alvoFicha) {
      ligar();
      abrirLeitura(alvoFicha).then(function (ok) {
        montar(); pintarPe();
        ir(ok ? (qs.get('etapa') || 'fase0') : 'briefing', true);
      });
      return;
    }
    carregarIdent(); carregar();
    try { jaFestejou = JSON.parse(localStorage.getItem(KEY + '.marcos') || '{}') || {}; } catch (e) {}
    montar(); pintarPe(); ligar();
    var h = (location.hash || '').replace('#', '');
    var alvo = STEPS.filter(function (s) { return s.id === h && !travada(s); })[0];

    /* Aplicativo abre na tela de entrar. Quem já entrou uma vez tem sessão e
       passa direto; quem não tem conta fecha a folha e cai no briefing, que
       é a página de quem ainda está decidindo. */
    /* devolver o lugar só faz sentido quando a URL já diz em que etapa a
       pessoa estava — recarregou. Abrindo pelo link, sem etapa nenhuma, ela
       começa do começo, que foi o combinado. */
    if (Sessao.tem(KEY_SESSAO) && retomarSessao(alvo ? h : null)) {
      if (alvo) restaurarLugar();
      return;
    }
    ir(alvo ? h : 'briefing', true);
    abrirPorta('entrar');
  }

  /* Volta de uma sessão guardada, sem pedir senha de novo. Devolve false
     quando a sessão não serve — aí o boot abre a porta como se não houvesse. */
  function retomarSessao(destino) {
    var s = Sessao.ler(KEY_SESSAO) || {};
    var meta = (s.user && s.user.user_metadata) || {};
    var id = meta.ficha_id || ident.id || null;
    if (!id) return false;              // sem ficha não há o que retomar
    ident.id = id;
    if (meta.instagram) ident.instagram = meta.instagram;
    if (meta.nome && !ident.nome) ident.nome = meta.nome;
    salvarIdent();
    if (destino) { pintarPe(); ir(destino, true); return true; }
    depoisDeEntrar({ ficha_id: id }, ident.instagram, ident.nome, ident.telefone);
    return true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
