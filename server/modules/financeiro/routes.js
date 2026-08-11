import { Router } from "express";
import { requireAuth, requireWritablePlan, requireModule } from "../../middleware.js";
import { ah } from "../../asyncHandler.js";
import {
  listCategorias,
  insertCategoria,
  getCategoria,
  listContas,
  getConta,
  insertConta,
  updateConta,
  listCentrosCusto,
  getCentroCusto,
  insertCentroCusto,
  updateCentroCusto,
  listContatos,
  getContato,
  insertContato,
  updateContato,
  listLancamentos,
  getLancamento,
  insertLancamento,
  updateLancamento,
  baixarLancamento,
  estornarLancamento,
  deleteLancamento,
  sincronizarTituloImposto,
} from "./repo.js";
import { seedCategoriasSeVazio } from "./seed.js";
import { montarFluxo, montarDRE, montarSaldos } from "./calculos.js";

const router = Router();
// requireAuth resolve o companyId/ALS; requireWritablePlan tira a escrita de quem
// venceu (GET continua liberado); requireModule barra quem não tem o Financeiro
// (empresa sem o módulo, ou usuário sem autorização). Rota nova aqui nasce com as
// três camadas, sem depender de lembrar.
router.use(requireAuth, requireWritablePlan, requireModule("financeiro"));

const DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;
const LOCALES = ["pt", "en", "es"];

function valorCentsValido(v) {
  return Number.isInteger(v) && v > 0;
}

// ---------- Categorias ----------
router.get(
  "/categorias",
  ah(async (req, res) => {
    // Semeia o conjunto padrão na primeira leitura (idempotente). O locale vem do
    // cliente porque a empresa não guarda idioma - mesmo padrão do quadro inicial.
    const locale = LOCALES.includes(req.query.locale) ? req.query.locale : "pt";
    seedCategoriasSeVazio(locale);
    res.json(listCategorias());
  })
);

router.post(
  "/categorias",
  ah(async (req, res) => {
    const { nome, tipo, codigo } = req.body || {};
    if (!nome?.trim()) return res.status(400).json({ error: "Informe o nome da classe", code: "FIN_CATEGORY_NAME_REQUIRED" });
    if (tipo !== "receita" && tipo !== "despesa")
      return res.status(400).json({ error: "Tipo de classe inválido", code: "FIN_CATEGORY_TIPO_INVALID" });
    res.status(201).json(insertCategoria({ nome: nome.trim(), tipo, codigo: (codigo || "").trim() }));
  })
);

// ---------- Contas correntes ----------
router.get("/contas", ah(async (req, res) => res.json(listContas())));
router.post(
  "/contas",
  ah(async (req, res) => {
    const { nome, banco, agencia, numero, saldoInicialCents } = req.body || {};
    if (!nome?.trim()) return res.status(400).json({ error: "Informe o nome da conta", code: "FIN_CONTA_NAME_REQUIRED" });
    if (saldoInicialCents !== undefined && !Number.isInteger(saldoInicialCents))
      return res.status(400).json({ error: "Saldo inicial inválido", code: "FIN_VALUE_INVALID" });
    res.status(201).json(insertConta({ nome: nome.trim(), banco, agencia, numero, saldoInicialCents }));
  })
);
router.patch(
  "/contas/:id",
  ah(async (req, res) => {
    if (!getConta(req.params.id)) return res.status(404).json({ error: "Conta não encontrada", code: "FIN_CONTA_NOT_FOUND" });
    res.json(updateConta(req.params.id, req.body || {}));
  })
);

// ---------- Centros de custo ----------
router.get("/centros-custo", ah(async (req, res) => res.json(listCentrosCusto())));
router.post(
  "/centros-custo",
  ah(async (req, res) => {
    const { nome, codigo } = req.body || {};
    if (!nome?.trim()) return res.status(400).json({ error: "Informe o nome do centro de custo", code: "FIN_CC_NAME_REQUIRED" });
    res.status(201).json(insertCentroCusto({ nome: nome.trim(), codigo: (codigo || "").trim() }));
  })
);
router.patch(
  "/centros-custo/:id",
  ah(async (req, res) => {
    if (!getCentroCusto(req.params.id)) return res.status(404).json({ error: "Centro de custo não encontrado", code: "FIN_CC_NOT_FOUND" });
    res.json(updateCentroCusto(req.params.id, req.body || {}));
  })
);

// ---------- Contatos (clientes/fornecedores) ----------
router.get("/contatos", ah(async (req, res) => res.json(listContatos())));
router.post(
  "/contatos",
  ah(async (req, res) => {
    const { nome, tipo, doc, email, telefone } = req.body || {};
    if (!nome?.trim()) return res.status(400).json({ error: "Informe o nome", code: "FIN_CONTATO_NAME_REQUIRED" });
    const t = ["cliente", "fornecedor", "ambos"].includes(tipo) ? tipo : "fornecedor";
    res.status(201).json(insertContato({ nome: nome.trim(), tipo: t, doc, email, telefone }));
  })
);
router.patch(
  "/contatos/:id",
  ah(async (req, res) => {
    if (!getContato(req.params.id)) return res.status(404).json({ error: "Contato não encontrado", code: "FIN_CONTATO_NOT_FOUND" });
    res.json(updateContato(req.params.id, req.body || {}));
  })
);

// ---------- Saldos por conta corrente ----------
router.get("/saldos", ah(async (req, res) => res.json(montarSaldos())));

// ---------- Lançamentos ----------
router.get(
  "/lancamentos",
  ah(async (req, res) => {
    const { tipo, status, de, ate } = req.query;
    res.json(
      listLancamentos({
        tipo: tipo === "receber" || tipo === "pagar" ? tipo : undefined,
        status: status === "pago" || status === "pendente" ? status : undefined,
        de: DATA_CIVIL.test(de || "") ? de : undefined,
        ate: DATA_CIVIL.test(ate || "") ? ate : undefined,
      })
    );
  })
);

// Valida o corpo de um lançamento novo/editado. Devolve { error, code } ou null.
// Referências opcionais (categoria, centro de custo, contato, conta) são
// checadas se vierem - um id fantasma quebraria os relatórios e os saldos.
function validarLancamento(body, { parcial } = {}) {
  const { tipo, valorCents, due, emissao, categoryId, centroCustoId, contatoId, contaId } = body || {};
  if (!parcial || tipo !== undefined) {
    if (tipo !== "receber" && tipo !== "pagar") return { error: "Tipo inválido", code: "FIN_TIPO_INVALID" };
  }
  if (!parcial || valorCents !== undefined) {
    if (!valorCentsValido(valorCents)) return { error: "Valor inválido", code: "FIN_VALUE_INVALID" };
  }
  if (!parcial || due !== undefined) {
    if (!DATA_CIVIL.test(due || "")) return { error: "Data de vencimento inválida", code: "FIN_DATE_INVALID" };
  }
  // Emissão é opcional; se vier, precisa ser data civil.
  if (emissao !== undefined && emissao !== null && emissao !== "" && !DATA_CIVIL.test(emissao))
    return { error: "Data de emissão inválida", code: "FIN_DATE_INVALID" };
  // Impostos/desconto/retenção/multa/juros: se vierem, inteiros >= 0 (0 é válido).
  for (const campo of ["impostoRetidoCents", "impostoAcrescidoCents", "descontoCents", "retencaoCents", "multaCents", "jurosCents"]) {
    const v = (body || {})[campo];
    if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 0))
      return { error: "Valor inválido", code: "FIN_VALUE_INVALID" };
  }
  if (categoryId && !getCategoria(categoryId)) return { error: "Classe não encontrada", code: "FIN_CATEGORY_NOT_FOUND" };
  if (centroCustoId && !getCentroCusto(centroCustoId)) return { error: "Centro de custo não encontrado", code: "FIN_CC_NOT_FOUND" };
  if (contatoId && !getContato(contatoId)) return { error: "Contato não encontrado", code: "FIN_CONTATO_NOT_FOUND" };
  if (contaId && !getConta(contaId)) return { error: "Conta não encontrada", code: "FIN_CONTA_NOT_FOUND" };
  return null;
}

router.post(
  "/lancamentos",
  ah(async (req, res) => {
    const erro = validarLancamento(req.body, { parcial: false });
    if (erro) return res.status(400).json(erro);
    const { tipo, descricao, valorCents, due, emissao, formaPagto, observacao, impostoRetidoCents, impostoAcrescidoCents, descontoCents, retencaoCents, multaCents, jurosCents, categoryId, centroCustoId, contatoId, contaId, doc, contraparte } = req.body;
    const criado = insertLancamento({
      tipo, descricao, valorCents, due, emissao, formaPagto, observacao,
      impostoRetidoCents, impostoAcrescidoCents, descontoCents, retencaoCents, multaCents, jurosCents,
      categoryId, centroCustoId, contatoId, contaId, doc, contraparte,
      createdBy: req.user.id,
    });
    // Gera o título de imposto vinculado, se for a pagar com imposto retido.
    sincronizarTituloImposto(criado.id, req.user.id);
    res.status(201).json(criado);
  })
);

router.patch(
  "/lancamentos/:id",
  ah(async (req, res) => {
    if (!getLancamento(req.params.id))
      return res.status(404).json({ error: "Lançamento não encontrado", code: "FIN_LANCAMENTO_NOT_FOUND" });
    const erro = validarLancamento(req.body, { parcial: true });
    if (erro) return res.status(400).json(erro);
    const atualizado = updateLancamento(req.params.id, req.body);
    // Reflete a mudança de imposto retido no título de imposto vinculado.
    sincronizarTituloImposto(req.params.id, req.user.id);
    res.json(atualizado);
  })
);

router.post(
  "/lancamentos/:id/baixar",
  ah(async (req, res) => {
    if (!getLancamento(req.params.id))
      return res.status(404).json({ error: "Lançamento não encontrado", code: "FIN_LANCAMENTO_NOT_FOUND" });
    const paidAt = DATA_CIVIL.test(req.body?.paidAt || "") ? req.body.paidAt : undefined;
    const contaId = req.body?.contaId;
    if (contaId && !getConta(contaId)) return res.status(400).json({ error: "Conta não encontrada", code: "FIN_CONTA_NOT_FOUND" });
    res.json(baixarLancamento(req.params.id, { paidAt, contaId }));
  })
);

router.post(
  "/lancamentos/:id/estornar",
  ah(async (req, res) => {
    if (!getLancamento(req.params.id))
      return res.status(404).json({ error: "Lançamento não encontrado", code: "FIN_LANCAMENTO_NOT_FOUND" });
    res.json(estornarLancamento(req.params.id));
  })
);

router.delete(
  "/lancamentos/:id",
  ah(async (req, res) => {
    if (!getLancamento(req.params.id))
      return res.status(404).json({ error: "Lançamento não encontrado", code: "FIN_LANCAMENTO_NOT_FOUND" });
    deleteLancamento(req.params.id);
    res.json({ ok: true });
  })
);

// ---------- Relatórios (calculados na leitura, fonte única em calculos.js) ----------
router.get(
  "/fluxo",
  ah(async (req, res) => {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    res.json(montarFluxo(ano));
  })
);

router.get(
  "/dre",
  ah(async (req, res) => {
    // Sem período informado, o ano corrente inteiro. Datas civis.
    const ano = new Date().getFullYear();
    const de = DATA_CIVIL.test(req.query.de || "") ? req.query.de : `${ano}-01-01`;
    const ate = DATA_CIVIL.test(req.query.ate || "") ? req.query.ate : `${ano}-12-31`;
    res.json(montarDRE(de, ate));
  })
);

export { router };
