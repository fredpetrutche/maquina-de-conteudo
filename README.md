# Máquina de Conteúdo

App de fluxo guiado para construir audiência própria. Hospedado no GitHub Pages.

- **App:** https://fredpetrutche.github.io/maquina-de-conteudo/
- **Painel:** https://fredpetrutche.github.io/maquina-de-conteudo/admin.html

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O app: briefing + formulários das Fases 0 e 1 |
| `app.js` | Estado, navegação, autosave e sincronização |
| `app.css` | Design system, usado pelo app e pelo painel |
| `admin.html` / `admin.js` | Painel para acompanhar quem preencheu |
| `schema.sql` | Estrutura inicial do banco |
| `migracao-telefone.sql` | Troca do identificador para celular (já aplicada) |

Sem framework, sem build, sem dependência externa. É só abrir.

## Banco

Supabase, projeto `maquina-de-conteudo` (`mkajvxyiyqxotiydkylq`), região São Paulo.

### Como a segurança funciona

A chave `anon` fica visível neste repositório — isso é normal no Supabase. A proteção real está no banco:

- A tabela `fichas` tem RLS ligada e **nenhuma policy para visitantes**. Ou seja: quem tem a chave pública não consegue listar, alterar nem apagar nada direto na tabela.
- O app só consegue falar com o banco por **duas funções** que operam em exatamente uma linha:
  - `salvar_ficha(...)` — cria ou atualiza a própria ficha
  - `retomar_ficha(id)` — recupera a ficha a partir do código
- Só o e-mail do dono consegue ler a tabela inteira, via policy de `select`.

Testes executados e aprovados: `DELETE` em massa, `UPDATE` em massa e `INSERT` direto são todos bloqueados; um usuário autenticado diferente do dono enxerga uma lista vazia.

### Se precisar mexer no schema

```bash
psql "postgresql://postgres.mkajvxyiyqxotiydkylq@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" --file=schema.sql
```

O script é idempotente — pode rodar de novo sem quebrar nada.

## Fluxo

```
Etapa 0  Briefing         leitura; ao aceitar, pede nome e e-mail
Fase 0   Definir o campo  nicho, comunidade, 10 temas, assinatura
Fase 1   Benchmarks       10 canais e os vídeos mais vistos de cada
Fases 2-6                 bloqueadas por enquanto
```

O trabalho é salvo no navegador **e** no banco. Cada pessoa recebe um código para continuar em outro aparelho.

O identificador é o **celular**, guardado em E.164 sem o "+" (`5511987654321`) — o formato que a Cloud API da Meta espera, para o disparo por WhatsApp no futuro.
