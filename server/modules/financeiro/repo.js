// Acesso ao banco do módulo Financeiro. Como o repo.js principal, tudo passa por
// getDb() (resolvido pelo AsyncLocalStorage do companyId) - logo, só funciona
// dentro de um runWithCompany, que o requireAuth já garante nas rotas.
import crypto from "node:crypto";
import { getDb } from "../../db.js";
import { uid } from "../../repo.js";
import { getCurrentCompanyId } from "../../context.js";
import * as centrosGlobais from "../../admin/centrosCustoStore.js";
import { normalizarTipoCategoria } from "./importCategorias.js";

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
  return getDb().prepare("SELECT * FROM financeiro_categorias ORDER BY ativo DESC, tipo, nome").all();
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
export function updateCategoria(id, c) {
  const a = getCategoria(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE financeiro_categorias SET nome = ?, tipo = ?, codigo = ?, ativo = ? WHERE id = ?")
    .run(c.nome ?? a.nome, c.tipo ?? a.tipo, c.codigo ?? a.codigo, c.ativo !== undefined ? (c.ativo ? 1 : 0) : a.ativo, id);
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
// A FONTE ÚNICA agora é a tabela GLOBAL `centros_custo` (banco do diretório),
// gerida no painel da plataforma - ver server/admin/centrosCustoStore.js. O
// Financeiro só LÊ daqui os centros da própria empresa; criar/editar é no painel.
// Formato mantido como as outras entidades do módulo (ativo 0/1), com tipo e nível
// junto, para o cliente indentar e filtrar analíticos.

// Migração preguiçosa: na primeira leitura de uma empresa que ainda não tem
// centros no global, importa os antigos por-empresa preservando os ids (os
// lançamentos continuam apontando certo). Roda aqui porque só o repo do módulo
// tem o getDb() da empresa para ler a tabela legada.
function garantirMigracaoCentros(companyId) {
  if (!companyId) return;
  let antigos = [];
  try {
    antigos = getDb().prepare("SELECT * FROM financeiro_centros_custo").all();
  } catch {
    // Tabela legada pode nem existir numa empresa nova - nada a migrar.
    return;
  }
  if (!antigos.length) return;
  // SEMPRE importa o legado antes de esvaziá-lo (importarLegado é idempotente:
  // INSERT OR IGNORE preserva os ids). O guard antigo "só importa se o global está
  // vazio" tinha um furo: uma empresa com um centro global criado antes (ex.: pelo
  // painel) pulava a importação, mas o DELETE abaixo apagava os legados que os
  // lançamentos referenciam pelo id - deixando-os órfãos. Esvaziar o legado depois
  // de importar é o que faz um "Excluir tudo" finalmente "pegar" (a leitura
  // seguinte acha o legado vazio e não re-importa nada).
  centrosGlobais.importarLegado(companyId, antigos);
  getDb().prepare("DELETE FROM financeiro_centros_custo").run();
}

function centroTenant(c) {
  if (!c) return null;
  return { id: c.id, nome: c.nome, codigo: c.codigo, tipo: c.tipo, nivel: c.nivel, ativo: c.ativo ? 1 : 0 };
}

export function listCentrosCusto() {
  const companyId = getCurrentCompanyId();
  garantirMigracaoCentros(companyId);
  return centrosGlobais.listarCentros(companyId).map(centroTenant);
}
export function getCentroCusto(id) {
  const companyId = getCurrentCompanyId();
  const row = centrosGlobais.acharCentro(id);
  // Isolamento: um centro de OUTRA empresa não existe para esta.
  if (!row || row.company_id !== companyId) return null;
  return centroTenant(centrosGlobais.publicCentro(row));
}

// CRUD do próprio cliente, sempre ESCOPADO à empresa do contexto (companyId do
// ALS): a empresa gerencia os SEUS centros: nunca os de outra. A visão
// cross-empresa continua sendo exclusiva do painel da plataforma. As regras
// (máscara, pai derivado, sintético/analítico, cascata) são as mesmas do store
// global - aqui só amarramos a empresa e devolvemos o formato do módulo.
export function criarCentroCusto({ codigo, nome }) {
  const companyId = getCurrentCompanyId();
  garantirMigracaoCentros(companyId); // pai pode ser um centro legado ainda não migrado
  return centroTenant(centrosGlobais.criarCentro({ companyId, codigo, nome }));
}
export function updateCentroCusto(id, { nome }) {
  const companyId = getCurrentCompanyId();
  const row = centrosGlobais.acharCentro(id);
  if (!row || row.company_id !== companyId) return null;
  return centroTenant(centrosGlobais.editarCentro(id, { nome }));
}
export function definirCentroAtivo(id, ativo) {
  const companyId = getCurrentCompanyId();
  const row = centrosGlobais.acharCentro(id);
  if (!row || row.company_id !== companyId) return null;
  return centroTenant(centrosGlobais.definirAtivo(id, ativo));
}

// Exclui um centro (e sua subárvore) da empresa do contexto. Antes de sumir com
// eles, ANULA a referência nos lançamentos que os usavam - o lançamento fica, só
// perde a apropriação de centro (nunca apagamos lançamento por causa de cadastro).
export function excluirCentroCusto(id) {
  const companyId = getCurrentCompanyId();
  garantirMigracaoCentros(companyId); // migra o legado antes de excluir (ver excluirTodosCentrosCusto)
  const ids = centrosGlobais.excluirCentro(companyId, id);
  if (!ids) return null; // inexistente ou de outra empresa
  if (ids.length) {
    const marcas = ids.map(() => "?").join(",");
    try {
      getDb().prepare(`UPDATE financeiro_lancamentos SET centro_custo_id = NULL WHERE centro_custo_id IN (${marcas})`).run(...ids);
    } catch {
      // A empresa pode nunca ter aberto o Financeiro (sem tabela de lançamentos):
      // não há referência a anular, segue.
    }
  }
  return { removidos: ids.length };
}

// Exclui TODOS os centros da empresa e anula o centro em todos os lançamentos dela
// (todos apontam para centros que estão sumindo).
export function excluirTodosCentrosCusto() {
  const companyId = getCurrentCompanyId();
  // Migra o legado ANTES de excluir: numa empresa não migrada, o global está vazio,
  // então excluir não removeria nada, mas o UPDATE abaixo já anularia os lançamentos
  // - e a leitura seguinte re-importaria os centros legados, ressuscitando-os com os
  // vínculos já perdidos. Migrando antes, a exclusão remove de verdade e o anular fica coerente.
  garantirMigracaoCentros(companyId);
  const ids = centrosGlobais.excluirTodosCentros(companyId);
  try {
    getDb().prepare("UPDATE financeiro_lancamentos SET centro_custo_id = NULL WHERE centro_custo_id IS NOT NULL").run();
  } catch {
    // Empresa sem Financeiro aberto: sem tabela de lançamentos, nada a anular.
  }
  return { removidos: ids.length };
}

// Import em lote (planilha). Ordena por PROFUNDIDADE do código para o pai nascer
// antes do filho, e é tolerante linha a linha: código duplicado conta como
// "ignorado" (permite reimportar sem quebrar), outros erros de regra viram "erro"
// com o motivo, sem abortar o resto. Devolve o resumo + o desfecho de cada linha.
export function importarCentros(linhas) {
  const companyId = getCurrentCompanyId();
  garantirMigracaoCentros(companyId);
  const ordenadas = [...linhas].sort(
    (a, b) =>
      String(a.codigo).split(".").length - String(b.codigo).split(".").length ||
      String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true })
  );
  let criados = 0, ignorados = 0, erros = 0;
  const resultados = [];
  for (const l of ordenadas) {
    try {
      centrosGlobais.criarCentro({ companyId, codigo: l.codigo, nome: l.nome });
      criados++;
      resultados.push({ row: l.row, codigo: l.codigo, status: "criado" });
    } catch (e) {
      if (e instanceof centrosGlobais.RegraError && e.code === "CC_CODIGO_DUPLICADO") {
        ignorados++;
        resultados.push({ row: l.row, codigo: l.codigo, status: "ignorado", code: e.code });
      } else if (e instanceof centrosGlobais.RegraError) {
        erros++;
        resultados.push({ row: l.row, codigo: l.codigo, status: "erro", code: e.code, motivo: e.message });
      } else {
        throw e;
      }
    }
  }
  return { criados, ignorados, erros, resultados };
}

// Import em lote de classes (planilha). Diferente do centro, classe não tem
// hierarquia obrigatória (o pai não precisa existir), então não reordena por
// profundidade. É tolerante linha a linha: código repetido - já existente no
// banco OU repetido dentro da própria planilha - conta como "ignorado" (permite
// reimportar sem duplicar), tipo em branco/desconhecido e descrição vazia viram
// "erro" com o motivo, sem abortar o resto. Devolve o resumo + o desfecho de
// cada linha, no mesmo formato do import de centros.
export function importarCategorias(linhas) {
  const db = getDb();
  // Códigos já existentes (não-vazios), para o dedup. Código vazio nunca dedupa:
  // classe sem código de plano de contas é válida e pode repetir.
  const existentes = new Set(
    db.prepare("SELECT codigo FROM financeiro_categorias WHERE codigo <> ''").all().map((r) => r.codigo)
  );
  const vistos = new Set(); // códigos já processados nesta planilha
  let criados = 0, ignorados = 0, erros = 0;
  const resultados = [];
  for (const l of linhas) {
    const codigo = String(l.codigo || "").trim();
    const nome = String(l.nome || "").trim();
    const tipo = normalizarTipoCategoria(l.tipo);
    if (codigo && (existentes.has(codigo) || vistos.has(codigo))) {
      ignorados++;
      resultados.push({ row: l.row, codigo, status: "ignorado", code: "FIN_CAT_DUPLICADO" });
      continue;
    }
    if (!nome) {
      erros++;
      resultados.push({ row: l.row, codigo, status: "erro", code: "FIN_CAT_NOME_REQUIRED", motivo: "Informe a descrição da classe" });
      continue;
    }
    if (!tipo) {
      erros++;
      resultados.push({ row: l.row, codigo, status: "erro", code: "FIN_CAT_TIPO_INVALID", motivo: "Tipo inválido (use receita ou despesa)" });
      continue;
    }
    insertCategoria({ nome, tipo, codigo });
    if (codigo) vistos.add(codigo);
    criados++;
    resultados.push({ row: l.row, codigo, status: "criado" });
  }
  return { criados, ignorados, erros, resultados };
}

// ---------- Contatos (clientes/fornecedores) ----------
export function listContatos() {
  return getDb().prepare("SELECT * FROM financeiro_contatos ORDER BY ativo DESC, nome").all();
}
export function getContato(id) {
  return getDb().prepare("SELECT * FROM financeiro_contatos WHERE id = ?").get(id) || null;
}
export function insertContato({ nome, tipo, doc, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, pais, pontoReferencia }) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO financeiro_contatos
         (id, nome, tipo, doc, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, pais, ponto_referencia, ativo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      id, nome, tipo || "fornecedor", doc || "", email || "", telefone || "",
      cep || "", logradouro || "", numero || "", complemento || "", bairro || "", cidade || "", uf || "",
      pais || "Brasil", pontoReferencia || "",
      new Date().toISOString()
    );
  return getContato(id);
}
export function updateContato(id, c) {
  const a = getContato(id);
  if (!a) return null;
  getDb()
    .prepare(
      `UPDATE financeiro_contatos SET nome = ?, tipo = ?, doc = ?, email = ?, telefone = ?,
         cep = ?, logradouro = ?, numero = ?, complemento = ?, bairro = ?, cidade = ?, uf = ?,
         pais = ?, ponto_referencia = ?, ativo = ?
       WHERE id = ?`
    )
    .run(
      c.nome ?? a.nome,
      c.tipo ?? a.tipo,
      c.doc ?? a.doc,
      c.email ?? a.email,
      c.telefone ?? a.telefone,
      c.cep ?? a.cep,
      c.logradouro ?? a.logradouro,
      c.numero ?? a.numero,
      c.complemento ?? a.complemento,
      c.bairro ?? a.bairro,
      c.cidade ?? a.cidade,
      c.uf ?? a.uf,
      c.pais ?? a.pais,
      c.pontoReferencia ?? a.ponto_referencia,
      c.ativo !== undefined ? (c.ativo ? 1 : 0) : a.ativo,
      id
    );
  return getContato(id);
}

// ---------- Impostos (alíquotas) ----------
export function listImpostos() {
  return getDb().prepare("SELECT * FROM financeiro_impostos ORDER BY ativo DESC, nome").all();
}
export function getImposto(id) {
  return getDb().prepare("SELECT * FROM financeiro_impostos WHERE id = ?").get(id) || null;
}
export function insertImposto({ nome, codigo, aliquotaCentesimos, tipo }) {
  const id = uid();
  getDb()
    .prepare("INSERT INTO financeiro_impostos (id, nome, codigo, aliquota_centesimos, tipo, ativo, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)")
    .run(id, nome, codigo || "", aliquotaCentesimos || 0, tipo, new Date().toISOString());
  return getImposto(id);
}
export function updateImposto(id, c) {
  const a = getImposto(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE financeiro_impostos SET nome = ?, codigo = ?, aliquota_centesimos = ?, tipo = ?, ativo = ? WHERE id = ?")
    .run(
      c.nome ?? a.nome, c.codigo ?? a.codigo, c.aliquotaCentesimos ?? a.aliquota_centesimos, c.tipo ?? a.tipo,
      c.ativo !== undefined ? (c.ativo ? 1 : 0) : a.ativo, id
    );
  return getImposto(id);
}

// ---------- Código de serviço (SPED) ----------
export function listCodigosServico() {
  return getDb().prepare("SELECT * FROM financeiro_codigos_servico ORDER BY ativo DESC, codigo").all();
}
export function getCodigoServico(id) {
  return getDb().prepare("SELECT * FROM financeiro_codigos_servico WHERE id = ?").get(id) || null;
}
export function insertCodigoServico({ codigo, descricao }) {
  const id = uid();
  getDb()
    .prepare("INSERT INTO financeiro_codigos_servico (id, codigo, descricao, ativo, created_at) VALUES (?, ?, ?, 1, ?)")
    .run(id, codigo, descricao, new Date().toISOString());
  return getCodigoServico(id);
}
export function updateCodigoServico(id, c) {
  const a = getCodigoServico(id);
  if (!a) return null;
  getDb()
    .prepare("UPDATE financeiro_codigos_servico SET codigo = ?, descricao = ?, ativo = ? WHERE id = ?")
    .run(c.codigo ?? a.codigo, c.descricao ?? a.descricao, c.ativo !== undefined ? (c.ativo ? 1 : 0) : a.ativo, id);
  return getCodigoServico(id);
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
  // apropriacao_count acompanha para a lista mostrar "Rateado (N)" sem uma segunda
  // consulta por linha - o título rateado não tem centro único, então é assim que
  // a coluna Centro sabe distinguir "sem centro" de "rateado". As colunas do WHERE
  // (tipo/status/due) só existem na tabela externa, então não precisam de alias.
  return getDb()
    .prepare(`SELECT financeiro_lancamentos.*,
                (SELECT COUNT(*) FROM financeiro_apropriacoes a WHERE a.lancamento_id = financeiro_lancamentos.id) AS apropriacao_count
              FROM financeiro_lancamentos ${where} ORDER BY due ASC, created_at ASC`)
    .all(...args);
}

export function insertLancamento({ tipo, descricao, valorCents, due, emissao, formaPagto, observacao, impostoRetidoCents, impostoAcrescidoCents, descontoCents, retencaoCents, multaCents, jurosCents, categoryId, centroCustoId, contatoId, contaId, doc, contraparte, tituloOrigemId, origem, parcelaNum, parcelaTotal, createdBy }) {
  const id = uid();
  // Próximo número de título da empresa. node:sqlite é síncrono e single-thread
  // no processo, então o MAX+1 não corre risco de corrida entre requisições.
  const numero = getDb().prepare("SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM financeiro_lancamentos").get().n;
  getDb()
    .prepare(
      `INSERT INTO financeiro_lancamentos
        (id, numero, tipo, descricao, valor_cents, due, emissao, forma_pagto, observacao,
         imposto_retido_cents, imposto_acrescido_cents, desconto_cents, retencao_cents, multa_cents, juros_cents,
         status, paid_at, category_id, centro_custo_id, contato_id, conta_id, doc, contraparte, titulo_origem_id, origem, parcela_num, parcela_total, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, numero, tipo, descricao || "", valorCents, due, emissao || null, formaPagto || "", observacao || "",
      impostoRetidoCents || 0, impostoAcrescidoCents || 0, descontoCents || 0, retencaoCents || 0, multaCents || 0, jurosCents || 0,
      categoryId || null, centroCustoId || null, contatoId || null, contaId || null, doc || "",
      contraparte || "", tituloOrigemId || null, origem || null, parcelaNum || null, parcelaTotal || null, new Date().toISOString(), createdBy || null
    );
  return getLancamento(id);
}

// Adiciona n meses a uma data civil YYYY-MM-DD, preservando o dia (grampeando ao
// último dia do mês quando o alvo é mais curto). Em horário local, coerente com o
// resto do módulo - nunca UTC.
export function addMesesCivil(civil, n) {
  const [y, m, d] = civil.split("-").map(Number);
  const alvo = new Date(y, m - 1 + n, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const dia = Math.min(d, ultimoDia);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Desdobra um título pendente em `parcelas` parcelas. O próprio título vira a
// parcela 1 (recebe o resto da divisão, para a soma fechar com o original); as
// 2..N nascem como títulos vinculados (origem='parcela'), com vencimento espaçado
// por `intervaloMeses`. A validação de elegibilidade fica na rota.
export function desdobrarLancamento(id, { parcelas, intervaloMeses = 1, primeiraData, createdBy }) {
  const parent = getLancamento(id);
  if (!parent) return null;
  const total = parent.valor_cents;
  const base = Math.floor(total / parcelas);
  const resto = total - base * parcelas;
  const primeiroVenc = primeiraData || parent.due;

  // Parcela 1 = o próprio título original.
  getDb()
    .prepare("UPDATE financeiro_lancamentos SET valor_cents = ?, due = ?, parcela_num = 1, parcela_total = ? WHERE id = ?")
    .run(base + resto, primeiroVenc, parcelas, id);

  // Parcelas 2..N.
  for (let i = 2; i <= parcelas; i++) {
    insertLancamento({
      tipo: parent.tipo,
      descricao: parent.descricao,
      valorCents: base,
      due: addMesesCivil(primeiroVenc, (i - 1) * intervaloMeses),
      emissao: parent.emissao,
      formaPagto: parent.forma_pagto,
      categoryId: parent.category_id,
      centroCustoId: parent.centro_custo_id,
      contatoId: parent.contato_id,
      doc: parent.doc,
      tituloOrigemId: id,
      origem: "parcela",
      parcelaNum: i,
      parcelaTotal: parcelas,
      createdBy,
    });
  }
  // Devolve todas as parcelas em ordem (a 1 é o próprio original).
  return getDb()
    .prepare("SELECT * FROM financeiro_lancamentos WHERE id = ? OR (titulo_origem_id = ? AND origem = 'parcela') ORDER BY parcela_num")
    .all(id, id);
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
    // Não vêm do body: são SEMPRE derivados dos impostos de fato aplicados
    // (recalcularImpostosDoTitulo), nunca digitados - senão o total divergiria
    // da lista de impostos que o título realmente tem.
    imposto_retido_cents: atual.imposto_retido_cents,
    imposto_acrescido_cents: atual.imposto_acrescido_cents,
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
  // Mudou o valor do título? Um rateio antigo não fecha mais a soma - limpa as
  // apropriações para não deixar rateio inconsistente. O cliente regrava o rateio
  // logo em seguida (salva o título e então manda as apropriações contra o novo
  // valor), então isto só descarta o que ficou órfão.
  if (novo.valor_cents !== atual.valor_cents) {
    getDb().prepare("DELETE FROM financeiro_apropriacoes WHERE lancamento_id = ?").run(id);
  }
  return getLancamento(id);
}

// Baixa (marca pago) contra uma conta corrente. Idempotente: se já está pago, não
// reescreve o paid_at nem a conta - esta rota roda por clique e não pode
// "reagendar" o pagamento de algo já baixado. paidAt em data civil (default hoje);
// contaId opcional (de qual conta saiu/entrou) e é o que alimenta os saldos.
export function baixarLancamento(id, { paidAt, contaId } = {}) {
  const atual = getLancamento(id);
  if (!atual) return null;
  // Já finalizado: idempotente, não reescreve. Anulado não se baixa - fica de
  // fora, e a rota já barra antes com mensagem própria.
  if (atual.status === "finalizado" || atual.status === "anulado") return atual;
  // Baixa é movimento novo: zera o rastro de estorno e o "conferido" antigo -
  // uma linha rebaixada precisa ser conferida de novo, e não é mais um estorno.
  getDb()
    .prepare("UPDATE financeiro_lancamentos SET status = 'finalizado', paid_at = ?, conta_id = COALESCE(?, conta_id), estornado_em = NULL, conferido = 0 WHERE id = ?")
    .run(paidAt || hojeCivil(), contaId || null, id);
  return getLancamento(id);
}

// Estorna a baixa (volta a pendente). Simétrico do baixar, também idempotente.
// Agora deixa RASTRO: grava estornado_em (a data do estorno) para o filtro
// "Estornados" da Movimentação reexibir o que foi desfeito, e zera conferido -
// movimento desfeito não conta no saldo conferido. Mantém conta_id de propósito:
// é como a tela sabe de que conta o estorno saiu.
export function estornarLancamento(id) {
  const atual = getLancamento(id);
  if (!atual) return null;
  if (atual.status !== "finalizado") return atual;
  getDb()
    .prepare("UPDATE financeiro_lancamentos SET status = 'pendente', paid_at = NULL, estornado_em = ?, conferido = 0 WHERE id = ?")
    .run(hojeCivil(), id);
  return getLancamento(id);
}

// Marca/desmarca a conferência bancária de um título. Só finalizado se confere -
// um título em aberto não é movimento de conta. Idempotente. Devolve a linha ou
// null quando não existe / não é finalizado (a rota traduz para o erro certo).
export function definirConferido(id, conferido) {
  const atual = getLancamento(id);
  if (!atual) return null;
  if (atual.status !== "finalizado") return null;
  getDb().prepare("UPDATE financeiro_lancamentos SET conferido = ? WHERE id = ?").run(conferido ? 1 : 0, id);
  return getLancamento(id);
}

// Movimentação de uma conta: os títulos FINALIZADOS apontando para ela (a fonte
// dos saldos do período). Ordenados pela data da baixa. calculos.montarMovimentacao
// filtra por período em JS, coerente com o resto do módulo.
export function finalizadosDaConta(contaId) {
  return getDb()
    .prepare("SELECT * FROM financeiro_lancamentos WHERE conta_id = ? AND status = 'finalizado' ORDER BY paid_at ASC, numero ASC")
    .all(contaId);
}

// Títulos que foram estornados nesta conta (têm rastro de estorno). Servem só ao
// filtro "Estornados" - não entram em nenhum saldo, porque não são realizados.
export function estornadosDaConta(contaId) {
  return getDb()
    .prepare("SELECT * FROM financeiro_lancamentos WHERE conta_id = ? AND estornado_em IS NOT NULL ORDER BY estornado_em ASC, numero ASC")
    .all(contaId);
}

// Muda a situação do título entre os estados de "aberto" (provisionado, pendente,
// disponivel) e o cancelamento (anulado). Finalizar NÃO passa por aqui - é a
// baixa (baixarLancamento), que move o dinheiro contra uma conta; voltar de
// finalizado é o estorno. A validação de quais transições valem fica na rota.
export function mudarStatusLancamento(id, status) {
  const atual = getLancamento(id);
  if (!atual) return null;
  // Anular tira o título de tudo: se ele estava estornado, limpa o rastro para não
  // continuar aparecendo no filtro "Estornados" da Movimentação como se fosse um
  // estorno vivo. Nos demais estados o rastro é mantido (ainda é um título aberto
  // que foi estornado).
  if (status === "anulado") {
    getDb().prepare("UPDATE financeiro_lancamentos SET status = ?, estornado_em = NULL WHERE id = ?").run(status, id);
  } else {
    getDb().prepare("UPDATE financeiro_lancamentos SET status = ? WHERE id = ?").run(status, id);
  }
  return getLancamento(id);
}

// Chave-base de uma linha de extrato: mesma conta + data + valor/tipo + documento/
// histórico = mesma movimentação. Reprocessar o mesmo PDF não duplica.
function chaveBaseExtrato(contaId, tx) {
  return [contaId, tx.dataMovimento, tx.valorCents, tx.tipo, tx.documento || "", tx.historico || ""].join("|");
}
// Hash de dedup. `ocorrencia` distingue linhas LEGÍTIMAS idênticas no mesmo
// extrato (duas tarifas de R$ 2,00 no mesmo dia, dois Pix iguais): sem isso a
// segunda colidia com a primeira e era descartada em silêncio. A ocorrência 0 NÃO
// leva sufixo de propósito - assim o hash de linha única fica idêntico ao formato
// antigo, e extratos já importados seguem sendo deduplicados na reimportação (e a
// 2ª linha antes perdida é recuperada, não duplicada, porque o hash #1 é novo).
function hashExtrato(contaId, tx, ocorrencia = 0) {
  const base = chaveBaseExtrato(contaId, tx);
  const chave = ocorrencia > 0 ? `${base}|#${ocorrencia}` : base;
  return crypto.createHash("sha1").update(chave).digest("hex");
}

// Importa linhas de extrato bancário como lançamentos JÁ FINALIZADOS na conta
// escolhida: crédito (C) vira 'receber', débito (D) vira 'pagar', datado pela
// movimentação (due=emissao=paid_at=dataMovimento). Assim a importação alimenta
// direto o caixa realizado e o saldo da conta (montarSaldos/lancamentosPagos).
// Idempotente: linha já importada (mesmo hash) é ignorada, não duplicada.
export function importarExtrato({ contaId, transacoes, createdBy }) {
  const db = getDb();
  const jaExiste = db.prepare("SELECT 1 FROM financeiro_lancamentos WHERE extrato_hash = ? LIMIT 1");
  const insere = db.prepare(
    `INSERT INTO financeiro_lancamentos
       (id, numero, tipo, descricao, valor_cents, due, emissao, forma_pagto, observacao,
        imposto_retido_cents, imposto_acrescido_cents, desconto_cents, retencao_cents, multa_cents, juros_cents,
        status, paid_at, category_id, centro_custo_id, contato_id, conta_id, doc, contraparte,
        titulo_origem_id, origem, parcela_num, parcela_total, created_at, created_by, extrato_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', '',
        0, 0, 0, 0, 0, 0,
        'finalizado', ?, NULL, NULL, NULL, ?, ?, '',
        NULL, 'extrato', NULL, NULL, ?, ?, ?)`
  );
  let importados = 0;
  let ignorados = 0;
  const criados = [];
  // Conta quantas linhas idênticas já vieram ANTES nesta importação, para dar a
  // ocorrência (0, 1, 2...) a cada uma - linhas legítimas repetidas no mesmo
  // extrato deixam de colidir. Reimportar o mesmo extrato repete as ocorrências,
  // então tudo continua sendo deduplicado.
  const contagem = new Map();
  for (const tx of transacoes) {
    const chave = chaveBaseExtrato(contaId, tx);
    const ocorrencia = contagem.get(chave) || 0;
    contagem.set(chave, ocorrencia + 1);
    const hash = hashExtrato(contaId, tx, ocorrencia);
    if (jaExiste.get(hash)) { ignorados++; continue; }
    const numero = db.prepare("SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM financeiro_lancamentos").get().n;
    const id = uid();
    const tipo = tx.tipo === "C" ? "receber" : "pagar";
    const agora = new Date().toISOString();
    insere.run(
      id, numero, tipo, tx.historico || "", tx.valorCents, tx.dataMovimento, tx.dataMovimento,
      tx.dataMovimento, contaId, tx.documento || "", agora, createdBy || null, hash
    );
    criados.push(id);
    importados++;
  }
  return { importados, ignorados, criados };
}

export function deleteLancamento(id) {
  const db = getDb();
  // Toda a DESCENDÊNCIA some junto, não só os filhos diretos: uma parcela (filha
  // de um desdobramento) pode ter gerado um recolhimento de imposto, que é NETO do
  // título original. Apagar só os filhos deixaria o neto órfão apontando para um
  // pai inexistente, e ele seguiria contando como obrigação viva em fluxo/DRE/saldo.
  const ids = [id];
  const fila = [id];
  const filhosDe = db.prepare("SELECT id FROM financeiro_lancamentos WHERE titulo_origem_id = ?");
  while (fila.length) {
    for (const r of filhosDe.all(fila.shift())) {
      if (!ids.includes(r.id)) { ids.push(r.id); fila.push(r.id); }
    }
  }
  const marcas = ids.map(() => "?").join(",");
  // ANTES dos títulos: apagar os impostos aplicados que os referenciam. A FK
  // financeiro_lancamento_impostos.lancamento_id é NOT NULL e as FKs estão ON, então
  // deletar o título com imposto aplicado sem limpar isto dá "constraint failed".
  db.prepare(`DELETE FROM financeiro_lancamento_impostos WHERE lancamento_id IN (${marcas})`).run(...ids);
  // Apropriações também referenciam o título (FK NOT NULL) - somem junto.
  db.prepare(`DELETE FROM financeiro_apropriacoes WHERE lancamento_id IN (${marcas})`).run(...ids);
  db.prepare(`DELETE FROM financeiro_lancamentos WHERE id IN (${marcas})`).run(...ids);
}

// ---------- Apropriação (rateio) por centro de custo ----------
// Divide o valor de um título entre vários centros. Sub-registros do lançamento,
// mesmo padrão dos impostos aplicados. A soma tem que FECHAR o valor do título; um
// título rateado tem centro_custo_id único NULL (o rateio manda).
export function listApropriacoes(lancamentoId) {
  return getDb().prepare("SELECT * FROM financeiro_apropriacoes WHERE lancamento_id = ? ORDER BY created_at").all(lancamentoId);
}

// Apropriações de vários títulos numa consulta só - o DRE precisa das de todos os
// títulos pagos do período e não pode fazer um SELECT por título (N+1).
export function apropriacoesDeVarios(ids) {
  if (!ids.length) return [];
  const marcas = ids.map(() => "?").join(",");
  return getDb().prepare(`SELECT * FROM financeiro_apropriacoes WHERE lancamento_id IN (${marcas})`).all(...ids);
}

// Erro de regra do rateio - a rota traduz o code. Fora da classe RegraError dos
// centros (aquela é do store global); aqui é validação do módulo.
export class ApropriacaoError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Substitui TODAS as apropriações do título pelas `itens` ({centroCustoId,
// valorCents}). itens vazio limpa o rateio (o título volta a poder ter centro
// único). Valida: só título aberto; cada centro analítico ativo da empresa; sem
// centro repetido; cada valor inteiro > 0; e a soma igual ao valor do título.
export function definirApropriacoes(lancamentoId, itens) {
  const db = getDb();
  const titulo = getLancamento(lancamentoId);
  if (!titulo) return null;
  if (titulo.status !== "provisionado" && titulo.status !== "pendente" && titulo.status !== "disponivel")
    throw new ApropriacaoError("FIN_APROP_TRAVADO", "Título baixado ou anulado não aceita rateio");

  const lista = Array.isArray(itens) ? itens : [];
  const vistos = new Set();
  let soma = 0;
  for (const it of lista) {
    const cc = it.centroCustoId ? getCentroCusto(it.centroCustoId) : null;
    if (!cc) throw new ApropriacaoError("FIN_CC_NOT_FOUND", "Centro de custo não encontrado");
    if (cc.tipo !== "analitico") throw new ApropriacaoError("FIN_CC_SINTETICO", "Centro sintético não recebe rateio; escolha um analítico");
    if (cc.ativo !== 1) throw new ApropriacaoError("FIN_CC_INATIVO", "Centro de custo inativo");
    if (vistos.has(cc.id)) throw new ApropriacaoError("FIN_APROP_DUPLICADO", "Centro repetido no rateio");
    vistos.add(cc.id);
    if (!Number.isInteger(it.valorCents) || it.valorCents <= 0)
      throw new ApropriacaoError("FIN_APROP_VALOR", "Valor de rateio inválido");
    // Classe por linha é opcional (o rateio do detalhe do título não usa); se vier,
    // precisa existir. O Lançamento Manual manda classe + centro em cada linha.
    if (it.categoryId && !getCategoria(it.categoryId))
      throw new ApropriacaoError("FIN_CATEGORY_NOT_FOUND", "Classe não encontrada");
    soma += it.valorCents;
  }
  if (lista.length && soma !== titulo.valor_cents)
    throw new ApropriacaoError("FIN_APROP_SOMA", "A soma do rateio precisa fechar o valor do título");

  // Troca atômica: limpa as antigas e grava as novas. node:sqlite não tem
  // db.transaction() do better-sqlite3 - uso BEGIN/COMMIT na mão.
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM financeiro_apropriacoes WHERE lancamento_id = ?").run(lancamentoId);
    const ins = db.prepare("INSERT INTO financeiro_apropriacoes (id, lancamento_id, centro_custo_id, category_id, valor_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    const agora = new Date().toISOString();
    for (const it of lista) ins.run(uid(), lancamentoId, it.centroCustoId, it.categoryId || null, it.valorCents, agora);
    // Título rateado não tem centro único; sem rateio, não mexo no centro atual.
    if (lista.length) db.prepare("UPDATE financeiro_lancamentos SET centro_custo_id = NULL WHERE id = ?").run(lancamentoId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { titulo: getLancamento(lancamentoId), apropriacoes: listApropriacoes(lancamentoId) };
}

// ---------- Impostos aplicados ao título ----------
// Cada linha é um imposto do cadastro (financeiro_impostos) aplicado a um
// título, com o valor já calculado pela alíquota. Substitui o mecanismo antigo
// de um único "imposto retido" digitado à mão: agora dá para aplicar vários
// impostos diferentes, cada um com o título de recolhimento próprio.
export function listImpostosAplicados(lancamentoId) {
  return getDb().prepare("SELECT * FROM financeiro_lancamento_impostos WHERE lancamento_id = ? ORDER BY created_at").all(lancamentoId);
}
export function getImpostoAplicado(id) {
  return getDb().prepare("SELECT * FROM financeiro_lancamento_impostos WHERE id = ?").get(id) || null;
}
export function listVinculados(parentId) {
  return getDb().prepare("SELECT * FROM financeiro_lancamentos WHERE titulo_origem_id = ?").all(parentId);
}
function classeImpostoId() {
  // Usa a classe "Impostos e taxas" (código 4.08) do plano padrão, se existir.
  const c = getDb().prepare("SELECT id FROM financeiro_categorias WHERE codigo = '4.08' OR nome LIKE 'Impostos%' LIMIT 1").get();
  return c?.id || null;
}

// Recalcula os totais do título a partir dos impostos de fato aplicados (nunca
// somados na mão) - é o que mantém imposto_retido_cents/imposto_acrescido_cents
// (usados por liquidoCents e pelos agregados em SQL) coerentes com a lista.
function recalcularImpostosDoTitulo(lancamentoId) {
  const linhas = listImpostosAplicados(lancamentoId);
  const retido = linhas.filter((l) => l.tipo === "retido").reduce((s, l) => s + l.valor_cents, 0);
  const acrescido = linhas.filter((l) => l.tipo === "acrescido").reduce((s, l) => s + l.valor_cents, 0);
  getDb()
    .prepare("UPDATE financeiro_lancamentos SET imposto_retido_cents = ?, imposto_acrescido_cents = ? WHERE id = ?")
    .run(retido, acrescido, lancamentoId);
}

// Aplica um imposto do cadastro a um título: calcula o valor (título × alíquota),
// grava a linha e, se for retido num título A PAGAR, gera o título de
// recolhimento vinculado (no 'receber' o retido é crédito, não obrigação - não
// gera nada, mesma regra de antes). A elegibilidade (pendente, não é ele mesmo
// um imposto gerado, imposto não repetido) é validada na rota.
export function aplicarImposto(lancamentoId, impostoId, createdBy) {
  const parent = getLancamento(lancamentoId);
  const imposto = getImposto(impostoId);
  if (!parent || !imposto) return null;

  const valorCents = Math.round((parent.valor_cents * imposto.aliquota_centesimos) / 10000);
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO financeiro_lancamento_impostos
        (id, lancamento_id, imposto_id, imposto_nome, tipo, aliquota_centesimos, valor_cents, titulo_gerado_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`
    )
    .run(id, lancamentoId, impostoId, imposto.nome, imposto.tipo, imposto.aliquota_centesimos, valorCents, new Date().toISOString());

  if (imposto.tipo === "retido" && parent.tipo === "pagar") {
    const gerado = insertLancamento({
      tipo: "pagar",
      descricao: `Recolhimento ${imposto.nome} - título ${parent.numero}`,
      valorCents,
      due: parent.due,
      emissao: parent.emissao,
      categoryId: classeImpostoId(),
      centroCustoId: parent.centro_custo_id,
      contatoId: parent.contato_id,
      tituloOrigemId: lancamentoId,
      origem: "imposto_aplicado",
      createdBy,
    });
    getDb().prepare("UPDATE financeiro_lancamento_impostos SET titulo_gerado_id = ? WHERE id = ?").run(gerado.id, id);
  }

  recalcularImpostosDoTitulo(lancamentoId);
  return { titulo: getLancamento(lancamentoId), aplicados: listImpostosAplicados(lancamentoId) };
}

// Remove um imposto aplicado e o título de recolhimento que ele gerou. A
// elegibilidade (recolhimento já pago não se desfaz) é validada na rota, que
// tem o título gerado em mãos antes de chamar isto.
export function removerImpostoAplicado(id) {
  const aplicado = getImpostoAplicado(id);
  if (!aplicado) return null;
  if (aplicado.titulo_gerado_id) deleteLancamento(aplicado.titulo_gerado_id);
  getDb().prepare("DELETE FROM financeiro_lancamento_impostos WHERE id = ?").run(id);
  recalcularImpostosDoTitulo(aplicado.lancamento_id);
  return { titulo: getLancamento(aplicado.lancamento_id), aplicados: listImpostosAplicados(aplicado.lancamento_id) };
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

// Finalizados com baixa dentro do período - a base do DRE em regime de caixa.
// Fora do período, ou ainda em aberto, não entra no resultado realizado.
export function lancamentosPagosNoPeriodo(de, ate) {
  return getDb()
    .prepare("SELECT * FROM financeiro_lancamentos WHERE status = 'finalizado' AND paid_at >= ? AND paid_at <= ?")
    .all(de, ate);
}

// Movimento líquido por conta (só do que está finalizado e tem conta): receber soma,
// pagar subtrai. É a parte variável do saldo; o saldo_inicial da conta entra em
// cima disso no cálculo dos saldos (calculos.montarSaldos).
export function movimentoPorConta() {
  return getDb()
    .prepare(
      `SELECT conta_id,
              SUM(CASE WHEN tipo = 'receber' THEN ${LIQUIDO_SQL} ELSE -(${LIQUIDO_SQL}) END) AS mov
         FROM financeiro_lancamentos
        WHERE status = 'finalizado' AND conta_id IS NOT NULL
        GROUP BY conta_id`
    )
    .all();
}
