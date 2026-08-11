import { Router } from "express";
import { requireAuth, requireWritablePlan, requireModule } from "../../middleware.js";
import { ah } from "../../asyncHandler.js";
import {
  listCategorias,
  insertCategoria,
  getCategoria,
  listLancamentos,
  getLancamento,
  insertLancamento,
  updateLancamento,
  baixarLancamento,
  estornarLancamento,
  deleteLancamento,
} from "./repo.js";
import { seedCategoriasSeVazio } from "./seed.js";
import { montarFluxo, montarDRE } from "./calculos.js";

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
    const { nome, tipo } = req.body || {};
    if (!nome?.trim()) return res.status(400).json({ error: "Informe o nome da categoria", code: "FIN_CATEGORY_NAME_REQUIRED" });
    if (tipo !== "receita" && tipo !== "despesa")
      return res.status(400).json({ error: "Tipo de categoria inválido", code: "FIN_CATEGORY_TIPO_INVALID" });
    res.status(201).json(insertCategoria({ nome: nome.trim(), tipo }));
  })
);

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
function validarLancamento(body, { parcial } = {}) {
  const { tipo, valorCents, due, categoryId } = body || {};
  if (!parcial || tipo !== undefined) {
    if (tipo !== "receber" && tipo !== "pagar") return { error: "Tipo inválido", code: "FIN_TIPO_INVALID" };
  }
  if (!parcial || valorCents !== undefined) {
    if (!valorCentsValido(valorCents)) return { error: "Valor inválido", code: "FIN_VALUE_INVALID" };
  }
  if (!parcial || due !== undefined) {
    if (!DATA_CIVIL.test(due || "")) return { error: "Data de vencimento inválida", code: "FIN_DATE_INVALID" };
  }
  // Categoria é opcional, mas se veio um id ele precisa existir - senão o DRE
  // agruparia por uma categoria fantasma.
  if (categoryId) {
    if (!getCategoria(categoryId)) return { error: "Categoria não encontrada", code: "FIN_CATEGORY_NOT_FOUND" };
  }
  return null;
}

router.post(
  "/lancamentos",
  ah(async (req, res) => {
    const erro = validarLancamento(req.body, { parcial: false });
    if (erro) return res.status(400).json(erro);
    const { tipo, descricao, valorCents, due, categoryId, contraparte } = req.body;
    const criado = insertLancamento({
      tipo,
      descricao,
      valorCents,
      due,
      categoryId,
      contraparte,
      createdBy: req.user.id,
    });
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
    res.json(updateLancamento(req.params.id, req.body));
  })
);

router.post(
  "/lancamentos/:id/baixar",
  ah(async (req, res) => {
    if (!getLancamento(req.params.id))
      return res.status(404).json({ error: "Lançamento não encontrado", code: "FIN_LANCAMENTO_NOT_FOUND" });
    const paidAt = DATA_CIVIL.test(req.body?.paidAt || "") ? req.body.paidAt : undefined;
    res.json(baixarLancamento(req.params.id, paidAt));
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
