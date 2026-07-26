# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Cantiere — quadro Kanban multiempresa. React 18 + Vite no cliente, Express + `node:sqlite` no servidor. Sem build step no servidor: ESM puro, rodado direto pelo Node.

## Comandos

```bash
npm run dev       # servidor (4000) + Vite (5173) juntos, via concurrently
npm run server    # só a API
npm run client    # só o Vite
npm run build     # gera dist/
npm start         # produção: um processo só, Express serve dist/ e a API
```

Node >= 22.5 é obrigatório (`node:sqlite`). O `.node-version` fixa 24, onde o módulo já não precisa de flag.

**Não há suíte de testes nem linter.** A verificação de rotina é:

```bash
node --check <arquivo>                                                  # sintaxe
node -e "['pt','en','es'].forEach(l=>JSON.parse(require('fs').readFileSync('src/i18n/locales/'+l+'.json','utf8')))"
```

e depois `npm run dev` para conferir no app. Não invente comando de teste.

## Arquitetura

### Isolamento por empresa

Dois níveis de banco em `server/data/`:

- `directory.sqlite` — cadastro de empresas (plano, status, vencimento) e o mapa `email → company_id`. Único banco global, em `directory.js`.
- `companies/<id>/app.sqlite` — um banco por empresa, com usuários, quadros, listas, cartões, recorrências e atas. Anexos em `companies/<id>/uploads/`.

O `companyId` viaja por `AsyncLocalStorage` (`server/context.js`), não por parâmetro. `getDb()` resolve o banco a partir desse contexto, então **qualquer código que chegue a `repo.js` precisa estar dentro de `runWithCompany`**. O `requireAuth` faz isso para as rotas normais; handlers assíncronos que nascem do socket escapam do ALS e têm de reentrar na mão — é o caso do upload em `routes/cards.js`.

`migrateLegacy.js` roda no boot e converte a instalação antiga de banco único para o formato multiempresa. Só age se o diretório estiver vazio.

### Schema é código, não arquivo de migração

`db.js applySchema()` roda a cada abertura de banco: `CREATE TABLE IF NOT EXISTS` mais `addColumnIfMissing` para tudo que veio depois. Coluna nova entra ali, com o comentário do porquê do default — não existe pasta de migrations. O mesmo padrão vale para `directory.js`.

Colunas adicionadas depois costumam vir com um `UPDATE ... WHERE <coluna> IS NULL` de retrocompatibilidade logo abaixo (ver `completed_at`, `list_entered_at`): sem isso, ligar um recurso novo faria o histórico inteiro parecer vencido de uma vez.

### Planos e cobrança

`server/plans.js` é a autoridade única. Preço, limite de usuários, teto de anexo e direito a cada recurso pago moram só ali. O bloqueio acontece em três camadas:

1. `requireWritablePlan` (em `app.js`, por router) — plano vencido perde escrita, mantém leitura. Aplicado uma vez por método, não rota a rota: rota nova nasce protegida.
2. Checagem do recurso na rota — `canUseAutoArchive`, `canUseRecurringCards`, `canUseBottleneckMonitor`, `attachmentLimitFor`.
3. `GET /api/plan` devolve os direitos **já calculados** (`canUseAutoArchive`, `catalog[].selfUpgradable`…). O cliente só renderiza o que veio; nunca reimplemente regra de plano no front.

`/api/auth` e `/api/plan` ficam fora do bloqueio de escrita de propósito: empresa vencida precisa poder entrar e contratar para voltar a escrever. Só subir de plano é autoatendimento (`canSelfUpgradeTo`).

### Autenticação

JWT em cookie httpOnly `kanban_token`, com `companyId` no payload. Segredo em `JWT_SECRET` ou gerado em `server/data/jwt-secret.txt` (em disco efêmero isso derruba as sessões — defina a variável em produção).

Sem token CSRF: `verifyOrigin` confere `Origin`/`Referer` em todo método que altera estado, comparando **host** em vez de origem completa por causa de proxy reverso. Necessário porque com `FRONTEND_URL` definida o cookie usa `sameSite=none`. Login e cadastro passam por `rateLimit.js` (por IP e por e-mail).

### Estado do cliente: otimista, com sync separado

`BoardContext` guarda o workspace inteiro num único `useReducer`: `boards[]`, cada quadro com `lists[]` (só ordem, via `cardIds`) e `cards{}` indexado por id.

O fluxo é: `dispatch` aplica no reducer na hora, e um efeito chama `syncAction(action, state)` com o estado **já novo** para disparar a chamada de API. Consequência prática:

> Toda ação que altera dados precisa de um `case` em `state/reducer.js` **e** um `case` em `state/sync.js`. Faltando o segundo, a mudança aparece na tela e desaparece no próximo carregamento, sem erro nenhum.

Reordenações mandam a lista inteira de ids (`setCardOrder`) em vez de posições individuais. Erro de sync só vai para o console — não há rollback do estado local.

Leitura é sempre o workspace completo (`GET /api/boards` → `repo.getWorkspace`); `useBoardRefetch()` re-hidrata.

### Automações rodam na leitura

Não há cron. `GET /api/boards` executa `runAutoArchive()` e `runRecurrences()` antes de responder, cada um atrás do direito do plano. Assim o quadro que chega já está varrido e com os cartões do dia. `recurrence.js` calcula a última ocorrência devida e gera **um** cartão, mesmo que várias tenham passado sem ninguém abrir o app.

**Arquivar não apaga:** o cartão mantém `list_id` e `position` e sai apenas de `list.cardIds` na leitura. É isso que o esconde do quadro e das sete views de uma vez, já que todas percorrem `cardIds`.

### Anexos

Upload em streaming com busboy, fora do `request()` do `api.js`. O teto do plano é verificado **durante** a transferência (`limits.fileSize`), então arquivo grande é abortado no meio. Arquivo no disco da empresa, metadados no JSON `cards.attachments`. Subir o limite é trocar o número em `plans.js` — o arquivo nunca fica inteiro na memória.

### i18n e erros

Três locales em `src/i18n/locales/` (`pt` é o fallback), detecção por `localStorage` na chave `kanban-language`. O servidor semeia o quadro inicial no idioma do cadastro (`seedContent.js`).

Erro de API tem mensagem em português **e** um `code` estável. O cliente traduz pelo code (`utils/errors.js translateError`) e cai na mensagem do servidor quando não há tradução. Portanto: erro novo precisa de `code`, e a chave `errors.<CODE>` nos três JSONs.

## Convenções

- **Comentários em português, explicando o porquê, não o quê.** É a marca do repositório: decisões de produto, armadilhas já pagas e defaults justificados ficam registrados junto do código. Mantenha essa densidade em código novo.
- **Mensagens de commit em português, no imperativo:** "Adiciona…", "Corrige…", "Atualiza…".
- **Texto de interface usa hífen, não travessão** (`—` foi removido da UI de propósito). Em comentários de código o travessão é usado normalmente.
- O produto chama-se **Cantiere**; o nome antigo sobrevive em identificadores estáveis (`kanban-board`, `kanban_token`, `KANBAN_DATA_DIR`). Não renomeie esses.
- Identificadores em inglês, com locais em português em código de regra de negócio (`limite`, `alvo`, `plano`, `resumo`). Siga o arquivo em que estiver.
- CSS todo em `src/index.css` (~3000 linhas), dividido por marcadores `/* ---------- Seção ---------- */`. Landing e login fixam tema escuro; o app tem claro/escuro.
- Rotas usam o wrapper `ah()` (`asyncHandler.js`) e os middlewares `requireBoardAccess` / `requireBoardAccessParam` para acesso a quadro privado.
