# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Xaphires — quadro Kanban multiempresa. React 18 + Vite no cliente, Express + `node:sqlite` no servidor. Sem build step no servidor: ESM puro, rodado direto pelo Node.

## Comandos

```bash
npm run dev       # servidor (4000) + Vite (5173) juntos, via concurrently
npm run server    # só a API
npm run client    # só o Vite
npm run build     # gera dist/
npm start         # produção: um processo só, Express serve dist/ e a API
```

Node >= 22.5 é obrigatório (`node:sqlite`). O `.node-version` fixa 24, onde o módulo já não precisa de flag.

Variáveis de ambiente em `.env.example`, incluindo as da cobrança: `BILLING_PROVIDER` (padrão `fake`), `BILLING_WEBHOOK_SECRET`, e o trio do Asaas `ASAAS_API_KEY` / `ASAAS_ENV` / `ASAAS_WEBHOOK_TOKEN`. Provedor real sem configuração completa grita no log no arranque, e não na primeira cobrança.

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

- `directory.sqlite` — cadastro de empresas (plano, status, vencimento, carência, contato, bloqueio) e o mapa `email → company_id`, em `directory.js`. Guarda também `subscriptions` e `payments` (`billing/store.js`) e `platform_admins` e `admin_audit` (`admin/store.js`), todas criadas via `getDirectoryDb()`: cobrança e administração são da empresa, não de dentro de um quadro. Único banco global.
- `companies/<id>/app.sqlite` — um banco por empresa, com usuários, quadros, listas, cartões, recorrências e atas. Anexos em `companies/<id>/uploads/`.

O `companyId` viaja por `AsyncLocalStorage` (`server/context.js`), não por parâmetro. `getDb()` resolve o banco a partir desse contexto, então **qualquer código que chegue a `repo.js` precisa estar dentro de `runWithCompany`**. O `requireAuth` faz isso para as rotas normais; handlers assíncronos que nascem do socket escapam do ALS e têm de reentrar na mão — é o caso do upload em `routes/cards.js`.

**`getCompanyDb()` cria o banco quando não existe, sem perguntar se a empresa existe.** É o que faz o cadastro funcionar, e é uma armadilha: o token vale 7 dias e sobrevive à exclusão da empresa, então uma aba aberta com sessão órfã ressuscitava a pasta apagada a cada requisição. O `requireAuth` confere `getCompany()` antes de entrar no contexto justamente por isso. Qualquer caminho novo que chame `runWithCompany` com um id vindo de token precisa da mesma conferência.

Excluir uma empresa é: apagar `payments`, `subscriptions`, `user_directory` e `companies` numa transação, e remover a pasta. No Windows a pasta só sai com o servidor parado, porque o SQLite mantém o arquivo aberto pelo cache do `getCompanyDb`.

`migrateLegacy.js` roda no boot e converte a instalação antiga de banco único para o formato multiempresa. Só age se o diretório estiver vazio.

### Schema é código, não arquivo de migração

`db.js applySchema()` roda a cada abertura de banco: `CREATE TABLE IF NOT EXISTS` mais `addColumnIfMissing` para tudo que veio depois. Coluna nova entra ali, com o comentário do porquê do default — não existe pasta de migrations. O mesmo padrão vale para `directory.js`.

Colunas adicionadas depois costumam vir com um `UPDATE ... WHERE <coluna> IS NULL` de retrocompatibilidade logo abaixo (ver `completed_at`, `list_entered_at`, `created_at`): sem isso, ligar um recurso novo faria o histórico inteiro parecer vencido de uma vez. **A ordem entre eles importa quando um preenche a partir do outro** — o de `created_at` usa `COALESCE(list_entered_at, agora)` e por isso roda depois do de `list_entered_at`.

**O `applySchema` de empresa é preguiçoso.** O banco de empresa só abre quando alguém a usa, então coluna nova não aparece no arranque do servidor — ela entra na primeira requisição autenticada daquela empresa. Não conte com a migração tendo acontecido só porque o processo subiu.

### Planos

`server/plans.js` é a autoridade única. Preço, limite de usuários, teto de anexo e direito a cada recurso pago moram só ali. O bloqueio acontece em três camadas:

1. `requireWritablePlan` (em `app.js`, por router) — plano vencido perde escrita, mantém leitura. Aplicado uma vez por método, não rota a rota: rota nova nasce protegida.
2. Checagem do recurso na rota — `canUseAutoArchive`, `canUseRecurringCards`, `canUseBottleneckMonitor`, `attachmentLimitFor`.
3. `GET /api/plan` devolve os direitos **já calculados** (`canUseAutoArchive`, `catalog[].selfSelectable`…). O cliente só renderiza o que veio; nunca reimplemente regra de plano no front.

`/api/auth`, `/api/plan` e `/api/billing` ficam fora do bloqueio de escrita de propósito: empresa vencida precisa poder entrar e pagar para voltar a escrever.

**Preço é `priceCents`, inteiro.** O campo `price` em reais é derivado dele num só lugar. Nunca faça conta de dinheiro com o decimal: 349.99 não é representável em binário, e proporcional calculado assim fecha com centavo de diferença do extrato.

**`canSelfSelectPlan(company, alvo)` decide o autoatendimento.** Com plano pago em vigor, só subir. "Em vigor" é só `effectiveStatus === "active"` — teste, carência e vencido dão escolha livre, inclusive cair para o Básico e renovar o mesmo plano. Tratar teste como vigente travava a conversão de teste em cliente pagante, que é a coisa mais importante do produto.

`effectiveStatus` tem cinco valores: `blocked`, `active`, `trialing`, `grace` e `expired`. `blocked` vem antes de tudo e é bloqueio administrativo (ver a seção do painel). `grace` é vencido com `companies.grace_until` no futuro — quem concede é a cobrança, e só para quem tem assinatura tentando pagar. Teste que terminou não recebe carência.

### Cobrança

Mora em `server/billing/`, e guarda os dados no **banco do diretório** (global), porque pagamento é da empresa e não de dentro de um quadro.

Duas tabelas com papéis distintos: `subscriptions` é a *intenção* de recorrência (plano, meio, próxima cobrança); `payments` é o *histórico* de cobranças emitidas, que nunca é reescrito para outro ciclo — é o extrato.

Três regras que governam tudo ali:

> **`confirmarPagamento()` é o único caminho que libera acesso.** Nenhuma outra função escreve `companies.plan`/`expires_at`. A cobrança não decide acesso: ela empurra o vencimento quando um pagamento confirma. Assim uma falha na cobrança nunca tranca quem está em dia.

> **Tudo é idempotente.** `varrerCobranca()` roda na leitura do quadro, dezenas de vezes por sessão. Nada pode cobrar duas vezes o mesmo ciclo nem emitir um Pix por acesso — daí `pendingPayment()` e `countAttempts()`.

> **O provedor fica atrás de `billing/gateway.js`.** Nenhum outro arquivo importa SDK de gateway. O padrão é `fake`, para variável de ambiente esquecida não virar cobrança silenciosa no cartão de alguém.

`providers/fake.js` não é mock descartável: é o provedor de desenvolvimento, e imita o que importa do mundo real — Pix e boleto nascem pendentes, e cartão com terminação `0002`/`0003`/`0004` é recusado.

`POST /api/plan` **só troca para plano gratuito**. Plano pago passa por `POST /api/billing/subscribe`, e o acesso muda só na confirmação. Trocar a forma de pagamento é `PUT /api/billing/method`, que não cobra nada — é cadastro, não renovação antecipada.

Carência e tentativas são constantes no topo de `lifecycle.js` (`GRACE_DAYS`, `MAX_TENTATIVAS_CARTAO`, `ESPACAMENTO_DIAS`) — só valem para Pix e boleto, que são cobranças que nós reemitimos a cada ciclo. Cartão não usa nenhuma das duas: ver a seção da renovação de cartão, abaixo.

Pix e boleto exigem CPF ou CNPJ do pagador. Validado com dígito verificador nos dois lados (`server/doc.js` é a autoridade, `src/utils/doc.js` dá a resposta imediata), e gravado em `subscriptions.payer_doc` — a renovação roda fora do contexto da empresa e não teria como buscar o dado depois. O documento só volta no `GET /api/billing` para o master.

### O número do cartão nunca é nosso

Esta é a regra mais importante do checkout, e a mais fácil de destruir sem perceber.

> **Não existe, e não pode passar a existir, um estado com o número do cartão.** A tokenização de cartão do Asaas exige a chave secreta e só pode ser chamada do servidor (diferente do Mercado Pago, que este projeto usava antes, e cuja Secure Fields tokenizava direto no navegador) — então, em vez de um formulário embutido, o cartão é pago numa **página hospedada pelo próprio Asaas** (`asaas.com/checkoutSession`): `pagar()`, em `CheckoutModal.jsx`, redireciona o navegador inteiro para lá com `window.location.href` assim que `POST /api/billing/subscribe` devolve um `checkoutUrl`. Nosso servidor e nosso JavaScript nunca veem o número do cartão. Se aparecer um `useState` guardando PAN em algum lugar, ou um campo de número fora do modo simulado, o desenho foi perdido — o escopo de conformidade sobe de SAQ A para SAQ A-EP.

O formulário com campo de número só aparece quando `GET /api/billing` devolve `simulated: true`, e ali o número é de mentira. A rota `dev/confirm` responde 404 fora do modo simulado.

Sem SDK de pagamento no cliente: como o cartão é a página do próprio Asaas, não existe script de terceiro para carregar nem chave pública para expor — a antiga preocupação com import dinâmico e code-splitting do SDK do Mercado Pago não se aplica mais.

### A assinatura de cartão nasce no checkout, não em `criarAssinatura()`

O checkout hospedado, criado com `chargeTypes: ["RECURRENT"]` e um bloco `subscription`, é o que faz o Asaas montar a assinatura **e** a primeira cobrança de uma vez só — do lado dele, quando a pessoa termina de pagar, bem depois da resposta de `POST /api/billing/subscribe`. Por isso `criarAssinatura()` em `providers/asaas.js` é só um placeholder (devolve `status: "active"` sem nenhum id), e quem de fato cria o checkout é `criarCobranca()` com `method: "card"`, chamada logo em seguida por `emitirCobranca()`. O id real da assinatura, e o da primeira cobrança, só chegam depois — pelo webhook.

**Renovação de cartão não passa por nós — só com o Asaas.** Uma vez criada, a assinatura cobra o cartão sozinha a cada ciclo. `confirmarPagamento()` sabe disso e não agenda `next_charge_at` quando `metodoRenovaSozinho()` (`gateway.js`) diz que o provedor ativo tem motor de renovação próprio — sem essa checagem, a varredura tentaria emitir um checkout novo por cima da renovação que o próprio Asaas já dispara. O mesmo vale em `registrarFalha()`: quem decide se tenta de novo é o gateway, não `MAX_TENTATIVAS_CARTAO`. O simulado (`providers/fake.js`) declara `renovaCartaoSozinho: false` de propósito — sem motor próprio, cartão nele continua sendo reagendado por nós como Pix e boleto sempre foram, e é isso que deixa renovação e cancelamento exercitáveis em desenvolvimento sem credencial nenhuma.

**O webhook precisa achar (ou criar) a linha local de dois jeitos que não são "pelo id de cobrança".** Testado contra o sandbox de verdade (checkout completo, cartão de teste, webhook batendo aqui via túnel): o `externalReference` do checkout **não propaga** para o pagamento gerado — a intuição óbvia de mandar o id local como referência e reencontrá-lo no aviso simplesmente não funciona, o campo volta `null`. Quem sobrevive é `checkoutSession`, com o id do próprio checkout. Por isso `criarCheckoutAssinatura()` devolve `providerChargeId: "checkout:" + id-do-checkout` em vez de um id real ou de nulo — é pseudo-id, nunca mandado pro Asaas, só serve pra `acharOuCriarPagamento()` (`routes/billingWebhook.js`) reencontrar a linha quando o aviso trouxer esse mesmo `checkoutSession`, preenchendo então o `provider_charge_id` de verdade (e o `provider_subscription_id` da assinatura, junto). A partir da segunda cobrança não existe nem checkout: é uma renovação que o Asaas disparou sozinho — aí quem casa é `providerSubscriptionId`, e a linha local nasce ali mesmo, na hora, com `store.createPayment()`. `consultarCobranca()` sabe que um `providerChargeId` começando com `"checkout:"` não é uma cobrança consultável, e devolve `{ status: null }` sem tentar montar a requisição — é por isso que o cliente, enquanto o checkout está aberto, só vê "ainda pendente" ao consultar; quem resolve isso é sempre o webhook.

### O adaptador do Asaas foi testado contra a API de verdade

Não usa SDK — chamadas HTTP puras (`fetch`) contra `api-sandbox.asaas.com` ou `api.asaas.com`, escolhido por `ASAAS_ENV`. Pix, boleto, criação de checkout, autenticação do webhook (token errado ignorado, token certo aplica) e um pagamento de cartão completo via checkout — incluindo o Asaas de fato entregando o webhook num túnel local — já rodaram contra o sandbox de verdade, não só contra a documentação. Dois detalhes só apareceram nesse teste, sem estar documentados:

- **`callback.successUrl`/`cancelUrl`/`expiredUrl` do checkout precisam ser HTTPS.** O Asaas recusa `http://localhost` com 400. Sem efeito em produção (`FRONTEND_URL` já é https), mas testar o checkout localmente exige `FRONTEND_URL` apontando pra algo https (um túnel, por exemplo) só durante o teste.
- **`customerData` no checkout é tudo ou nada.** Mandar só e-mail faz o Asaas exigir nome, CPF/CNPJ, telefone e endereço completo juntos — dado que este projeto não coleta. `criarCheckoutAssinatura()` omite o campo inteiro de propósito, e a própria página hospedada pede isso à pessoa.
- **Cartão em sandbox não confirma sozinho.** "Pagamento confirmado" na tela do checkout só quer dizer que o Asaas aceitou processar — o pagamento fica em `PENDING` até uma ação manual (`POST /v3/sandbox/payment/{id}/confirm`, só existe em sandbox) ou até compensar de verdade em produção. Não é bug daqui; é assim que o ambiente de teste deles funciona.

Rode `node server/billing/verificarCredencial.js` com `ASAAS_API_KEY` de **sandbox** no `.env` depois de qualquer mudança neste arquivo — é o que troca "código plausível" por "código provado". Ele cria uma cobrança Pix, uma boleto e um checkout de cartão de verdade (sandbox, nada é cobrado), e confere se os campos que `providers/asaas.js` espera (`payload` do QR do Pix, `identificationField` do boleto, `link` do checkout) realmente vêm preenchidos. O webhook em si (completar o checkout e receber o aviso) precisa de um túnel local à parte — não está automatizado no script.

Decisões que não são óbvias:

- **Valor vai em reais decimais**, não centavos. A conversão acontece só na borda e volta a inteiro com `Math.round`, porque o JSON devolve `349.98999999999995`.
- **O webhook manda o estado no corpo** (diferente do Mercado Pago, que mandava só o id), mas `lerWebhook` devolve `consultar: true` do mesmo jeito — a autenticação aqui é um token fixo no cabeçalho (`asaas-access-token`), não uma assinatura HMAC do payload, e o hábito do projeto é não confiar no corpo quando dá pra confirmar de outro jeito.
- **Status desconhecido traduz para `null`**, não para um palpite. Estado novo na API deles não vira "pago" por omissão.
- **Cliente é resolvido por CPF/CNPJ a cada cobrança** (`GET /customers?cpfCnpj=`), sem tabela própria de mapeamento — o volume é baixo (uma cobrança por empresa por mês), e uma consulta a mais não pesa.

### Autenticação

JWT em cookie httpOnly `kanban_token`, com `companyId` no payload. Segredo em `JWT_SECRET` ou gerado em `server/data/jwt-secret.txt` (em disco efêmero isso derruba as sessões — defina a variável em produção).

Sem token CSRF: `verifyOrigin` confere `Origin`/`Referer` em todo método que altera estado, comparando **host** em vez de origem completa por causa de proxy reverso. Necessário porque com `FRONTEND_URL` definida o cookie usa `sameSite=none`. Login, cadastro e geocode passam por `rateLimit.js`.

> **`/api/billing/webhook` é montado ANTES do `verifyOrigin`, e a ordem no `app.js` importa.** Gateway não é navegador: manda POST sem `Origin` nem `Referer`, e a checagem de CSRF recusaria todo aviso de pagamento com 403 — as cobranças seriam confirmadas no gateway e nunca aqui. Quem autentica essa rota é o token do provedor, dentro dela. Mexer na ordem dos `app.use` quebra os pagamentos sem erro visível.

O webhook responde **200 mesmo quando ignora** o aviso. Erro ensinaria um atacante a distinguir aviso aceito de rejeitado, e faria o gateway legítimo reenviar sem parar. Só falha nossa ao aplicar devolve 500, porque aí o reenvio é o que queremos.

### Quadro privado e permissões

Quadro tem duas visibilidades. `shared` é da empresa inteira: todo mundo entra e escreve, e não existe convite. `private` é do dono, e só chega a quem ele convidar, um a um.

`board_permissions (board_id, user_id, role)` guarda os convites, no banco da empresa. Três papéis: `owner`, `editor` (colabora como em quadro compartilhado) e `viewer` (só lê).

> **A autoridade sobre o dono é `boards.owner_id`, não a linha `owner` da tabela.** Essa linha é derivada, existe para o modal listar todo mundo com acesso numa consulta só, e nenhuma decisão de acesso a lê — autorização que dependesse dela abriria a porta a qualquer escrita capaz de inserir uma linha ali. `POST .../permissions` recusa o papel `owner`, e `revokeBoardPermission` tem `AND role <> 'owner'` no `DELETE`: sem isso um id errado deixaria o quadro sem ninguém que pudesse administrá-lo.

`boardRoleFor(user, access)` em `middleware.js` é a autoridade única do papel, e é o que `requireBoardAccess` / `requireBoardAccessParam` chamam. Duas consequências:

1. **Leitor é barrado no mesmo lugar em que o acesso é conferido** (`role === "viewer"` e método que não é seguro → 403 `FORBIDDEN_BOARD_READ_ONLY`). Cartão, lista, recorrência e anexo passam todos por um desses dois middlewares, então rota nova nasce protegida — como no `requireWritablePlan`.
2. **Master não fura quadro privado**, e nunca furou. Privado é privado inclusive para o master da empresa; quem enxerga tudo é o painel da plataforma, com auditoria.

O filtro do workspace é a primeira camada, não a segunda: `getWorkspace(userId)` só traz o quadro privado alheio se houver concessão, e é isso que o mantém fora da barra lateral. `GET /api/boards/:id` existe para o acesso direto por id devolver 403 em vez de conteúdo.

`GET /api/boards` devolve por quadro o **papel já resolvido** (`myRole`) e os convidados (`sharedWith`), mesmo princípio de `/api/plan`: o cliente desenha o que veio e não reimplementa a regra. Ler `myRole === "viewer"` é como TopBar, BoardView, ListColumn, CardItem, CardModal e DataMenu decidem o que esconder. Esconder importa mesmo com o servidor recusando: o estado do cliente é otimista e sem rollback, então uma escrita que a API nega ficaria visível na tela até o próximo carregamento.

Administrar o quadro privado (excluir, limpar, compartilhar) é do dono. Antes das permissões, ter acesso a um privado e ser dono eram a mesma coisa, e a checagem de visibilidade bastava — hoje não basta: veja o `req.boardRole !== "owner"` no `DELETE /api/boards/:id`.

### Painel da plataforma

Gerencia empresas, abre os quadros de qualquer cliente, mostra métricas globais e controla permissões. Servidor em `server/admin/` e `routes/admin.js`; componentes em `src/admin/`.

**Abre em dois lugares, com os mesmos componentes.** Dentro do app, num modal pelo menu da conta (`components/PlataformaModal.jsx`), que é o caminho normal; e na página `/admin`, montada no `main.jsx`. Os cinco componentes de `src/admin/` (`Empresas`, `Metricas`, `Popups`, `Auditoria`, `Admins`) foram escritos independentes da casca justamente para servirem nos dois — mexer neles afeta as duas telas, e o array `ABAS` é duplicado entre `AdminApp.jsx` e `PlataformaModal.jsx` (aba nova entra nos dois).

**Pop-up promocional da landing** (`admin/popupStore.js`, aba Popups) é conteúdo de marketing da plataforma, não dado de empresa — mora no banco do diretório, fora de `comAcessoAEmpresa`. Só uma campanha fica ativa por vez: `ativarPopup()` desativa qualquer outra na mesma transação. Campanha nasce desativada, e `expiresAt` (data civil `YYYY-MM-DD`) é calculado contra o relógio a cada leitura — não é um estado gravado, então uma campanha vencida continua no banco como `active: true, expired: true` até alguém mexer, e o painel mostra "Expirada" nesse caso em vez de "No ar". `GET /api/popup` é a única rota pública deste arquivo (sem sessão de cliente nem de admin) — é o que a landing consulta antes de qualquer login.

A imagem da campanha (`admin/popupUploads.js`) fica em `<dataDir>/popup-uploads/`, fora de `companies/<id>/uploads` de propósito: não é anexo de empresa, é pública por natureza, servida direto por `express.static` em `/uploads/popups` (montada em `app.js`, **antes** do catch-all da SPA — sem essa ordem, imagem removida ou nunca enviada voltava 200 com o HTML da landing em vez de 404, porque o catch-all engolia qualquer caminho fora de `/api`). Upload é streaming como o anexo de cartão, mas sem a passagem por `repo.js`/`runWithCompany` — não há empresa envolvida. Trocar a imagem apaga o arquivo antigo só depois que o novo terminou de gravar; excluir a campanha apaga a imagem junto. **`vite.config.js` faz proxy de `/uploads` além de `/api`** — sem isso a imagem carrega certo em produção (processo único) e quebra só em `npm run dev`, porque o Vite não sabe que esse caminho pertence ao Express.

**O item no menu só aparece para quem administra a plataforma.** `GET /api/auth/me` devolve `platformAdmin`, comparando o e-mail do usuário do app com o cadastro de administradores. Essa marca **não autoriza nada** e não é lida em nenhuma decisão de acesso: serve só para decidir se o item aparece. Por isso o casamento por e-mail basta — criar uma conta de cliente com o e-mail de um administrador mostraria o item e não abriria porta nenhuma.

**O acesso é por elevação, no espírito do `sudo`.** Estar logado no app não abre o painel: os dados vêm todos de `/api/admin`, que exige a sessão de administrador, e a primeira abertura pede a senha. Vale 4h, e há um "Encerrar acesso" que derruba a elevação sem sair do app. É isso que mantém a barreira mesmo com as duas coisas na mesma tela — sessão de cliente roubada não carrega a elevação.

**Para o item aparecer, o e-mail do usuário do app e o do administrador precisam ser idênticos.** É a primeira coisa a conferir quando alguém disser que o item sumiu.

**A autenticação é separada em todas as camadas, e isso não é redundância.** Tabela `platform_admins` em vez de uma coluna em `users`; segredo de assinatura próprio (`admin-jwt-secret.txt`, nunca o do app); cookie `cantiere_admin`; sessão de 4h contra os 7 dias do app. Um token do app não é aceito no painel nem por bug futuro de verificação, porque a assinatura não bate. `requireAdmin` lê **só** o cookie de admin e reconfere `active` a cada requisição — desativar alguém tira o acesso na mesma chamada, sem esperar o token expirar.

> **`comAcessoAEmpresa()` (`admin/tenant.js`) é o único caminho pelo qual o painel toca em dado de cliente.** Ele registra a auditoria **antes** de conceder o acesso, no mesmo lugar que concede — não dá para ler os dados de alguém e esquecer de registrar. Rota nova que chame `runWithCompany` direto no `routes/admin.js` fura a trilha em silêncio. Se precisar de acesso novo, use essa função.

`admin_audit` é append-only: não existe função de update nem de delete no store, de propósito. Trilha que o auditado pode editar não vale nada.

`getWorkspaceCompleto()` no `repo.js` ignora a visibilidade e devolve inclusive quadros privados. Existe só para o painel em auditoria — **não chame do app do cliente**, que é onde a regra de quadro privado precisa continuar valendo.

**Bloqueio administrativo é estado próprio** (`companies.blocked_at`), não um valor de `status`. Vencido é quem não pagou e volta pagando; bloqueado é decisão da plataforma e pagar não desfaz. `effectiveStatus` devolve `blocked`, `isWritable` recusa, e `canSelfSelectPlan` recusa — sem essa última, a empresa sairia do bloqueio contratando um plano.

O primeiro admin é criado por `node server/admin/criarAdmin.js "Nome" email@dominio`, com a senha pedida no terminal. Não existe tela pública de primeiro acesso de propósito: seria uma corrida que se perde uma vez só, para sempre. O script tem dois modos — terminal esconde o eco da senha, entrada redirecionada lê o fluxo inteiro de uma vez. Perguntar uma de cada vez no cano perde a segunda linha, porque ela chega antes de a segunda pergunta existir.

`POST /api/admin/senha` troca a própria senha e **exige a atual mesmo com a sessão aberta**: sessão esquecida numa máquina destravada não pode trancar o dono para fora da conta que enxerga todos os clientes. É o que permite entregar uma conta com senha provisória.

**Os dois pontos de entrada carregam por `lazy`, e precisam continuar assim.** No `main.jsx` para a página `/admin`, e no `AccountMenu.jsx` para o modal. Importar o modal direto coloca ~22 kB de ferramenta interna no pacote que todo cliente baixa — já aconteceu, o bundle foi de 677 para 699 kB.

Na página `/admin` o painel fica fora dos provedores do app (sem AuthProvider, sem i18n, sem tema): são duas sessões distintas, e compartilhar contexto convidaria a confundir "usuário logado" com "administrador logado". Os textos são só em português — é ferramenta interna, com um público só.

Em desenvolvimento o StrictMode chama os efeitos duas vezes, então a auditoria mostra entradas duplicadas. No build de produção não acontece.

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

### Relatório exportado

Modal em `components/ExportReportModal.jsx`, aberto pelo menu de dados. Dois filtros (responsável e situação), um contador que reage a eles, e download em CSV, PDF ou Excel. Servidor em `server/reports/` e `routes/reports.js`.

> **`reports/dados.js` é a fonte única dos números.** O CSV, o Excel e o PDF só desenham o que `montarRelatorio()` devolveu — nenhum deles decide o que é "concluído", o que entra ou o que fica de fora. Regra nova de conteúdo entra ali, uma vez, senão os três formatos passam a discordar entre si sobre o mesmo filtro.

> **A leitura é sempre `repo.getWorkspace(usuarioLogado)`,** nunca `getWorkspaceCompleto` nem consulta própria em `cards`. É essa função que aplica a regra de quadro privado. Filtrar por responsável **depois** não protege nada: pedir o relatório "do Fulano" não pode devolver os cartões dele em quadro que quem pediu não enxerga.

**O contador do modal chama o mesmo `montarRelatorio`** (`GET /api/reports/contagem`), e devolve `kpis.total`. Contar de novo no cliente sairia mais barato e criaria uma segunda definição de "cartão que conta" — o número na tela deixaria de descrever o arquivo que o botão baixa.

**Concluído é o checkbox do cartão OU a coluna em que ele está.** `colunaDeConclusao()` compara o título da lista normalizado (sem acento, sem caixa, sem pontuação) contra um conjunto fechado de palavras nos três idiomas. A comparação é por igualdade, e não por `includes`, de propósito: com `includes` uma coluna "A concluir" ou "Não concluído" — que é o oposto — entraria como concluída e inflaria a taxa de conclusão.

**`cards.created_at` foi adicionada para este recurso.** O quadro nunca precisou da data de nascimento do cartão; quem precisa é a coluna "Criado em" do arquivo. Cartões anteriores herdam `list_entered_at` no backfill, que é a marca mais antiga que existe deles — é aproximação, e o banco antigo mostra a data da migração. O backfill roda **depois** do de `list_entered_at`, senão o `COALESCE` não acha nada.

Três decisões do CSV que vêm de "abrir no Excel com dois cliques", e não do RFC: separador `;` (o Excel pt-BR lê vírgula como decimal e joga tudo na coluna A), BOM UTF-8 no início (sem ele "Concluído" vira "ConcluÃ­do"), e fim de linha CRLF.

**Título de cartão é texto de usuário, então o CSV neutraliza fórmula:** campo começando por `=`, `+`, `-` ou `@` ganha apóstrofo. Sem isso um cartão chamado `=HYPERLINK(...)` vira fórmula ativa na planilha de quem abrir o relatório.

A coluna Situação é **binária** (concluída ou pendente). Atrasado continua pendente e não vira terceira categoria: quem abre o CSV faz tabela dinâmica por essa coluna, e um terceiro valor quebraria a soma. O atraso está no prazo, na coluna ao lado, e o PDF e o Excel continuam destacando-o.

`/reports/contagem` é registrada **antes** de `/reports/:formato`, senão o parâmetro engole "contagem".

### i18n e erros

Três locales em `src/i18n/locales/` (`pt` é o fallback), detecção por `localStorage` na chave `kanban-language`. O servidor semeia o quadro inicial no idioma do cadastro (`seedContent.js`).

Erro de API tem mensagem em português **e** um `code` estável. O cliente traduz pelo code (`utils/errors.js translateError`) e cai na mensagem do servidor quando não há tradução. Portanto: erro novo precisa de `code`, e a chave `errors.<CODE>` nos três JSONs.

**Falha de rede não é resposta de erro, e por isso não tem `code` vindo do servidor.** O `fetch()` só rejeita quando a requisição não chegou a acontecer — servidor fora do ar, porta errada, rede caída. Deixado cru, o `translateError` cai no `err.message` e mostra o "Failed to fetch" do navegador, em inglês, no meio de um app traduzido. Os quatro pontos de `fetch` do projeto convertem isso em `NETWORK_UNREACHABLE`: `request()`, `addFileAttachment()` e `baixarRelatorio()` pelo helper `erroDeRede()` em `state/api.js`, e `admin/api.js` com a mensagem escrita à mão, porque o painel não passa pelo i18n e mostra `err.message` direto. **Ponto de `fetch` novo precisa do mesmo tratamento** — não há interceptador global que o faça por você.

## Convenções

- **Comentários em português, explicando o porquê, não o quê.** É a marca do repositório: decisões de produto, armadilhas já pagas e defaults justificados ficam registrados junto do código. Mantenha essa densidade em código novo.
- **Mensagens de commit em português, no imperativo:** "Adiciona…", "Corrige…", "Atualiza…".
- **Texto de interface usa hífen, não travessão** (`—` foi removido da UI de propósito). Em comentários de código o travessão é usado normalmente.
- O produto chama-se **Xaphires** (antes, Cantiere); os nomes antigos sobrevivem em identificadores estáveis (`kanban-board`, `kanban_token`, `KANBAN_DATA_DIR`, cookie `cantiere_admin`, User-Agent `cantiere-app`). Não renomeie esses — só o nome exibido para quem usa o produto muda a cada rebranding, os identificadores internos ficam.
- Identificadores em inglês, com locais em português em código de regra de negócio (`limite`, `alvo`, `plano`, `resumo`). Siga o arquivo em que estiver.
- CSS todo em `src/index.css` (~3400 linhas), dividido por marcadores `/* ---------- Seção ---------- */`. Landing e login são branco neve por padrão (decisão de marca, não seguem `prefers-color-scheme`; inspirado na referência viverdeia.ai), com um escuro opcional via `LandingThemeToggle` — mesmo `ThemeContext`/`data-theme` do app, então a escolha do visitante já chega pronta se ele criar conta. O par de blocos `.landing-shell`/`.auth-shell` (branco neve) e `:root[data-theme="dark"] .landing-shell`/`.auth-shell` (escuro) em `index.css` é sempre editado junto — variável nova num precisa entrar no outro.
- **Variáveis CSS: os nomes são `--border-subtle`, `--border-strong`, `--bg-card`, `--bg-list`, `--bg-column`, `--text-primary/secondary/muted`, `--accent`, `--success`, `--danger`.** Não há `--border` nem `--bg-input`. Confira o `:root` antes de usar uma: variável inexistente derruba a declaração inteira sem avisar.
- Rotas usam o wrapper `ah()` (`asyncHandler.js`) e os middlewares `requireBoardAccess` / `requireBoardAccessParam` para acesso a quadro privado.
- **Escrita em massa nos locales por script:** `JSON.stringify(json, null, 2)` reformata os arrays compactos de `en.json` e `es.json` e produz um diff de 400 linhas por arquivo. Insira por texto, sobre uma âncora, e valide com `JSON.parse` antes de gravar.
