// Schema do módulo Financeiro, no banco da EMPRESA (companies/<id>/app.sqlite).
//
// Segue o mesmo padrão de db.js applySchema: CREATE TABLE IF NOT EXISTS, rodado a
// cada abertura do banco. Não existe pasta de migrations. Fica junto do módulo em
// vez de dentro de db.js para o Financeiro ser autocontido, mas é chamado de lá
// (applySchema), no mesmo ponto preguiçoso: a tabela só nasce na primeira
// requisição autenticada da empresa que abrir o módulo.
//
// Convenções obrigatórias do projeto respeitadas aqui:
//   - Dinheiro em CENTAVOS INTEIROS (valor_cents), nunca decimal - é o que entra
//     em soma e comparação sem o erro de binário do float (ver plans.js).
//   - Data civil YYYY-MM-DD (due), o formato do <input type="date"> - nunca
//     timestamp ISO, que apareceria como "Invalid Date" e sairia da ordenação.
export function applyFinanceiroSchema(companyDb) {
  companyDb.exec(`
    CREATE TABLE IF NOT EXISTS financeiro_categorias (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      -- 'receita' | 'despesa': é o que agrupa o DRE. Uma categoria de receita
      -- soma no topo do resultado; a de despesa, embaixo.
      tipo TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
      id TEXT PRIMARY KEY,
      -- 'receber' | 'pagar': o sinal no fluxo de caixa vem daqui, por isso
      -- valor_cents é sempre positivo (não se guarda -100).
      tipo TEXT NOT NULL,
      descricao TEXT NOT NULL DEFAULT '',
      valor_cents INTEGER NOT NULL,
      -- Vencimento, data civil YYYY-MM-DD.
      due TEXT NOT NULL,
      -- 'pendente' | 'pago'. Só o que está pago entra no realizado do fluxo e no DRE.
      status TEXT NOT NULL DEFAULT 'pendente',
      -- Quando foi baixado (data civil). NULL enquanto pendente.
      paid_at TEXT,
      category_id TEXT REFERENCES financeiro_categorias(id),
      -- Cliente/fornecedor em texto livre por ora. Vira tabela própria quando o
      -- CRM (Fase 2) trouxer o cadastro de contatos - não se constrói duas vezes.
      contraparte TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );

    -- Fluxo e DRE varrem por vencimento e por data de baixa; o índice evita o
    -- table scan quando a empresa acumular histórico.
    CREATE INDEX IF NOT EXISTS idx_fin_lanc_due ON financeiro_lancamentos(due);
    CREATE INDEX IF NOT EXISTS idx_fin_lanc_paid ON financeiro_lancamentos(paid_at);

    -- ---------- Fundação (cadastros de apoio) ----------

    -- Contas correntes/bancárias da empresa. O saldo NÃO é gravado aqui: é
    -- derivado (saldo_inicial + baixas de receber - baixas de pagar na conta),
    -- para nunca ficar dessincronizado de um movimento estornado (ver calculos).
    CREATE TABLE IF NOT EXISTS financeiro_contas (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      banco TEXT NOT NULL DEFAULT '',
      agencia TEXT NOT NULL DEFAULT '',
      numero TEXT NOT NULL DEFAULT '',
      saldo_inicial_cents INTEGER NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Centro de custo: a dimensão de "para qual obra/setor" o lançamento pertence.
    -- Plano na construção civil costuma ser por obra. Hierarquia (parent_id) fica
    -- para depois; começa flat.
    CREATE TABLE IF NOT EXISTS financeiro_centros_custo (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      codigo TEXT NOT NULL DEFAULT '',
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Cadastro de clientes e fornecedores. tipo = 'cliente' | 'fornecedor' |
    -- 'ambos'. Substitui o texto livre 'contraparte' do lançamento (que continua
    -- existindo como fallback dos lançamentos antigos). Cruza com o CRM da Fase 2;
    -- aqui é o mínimo que o Financeiro precisa.
    CREATE TABLE IF NOT EXISTS financeiro_contatos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'fornecedor',
      doc TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      telefone TEXT NOT NULL DEFAULT '',
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- ---------- Fiscal & tributário ----------

    -- Tipos de imposto e a alíquota de cada um (ex.: ISS 5%, IRRF 1,5%). Alíquota
    -- em CENTÉSIMOS DE PONTO PERCENTUAL - mesmo raciocínio dos centavos de
    -- dinheiro: 150 = 1,50%, inteiro, sem erro de binário. tipo diz se essa
    -- alíquota, ao ser aplicada, é retida (some do que se paga) ou acrescida
    -- (soma no que se paga) - o mesmo par que já existe no título
    -- (imposto_retido_cents/imposto_acrescido_cents).
    CREATE TABLE IF NOT EXISTS financeiro_impostos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      codigo TEXT NOT NULL DEFAULT '',
      aliquota_centesimos INTEGER NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT 'retido',
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Código de serviço para SPED/NFSe: código + descrição. Sem uso funcional
    -- ainda (a emissão fiscal é do bloco Faturamento) - é o cadastro de apoio
    -- para quando a nota entrar.
    CREATE TABLE IF NOT EXISTS financeiro_codigos_servico (
      id TEXT PRIMARY KEY,
      codigo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Impostos aplicados a um título específico: um por imposto do cadastro
    -- (financeiro_impostos), com o valor já calculado (título × alíquota) e, se
    -- for retido num título a pagar, o id do título de recolhimento que ele
    -- gerou. nome/tipo/alíquota são copiados no momento da aplicação (snapshot) -
    -- editar o imposto no cadastro depois não reescreve o histórico de quem já
    -- usou aquela alíquota.
    CREATE TABLE IF NOT EXISTS financeiro_lancamento_impostos (
      id TEXT PRIMARY KEY,
      lancamento_id TEXT NOT NULL REFERENCES financeiro_lancamentos(id),
      imposto_id TEXT REFERENCES financeiro_impostos(id),
      imposto_nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      aliquota_centesimos INTEGER NOT NULL,
      valor_cents INTEGER NOT NULL,
      titulo_gerado_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fin_lanc_impostos_titulo ON financeiro_lancamento_impostos(lancamento_id);

    -- Apropriação (rateio) do valor de um título entre vários centros de custo.
    -- Cada linha é uma parte do valor do título alocada a um centro. Quando um
    -- título tem apropriações, ele é "rateado" e o centro_custo_id único fica NULL
    -- (o rateio é a fonte da verdade). A soma dos valor_cents fecha o valor do
    -- título (validado no repo). Mesmo espírito de financeiro_lancamento_impostos:
    -- sub-registros de um lançamento.
    CREATE TABLE IF NOT EXISTS financeiro_apropriacoes (
      id TEXT PRIMARY KEY,
      lancamento_id TEXT NOT NULL REFERENCES financeiro_lancamentos(id),
      centro_custo_id TEXT NOT NULL,
      valor_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fin_apropriacoes_titulo ON financeiro_apropriacoes(lancamento_id);
  `);

  // Colunas acrescentadas depois do MVP - mesmo padrão addColumnIfMissing de
  // db.js, aqui local porque o helper de lá não é exportado. Default cobre as
  // linhas existentes no próprio ALTER.
  addColumn(companyDb, "financeiro_categorias", "codigo", "codigo TEXT NOT NULL DEFAULT ''");
  addColumn(companyDb, "financeiro_categorias", "ativo", "ativo INTEGER NOT NULL DEFAULT 1");
  addColumn(companyDb, "financeiro_lancamentos", "centro_custo_id", "centro_custo_id TEXT");
  addColumn(companyDb, "financeiro_lancamentos", "contato_id", "contato_id TEXT");
  // Conta corrente da baixa: gravada quando o lançamento é pago, para os saldos
  // por conta e o extrato saberem de onde saiu / onde entrou. NULL enquanto
  // pendente, e nos lançamentos baixados antes desta coluna existir.
  addColumn(companyDb, "financeiro_lancamentos", "conta_id", "conta_id TEXT");
  // Número do documento (nota, boleto...), a coluna "Doc." do grid do SIGIM.
  addColumn(companyDb, "financeiro_lancamentos", "doc", "doc TEXT NOT NULL DEFAULT ''");
  // Data de emissão do documento (civil YYYY-MM-DD) - a "Data emissão doc." do
  // SIGIM, distinta do vencimento. NULL nos títulos anteriores a esta coluna.
  addColumn(companyDb, "financeiro_lancamentos", "emissao", "emissao TEXT");
  // Forma de pagamento (chave de um conjunto fixo: operação bancária, pix...).
  // O SIGIM tem cadastro próprio; aqui basta o enum por ora.
  addColumn(companyDb, "financeiro_lancamentos", "forma_pagto", "forma_pagto TEXT NOT NULL DEFAULT ''");
  // Observação livre do título.
  addColumn(companyDb, "financeiro_lancamentos", "observacao", "observacao TEXT NOT NULL DEFAULT ''");
  // Impostos e ajustes do título, em centavos (default 0). O valor LÍQUIDO é
  // derivado deles - nunca gravado: liquido = valor - desconto - imposto_retido
  // - retencao + imposto_acrescido (ver liquidoCents em repo.js). É o líquido que
  // move o caixa (saldos, fluxo, DRE); com tudo 0, líquido = valor do título.
  addColumn(companyDb, "financeiro_lancamentos", "imposto_retido_cents", "imposto_retido_cents INTEGER NOT NULL DEFAULT 0");
  addColumn(companyDb, "financeiro_lancamentos", "imposto_acrescido_cents", "imposto_acrescido_cents INTEGER NOT NULL DEFAULT 0");
  addColumn(companyDb, "financeiro_lancamentos", "desconto_cents", "desconto_cents INTEGER NOT NULL DEFAULT 0");
  addColumn(companyDb, "financeiro_lancamentos", "retencao_cents", "retencao_cents INTEGER NOT NULL DEFAULT 0");
  // Multa e juros (taxa de permanência) - encargos que AUMENTAM o que se paga/
  // recebe. Valor em centavos (não % por ora; o cálculo a partir do atraso vem
  // depois). Entram no líquido com sinal +.
  addColumn(companyDb, "financeiro_lancamentos", "multa_cents", "multa_cents INTEGER NOT NULL DEFAULT 0");
  addColumn(companyDb, "financeiro_lancamentos", "juros_cents", "juros_cents INTEGER NOT NULL DEFAULT 0");
  // Vínculo pai-filho: um título a pagar com imposto retido gera um título de
  // imposto (recolhimento) vinculado a ele. titulo_origem_id aponta para o título
  // principal; origem marca como foi gerado ('imposto_retido'). NULL nos dois em
  // títulos normais. Evita recursão: título com origem preenchida não gera outro.
  addColumn(companyDb, "financeiro_lancamentos", "titulo_origem_id", "titulo_origem_id TEXT");
  addColumn(companyDb, "financeiro_lancamentos", "origem", "origem TEXT");
  companyDb.exec("CREATE INDEX IF NOT EXISTS idx_fin_lanc_origem ON financeiro_lancamentos(titulo_origem_id)");
  // Desdobramento em parcelas: parcela_num/parcela_total marcam "X de N". NULL em
  // título não parcelado. A parcela 1 é o próprio título original (que tem o
  // vínculo NULL); as parcelas 2..N são títulos com origem='parcela' apontando
  // para ele. A soma das parcelas fecha com o valor original.
  addColumn(companyDb, "financeiro_lancamentos", "parcela_num", "parcela_num INTEGER");
  addColumn(companyDb, "financeiro_lancamentos", "parcela_total", "parcela_total INTEGER");
  // Ciclo de situação do título: de 'pendente'/'pago' binário para cinco estados
  // (provisionado -> pendente -> disponivel -> finalizado, e anulado como
  // cancelamento). O antigo 'pago' vira 'finalizado' - único estado que conta
  // como realizado no caixa/DRE. Idempotente: depois da primeira passada não
  // sobra nenhum 'pago'. O default do insert segue 'pendente' (onde o título
  // nasce, aguardando baixa).
  companyDb.exec("UPDATE financeiro_lancamentos SET status = 'finalizado' WHERE status = 'pago'");
  // Import de extrato bancário: hash estável da linha (conta+data+valor+tipo+doc+
  // histórico) para não importar a mesma movimentação duas vezes ao reprocessar o
  // mesmo PDF. NULL nos lançamentos que não vieram de extrato.
  addColumn(companyDb, "financeiro_lancamentos", "extrato_hash", "extrato_hash TEXT");
  companyDb.exec("CREATE INDEX IF NOT EXISTS idx_fin_extrato_hash ON financeiro_lancamentos(extrato_hash)");
  // Endereço do contato (cliente/fornecedor), preenchido pelo CEP (ViaCEP) na
  // tela. Tudo TEXT DEFAULT '' - endereço é opcional e os contatos antigos ficam
  // com string vazia, sem virar NULL.
  addColumn(companyDb, "financeiro_contatos", "cep", "cep TEXT NOT NULL DEFAULT ''");
  addColumn(companyDb, "financeiro_contatos", "logradouro", "logradouro TEXT NOT NULL DEFAULT ''");
  addColumn(companyDb, "financeiro_contatos", "numero", "numero TEXT NOT NULL DEFAULT ''");
  addColumn(companyDb, "financeiro_contatos", "complemento", "complemento TEXT NOT NULL DEFAULT ''");
  addColumn(companyDb, "financeiro_contatos", "bairro", "bairro TEXT NOT NULL DEFAULT ''");
  addColumn(companyDb, "financeiro_contatos", "cidade", "cidade TEXT NOT NULL DEFAULT ''");
  addColumn(companyDb, "financeiro_contatos", "uf", "uf TEXT NOT NULL DEFAULT ''");
  addColumn(companyDb, "financeiro_contatos", "pais", "pais TEXT NOT NULL DEFAULT 'Brasil'");
  addColumn(companyDb, "financeiro_contatos", "ponto_referencia", "ponto_referencia TEXT NOT NULL DEFAULT ''");
  // Número do TÍTULO: um sequencial legível por empresa (o "64194" do SIGIM), que
  // dá um identificador estável e pesquisável a cada lançamento em vez do uuid.
  // Atribuído no insert (repo.insertLancamento); o backfill abaixo numera os
  // lançamentos que nasceram antes desta coluna, em ordem de criação.
  addColumn(companyDb, "financeiro_lancamentos", "numero", "numero INTEGER");
  const semNumero = companyDb
    .prepare("SELECT id FROM financeiro_lancamentos WHERE numero IS NULL ORDER BY created_at ASC, id ASC")
    .all();
  if (semNumero.length) {
    let base = companyDb.prepare("SELECT COALESCE(MAX(numero), 0) AS m FROM financeiro_lancamentos").get().m;
    const upd = companyDb.prepare("UPDATE financeiro_lancamentos SET numero = ? WHERE id = ?");
    for (const r of semNumero) upd.run(++base, r.id);
  }
  companyDb.exec("CREATE INDEX IF NOT EXISTS idx_fin_lanc_numero ON financeiro_lancamentos(numero)");

  // Conferência bancária (aba Movimentação): marca de que a linha do extrato foi
  // conferida contra o banco. O "Saldo Conferido" da tela soma só os conferidos.
  // Nasce 0 (não conferido); a baixa reinicia para 0 e o estorno também zera -
  // movimento novo/desfeito não pode herdar "conferido" antigo.
  addColumn(companyDb, "financeiro_lancamentos", "conferido", "conferido INTEGER NOT NULL DEFAULT 0");
  // Rastro do estorno: quando um título finalizado é estornado, guarda a data
  // civil do estorno (antes o estorno não deixava rastro nenhum - voltava a
  // pendente e sumia do extrato). É o que o filtro "Estornados" da Movimentação
  // usa para reexibir o que foi desfeito. Limpo na baixa (a linha volta a ser um
  // movimento normal).
  addColumn(companyDb, "financeiro_lancamentos", "estornado_em", "estornado_em TEXT");
}

function addColumn(companyDb, table, name, ddl) {
  const cols = companyDb.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(name)) companyDb.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
