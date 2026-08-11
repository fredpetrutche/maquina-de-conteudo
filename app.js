/* ============================================================
   MÁQUINA DE CONTEÚDO — motor do fluxo
   Estado local (localStorage) + navegação + exportação
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'maquina-conteudo.v1';
  var KEY_ID = 'maquina-conteudo.ident';
  var SUPA_URL = 'https://mkajvxyiyqxotiydkylq.supabase.co';
  var SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rYWp2eHlpeXF4b3RpeWRreWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NTgzNzcsImV4cCI6MjEwMjAzNDM3N30.vfHCb8BRcshufnp_7eAt9ch4aVEMpcbVA5u16IS0Kao';
  var N_TEMAS = 10;
  var N_CANAIS = 10;
  var VIDEOS_ALVO = 10;

  var STEPS = [
    { id: 'briefing', ph: 'Etapa 0', nm: 'Briefing do projeto', grupo: 'Comece aqui' },
    { id: 'fase0', ph: 'Fase 0', nm: 'Definir o campo', grupo: 'Suas informações' },
    { id: 'fase1', ph: 'Fase 1', nm: 'Minerar benchmarks' },
    { id: 'fase2', ph: 'Fase 2', nm: 'Replicar o validado', lock: 1, grupo: 'Destrava depois' },
    { id: 'fase3', ph: 'Fase 3', nm: 'Retroalimentar a IA', lock: 1 },
    { id: 'fase4', ph: 'Fase 4', nm: 'Travar o formato', lock: 1 },
    { id: 'fase5', ph: 'Fase 5', nm: 'Industrializar', lock: 1 },
    { id: 'fase6', ph: 'Fase 6', nm: 'Monetizar', lock: 1 }
  ];

  /* ---------- estado ---------- */
  function novoEstado() {
    var s = {
      v: 2, briefingOk: false,
      macroNicho: '', subNicho: '',
      comunidade: '', comunidadeBandeira: '', comunidadeCausa: '',
      temas: [], sigNome: '', sigEntrega: '', sigPromessa: '',
      canais: []
    };
    var i;
    for (i = 0; i < N_TEMAS; i++) s.temas.push('');
    for (i = 0; i < N_CANAIS; i++) s.canais.push({ nome: '', url: '', videos: '' });
    return s;
  }

  var state = novoEstado();
  var ident = { id: null, nome: '', email: '' };
  var atual = 'briefing';
  var abertos = {};

  /* ---------- ponte com o servidor ---------- */
  function rpc(fn, corpo) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'apikey': SUPA_ANON,
        'Authorization': 'Bearer ' + SUPA_ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(corpo)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || r.status); });
      return r.json();
    });
  }

  function progressoAtual() {
    return ['briefing', 'fase0', 'fase1'].filter(concluida).length;
  }

  var syncTimer = null;
  function sincronizar() {
    if (!ident.nome || !ident.email) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      estadoNuvem('enviando');
      rpc('salvar_ficha', {
        p_id: ident.id,
        p_nome: ident.nome,
        p_email: ident.email,
        p_dados: state,
        p_etapa: atual,
        p_progresso: progressoAtual()
      }).then(function (id) {
        if (id && !ident.id) { ident.id = id; salvarIdent(); pintarRodape(); }
        estadoNuvem('ok');
      }).catch(function () {
        estadoNuvem('erro');
      });
    }, 1200);
  }

  function estadoNuvem(st) {
    var el = document.getElementById('saveState');
    if (!el) return;
    var i = el.querySelector('i'), s = el.querySelector('span');
    i.className = st === 'ok' ? 'nuvem' : '';
    el.className = 'save-state' + (st === 'erro' || st === 'enviando' ? ' dirty' : '');
    s.textContent = st === 'enviando' ? 'Enviando…'
      : st === 'ok' ? 'Salvo na nuvem'
      : st === 'erro' ? 'Sem conexão — salvo aqui'
      : 'Salvo neste navegador';
  }

  function carregarIdent() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY_ID) || 'null');
      if (d && d.email) ident = { id: d.id || null, nome: d.nome || '', email: d.email || '' };
    } catch (e) {}
  }
  function salvarIdent() {
    try { localStorage.setItem(KEY_ID, JSON.stringify(ident)); } catch (e) {}
  }

  function carregar() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      aplicar(JSON.parse(raw));
    } catch (e) { /* estado corrompido: começa limpo */ }
  }

  function aplicar(d) {
    try {
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
      if (Array.isArray(d.temas)) {
        for (var i = 0; i < N_TEMAS; i++) state.temas[i] = d.temas[i] || '';
      }
      if (Array.isArray(d.canais)) {
        for (var j = 0; j < N_CANAIS; j++) {
          var c = d.canais[j] || {};
          state.canais[j] = { nome: c.nome || '', url: c.url || '', videos: c.videos || '' };
        }
      }
    } catch (e) { /* estado corrompido: começa limpo */ }
  }

  var salvarTimer = null;
  function salvar() {
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    }, 300);
    sincronizar();
  }

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function linhas(txt) {
    return String(txt || '').split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });
  }
  function preenchidos(arr) {
    return arr.filter(function (t) { return String(t || '').trim().length > 0; }).length;
  }
  function canaisPreenchidos() {
    return state.canais.filter(function (c) {
      return c.nome.trim() && c.url.trim();
    }).length;
  }
  function totalVideos() {
    return state.canais.reduce(function (n, c) { return n + linhas(c.videos).length; }, 0);
  }

  /* ---------- conclusão de cada etapa ---------- */
  function concluida(id) {
    if (id === 'briefing') return state.briefingOk;
    if (id === 'fase0') {
      return !!(state.macroNicho.trim() && state.subNicho.trim() &&
        state.comunidade.trim() && state.comunidadeBandeira.trim() && state.comunidadeCausa.trim() &&
        preenchidos(state.temas) >= N_TEMAS &&
        state.sigNome.trim() && state.sigEntrega.trim() && state.sigPromessa.trim());
    }
    if (id === 'fase1') {
      if (canaisPreenchidos() < N_CANAIS) return false;
      return state.canais.every(function (c) {
        return !c.nome.trim() || linhas(c.videos).length >= 1;
      });
    }
    return false;
  }

  /* ---------- sidebar ---------- */
  function pintarSidebar() {
    var nav = document.getElementById('sbNav');
    var html = '';
    STEPS.forEach(function (s, i) {
      if (s.grupo) html += '<div class="sb-group">' + esc(s.grupo) + '</div>';
      var done = concluida(s.id);
      html += '<button class="sb-item' + (done ? ' done' : '') + '"' +
        ' data-go="' + s.id + '"' +
        (s.lock ? ' disabled' : '') +
        ' aria-current="' + (s.id === atual ? 'true' : 'false') + '">' +
        '<span class="sb-mark"><span>' + (s.lock ? '&#128274;' : i) + '</span></span>' +
        '<span class="sb-txt"><span class="sb-ph">' + esc(s.ph) + '</span>' +
        '<span class="sb-nm">' + esc(s.nm) + '</span></span></button>';
    });
    nav.innerHTML = html;

    var abertas = STEPS.filter(function (s) { return !s.lock; });
    var feitas = abertas.filter(function (s) { return concluida(s.id); }).length;
    document.getElementById('sbBar').style.width =
      Math.round((feitas / abertas.length) * 100) + '%';
    document.getElementById('sbCount').textContent = feitas + '/' + abertas.length;

    var st = STEPS.filter(function (s) { return s.id === atual; })[0];
    if (st) {
      document.getElementById('tbPh').textContent = st.ph;
      document.getElementById('tbNm').textContent = st.nm;
    }
  }

  /* ---------- navegação ---------- */
  function ir(id, semScroll) {
    var st = STEPS.filter(function (s) { return s.id === id; })[0];
    if (!st || st.lock) return;
    atual = id;
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) {
      views[i].classList.toggle('on', views[i].id === 'view-' + id);
    }
    pintarSidebar();
    fecharMenu();
    if (history.replaceState) history.replaceState(null, '', '#' + id);
    if (!semScroll) window.scrollTo(0, 0);
  }

  function fecharMenu() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('scrim').classList.remove('on');
  }

  /* ---------- gate de identificação ---------- */
  function abrirGate(modo) {
    document.getElementById('gate').classList.add('on');
    trocarGate(modo || 'novo');
    setTimeout(function () {
      var f = document.getElementById(modo === 'retomar' ? 'gCodigo' : 'gNome');
      if (f) f.focus();
    }, 60);
  }
  function fecharGate() { document.getElementById('gate').classList.remove('on'); }
  function trocarGate(modo) {
    document.getElementById('gateNovo').classList.toggle('on', modo !== 'retomar');
    document.getElementById('gateRetomar').classList.toggle('on', modo === 'retomar');
    erroGate('');
  }
  function erroGate(msg) {
    var e = document.getElementById('gateErr');
    e.textContent = msg || '';
    e.classList.toggle('on', !!msg);
  }
  function emailValido(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }

  function identificar() {
    var nome = document.getElementById('gNome').value.trim();
    var email = document.getElementById('gEmail').value.trim().toLowerCase();
    if (nome.length < 2) return erroGate('Escreva o seu nome.');
    if (!emailValido(email)) return erroGate('Esse e-mail não parece válido.');
    ident.nome = nome; ident.email = email;
    salvarIdent();
    fecharGate();
    pintarRodape();
    state.briefingOk = true;
    salvar();
    pintarSidebar();
    ir('fase0');
  }

  function retomar() {
    var cod = document.getElementById('gCodigo').value.trim();
    if (!/^[0-9a-f-]{36}$/i.test(cod)) return erroGate('Código inválido. Ele tem 36 caracteres.');
    erroGate('');
    document.getElementById('btnRetomar').disabled = true;
    rpc('retomar_ficha', { p_id: cod }).then(function (rows) {
      document.getElementById('btnRetomar').disabled = false;
      if (!rows || !rows.length) return erroGate('Não encontrei nenhuma ficha com esse código.');
      var f = rows[0];
      ident = { id: f.id, nome: f.nome, email: f.email };
      salvarIdent();
      if (f.dados && typeof f.dados === 'object') {
        state = novoEstado();
        aplicar(f.dados);
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
      }
      fecharGate();
      montarTudo();
      pintarRodape();
      toast('Ficha recuperada — bem-vindo de volta');
      ir(concluida('fase0') ? 'fase1' : 'fase0');
    }).catch(function () {
      document.getElementById('btnRetomar').disabled = false;
      erroGate('Não consegui conectar. Tente de novo.');
    });
  }

  function pintarRodape() {
    var q = document.getElementById('quem');
    var c = document.getElementById('codigoBox');
    if (ident.nome) {
      q.style.display = '';
      q.innerHTML = '<b>' + esc(ident.nome) + '</b>' + esc(ident.email);
    } else { q.style.display = 'none'; }
    if (ident.id) {
      c.style.display = '';
      document.getElementById('codigoVal').textContent = ident.id;
    } else { c.style.display = 'none'; }
    estadoNuvem(ident.nome ? 'ok' : '');
  }

  /* ---------- Fase 0 ---------- */
  function pintarTemas() {
    var box = document.getElementById('temasBox');
    var html = '';
    for (var i = 0; i < N_TEMAS; i++) {
      html += '<div class="tema"><span class="n">' + (i + 1) + '</span>' +
        '<input type="text" data-tema="' + i + '" value="' + esc(state.temas[i]) +
        '" placeholder="' + esc(exemploTema(i)) + '" aria-label="Tema ' + (i + 1) + '"></div>';
    }
    box.innerHTML = html;
    atualizarContadorTemas();
  }

  function exemploTema(i) {
    var ex = ['ex: empreendedorismo', 'ex: lucro', 'ex: delegação', 'ex: produtividade',
      'ex: trabalhar menos', 'ex: liderança', 'ex: vendas', 'ex: marketing',
      'ex: contratação', 'ex: gestão de tempo'];
    return ex[i] || '';
  }

  function atualizarContadorTemas() {
    var n = preenchidos(state.temas);
    var el = document.getElementById('temasCount');
    el.textContent = n + '/' + N_TEMAS;
    el.className = 'counter' + (n >= N_TEMAS ? ' ok' : '');
  }

  function atualizarAssinatura() {
    var nome = state.sigNome.trim();
    var ent = state.sigEntrega.trim();
    var pro = state.sigPromessa.trim();
    var frase = 'Meu nome é ' +
      (nome ? esc(nome) : '<span class="ph">[seu nome]</span>') + ' e eu ' +
      (ent ? esc(ent) : '<span class="ph">[o que você faz]</span>') + ' ' +
      (pro ? esc(pro) : '<span class="ph">[a promessa]</span>') +
      ' todos os dias. Se inscreve para não perder a próxima.';
    document.getElementById('sigTxt').innerHTML = frase;

    var limpo = ('Meu nome é ' + nome + ' e eu ' + ent + ' ' + pro + ' todos os dias.').trim();
    var meta = document.getElementById('sigMeta');
    var n = limpo.length;
    meta.textContent = n + ' caracteres' + (n > 110 ? ' — está longa. Corte até caber em um fôlego.' : '');
    meta.className = 'sig-meta' + (n > 110 ? ' long' : '');
  }

  /* ---------- Fase 1 ---------- */
  function pintarCanais() {
    var box = document.getElementById('canaisBox');
    var html = '';
    for (var i = 0; i < N_CANAIS; i++) {
      var c = state.canais[i];
      var nv = linhas(c.videos).length;
      var cheio = c.nome.trim() && c.url.trim() && nv >= 1;
      html += '<div class="canal' + (cheio ? ' filled' : '') + (abertos[i] ? ' open' : '') + '" data-canal="' + i + '">' +
        '<button class="canal-h" data-toggle="' + i + '" aria-expanded="' + (abertos[i] ? 'true' : 'false') + '">' +
        '<span class="canal-n">' + (i + 1) + '</span>' +
        '<span class="canal-t">' +
        '<b class="' + (c.nome.trim() ? '' : 'empty') + '">' + esc(c.nome.trim() || 'Canal ' + (i + 1) + ' — vazio') + '</b>' +
        '<s>' + nv + ' de ' + VIDEOS_ALVO + ' vídeos</s>' +
        '</span>' +
        '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</button>' +
        '<div class="canal-b">' +
        '<div class="row2">' +
        '<div class="field"><label class="lab" for="cn' + i + '">Nome do canal</label>' +
        '<input type="text" id="cn' + i + '" data-canal-nome="' + i + '" value="' + esc(c.nome) + '" placeholder="ex: Cody Sanchez"></div>' +
        '<div class="field"><label class="lab" for="cu' + i + '">Link do canal</label>' +
        '<input type="text" id="cu' + i + '" data-canal-url="' + i + '" value="' + esc(c.url) + '" placeholder="https://youtube.com/@…"></div>' +
        '</div>' +
        '<div class="field" style="margin-bottom:0">' +
        '<label class="lab" for="cv' + i + '">Os ' + VIDEOS_ALVO + ' vídeos mais vistos</label>' +
        '<span class="hint">Um link por linha. Ordene o canal por visualizações e copie de cima para baixo.</span>' +
        '<textarea id="cv' + i + '" data-canal-videos="' + i + '" rows="6" placeholder="https://youtube.com/watch?v=…&#10;https://youtube.com/watch?v=…">' + esc(c.videos) + '</textarea>' +
        '</div>' +
        '</div></div>';
    }
    box.innerHTML = html;
    atualizarContadorCanais();
  }

  function atualizarContadorCanais() {
    var nc = canaisPreenchidos();
    var ec = document.getElementById('canaisCount');
    ec.textContent = nc + '/' + N_CANAIS + ' canais';
    ec.className = 'counter' + (nc >= N_CANAIS ? ' ok' : '');

    var nv = totalVideos();
    var alvo = N_CANAIS * VIDEOS_ALVO;
    var ev = document.getElementById('videosCount');
    ev.textContent = nv + '/' + alvo + ' vídeos';
    ev.className = 'counter' + (nv >= alvo ? ' ok' : '');

    var btn = document.getElementById('btnTranscrever');
    if (btn) {
      var pronto = nv >= 1;
      btn.disabled = !pronto;
      document.getElementById('transcNota').textContent = pronto
        ? nv + ' vídeo(s) prontos para extração. Esta função abre na próxima etapa.'
        : 'Importe pelo menos um vídeo para liberar.';
    }
  }

  /* ---------- exportação ---------- */
  function montarTexto() {
    var L = [];
    L.push('# MÁQUINA DE CONTEÚDO — Ficha de entrada');
    L.push('');
    L.push('## Fase 0 — Definir o campo');
    L.push('');
    L.push('- **Macro-nicho:** ' + (state.macroNicho.trim() || '(vazio)'));
    L.push('- **Subnicho:** ' + (state.subNicho.trim() || '(vazio)'));
    L.push('');
    L.push('**Comunidade:**');
    L.push('- Representa: ' + (state.comunidade.trim() || '(vazio)'));
    L.push('- Como se descreve: ' + (state.comunidadeBandeira.trim() || '(vazio)'));
    L.push('- Orgulho ferido: ' + (state.comunidadeCausa.trim() || '(vazio)'));
    L.push('');
    L.push('**Assinatura:**');
    L.push('> Meu nome é ' + state.sigNome.trim() + ' e eu ' + state.sigEntrega.trim() +
      ' ' + state.sigPromessa.trim() + ' todos os dias. Se inscreve para não perder a próxima.');
    L.push('');
    L.push('**Os 10 grandes temas:**');
    state.temas.forEach(function (t, i) {
      if (t.trim()) L.push((i + 1) + '. ' + t.trim());
    });
    L.push('');
    L.push('## Fase 1 — Benchmarks');
    L.push('');
    state.canais.forEach(function (c, i) {
      if (!c.nome.trim() && !c.url.trim()) return;
      L.push('### ' + (i + 1) + '. ' + (c.nome.trim() || 'sem nome'));
      if (c.url.trim()) L.push(c.url.trim());
      var vs = linhas(c.videos);
      if (vs.length) {
        L.push('');
        vs.forEach(function (v, k) { L.push('  ' + (k + 1) + '. ' + v); });
      }
      L.push('');
    });
    L.push('---');
    L.push('Canais preenchidos: ' + canaisPreenchidos() + '/' + N_CANAIS +
      ' · Vídeos coletados: ' + totalVideos());
    return L.join('\n');
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function copiar(txt, msg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(msg); }
      catch (e) { toast('Não consegui copiar. Use "Baixar arquivo".'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast(msg); }, fallback);
    } else { fallback(); }
  }

  var MARCAS = new RegExp('[\\u0300-\\u036f]', 'g');

  function baixar() {
    var nome = (state.sigNome.trim() || 'ficha').split(' ')[0].toLowerCase()
      .normalize('NFD').replace(MARCAS, '').replace(/[^a-z0-9]/g, '');
    var blob = new Blob([montarTexto()], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'maquina-de-conteudo-' + (nome || 'ficha') + '.md';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Arquivo baixado');
  }

  /* ---------- eventos ---------- */
  function ligar() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-go],[data-toggle],[data-act]') : null;
      if (!t) return;

      if (t.hasAttribute('data-go')) { ir(t.getAttribute('data-go')); return; }

      if (t.hasAttribute('data-toggle')) {
        var i = +t.getAttribute('data-toggle');
        abertos[i] = !abertos[i];
        var card = document.querySelector('[data-canal="' + i + '"]');
        card.classList.toggle('open', !!abertos[i]);
        t.setAttribute('aria-expanded', abertos[i] ? 'true' : 'false');
        return;
      }

      var act = t.getAttribute('data-act');
      if (act === 'briefing-ok') {
        if (!ident.nome || !ident.email) { abrirGate('novo'); return; }
        state.briefingOk = true; salvar(); pintarSidebar(); ir('fase0');
      } else if (act === 'gate-entrar') {
        identificar();
      } else if (act === 'gate-retomar') {
        retomar();
      } else if (act === 'gate-modo-retomar') {
        trocarGate('retomar');
      } else if (act === 'gate-modo-novo') {
        trocarGate('novo');
      } else if (act === 'copiar-codigo') {
        copiar(ident.id || '', 'Código copiado');
      } else if (act === 'copiar') {
        copiar(montarTexto(), 'Ficha copiada — agora é só colar e enviar');
      } else if (act === 'baixar') {
        baixar();
      } else if (act === 'menu') {
        var sb = document.getElementById('sidebar');
        var aberto = sb.classList.toggle('open');
        document.getElementById('scrim').classList.toggle('on', aberto);
      } else if (act === 'fechar-menu') {
        fecharMenu();
      } else if (act === 'limpar') {
        if (confirm('Isto apaga tudo o que você preencheu neste navegador. Continuar?')) {
          localStorage.removeItem(KEY);
          localStorage.removeItem(KEY_ID);
          state = novoEstado();
          ident = { id: null, nome: '', email: '' };
          abertos = {};
          montarTudo();
          pintarRodape();
          ir('briefing');
          toast('Tudo apagado');
        }
      }
    });

    document.addEventListener('input', function (e) {
      var el = e.target, v = el.value;
      if (el.id === 'macroNicho') { state.macroNicho = v; }
      else if (el.id === 'subNicho') { state.subNicho = v; }
      else if (el.id === 'comunidade') { state.comunidade = v; }
      else if (el.id === 'comunidadeBandeira') { state.comunidadeBandeira = v; }
      else if (el.id === 'comunidadeCausa') { state.comunidadeCausa = v; }
      else if (el.id === 'sigNome') { state.sigNome = v; atualizarAssinatura(); }
      else if (el.id === 'sigEntrega') { state.sigEntrega = v; atualizarAssinatura(); }
      else if (el.id === 'sigPromessa') { state.sigPromessa = v; atualizarAssinatura(); }
      else if (el.hasAttribute('data-tema')) {
        state.temas[+el.getAttribute('data-tema')] = v; atualizarContadorTemas();
      }
      else if (el.hasAttribute('data-canal-nome')) {
        var a = +el.getAttribute('data-canal-nome');
        state.canais[a].nome = v;
        var lb = document.querySelector('[data-canal="' + a + '"] .canal-t b');
        lb.textContent = v.trim() || 'Canal ' + (a + 1) + ' — vazio';
        lb.className = v.trim() ? '' : 'empty';
        atualizarContadorCanais(); marcarCheio(a);
      }
      else if (el.hasAttribute('data-canal-url')) {
        state.canais[+el.getAttribute('data-canal-url')].url = v;
        atualizarContadorCanais(); marcarCheio(+el.getAttribute('data-canal-url'));
      }
      else if (el.hasAttribute('data-canal-videos')) {
        var b = +el.getAttribute('data-canal-videos');
        state.canais[b].videos = v;
        document.querySelector('[data-canal="' + b + '"] .canal-t s').textContent =
          linhas(v).length + ' de ' + VIDEOS_ALVO + ' vídeos';
        atualizarContadorCanais(); marcarCheio(b);
      } else { return; }
      salvar();
      pintarSidebar();
    });

    document.getElementById('scrim').addEventListener('click', fecharMenu);
    window.addEventListener('beforeunload', function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    });
  }

  function marcarCheio(i) {
    var c = state.canais[i];
    var card = document.querySelector('[data-canal="' + i + '"]');
    if (card) card.classList.toggle('filled', !!(c.nome.trim() && c.url.trim() && linhas(c.videos).length >= 1));
  }

  /* ---------- boot ---------- */
  function montarTudo() {
    document.getElementById('macroNicho').value = state.macroNicho;
    document.getElementById('subNicho').value = state.subNicho;
    document.getElementById('comunidade').value = state.comunidade;
    document.getElementById('comunidadeBandeira').value = state.comunidadeBandeira;
    document.getElementById('comunidadeCausa').value = state.comunidadeCausa;
    document.getElementById('sigNome').value = state.sigNome;
    document.getElementById('sigEntrega').value = state.sigEntrega;
    document.getElementById('sigPromessa').value = state.sigPromessa;
    pintarTemas();
    atualizarAssinatura();
    pintarCanais();
    pintarSidebar();
  }

  function boot() {
    carregarIdent();
    carregar();
    montarTudo();
    pintarRodape();
    ligar();
    var h = (location.hash || '').replace('#', '');
    var alvo = STEPS.filter(function (s) { return s.id === h && !s.lock; })[0];
    ir(alvo ? h : 'briefing', true);

    document.getElementById('gate').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (document.getElementById('gateRetomar').classList.contains('on')) retomar();
        else identificar();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
