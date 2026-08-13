/* ============================================================
   sessao.js — guarda a sessão e a renova sozinha
   ------------------------------------------------------------
   O Supabase devolve um access_token que vale 60 minutos e um
   refresh_token de longa duração. O código antigo guardava só o
   primeiro — por isso pedia senha de hora em hora.
   ============================================================ */
window.Sessao = (function () {
  'use strict';
  var URL_SUPA = 'https://mkajvxyiyqxotiydkylq.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rYWp2eHlpeXF4b3RpeWRreWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NTgzNzcsImV4cCI6MjEwMjAzNDM3N30.vfHCb8BRcshufnp_7eAt9ch4aVEMpcbVA5u16IS0Kao';

  function ler(chave) {
    try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (e) { return null; }
  }
  function gravar(chave, s) {
    try {
      if (s) {
        s.expira_em = Date.now() + ((s.expires_in || 3600) - 90) * 1000; // 90s de folga
        localStorage.setItem(chave, JSON.stringify(s));
      } else localStorage.removeItem(chave);
    } catch (e) {}
  }

  function renovar(chave, s) {
    return fetch(URL_SUPA + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function (r) {
      if (!r.ok) throw new Error('sessão expirada');
      return r.json();
    }).then(function (nova) {
      if (!nova.access_token) throw new Error('sessão expirada');
      gravar(chave, nova);
      return nova;
    });
  }

  /** devolve um token válido, renovando quando faltar pouco */
  function token(chave) {
    var s = ler(chave);
    if (!s || !s.access_token) return Promise.reject(new Error('sem sessão'));
    if (s.expira_em && Date.now() < s.expira_em) return Promise.resolve(s.access_token);
    if (!s.refresh_token) return Promise.reject(new Error('sessão expirada'));
    return renovar(chave, s).then(function (n) { return n.access_token; });
  }

  function entrar(chave, email, senha) {
    return fetch(URL_SUPA + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: senha })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.access_token) {
          throw new Error(res.d.error_description || res.d.msg || 'E-mail ou senha incorretos.');
        }
        gravar(chave, res.d);
        return res.d;
      });
  }

  return {
    URL: URL_SUPA, ANON: ANON,
    ler: ler, gravar: gravar, token: token, entrar: entrar,
    sair: function (chave) { gravar(chave, null); },
    tem: function (chave) { var s = ler(chave); return !!(s && s.refresh_token); }
  };
})();
