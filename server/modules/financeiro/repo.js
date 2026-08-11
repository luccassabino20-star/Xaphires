// Acesso ao banco do módulo Financeiro. Como o repo.js principal, tudo passa por
// getDb() (resolvido pelo AsyncLocalStorage do companyId) - logo, só funciona
// dentro de um runWithCompany, que o requireAuth já garante nas rotas.
import { getDb } from "../../db.js";
import { uid } from "../../repo.js";

// "Hoje" em data civil YYYY-MM-DD no horário LOCAL do servidor, não UTC - mesma
// escolha da aritmética de recorrência (a data é a do relógio de quem age).
// slice do toISOString() daria UTC e poderia adiantar/atrasar um dia perto da
// virada.
export function hojeCivil() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

// ---------- Categorias ----------
export function listCategorias() {
  return getDb().prepare("SELECT * FROM financeiro_categorias ORDER BY tipo, nome").all();
}
export function countCategorias() {
  return getDb().prepare("SELECT COUNT(*) AS c FROM financeiro_categorias").get().c;
}
export function getCategoria(id) {
  return getDb().prepare("SELECT * FROM financeiro_categorias WHERE id = ?").get(id) || null;
}
export function insertCategoria({ nome, tipo, codigo }) {
  const id = uid();
  getDb()
    .prepare("INSERT INTO financeiro_categorias (id, nome, tipo, codigo, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, nome, tipo, codigo || "", new Date().toISOString());
  return getCategoria(id);
}

// ---------- Contas correntes ----------
export function listContas() {
  return getDb().prepare("SELECT * FROM financeiro_contas ORDER BY ativo DESC, nome").all();
}
export function getConta(id) {
  return getDb().prepare("SELECT * FROM financeiro_contas WHERE id = ?").get(id) || null;
}
export function insertConta({ nome, banco, agencia, numero, saldoInicialCents }) {
  const id = uid();
  getDb()
    .prepare(
      "INSERT INTO financeiro_contas (id, nome, banco, agencia, numero, saldo_inicial_cents, ativo, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)"
    )
    .run(id, nome, banco || "", agencia || "", numero || "", saldoInicialCents || 0, new Date().toISOString());
  return getConta(id);
}
export function updateConta(id, c) {
  const a = getConta(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE financeiro_contas SET nome = ?, banco = ?, agencia = ?, numero = ?, saldo_inicial_cents = ?, ativo = ? WHERE id = ?")
    .run(
      c.nome ?? a.nome,
      c.banco ?? a.banco,
      c.agencia ?? a.agencia,
      c.numero ?? a.numero,
      c.saldoInicialCents ?? a.saldo_inicial_cents,
      c.ativo !== undefined ? (c.ativo ? 1 : 0) : a.ativo,
      id
    );
  return getConta(id);
}

// ---------- Centros de custo ----------
export function listCentrosCusto() {
  return getDb().prepare("SELECT * FROM financeiro_centros_custo ORDER BY ativo DESC, nome").all();
}
export function getCentroCusto(id) {
  return getDb().prepare("SELECT * FROM financeiro_centros_custo WHERE id = ?").get(id) || null;
}
export function insertCentroCusto({ nome, codigo }) {
  const id = uid();
  getDb()
    .prepare("INSERT INTO financeiro_centros_custo (id, nome, codigo, ativo, created_at) VALUES (?, ?, ?, 1, ?)")
    .run(id, nome, codigo || "", new Date().toISOString());
  return getCentroCusto(id);
}
export function updateCentroCusto(id, c) {
  const a = getCentroCusto(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE financeiro_centros_custo SET nome = ?, codigo = ?, ativo = ? WHERE id = ?")
    .run(c.nome ?? a.nome, c.codigo ?? a.codigo, c.ativo !== undefined ? (c.ativo ? 1 : 0) : a.ativo, id);
  return getCentroCusto(id);
}

// ---------- Contatos (clientes/fornecedores) ----------
export function listContatos() {
  return getDb().prepare("SELECT * FROM financeiro_contatos ORDER BY ativo DESC, nome").all();
}
export function getContato(id) {
  return getDb().prepare("SELECT * FROM financeiro_contatos WHERE id = ?").get(id) || null;
}
export function insertContato({ nome, tipo, doc, email, telefone }) {
  const id = uid();
  getDb()
    .prepare(
      "INSERT INTO financeiro_contatos (id, nome, tipo, doc, email, telefone, ativo, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)"
    )
    .run(id, nome, tipo || "fornecedor", doc || "", email || "", telefone || "", new Date().toISOString());
  return getContato(id);
}
export function updateContato(id, c) {
  const a = getContato(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE financeiro_contatos SET nome = ?, tipo = ?, doc = ?, email = ?, telefone = ?, ativo = ? WHERE id = ?")
    .run(
      c.nome ?? a.nome,
      c.tipo ?? a.tipo,
      c.doc ?? a.doc,
      c.email ?? a.email,
      c.telefone ?? a.telefone,
      c.ativo !== undefined ? (c.ativo ? 1 : 0) : a.ativo,
      id
    );
  return getContato(id);
}

// ---------- Lançamentos ----------
export function getLancamento(id) {
  return getDb().prepare("SELECT * FROM financeiro_lancamentos WHERE id = ?").get(id) || null;
}

// Valor líquido de um título, em centavos: o que de fato entra/sai de caixa.
// Nunca fica negativo (imposto/desconto absurdo não vira "caixa negativo"). É a
// fonte única do líquido - fluxo, DRE e saldos passam por aqui.
export function liquidoCents(l) {
  if (!l) return 0;
  const liq =
    (l.valor_cents || 0) -
    (l.desconto_cents || 0) -
    (l.imposto_retido_cents || 0) -
    (l.retencao_cents || 0) +
    (l.imposto_acrescido_cents || 0) +
    (l.multa_cents || 0) +
    (l.juros_cents || 0);
  return Math.max(0, liq);
}
// Expressão SQL equivalente ao liquidoCents, para os agregados que somam no banco.
const LIQUIDO_SQL =
  "MAX(0, valor_cents - desconto_cents - imposto_retido_cents - retencao_cents + imposto_acrescido_cents + multa_cents + juros_cents)";

// Lista com filtros opcionais. `de`/`ate` filtram por vencimento (due). Todos os
// filtros são AND; ausente significa "não filtra por isso".
export function listLancamentos({ tipo, status, de, ate } = {}) {
  const cond = [];
  const args = [];
  if (tipo) { cond.push("tipo = ?"); args.push(tipo); }
  if (status) { cond.push("status = ?"); args.push(status); }
  if (de) { cond.push("due >= ?"); args.push(de); }
  if (ate) { cond.push("due <= ?"); args.push(ate); }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  return getDb()
    .prepare(`SELECT * FROM financeiro_lancamentos ${where} ORDER BY due ASC, created_at ASC`)
    .all(...args);
}

export function insertLancamento({ tipo, descricao, valorCents, due, emissao, formaPagto, observacao, impostoRetidoCents, impostoAcrescidoCents, descontoCents, retencaoCents, multaCents, jurosCents, categoryId, centroCustoId, contatoId, contaId, doc, contraparte, tituloOrigemId, origem, createdBy }) {
  const id = uid();
  // Próximo número de título da empresa. node:sqlite é síncrono e single-thread
  // no processo, então o MAX+1 não corre risco de corrida entre requisições.
  const numero = getDb().prepare("SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM financeiro_lancamentos").get().n;
  getDb()
    .prepare(
      `INSERT INTO financeiro_lancamentos
        (id, numero, tipo, descricao, valor_cents, due, emissao, forma_pagto, observacao,
         imposto_retido_cents, imposto_acrescido_cents, desconto_cents, retencao_cents, multa_cents, juros_cents,
         status, paid_at, category_id, centro_custo_id, contato_id, conta_id, doc, contraparte, titulo_origem_id, origem, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, numero, tipo, descricao || "", valorCents, due, emissao || null, formaPagto || "", observacao || "",
      impostoRetidoCents || 0, impostoAcrescidoCents || 0, descontoCents || 0, retencaoCents || 0, multaCents || 0, jurosCents || 0,
      categoryId || null, centroCustoId || null, contatoId || null, contaId || null, doc || "",
      contraparte || "", tituloOrigemId || null, origem || null, new Date().toISOString(), createdBy || null
    );
  return getLancamento(id);
}

// Edição parcial: só sobrescreve o que veio. Não mexe em status/paid_at - baixar
// e estornar têm caminhos próprios, para a regra de idempotência ficar num lugar só.
export function updateLancamento(id, campos) {
  const atual = getLancamento(id);
  if (!atual) return null;
  const pick = (nova, atualVal) => (nova !== undefined ? nova : atualVal);
  const novo = {
    tipo: campos.tipo ?? atual.tipo,
    descricao: campos.descricao ?? atual.descricao,
    valor_cents: campos.valorCents ?? atual.valor_cents,
    due: campos.due ?? atual.due,
    emissao: pick(campos.emissao, atual.emissao),
    forma_pagto: campos.formaPagto ?? atual.forma_pagto,
    observacao: campos.observacao ?? atual.observacao,
    imposto_retido_cents: campos.impostoRetidoCents ?? atual.imposto_retido_cents,
    imposto_acrescido_cents: campos.impostoAcrescidoCents ?? atual.imposto_acrescido_cents,
    desconto_cents: campos.descontoCents ?? atual.desconto_cents,
    retencao_cents: campos.retencaoCents ?? atual.retencao_cents,
    multa_cents: campos.multaCents ?? atual.multa_cents,
    juros_cents: campos.jurosCents ?? atual.juros_cents,
    category_id: pick(campos.categoryId, atual.category_id),
    centro_custo_id: pick(campos.centroCustoId, atual.centro_custo_id),
    contato_id: pick(campos.contatoId, atual.contato_id),
    conta_id: pick(campos.contaId, atual.conta_id),
    doc: campos.doc ?? atual.doc,
    contraparte: campos.contraparte ?? atual.contraparte,
  };
  getDb()
    .prepare(
      `UPDATE financeiro_lancamentos
          SET tipo = ?, descricao = ?, valor_cents = ?, due = ?, emissao = ?, forma_pagto = ?, observacao = ?,
              imposto_retido_cents = ?, imposto_acrescido_cents = ?, desconto_cents = ?, retencao_cents = ?, multa_cents = ?, juros_cents = ?,
              category_id = ?, centro_custo_id = ?, contato_id = ?, conta_id = ?, doc = ?, contraparte = ?
        WHERE id = ?`
    )
    .run(
      novo.tipo, novo.descricao, novo.valor_cents, novo.due, novo.emissao, novo.forma_pagto, novo.observacao,
      novo.imposto_retido_cents, novo.imposto_acrescido_cents, novo.desconto_cents, novo.retencao_cents, novo.multa_cents, novo.juros_cents,
      novo.category_id, novo.centro_custo_id, novo.contato_id, novo.conta_id, novo.doc, novo.contraparte, id
    );
  return getLancamento(id);
}

// Baixa (marca pago) contra uma conta corrente. Idempotente: se já está pago, não
// reescreve o paid_at nem a conta - esta rota roda por clique e não pode
// "reagendar" o pagamento de algo já baixado. paidAt em data civil (default hoje);
// contaId opcional (de qual conta saiu/entrou) e é o que alimenta os saldos.
export function baixarLancamento(id, { paidAt, contaId } = {}) {
  const atual = getLancamento(id);
  if (!atual) return null;
  if (atual.status === "pago") return atual;
  getDb()
    .prepare("UPDATE financeiro_lancamentos SET status = 'pago', paid_at = ?, conta_id = COALESCE(?, conta_id) WHERE id = ?")
    .run(paidAt || hojeCivil(), contaId || null, id);
  return getLancamento(id);
}

// Estorna a baixa (volta a pendente). Simétrico do baixar, também idempotente.
export function estornarLancamento(id) {
  const atual = getLancamento(id);
  if (!atual) return null;
  if (atual.status !== "pago") return atual;
  getDb().prepare("UPDATE financeiro_lancamentos SET status = 'pendente', paid_at = NULL WHERE id = ?").run(id);
  return getLancamento(id);
}

export function deleteLancamento(id) {
  // Some com os títulos de imposto gerados a partir deste, para não deixar
  // recolhimento órfão apontando para um título que não existe mais.
  getDb().prepare("DELETE FROM financeiro_lancamentos WHERE titulo_origem_id = ?").run(id);
  getDb().prepare("DELETE FROM financeiro_lancamentos WHERE id = ?").run(id);
}

// ---------- Título de imposto vinculado ----------
// O filho de imposto (recolhimento) gerado a partir de um título principal.
export function getTituloImpostoDe(parentId) {
  return getDb()
    .prepare("SELECT * FROM financeiro_lancamentos WHERE titulo_origem_id = ? AND origem = 'imposto_retido'")
    .get(parentId) || null;
}
export function listVinculados(parentId) {
  return getDb().prepare("SELECT * FROM financeiro_lancamentos WHERE titulo_origem_id = ?").all(parentId);
}
function classeImpostoId() {
  // Usa a classe "Impostos e taxas" (código 4.08) do plano padrão, se existir.
  const c = getDb().prepare("SELECT id FROM financeiro_categorias WHERE codigo = '4.08' OR nome LIKE 'Impostos%' LIMIT 1").get();
  return c?.id || null;
}

// Garante que um título A PAGAR com imposto retido tenha um título de imposto
// vinculado (recolhimento) de mesmo valor. Regras:
//  - só gera para tipo 'pagar' com imposto_retido > 0 (no 'receber', o retido é
//    crédito, não obrigação - não gera nada);
//  - título já gerado (origem preenchida) nunca gera outro (sem recursão);
//  - o filho pago não é mais mexido (não corrompe um recolhimento já quitado).
// Devolve o título de imposto (novo, atualizado ou removido -> null).
export function sincronizarTituloImposto(parentId, createdBy) {
  const parent = getLancamento(parentId);
  if (!parent || parent.origem) return null;
  const gerar = parent.tipo === "pagar" && (parent.imposto_retido_cents || 0) > 0;
  const filho = getTituloImpostoDe(parentId);

  if (filho && filho.status === "pago") return filho; // não mexe em recolhimento pago

  if (gerar) {
    const descricao = `Imposto retido - título ${parent.numero}`;
    if (filho) {
      updateLancamento(filho.id, {
        valorCents: parent.imposto_retido_cents, due: parent.due, descricao,
        contatoId: parent.contato_id, centroCustoId: parent.centro_custo_id,
      });
      return getLancamento(filho.id);
    }
    return insertLancamento({
      tipo: "pagar", descricao, valorCents: parent.imposto_retido_cents, due: parent.due, emissao: parent.emissao,
      categoryId: classeImpostoId(), centroCustoId: parent.centro_custo_id, contatoId: parent.contato_id,
      tituloOrigemId: parentId, origem: "imposto_retido", createdBy,
    });
  }

  if (filho) deleteLancamento(filho.id); // retido zerou/virou receber: remove o pendente
  return null;
}

// ---------- Leituras para os cálculos (fluxo e DRE) ----------
// Tudo que toca o ano: vencimento OU baixa dentro dele. O fluxo precisa dos dois
// porque o realizado agrupa por paid_at e o previsto agrupa por due, e um
// lançamento pago num mês pode ter vencido em outro.
export function lancamentosDoAno(ano) {
  const like = `${ano}-%`;
  return getDb()
    .prepare("SELECT * FROM financeiro_lancamentos WHERE due LIKE ? OR paid_at LIKE ?")
    .all(like, like);
}

// Pagos com baixa dentro do período - a base do DRE em regime de caixa. Fora do
// período, ou ainda pendente, não entra no resultado realizado.
export function lancamentosPagosNoPeriodo(de, ate) {
  return getDb()
    .prepare("SELECT * FROM financeiro_lancamentos WHERE status = 'pago' AND paid_at >= ? AND paid_at <= ?")
    .all(de, ate);
}

// Movimento líquido por conta (só do que está pago e tem conta): receber soma,
// pagar subtrai. É a parte variável do saldo; o saldo_inicial da conta entra em
// cima disso no cálculo dos saldos (calculos.montarSaldos).
export function movimentoPorConta() {
  return getDb()
    .prepare(
      `SELECT conta_id,
              SUM(CASE WHEN tipo = 'receber' THEN ${LIQUIDO_SQL} ELSE -(${LIQUIDO_SQL}) END) AS mov
         FROM financeiro_lancamentos
        WHERE status = 'pago' AND conta_id IS NOT NULL
        GROUP BY conta_id`
    )
    .all();
}
