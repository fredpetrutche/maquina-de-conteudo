/* ============================================================
   MÁQUINA DE CONTEÚDO — painel
   Entrada por e-mail e senha. O que o painel enxerga é decidido
   pelo banco: só o e-mail do dono consegue ler a tabela.
   ============================================================ */
(function () {
  'use strict';

  var SUPA_URL = 'https://mkajvxyiyqxotiydkylq.supabase.co';
  var SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rYWp2eHlpeXF4b3RpeWRreWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NTgzNzcsImV4cCI6MjEwMjAzNDM3N30.vfHCb8BRcshufnp_7eAt9ch4aVEMpcbVA5u16IS0Kao';
  var TOKEN_KEY = 'maquina-conteudo.admin';

  var sessao = null, fichas = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function telBonito(e164) {
    var d = String(e164 || '').replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') d = d.slice(2);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return e164 || '';
  }
  function zap(e164) { return 'https://wa.me/' + String(e164 || '').replace(/\D/g, ''); }

  function avisar(m) {
    var t = $('aviso'); t.textContent = m; t.classList.add('on');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('on'); }, 2400);
  }
  function erro(m) {
    var e = $('entradaErr'); e.textContent = m || ''; e.classList.toggle('on', !!m);
  }

  /* ---------- entrada ---------- */
  function entrar() {
    var email = $('lEmail').value.trim().toLowerCase(), senha = $('lSenha').value;
    if (!email || !senha) return erro('Preencha e-mail e senha.');
    erro('');
    var bt = $('btEntrar');
    bt.disabled = true; bt.textContent = 'Entrando…';

    Sessao.entrar(TOKEN_KEY, email, senha).then(function () {
      bt.disabled = false; bt.textContent = 'Entrar';
      mostrar();
    }).catch(function (e) {
      bt.disabled = false; bt.textContent = 'Entrar';
      erro(String(e.message || e));
    });
  }

  function sair() {
    sessao = null;
    Sessao.sair(TOKEN_KEY);
    $('painel').style.display = 'none';
    $('entrada').style.display = '';
  }
  function mostrar() {
    $('entrada').style.display = 'none';
    $('painel').style.display = '';
    carregar();
  }

  /* ---------- dados ---------- */
  function carregar() {
    Sessao.token(TOKEN_KEY).then(function (tk) {
      return fetch(SUPA_URL + '/rest/v1/painel?select=*', {
        headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + tk }
      });
    }).then(function (r) {
      if (r.status === 401) { sair(); erro('Sessão expirada. Entre de novo.'); return null; }
      return r.json();
    }).then(function (d) {
      if (!d) return;
      fichas = Array.isArray(d) ? d : [];
      pintar();
    }).catch(function () { avisar('Não consegui carregar'); });
  }

  function quando(iso) {
    var d = new Date(iso), min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    if (h < 24) return h + ' h';
    var dias = Math.floor(h / 24);
    if (dias < 30) return dias + (dias === 1 ? ' dia' : ' dias');
    return d.toLocaleDateString('pt-BR');
  }

  var ETAPA = { briefing: 'Briefing', fase0: 'Fase 0', fase1: 'Fase 1' };

  function pintar() {
    $('vazio').style.display = fichas.length ? 'none' : '';
    $('kTotal').textContent = fichas.length;
    $('kFase0').textContent = fichas.filter(function (f) { return f.progresso >= 2; }).length;
    $('kFase1').textContent = fichas.filter(function (f) { return f.progresso >= 3; }).length;
    var ontem = Date.now() - 86400000;
    $('kHoje').textContent = fichas.filter(function (f) {
      return new Date(f.atualizado_em).getTime() > ontem;
    }).length;

    $('linhas').innerHTML = fichas.map(function (f, i) {
      var pct = Math.round((f.progresso / 3) * 100);
      var cls = f.progresso >= 3 ? 's3' : f.progresso >= 2 ? 's2' : f.progresso >= 1 ? 's1' : '';
      var traco = '<span style="color:var(--rotulo-3)">—</span>';
      return '<tr data-i="' + i + '">' +
        '<td><a class="nm" href="https://www.instagram.com/' + esc(f.instagram) +
        '" target="_blank" rel="noopener">@' + esc(f.instagram) + '</a>' +
        '<span class="em">' + (f.nome ? esc(f.nome) + ' · ' : '') +
        '<a class="zap" href="' + zap(f.telefone) + '" target="_blank" rel="noopener">' +
        esc(telBonito(f.telefone)) + '</a></span></td>' +
        '<td><span class="fita"><i style="width:' + pct + '%"></i></span><span class="t-num">' + f.progresso + '/3</span></td>' +
        '<td><span class="selo ' + cls + '">' + esc(ETAPA[f.etapa] || f.etapa) + '</span></td>' +
        '<td>' + (f.comunidade ? esc(f.comunidade) : traco) + '</td>' +
        '<td>' + (f.macro_nicho ? esc(f.macro_nicho) + (f.sub_nicho ? ' · ' + esc(f.sub_nicho) : '') : traco) + '</td>' +
        '<td class="t-num" style="white-space:nowrap">' + quando(f.atualizado_em) +
        '<button class="bt mini simples resumo" data-resumo="' + i + '" title="Ver o resumo">resumo</button></td>' +
        '</tr>';
    }).join('');
  }

  /* ---------- detalhe ---------- */
  function detalhe(i) {
    var f = fichas[i], d = f.dados || {};
    $('dNome').innerHTML = '<a class="zap" href="https://www.instagram.com/' + esc(f.instagram) +
      '" target="_blank" rel="noopener">@' + esc(f.instagram) + '</a>' +
      (f.nome ? ' <span style="color:var(--rotulo-2);font-weight:400">· ' + esc(f.nome) + '</span>' : '');
    $('dEmail').innerHTML = '<a class="zap" href="' + zap(f.telefone) + '" target="_blank" rel="noopener">' +
      esc(telBonito(f.telefone)) + ' &rsaquo; abrir no WhatsApp</a>';

    function par(rot, val) {
      return '<div><dt>' + esc(rot) + '</dt><dd' + (val ? '' : ' class="vazio"') + '>' +
        (val ? esc(val) : 'não preencheu') + '</dd></div>';
    }
    var h = '';

    h += '<div class="det-s"><h4>Nicho</h4><dl class="dl">' +
      par('Macro-nicho', d.macroNicho) + par('Subnicho', d.subNicho) + '</dl></div>';

    h += '<div class="det-s"><h4>Comunidade</h4><dl class="dl">' +
      par('Representa', d.comunidade) + par('Como se descreve', d.comunidadeBandeira) +
      par('Orgulho ferido', d.comunidadeCausa) + '</dl></div>';

    var temas = (d.temas || []).filter(function (t) { return t && t.trim(); });
    h += '<div class="det-s"><h4>Temas — ' + temas.length + ' de 10</h4>' +
      (temas.length
        ? '<div class="fichas">' + temas.map(function (t) { return '<span class="ficha">' + esc(t) + '</span>'; }).join('') + '</div>'
        : '<p class="sub" style="color:var(--rotulo-3);margin:0">não preencheu</p>') + '</div>';

    var a = (d.sigNome || d.sigEntrega || d.sigPromessa)
      ? 'Meu nome é ' + (d.sigNome || '…') + ' e eu ' + (d.sigEntrega || '…') + ' ' + (d.sigPromessa || '…') + ' todos os dias.'
      : '';
    h += '<div class="det-s"><h4>Assinatura</h4>' +
      (a ? '<p class="corpo" style="margin:0">' + esc(a) + '</p>'
         : '<p class="sub" style="color:var(--rotulo-3);margin:0">não preencheu</p>') + '</div>';

    var vids = (d.videos || []).filter(function (v) { return v && v.canal; });
    var porCanal = {};
    vids.forEach(function (v) {
      var k = v.canalUrl || v.canal;
      (porCanal[k] = porCanal[k] || { nome: v.canal, url: v.canalUrl, n: 0 }).n++;
    });
    var canais = Object.keys(porCanal).map(function (k) { return porCanal[k]; });
    var tv = vids.length;
    h += '<div class="det-s"><h4>Benchmarks — ' + canais.length + ' canais, ' + tv + ' vídeos</h4>' +
      (canais.length
        ? '<ul class="lista-c">' + canais.map(function (c) {
            return '<li><b>' + esc(c.nome) + '</b><s>' + esc(c.url || 'sem link') + ' · ' + c.n + ' vídeos</s></li>';
          }).join('') + '</ul>'
        : '<p class="sub" style="color:var(--rotulo-3);margin:0">não preencheu</p>') + '</div>';

    $('dCorpo').innerHTML = h;
    $('det').classList.add('on');
  }

  /* ---------- CSV ---------- */
  function csv() {
    var cab = ['instagram', 'nome', 'telefone', 'etapa', 'progresso', 'comunidade', 'bandeira', 'macro_nicho',
      'sub_nicho', 'temas', 'canais', 'videos', 'atualizado_em'];
    function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
    var ls = fichas.map(function (f) {
      var d = f.dados || {};
      var temas = (d.temas || []).filter(function (t) { return t && t.trim(); });
      var lista = (d.videos || []).filter(function (v) { return v && v.canal; });
      var cs = {}; lista.forEach(function (v) { cs[v.canalUrl || v.canal] = 1; });
      var canais = Object.keys(cs);
      var vids = lista.length;
      return ['@' + (f.instagram || ''), f.nome || '', "'" + (f.telefone || ''), f.etapa, f.progresso, d.comunidade || '', d.comunidadeBandeira || '',
        d.macroNicho || '', d.subNicho || '', temas.join(' | '), canais.length, vids,
        f.atualizado_em].map(q).join(',');
    });
    var b = new Blob(['﻿' + cab.join(',') + '\n' + ls.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'maquina-de-conteudo-fichas.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    avisar('CSV baixado');
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-resumo],tr[data-i],button') : null;
    if (!t) return;
    if (t.id === 'btEntrar') entrar();
    else if (t.id === 'btSair') sair();
    else if (t.id === 'btAtualizar') { carregar(); avisar('Atualizado'); }
    else if (t.id === 'btCsv') csv();
    else if (t.id === 'btFechar') $('det').classList.remove('on');
    else if (t.hasAttribute && t.hasAttribute('data-resumo')) {
      e.stopPropagation(); detalhe(+t.getAttribute('data-resumo'));
    }
    else if (t.hasAttribute && t.hasAttribute('data-i')) {
      // abre a tela que a própria pessoa vê, como ela vê
      window.open('index.html?ficha=' + encodeURIComponent(fichas[+t.getAttribute('data-i')].id), '_blank');
    }
  });

  $('det').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('on'); });
  $('entrada').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); entrar(); }
  });

  // com refresh_token guardado, entra direto e nunca mais pede senha
  if (Sessao.tem(TOKEN_KEY)) { sessao = Sessao.ler(TOKEN_KEY); mostrar(); }
})();
