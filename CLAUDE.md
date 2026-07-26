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

Variáveis de ambiente em `.env.example`. Além das de lá, a cobrança usa `BILLING_PROVIDER` (padrão `fake`) e `BILLING_WEBHOOK_SECRET`.

**O Vite recarrega o cliente sozinho, o Express não.** Mudou algo em `server/`, reinicie o `npm run dev` — senão você testa contra o código antigo e conclui que a correção não funcionou.

**Não há suíte de testes nem linter.** A verificação de rotina é:

```bash
node --check <arquivo>                                                  # sintaxe
node -e "['pt','en','es'].forEach(l=>JSON.parse(require('fs').readFileSync('src/i18n/locales/'+l+'.json','utf8')))"
npx vite build                                                          # o JSX compila
```

e depois `npm run dev` para conferir no app. Não invente comando de teste.

Para exercitar fluxo que depende de sessão, sobe a API num banco temporário e dirige por HTTP: `KANBAN_DATA_DIR` apontando para uma pasta nova, `app.listen(0)`, e o cookie de `Set-Cookie` reenviado nas chamadas seguintes. É assim que a cobrança e as regras de plano foram verificadas, sem tocar nos dados reais.

**Ajuste de CSS se confere no navegador, não no arquivo.** Este projeto tem regras concorrentes por especificidade (`.landing-hero p` vence `.landing-hero-note`), e variável inexistente faz o navegador descartar a declaração inteira em silêncio. Meça o `getComputedStyle` do elemento antes de concluir que a edição pegou.

## Arquitetura

### Isolamento por empresa

Dois níveis de banco em `server/data/`:

- `directory.sqlite` — cadastro de empresas (plano, status, vencimento, carência) e o mapa `email → company_id`, em `directory.js`. Guarda também `subscriptions` e `payments`, criadas por `billing/store.js` via `getDirectoryDb()`: cobrança é da empresa, não de dentro de um quadro. Único banco global.
- `companies/<id>/app.sqlite` — um banco por empresa, com usuários, quadros, listas, cartões, recorrências e atas. Anexos em `companies/<id>/uploads/`.

O `companyId` viaja por `AsyncLocalStorage` (`server/context.js`), não por parâmetro. `getDb()` resolve o banco a partir desse contexto, então **qualquer código que chegue a `repo.js` precisa estar dentro de `runWithCompany`**. O `requireAuth` faz isso para as rotas normais; handlers assíncronos que nascem do socket escapam do ALS e têm de reentrar na mão — é o caso do upload em `routes/cards.js`.

`migrateLegacy.js` roda no boot e converte a instalação antiga de banco único para o formato multiempresa. Só age se o diretório estiver vazio.

### Schema é código, não arquivo de migração

`db.js applySchema()` roda a cada abertura de banco: `CREATE TABLE IF NOT EXISTS` mais `addColumnIfMissing` para tudo que veio depois. Coluna nova entra ali, com o comentário do porquê do default — não existe pasta de migrations. O mesmo padrão vale para `directory.js`.

Colunas adicionadas depois costumam vir com um `UPDATE ... WHERE <coluna> IS NULL` de retrocompatibilidade logo abaixo (ver `completed_at`, `list_entered_at`): sem isso, ligar um recurso novo faria o histórico inteiro parecer vencido de uma vez.

### Planos

`server/plans.js` é a autoridade única. Preço, limite de usuários, teto de anexo e direito a cada recurso pago moram só ali. O bloqueio acontece em três camadas:

1. `requireWritablePlan` (em `app.js`, por router) — plano vencido perde escrita, mantém leitura. Aplicado uma vez por método, não rota a rota: rota nova nasce protegida.
2. Checagem do recurso na rota — `canUseAutoArchive`, `canUseRecurringCards`, `canUseBottleneckMonitor`, `attachmentLimitFor`.
3. `GET /api/plan` devolve os direitos **já calculados** (`canUseAutoArchive`, `catalog[].selfSelectable`…). O cliente só renderiza o que veio; nunca reimplemente regra de plano no front.

`/api/auth`, `/api/plan` e `/api/billing` ficam fora do bloqueio de escrita de propósito: empresa vencida precisa poder entrar e pagar para voltar a escrever.

**Preço é `priceCents`, inteiro.** O campo `price` em reais é derivado dele num só lugar. Nunca faça conta de dinheiro com o decimal: 349.99 não é representável em binário, e proporcional calculado assim fecha com centavo de diferença do extrato.

**`canSelfSelectPlan(company, alvo)` decide o autoatendimento.** Com plano pago em vigor, só subir. "Em vigor" é só `effectiveStatus === "active"` — teste, carência e vencido dão escolha livre, inclusive cair para o Básico e renovar o mesmo plano. Tratar teste como vigente travava a conversão de teste em cliente pagante, que é a coisa mais importante do produto.

`effectiveStatus` tem quatro valores: `active`, `trialing`, `grace` e `expired`. `grace` é vencido com `companies.grace_until` no futuro — quem concede é a cobrança, e só para quem tem assinatura tentando pagar. Teste que terminou não recebe carência.

### Cobrança

Mora em `server/billing/`, e guarda os dados no **banco do diretório** (global), porque pagamento é da empresa e não de dentro de um quadro.

Duas tabelas com papéis distintos: `subscriptions` é a *intenção* de recorrência (plano, meio, próxima cobrança); `payments` é o *histórico* de cobranças emitidas, que nunca é reescrito para outro ciclo — é o extrato.

Três regras que governam tudo ali:

> **`confirmarPagamento()` é o único caminho que libera acesso.** Nenhuma outra função escreve `companies.plan`/`expires_at`. A cobrança não decide acesso: ela empurra o vencimento quando um pagamento confirma. Assim uma falha na cobrança nunca tranca quem está em dia.

> **Tudo é idempotente.** `varrerCobranca()` roda na leitura do quadro, dezenas de vezes por sessão. Nada pode cobrar duas vezes o mesmo ciclo nem emitir um Pix por acesso — daí `pendingPayment()` e `countAttempts()`.

> **O provedor fica atrás de `billing/gateway.js`.** Nenhum outro arquivo importa SDK de gateway. O padrão é `fake`, para variável de ambiente esquecida não virar cobrança silenciosa no cartão de alguém.

`providers/fake.js` não é mock descartável: é o provedor de desenvolvimento, e imita o que importa do mundo real — Pix e boleto nascem pendentes, e cartão com terminação `0002`/`0003`/`0004` é recusado. `providers/mercadopago.js` ainda falha de propósito em cada método, com a lista do que falta para ligar; provedor que finge aprovação liberaria plano sem cobrar.

`POST /api/plan` **só troca para plano gratuito**. Plano pago passa por `POST /api/billing/subscribe`, e o acesso muda só na confirmação. Trocar a forma de pagamento é `PUT /api/billing/method`, que não cobra nada — é cadastro, não renovação antecipada.

Carência e tentativas são constantes no topo de `lifecycle.js` (`GRACE_DAYS`, `MAX_TENTATIVAS_CARTAO`, `ESPACAMENTO_DIAS`).

**Número de cartão não pode chegar ao servidor.** O formulário com o campo só aparece quando `GET /api/billing` devolve `simulated: true`. Com provedor real, os dados são trocados por token no navegador pelo SDK dele. A rota `dev/confirm` responde 404 fora do modo simulado.

### Autenticação

JWT em cookie httpOnly `kanban_token`, com `companyId` no payload. Segredo em `JWT_SECRET` ou gerado em `server/data/jwt-secret.txt` (em disco efêmero isso derruba as sessões — defina a variável em produção).

Sem token CSRF: `verifyOrigin` confere `Origin`/`Referer` em todo método que altera estado, comparando **host** em vez de origem completa por causa de proxy reverso. Necessário porque com `FRONTEND_URL` definida o cookie usa `sameSite=none`. Login, cadastro e geocode passam por `rateLimit.js`.

> **`/api/billing/webhook` é montado ANTES do `verifyOrigin`, e a ordem no `app.js` importa.** Gateway não é navegador: manda POST sem `Origin` nem `Referer`, e a checagem de CSRF recusaria todo aviso de pagamento com 403 — as cobranças seriam confirmadas no gateway e nunca aqui. Quem autentica essa rota é a assinatura do provedor, dentro dela. Mexer na ordem dos `app.use` quebra os pagamentos sem erro visível.

O webhook responde **200 mesmo quando ignora** o aviso. Erro ensinaria um atacante a distinguir aviso aceito de rejeitado, e faria o gateway legítimo reenviar sem parar. Só falha nossa ao aplicar devolve 500, porque aí o reenvio é o que queremos.

### Estado do cliente: otimista, com sync separado

`BoardContext` guarda o workspace inteiro num único `useReducer`: `boards[]`, cada quadro com `lists[]` (só ordem, via `cardIds`) e `cards{}` indexado por id.

O fluxo é: `dispatch` aplica no reducer na hora, e um efeito chama `syncAction(action, state)` com o estado **já novo** para disparar a chamada de API. Consequência prática:

> Toda ação que altera dados precisa de um `case` em `state/reducer.js` **e** um `case` em `state/sync.js`. Faltando o segundo, a mudança aparece na tela e desaparece no próximo carregamento, sem erro nenhum.

Reordenações mandam a lista inteira de ids (`setCardOrder`) em vez de posições individuais. Erro de sync só vai para o console — não há rollback do estado local.

`MOVE_CARD` é a exceção: **não** sincroniza. Durante um arraste ele é despachado a cada posição por onde o cartão passa, e um PUT em cada uma gerava dezenas de requisições concorrentes por arraste, sem garantia de ordem de chegada. Quem grava é `COMMIT_CARD_ORDER`, uma vez, no `onDragEnd`, com as colunas que o cartão atravessou.

Leitura é sempre o workspace completo (`GET /api/boards` → `repo.getWorkspace`); `useBoardRefetch()` re-hidrata.

### Automações rodam na leitura

Não há cron. `GET /api/boards` executa `runAutoArchive()`, `runRecurrences()` e `varrerCobranca()` antes de responder — os dois primeiros atrás do direito do plano. Assim o quadro que chega já está varrido, com os cartões do dia e com a cobrança em dia. `recurrence.js` calcula a última ocorrência devida e gera **um** cartão, mesmo que várias tenham passado sem ninguém abrir o app.

A varredura de cobrança fica dentro de `try/catch` na rota: gateway fora do ar não pode impedir alguém de ver o próprio quadro.

**A aritmética de recorrência é em horário local do servidor, não UTC.** A hora escolhida no formulário é a hora do relógio de quem escolhe. E `due` é sempre data civil `YYYY-MM-DD`, o formato que o `<input type="date">` produz — gravar timestamp ISO ali faz o cartão aparecer com "Invalid Date" no crachá, sumir do Calendário e sair com posição `NaN` na Linha do tempo.

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
- CSS todo em `src/index.css` (~3400 linhas), dividido por marcadores `/* ---------- Seção ---------- */`. Landing e login fixam tema escuro; o app tem claro/escuro.
- **Variáveis CSS: os nomes são `--border-subtle`, `--border-strong`, `--bg-card`, `--bg-list`, `--bg-column`, `--text-primary/secondary/muted`, `--accent`, `--success`, `--danger`.** Não há `--border` nem `--bg-input`. Confira o `:root` antes de usar uma: variável inexistente derruba a declaração inteira sem avisar.
- Rotas usam o wrapper `ah()` (`asyncHandler.js`) e os middlewares `requireBoardAccess` / `requireBoardAccessParam` para acesso a quadro privado.
- **Escrita em massa nos locales por script:** `JSON.stringify(json, null, 2)` reformata os arrays compactos de `en.json` e `es.json` e produz um diff de 400 linhas por arquivo. Insira por texto, sobre uma âncora, e valide com `JSON.parse` antes de gravar.
