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
  `);
}
