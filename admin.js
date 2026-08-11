/* ============================================================
   MÁQUINA DE CONTEÚDO — painel administrativo
   Autenticação por e-mail e senha (Supabase Auth).
   O que o painel enxerga é controlado por RLS no banco:
   apenas o e-mail do dono consegue ler a tabela.
   ============================================================ */
(function () {
  'use strict';

  var SUPA_URL = 'https://mkajvxyiyqxotiydkylq.supabase.co';
  var SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rYWp2eHlpeXF4b3RpeWRreWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NTgzNzcsImV4cCI6MjEwMjAzNDM3N30.vfHCb8BRcshufnp_7eAt9ch4aVEMpcbVA5u16IS0Kao';
  var TOKEN_KEY = 'maquina-conteudo.admin';

  var sessao = null;
  var fichas = [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(id) { return document.getElementById(id); }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------- autenticação ---------- */
  function entrar() {
    var email = $('lEmail').value.trim().toLowerCase();
    var senha = $('lSenha').value;
    if (!email || !senha) return erroLogin('Preencha e-mail e senha.');
    erroLogin('');
    $('btnEntrar').disabled = true;
    $('btnEntrar').textContent = 'Entrando…';

    fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: senha })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        $('btnEntrar').disabled = false;
        $('btnEntrar').textContent = 'Entrar';
        if (!res.ok || !res.d.access_token) {
          return erroLogin(res.d.error_description || res.d.msg || 'E-mail ou senha incorretos.');
        }
        sessao = res.d;
        try { localStorage.setItem(TOKEN_KEY, JSON.stringify(sessao)); } catch (e) {}
        mostrarPainel();
      }).catch(function () {
        $('btnEntrar').disabled = false;
        $('btnEntrar').textContent = 'Entrar';
        erroLogin('Não consegui conectar. Tente de novo.');
      });
  }

  function erroLogin(msg) {
    var e = $('loginErr');
    e.textContent = msg || '';
    e.classList.toggle('on', !!msg);
  }

  function sair() {
    sessao = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    $('painel').style.display = 'none';
    $('login').style.display = '';
  }

  function mostrarPainel() {
    $('login').style.display = 'none';
    $('painel').style.display = '';
    carregar();
  }

  /* ---------- dados ---------- */
  function carregar() {
    fetch(SUPA_URL + '/rest/v1/painel?select=*', {
      headers: {
        'apikey': SUPA_ANON,
        'Authorization': 'Bearer ' + sessao.access_token
      }
    }).then(function (r) {
      if (r.status === 401) { sair(); erroLogin('Sessão expirada. Entre de novo.'); return null; }
      return r.json();
    }).then(function (d) {
      if (!d) return;
      fichas = Array.isArray(d) ? d : [];
      pintar();
    }).catch(function () { toast('Não consegui carregar os dados'); });
  }

  function quando(iso) {
    var d = new Date(iso), ms = Date.now() - d.getTime();
    var min = Math.floor(ms / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return min + ' min atrás';
    var h = Math.floor(min / 60);
    if (h < 24) return h + 'h atrás';
    var dias = Math.floor(h / 24);
    if (dias < 30) return dias + (dias === 1 ? ' dia atrás' : ' dias atrás');
    return d.toLocaleDateString('pt-BR');
  }

  var NOME_ETAPA = { briefing: 'Briefing', fase0: 'Fase 0', fase1: 'Fase 1' };

  function pintar() {
    var tb = $('linhas');
    $('vazio').style.display = fichas.length ? 'none' : '';

    $('kTotal').textContent = fichas.length;
    $('kFase0').textContent = fichas.filter(function (f) { return f.progresso >= 2; }).length;
    $('kFase1').textContent = fichas.filter(function (f) { return f.progresso >= 3; }).length;
    var ontem = Date.now() - 86400000;
    $('kHoje').textContent = fichas.filter(function (f) {
      return new Date(f.atualizado_em).getTime() > ontem;
    }).length;

    tb.innerHTML = fichas.map(function (f, i) {
      var pct = Math.round((f.progresso / 3) * 100);
      var cls = f.progresso >= 3 ? 'b3' : f.progresso >= 2 ? 'b2' : f.progresso >= 1 ? 'b1' : '';
      return '<tr data-i="' + i + '">' +
        '<td><span class="nm">' + esc(f.nome) + '</span><span class="em">' + esc(f.email) + '</span></td>' +
        '<td><span class="mini-bar"><i style="width:' + pct + '%"></i></span> ' +
        '<span style="font-family:var(--mono);font-size:.74rem;color:var(--ink-3)">' + f.progresso + '/3</span></td>' +
        '<td><span class="badge ' + cls + '">' + esc(NOME_ETAPA[f.etapa] || f.etapa) + '</span></td>' +
        '<td>' + (f.comunidade ? esc(f.comunidade) : '<span style="color:var(--ink-3)">—</span>') + '</td>' +
        '<td>' + (f.macro_nicho ? esc(f.macro_nicho) + (f.sub_nicho ? ' · ' + esc(f.sub_nicho) : '') : '<span style="color:var(--ink-3)">—</span>') + '</td>' +
        '<td style="color:var(--ink-3);font-size:.84rem;white-space:nowrap">' + quando(f.atualizado_em) + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ---------- detalhe ---------- */
  function abrirDetalhe(i) {
    var f = fichas[i], d = f.dados || {};
    $('dNome').textContent = f.nome;
    $('dEmail').textContent = f.email;

    function campo(rot, val) {
      return '<dt>' + esc(rot) + '</dt><dd' + (val ? '' : ' class="vazio"') + '>' +
        (val ? esc(val) : 'não preencheu') + '</dd>';
    }

    var h = '';

    h += '<div class="det-sec"><h4>Nicho</h4><dl class="dl">' +
      campo('Macro-nicho', d.macroNicho) + campo('Subnicho', d.subNicho) + '</dl></div>';

    h += '<div class="det-sec"><h4>Comunidade</h4><dl class="dl">' +
      campo('Representa', d.comunidade) +
      campo('Como se descreve', d.comunidadeBandeira) +
      campo('Orgulho ferido', d.comunidadeCausa) + '</dl></div>';

    var temas = (d.temas || []).filter(function (t) { return t && t.trim(); });
    h += '<div class="det-sec"><h4>Os 10 temas — ' + temas.length + ' preenchidos</h4>' +
      (temas.length
        ? '<div class="chips">' + temas.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div>'
        : '<p style="color:var(--ink-3);font-style:italic;margin:0">não preencheu</p>') + '</div>';

    var assin = (d.sigNome || d.sigEntrega || d.sigPromessa)
      ? 'Meu nome é ' + (d.sigNome || '…') + ' e eu ' + (d.sigEntrega || '…') + ' ' + (d.sigPromessa || '…') + ' todos os dias.'
      : '';
    h += '<div class="det-sec"><h4>Assinatura</h4>' +
      (assin
        ? '<p style="font-family:var(--serif);font-size:1.1rem;margin:0">' + esc(assin) + '</p>'
        : '<p style="color:var(--ink-3);font-style:italic;margin:0">não preencheu</p>') + '</div>';

    var canais = (d.canais || []).filter(function (c) { return c && (c.nome || '').trim(); });
    var totalV = (d.canais || []).reduce(function (n, c) {
      return n + String((c && c.videos) || '').split('\n').filter(function (l) { return l.trim(); }).length;
    }, 0);
    h += '<div class="det-sec"><h4>Benchmarks — ' + canais.length + ' canais, ' + totalV + ' vídeos</h4>' +
      (canais.length
        ? '<ul class="canal-lista">' + canais.map(function (c) {
            var nv = String(c.videos || '').split('\n').filter(function (l) { return l.trim(); }).length;
            return '<li><b>' + esc(c.nome) + '</b><s>' + esc(c.url || 'sem link') + ' · ' + nv + ' vídeos</s></li>';
          }).join('') + '</ul>'
        : '<p style="color:var(--ink-3);font-style:italic;margin:0">não preencheu</p>') + '</div>';

    $('dCorpo').innerHTML = h;
    $('det').classList.add('on');
  }

  /* ---------- CSV ---------- */
  function csv() {
    var cab = ['nome', 'email', 'etapa', 'progresso', 'comunidade', 'macro_nicho', 'sub_nicho', 'temas', 'canais', 'videos', 'atualizado_em'];
    function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
    var linhas = fichas.map(function (f) {
      var d = f.dados || {};
      var temas = (d.temas || []).filter(function (t) { return t && t.trim(); });
      var canais = (d.canais || []).filter(function (c) { return c && (c.nome || '').trim(); });
      var vids = (d.canais || []).reduce(function (n, c) {
        return n + String((c && c.videos) || '').split('\n').filter(function (l) { return l.trim(); }).length;
      }, 0);
      return [f.nome, f.email, f.etapa, f.progresso, d.comunidade || '', d.macroNicho || '',
        d.subNicho || '', temas.join(' | '), canais.length, vids, f.atualizado_em].map(q).join(',');
    });
    var blob = new Blob(['﻿' + cab.join(',') + '\n' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'maquina-de-conteudo-fichas.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('CSV baixado');
  }

  /* ---------- boot ---------- */
  document.addEventListener('click', function (e) {
    var alvo = e.target.closest ? e.target.closest('tr[data-i],button') : null;
    if (!alvo) return;
    if (alvo.id === 'btnEntrar') entrar();
    else if (alvo.id === 'btnSair') sair();
    else if (alvo.id === 'btnAtualizar') { carregar(); toast('Atualizado'); }
    else if (alvo.id === 'btnCsv') csv();
    else if (alvo.id === 'btnFechar') $('det').classList.remove('on');
    else if (alvo.hasAttribute && alvo.hasAttribute('data-i')) abrirDetalhe(+alvo.getAttribute('data-i'));
  });

  $('det').addEventListener('click', function (e) {
    if (e.target === this) this.classList.remove('on');
  });

  $('login').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); entrar(); }
  });

  try {
    var s = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (s && s.access_token) { sessao = s; mostrarPainel(); }
  } catch (e) {}
})();
