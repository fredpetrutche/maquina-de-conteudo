/* ============================================================
   aviso.js — o banco avisa; a gente não fica perguntando
   ------------------------------------------------------------
   Os trabalhadores perguntavam ao banco de 12 em 12 segundos —
   14 mil consultas por dia para quase sempre ouvir "não tem
   nada". Agora eles ficam calados até o Postgres dizer que uma
   linha mudou.

   Três cuidados, e cada um existe por um motivo:

   1. ESPERA O SILÊNCIO. Quem está digitando na Fase 0 salva a
      cada poucos segundos. Sem isso, uma pessoa preenchendo um
      campo acordaria o trabalhador vinte vezes.

   2. OLHA UMA VEZ AO CONECTAR. É o que pega o que aconteceu
      enquanto ele estava fora do ar. Não é relógio: acontece uma
      vez por conexão.

   3. VOLTA SOZINHO SE CAIR. Websocket cai sem avisar. Sem
      reconectar, o trabalho pararia em silêncio — que é pior do
      que parar com barulho. E ao voltar, olha de novo (2).

   O único relógio aqui é o batimento de 25s que o servidor exige
   para não derrubar a conexão. Ele não consulta nada.
   ============================================================ */

const PROJETO = 'mkajvxyiyqxotiydkylq';

function ouvir({ chave, tabela, evento = '*', silencio = 3000, aoMexer, aoDizer }) {
  if (!chave) throw new Error('ouvir: falta a chave de serviço');
  const diz = aoDizer || (() => {});

  let ws = null;
  let batida = null;
  let relogio = null;
  let rodando = false;
  let denovo = false;
  let espera = 1000;
  let vivo = true;

  /* Uma volta por vez. Se chegar aviso no meio, marca para repetir
     depois — em vez de rodar duas ao mesmo tempo em cima da mesma fila. */
  async function trabalhar(porque) {
    if (rodando) { denovo = true; return; }
    rodando = true;
    try {
      do {
        denovo = false;
        await aoMexer(porque);
      } while (denovo);
    } catch (e) {
      diz('erro ao trabalhar: ' + String(e.message || e).slice(0, 160));
    } finally {
      rodando = false;
    }
  }

  function acordar(porque) {
    clearTimeout(relogio);
    relogio = setTimeout(() => trabalhar(porque), silencio);
  }

  function conectar() {
    if (!vivo) return;
    ws = new WebSocket(
      `wss://${PROJETO}.supabase.co/realtime/v1/websocket?apikey=${chave}&vsn=1.0.0`);

    ws.onopen = () => {
      espera = 1000;
      ws.send(JSON.stringify({
        topic: `realtime:${tabela}`,
        event: 'phx_join',
        ref: '1',
        payload: { config: { postgres_changes: [{ event: evento, schema: 'public', table: tabela }] } },
      }));
      batida = setInterval(() => {
        try { ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: '0' })); }
        catch (e) {}
      }, 25000);
    };

    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }

      if (m.event === 'system') {
        const p = m.payload || {};
        if (p.status === 'error') {
          diz('o servidor recusou: ' + String(p.message || '').slice(0, 140));
          return;
        }
        diz(`ouvindo ${tabela}`);
        /* a olhada de chegada: pega o que passou enquanto estávamos fora */
        trabalhar('ao conectar');
      }

      if (m.event === 'postgres_changes') acordar('o banco avisou');
    };

    ws.onclose = () => {
      clearInterval(batida);
      if (!vivo) return;
      diz(`conexão caiu; voltando em ${Math.round(espera / 1000)}s`);
      setTimeout(conectar, espera);
      espera = Math.min(espera * 2, 60000);   // não martelar servidor fora do ar
    };

    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }

  conectar();
  return { parar() { vivo = false; clearInterval(batida); clearTimeout(relogio); try { ws.close(); } catch (e) {} } };
}

module.exports = { ouvir };
