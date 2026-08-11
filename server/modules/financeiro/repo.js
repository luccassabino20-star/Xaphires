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
export function insertCategoria({ nome, tipo }) {
  const id = uid();
  getDb()
    .prepare("INSERT INTO financeiro_categorias (id, nome, tipo, created_at) VALUES (?, ?, ?, ?)")
    .run(id, nome, tipo, new Date().toISOString());
  return getCategoria(id);
}

// ---------- Lançamentos ----------
export function getLancamento(id) {
  return getDb().prepare("SELECT * FROM financeiro_lancamentos WHERE id = ?").get(id) || null;
}

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

export function insertLancamento({ tipo, descricao, valorCents, due, categoryId, contraparte, createdBy }) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO financeiro_lancamentos
        (id, tipo, descricao, valor_cents, due, status, paid_at, category_id, contraparte, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'pendente', NULL, ?, ?, ?, ?)`
    )
    .run(id, tipo, descricao || "", valorCents, due, categoryId || null, contraparte || "", new Date().toISOString(), createdBy || null);
  return getLancamento(id);
}

// Edição parcial: só sobrescreve o que veio. Não mexe em status/paid_at - baixar
// e estornar têm caminhos próprios, para a regra de idempotência ficar num lugar só.
export function updateLancamento(id, campos) {
  const atual = getLancamento(id);
  if (!atual) return null;
  const novo = {
    tipo: campos.tipo ?? atual.tipo,
    descricao: campos.descricao ?? atual.descricao,
    valor_cents: campos.valorCents ?? atual.valor_cents,
    due: campos.due ?? atual.due,
    category_id: campos.categoryId !== undefined ? campos.categoryId : atual.category_id,
    contraparte: campos.contraparte ?? atual.contraparte,
  };
  getDb()
    .prepare(
      `UPDATE financeiro_lancamentos
          SET tipo = ?, descricao = ?, valor_cents = ?, due = ?, category_id = ?, contraparte = ?
        WHERE id = ?`
    )
    .run(novo.tipo, novo.descricao, novo.valor_cents, novo.due, novo.category_id, novo.contraparte, id);
  return getLancamento(id);
}

// Baixa (marca pago). Idempotente: se já está pago, não reescreve o paid_at -
// esta rota roda por clique e não pode "reagendar" a data de pagamento de algo
// que já foi baixado. paidAt em data civil; default hoje.
export function baixarLancamento(id, paidAt) {
  const atual = getLancamento(id);
  if (!atual) return null;
  if (atual.status === "pago") return atual;
  getDb()
    .prepare("UPDATE financeiro_lancamentos SET status = 'pago', paid_at = ? WHERE id = ?")
    .run(paidAt || hojeCivil(), id);
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
  getDb().prepare("DELETE FROM financeiro_lancamentos WHERE id = ?").run(id);
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
