import { Router } from "express";
import { requireAuth, requireWritablePlan, requireModule } from "../../middleware.js";
import { ah } from "../../asyncHandler.js";
import {
  listCategorias,
  insertCategoria,
  updateCategoria,
  getCategoria,
  listContas,
  getConta,
  insertConta,
  updateConta,
  listCentrosCusto,
  getCentroCusto,
  criarCentroCusto,
  updateCentroCusto,
  definirCentroAtivo,
  excluirCentroCusto,
  excluirTodosCentrosCusto,
  importarCentros,
  importarCategorias,
  listContatos,
  getContato,
  insertContato,
  updateContato,
  listImpostos,
  getImposto,
  insertImposto,
  updateImposto,
  listCodigosServico,
  getCodigoServico,
  insertCodigoServico,
  updateCodigoServico,
  listLancamentos,
  getLancamento,
  insertLancamento,
  updateLancamento,
  baixarLancamento,
  estornarLancamento,
  mudarStatusLancamento,
  deleteLancamento,
  desdobrarLancamento,
  aplicarImposto,
  removerImpostoAplicado,
  listImpostosAplicados,
  getImpostoAplicado,
  importarExtrato,
} from "./repo.js";
import { seedCategoriasSeVazio } from "./seed.js";
import { montarFluxo, montarDRE, montarSaldos } from "./calculos.js";
import { gerarExcelExtrato } from "./extrato/excelExtrato.js";
import { parseExtrato } from "./extrato/parseExtrato.js";
import { RegraError } from "../../admin/centrosCustoStore.js";
import { parseCentrosXlsx, modeloCentrosXlsx } from "./importCentros.js";
import { runWithCompany } from "../../context.js";
import Busboy from "busboy";
import { PDFParse } from "pdf-parse";

const router = Router();
// requireAuth resolve o companyId/ALS; requireWritablePlan tira a escrita de quem
// venceu (GET continua liberado); requireModule barra quem não tem o Financeiro
// (empresa sem o módulo, ou usuário sem autorização). Rota nova aqui nasce com as
// três camadas, sem depender de lembrar.
router.use(requireAuth, requireWritablePlan, requireModule("financeiro"));

const DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;
const LOCALES = ["pt", "en", "es"];
// Ciclo de situação do título. ABERTOS são os que ainda podem receber
// baixa/imposto/desdobramento; MANUAIS são os que a rota /status aceita definir à
// mão (finalizar é a baixa; sair de finalizado é o estorno - nunca por /status).
const STATUS_VALIDOS = ["provisionado", "pendente", "disponivel", "finalizado", "anulado"];
const STATUS_ABERTOS = ["provisionado", "pendente", "disponivel"];
const STATUS_MANUAIS = ["provisionado", "pendente", "disponivel", "anulado"];

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

// Modelo .xlsx das classes (Código, Descrição, Tipo). Antes do /:id para o
// Express não casar "modelo" como um id.
router.get("/categorias/modelo", ah(async (req, res) => {
  const buffer = await modeloCategoriasXlsx();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="modelo-classes.xlsx"');
  res.send(buffer);
}));

// Import em lote por planilha: sobe o .xlsx, lê as linhas (código + descrição +
// tipo) e cria as classes da empresa do contexto. Tolerante linha a linha (ver
// repo.importarCategorias).
router.post("/categorias/importar", (req, res) => {
  const bb = Busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  const partes = [];
  let grande = false, recebeu = false;
  bb.on("file", (_n, arquivo) => {
    recebeu = true;
    arquivo.on("data", (d) => partes.push(d));
    arquivo.on("limit", () => { grande = true; arquivo.resume(); });
  });
  bb.on("close", async () => {
    if (grande) return res.status(400).json({ error: "Arquivo muito grande", code: "FIN_CAT_XLSX_GRANDE" });
    if (!recebeu || !partes.length) return res.status(400).json({ error: "Envie uma planilha .xlsx", code: "FIN_CAT_XLSX_SEM_ARQUIVO" });
    const { linhas, erro } = await parseCategoriasXlsx(Buffer.concat(partes));
    if (erro) return res.status(400).json({ error: "Não foi possível ler esta planilha", code: "FIN_CAT_XLSX_ILEGIVEL" });
    if (!linhas.length) return res.status(400).json({ error: "A planilha não tem linhas para importar", code: "FIN_CAT_XLSX_VAZIO" });
    // O 'close' do busboy é assíncrono e escapa do ALS montado pelo requireAuth;
    // reentramos no contexto da empresa na mão (mesmo padrão do import de centros).
    res.status(201).json(runWithCompany(req.companyId, () => importarCategorias(linhas)));
  });
  bb.on("error", () => res.status(400).json({ error: "Falha ao ler o envio", code: "FIN_CAT_XLSX_ILEGIVEL" }));
  req.pipe(bb);
});

router.patch(
  "/categorias/:id",
  ah(async (req, res) => {
    if (!getCategoria(req.params.id)) return res.status(404).json({ error: "Classe não encontrada", code: "FIN_CATEGORY_NOT_FOUND" });
    const { tipo } = req.body || {};
    if (tipo !== undefined && tipo !== "receita" && tipo !== "despesa")
      return res.status(400).json({ error: "Tipo de classe inválido", code: "FIN_CATEGORY_TIPO_INVALID" });
    res.json(updateCategoria(req.params.id, req.body || {}));
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
// Hierárquicos e multiempresa: cada empresa gerencia os SEUS (escopo pelo
// companyId do contexto); a visão cross-empresa é só no painel da plataforma. A
// tabela é global (server/admin/centrosCustoStore.js), mas o cliente nunca toca
// centro de outra empresa. Regras (máscara, pai derivado, sintético/analítico,
// cascata) vêm do store, e o RegraError vira 400 com código estável.
router.get("/centros-custo", ah(async (req, res) => res.json(listCentrosCusto())));

router.post(
  "/centros-custo",
  ah(async (req, res) => {
    const { codigo, nome } = req.body || {};
    try {
      res.status(201).json(criarCentroCusto({ codigo, nome }));
    } catch (e) {
      if (e instanceof RegraError) return res.status(400).json({ error: e.message, code: e.code });
      throw e;
    }
  })
);

// PATCH cobre os dois: com `ativo` no corpo, ativa/desativa (cascata no store);
// senão, edita a descrição. Código não muda por aqui (define a hierarquia).
router.patch(
  "/centros-custo/:id",
  ah(async (req, res) => {
    const { nome, ativo } = req.body || {};
    try {
      const centro = ativo !== undefined
        ? definirCentroAtivo(req.params.id, !!ativo)
        : updateCentroCusto(req.params.id, { nome });
      if (!centro) return res.status(404).json({ error: "Centro de custo não encontrado", code: "CC_NOT_FOUND" });
      res.json(centro);
    } catch (e) {
      if (e instanceof RegraError) return res.status(400).json({ error: e.message, code: e.code });
      throw e;
    }
  })
);

// Exclui TODOS os centros da empresa (e anula o centro nos lançamentos dela).
// Coleção sem :id - vem antes das rotas com parâmetro para o Express não tentar
// casar "excluir tudo" como um id.
router.delete("/centros-custo", ah(async (req, res) => res.json(excluirTodosCentrosCusto())));

// Exclui um centro e sua subárvore (anula a referência nos lançamentos).
router.delete(
  "/centros-custo/:id",
  ah(async (req, res) => {
    const r = excluirCentroCusto(req.params.id);
    if (!r) return res.status(404).json({ error: "Centro de custo não encontrado", code: "CC_NOT_FOUND" });
    res.json(r);
  })
);

// Modelo .xlsx para o import (cabeçalho + exemplos).
router.get("/centros-custo/modelo", ah(async (req, res) => {
  const buffer = await modeloCentrosXlsx();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="modelo-centros-custo.xlsx"');
  res.send(buffer);
}));

// Import em lote por planilha: sobe o .xlsx, lê as linhas (código + descrição) e
// cria os centros da empresa do contexto, com as mesmas regras de hierarquia.
// Tolerante linha a linha (ver repo.importarCentros).
router.post("/centros-custo/importar", (req, res) => {
  const bb = Busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  const partes = [];
  let grande = false, recebeu = false;
  bb.on("file", (_n, arquivo) => {
    recebeu = true;
    arquivo.on("data", (d) => partes.push(d));
    arquivo.on("limit", () => { grande = true; arquivo.resume(); });
  });
  bb.on("close", async () => {
    if (grande) return res.status(400).json({ error: "Arquivo muito grande", code: "FIN_CC_XLSX_GRANDE" });
    if (!recebeu || !partes.length) return res.status(400).json({ error: "Envie uma planilha .xlsx", code: "FIN_CC_XLSX_SEM_ARQUIVO" });
    const { linhas, erro } = await parseCentrosXlsx(Buffer.concat(partes));
    if (erro) return res.status(400).json({ error: "Não foi possível ler esta planilha", code: "FIN_CC_XLSX_ILEGIVEL" });
    if (!linhas.length) return res.status(400).json({ error: "A planilha não tem linhas para importar", code: "FIN_CC_XLSX_VAZIO" });
    // O 'close' do busboy é assíncrono e escapa do ALS montado pelo requireAuth;
    // reentramos no contexto da empresa na mão (mesmo padrão do upload de anexo).
    res.status(201).json(runWithCompany(req.companyId, () => importarCentros(linhas)));
  });
  bb.on("error", () => res.status(400).json({ error: "Falha ao ler o envio", code: "FIN_CC_XLSX_ILEGIVEL" }));
  req.pipe(bb);
});

// ---------- Contatos (clientes/fornecedores) ----------
router.get("/contatos", ah(async (req, res) => res.json(listContatos())));
router.post(
  "/contatos",
  ah(async (req, res) => {
    const { nome, tipo, doc, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, pais, pontoReferencia } = req.body || {};
    if (!nome?.trim()) return res.status(400).json({ error: "Informe o nome", code: "FIN_CONTATO_NAME_REQUIRED" });
    const t = ["cliente", "fornecedor", "ambos"].includes(tipo) ? tipo : "fornecedor";
    res.status(201).json(insertContato({ nome: nome.trim(), tipo: t, doc, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, pais, pontoReferencia }));
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

// ---------- Impostos (alíquotas) ----------
router.get("/impostos", ah(async (req, res) => res.json(listImpostos())));
router.post(
  "/impostos",
  ah(async (req, res) => {
    const { nome, codigo, aliquotaCentesimos, tipo } = req.body || {};
    if (!nome?.trim()) return res.status(400).json({ error: "Informe o nome do imposto", code: "FIN_IMPOSTO_NAME_REQUIRED" });
    if (tipo !== "retido" && tipo !== "acrescido")
      return res.status(400).json({ error: "Tipo de imposto inválido", code: "FIN_IMPOSTO_TIPO_INVALID" });
    if (!Number.isInteger(aliquotaCentesimos) || aliquotaCentesimos < 0 || aliquotaCentesimos > 10000)
      return res.status(400).json({ error: "Alíquota inválida", code: "FIN_IMPOSTO_ALIQUOTA_INVALID" });
    res.status(201).json(insertImposto({ nome: nome.trim(), codigo: (codigo || "").trim(), aliquotaCentesimos, tipo }));
  })
);
router.patch(
  "/impostos/:id",
  ah(async (req, res) => {
    if (!getImposto(req.params.id)) return res.status(404).json({ error: "Imposto não encontrado", code: "FIN_IMPOSTO_NOT_FOUND" });
    res.json(updateImposto(req.params.id, req.body || {}));
  })
);

// ---------- Código de serviço (SPED) ----------
router.get("/codigos-servico", ah(async (req, res) => res.json(listCodigosServico())));
router.post(
  "/codigos-servico",
  ah(async (req, res) => {
    const { codigo, descricao } = req.body || {};
    if (!codigo?.trim()) return res.status(400).json({ error: "Informe o código", code: "FIN_SPED_CODIGO_REQUIRED" });
    if (!descricao?.trim()) return res.status(400).json({ error: "Informe a descrição", code: "FIN_SPED_DESC_REQUIRED" });
    res.status(201).json(insertCodigoServico({ codigo: codigo.trim(), descricao: descricao.trim() }));
  })
);
router.patch(
  "/codigos-servico/:id",
  ah(async (req, res) => {
    if (!getCodigoServico(req.params.id)) return res.status(404).json({ error: "Código de serviço não encontrado", code: "FIN_SPED_NOT_FOUND" });
    res.json(updateCodigoServico(req.params.id, req.body || {}));
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
        status: STATUS_VALIDOS.includes(status) ? status : undefined,
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
  // Desconto/retenção/multa/juros: se vierem, inteiros >= 0 (0 é válido).
  // impostoRetidoCents/impostoAcrescidoCents NÃO entram aqui de propósito: são
  // derivados dos impostos aplicados (ver /lancamentos/:id/impostos), nunca
  // aceitos direto no corpo - updateLancamento já os ignora, isto é só a
  // primeira barreira.
  for (const campo of ["descontoCents", "retencaoCents", "multaCents", "jurosCents"]) {
    const v = (body || {})[campo];
    if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 0))
      return { error: "Valor inválido", code: "FIN_VALUE_INVALID" };
  }
  if (categoryId && !getCategoria(categoryId)) return { error: "Classe não encontrada", code: "FIN_CATEGORY_NOT_FOUND" };
  if (centroCustoId) {
    const cc = getCentroCusto(centroCustoId);
    if (!cc) return { error: "Centro de custo não encontrado", code: "FIN_CC_NOT_FOUND" };
    // Só analítico ativo recebe lançamento - sintético é nó de agrupamento.
    if (cc.tipo !== "analitico") return { error: "Centro sintético não recebe lançamento; escolha um analítico", code: "FIN_CC_SINTETICO" };
    if (cc.ativo !== 1) return { error: "Centro de custo inativo", code: "FIN_CC_INATIVO" };
  }
  if (contatoId && !getContato(contatoId)) return { error: "Contato não encontrado", code: "FIN_CONTATO_NOT_FOUND" };
  if (contaId && !getConta(contaId)) return { error: "Conta não encontrada", code: "FIN_CONTA_NOT_FOUND" };
  return null;
}

router.post(
  "/lancamentos",
  ah(async (req, res) => {
    const erro = validarLancamento(req.body, { parcial: false });
    if (erro) return res.status(400).json(erro);
    const { tipo, descricao, valorCents, due, emissao, formaPagto, observacao, descontoCents, retencaoCents, multaCents, jurosCents, categoryId, centroCustoId, contatoId, contaId, doc, contraparte } = req.body;
    const criado = insertLancamento({
      tipo, descricao, valorCents, due, emissao, formaPagto, observacao,
      descontoCents, retencaoCents, multaCents, jurosCents,
      categoryId, centroCustoId, contatoId, contaId, doc, contraparte,
      createdBy: req.user.id,
    });
    res.status(201).json(criado);
  })
);

router.patch(
  "/lancamentos/:id",
  ah(async (req, res) => {
    const atual = getLancamento(req.params.id);
    if (!atual) return res.status(404).json({ error: "Lançamento não encontrado", code: "FIN_LANCAMENTO_NOT_FOUND" });
    const erro = validarLancamento(req.body, { parcial: true });
    if (erro) return res.status(400).json(erro);
    // Título com imposto aplicado não pode ter o valor mudado por baixo dos
    // impostos: eles foram calculados em cima do valor antigo, e mudar aqui sem
    // recalcular deixaria o total mentindo. Remova os impostos aplicados, edite
    // o valor, e reaplique.
    if (
      req.body?.valorCents !== undefined && req.body.valorCents !== atual.valor_cents &&
      ((atual.imposto_retido_cents || 0) > 0 || (atual.imposto_acrescido_cents || 0) > 0)
    ) {
      return res.status(400).json({ error: "Remova os impostos aplicados antes de mudar o valor do título", code: "FIN_VALOR_COM_IMPOSTOS" });
    }
    res.json(updateLancamento(req.params.id, req.body));
  })
);

// ---------- Impostos aplicados a um título ----------
router.get(
  "/lancamentos/:id/impostos",
  ah(async (req, res) => {
    if (!getLancamento(req.params.id))
      return res.status(404).json({ error: "Lançamento não encontrado", code: "FIN_LANCAMENTO_NOT_FOUND" });
    res.json(listImpostosAplicados(req.params.id));
  })
);

// Aplica um imposto do cadastro (financeiro_impostos) ao título: calcula o
// valor pela alíquota e, se for retido num título a pagar, gera o título de
// recolhimento vinculado. Só título pendente, que não seja ele mesmo um título
// de imposto gerado (sem recursão), e sem repetir o mesmo imposto duas vezes.
router.post(
  "/lancamentos/:id/impostos",
  ah(async (req, res) => {
    const l = getLancamento(req.params.id);
    if (!l) return res.status(404).json({ error: "Lançamento não encontrado", code: "FIN_LANCAMENTO_NOT_FOUND" });
    if (!STATUS_ABERTOS.includes(l.status)) return res.status(400).json({ error: "Só título em aberto pode receber imposto", code: "FIN_IMPOSTO_APLICADO_TITULO_PAGO" });
    if (l.origem === "imposto_aplicado") return res.status(400).json({ error: "Título de imposto não pode receber outro imposto", code: "FIN_IMPOSTO_APLICADO_INVALIDO" });
    const { impostoId } = req.body || {};
    const imposto = impostoId && getImposto(impostoId);
    if (!imposto) return res.status(400).json({ error: "Imposto não encontrado", code: "FIN_IMPOSTO_NOT_FOUND" });
    const jaAplicado = listImpostosAplicados(l.id).some((a) => a.imposto_id === impostoId);
    if (jaAplicado) return res.status(400).json({ error: "Este imposto já foi aplicado ao título", code: "FIN_IMPOSTO_JA_APLICADO" });
    res.status(201).json(aplicarImposto(l.id, impostoId, req.user.id));
  })
);

router.delete(
  "/lancamentos/:id/impostos/:aplicadoId",
  ah(async (req, res) => {
    const aplicado = getImpostoAplicado(req.params.aplicadoId);
    if (!aplicado || aplicado.lancamento_id !== req.params.id)
      return res.status(404).json({ error: "Imposto aplicado não encontrado", code: "FIN_IMPOSTO_APLICADO_NOT_FOUND" });
    if (aplicado.titulo_gerado_id) {
      const gerado = getLancamento(aplicado.titulo_gerado_id);
      if (gerado?.status === "finalizado")
        return res.status(400).json({ error: "O recolhimento deste imposto já foi pago - não pode ser desfeito", code: "FIN_IMPOSTO_APLICADO_PAGO" });
    }
    res.json(removerImpostoAplicado(req.params.aplicadoId));
  })
);

router.post(
  "/lancamentos/:id/baixar",
  ah(async (req, res) => {
    const alvo = getLancamento(req.params.id);
    if (!alvo)
      return res.status(404).json({ error: "Lançamento não encontrado", code: "FIN_LANCAMENTO_NOT_FOUND" });
    if (alvo.status === "anulado")
      return res.status(400).json({ error: "Título anulado não pode ser baixado", code: "FIN_STATUS_ANULADO" });
    const paidAt = DATA_CIVIL.test(req.body?.paidAt || "") ? req.body.paidAt : undefined;
    const contaId = req.body?.contaId;
    if (contaId && !getConta(contaId)) return res.status(400).json({ error: "Conta não encontrada", code: "FIN_CONTA_NOT_FOUND" });
    res.json(baixarLancamento(req.params.id, { paidAt, contaId }));
  })
);

// Desdobra um título em parcelas. Só título pendente, ainda não parcelado, que
// não seja ele mesmo uma parcela/imposto gerado, e sem impostos/desconto/encargos
// lançados (o rateio proporcional deles fica para depois).
router.post(
  "/lancamentos/:id/desdobrar",
  ah(async (req, res) => {
    const l = getLancamento(req.params.id);
    if (!l) return res.status(404).json({ error: "Lançamento não encontrado", code: "FIN_LANCAMENTO_NOT_FOUND" });
    if (!STATUS_ABERTOS.includes(l.status)) return res.status(400).json({ error: "Só título em aberto pode ser desdobrado", code: "FIN_PARCELA_PAGO" });
    if (l.origem) return res.status(400).json({ error: "Título gerado não pode ser desdobrado", code: "FIN_PARCELA_INVALIDO" });
    if (l.parcela_total) return res.status(400).json({ error: "Título já está parcelado", code: "FIN_PARCELA_JA" });
    const temEncargo = (l.imposto_retido_cents || l.imposto_acrescido_cents || l.desconto_cents || l.retencao_cents || l.multa_cents || l.juros_cents);
    if (temEncargo) return res.status(400).json({ error: "Zere impostos/desconto/encargos antes de desdobrar", code: "FIN_PARCELA_IMPOSTOS" });

    const parcelas = Number(req.body?.parcelas);
    if (!Number.isInteger(parcelas) || parcelas < 2 || parcelas > 120)
      return res.status(400).json({ error: "Número de parcelas inválido", code: "FIN_PARCELA_QTD" });
    const intervaloMeses = Number.isInteger(req.body?.intervaloMeses) && req.body.intervaloMeses >= 1 && req.body.intervaloMeses <= 12 ? req.body.intervaloMeses : 1;
    const primeiraData = DATA_CIVIL.test(req.body?.primeiraData || "") ? req.body.primeiraData : undefined;

    const lista = desdobrarLancamento(req.params.id, { parcelas, intervaloMeses, primeiraData, createdBy: req.user.id });
    res.status(201).json(lista);
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

// Muda a situação manualmente entre os estados de aberto (provisionado, pendente,
// disponivel) e o cancelamento (anulado). Finalizar é a baixa (/baixar) e sair de
// finalizado é o estorno (/estornar) - nenhum dos dois passa por aqui, para o
// dinheiro nunca mudar de mão sem passar por uma conta.
router.patch(
  "/lancamentos/:id/status",
  ah(async (req, res) => {
    const l = getLancamento(req.params.id);
    if (!l) return res.status(404).json({ error: "Lançamento não encontrado", code: "FIN_LANCAMENTO_NOT_FOUND" });
    const { status } = req.body || {};
    if (!STATUS_MANUAIS.includes(status))
      return res.status(400).json({ error: "Situação inválida", code: "FIN_STATUS_INVALID" });
    if (l.status === "finalizado")
      return res.status(400).json({ error: "Estorne a baixa antes de mudar a situação", code: "FIN_STATUS_FINALIZADO" });
    res.json(mudarStatusLancamento(req.params.id, status));
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

// ---------- Extrato bancário (import + Excel) ----------
// O PARSER do PDF é um passo à parte (calibrado com um extrato real); aqui as
// transações chegam já ESTRUTURADAS. Cada linha: { dataMovimento (YYYY-MM-DD),
// valorCents (inteiro > 0), tipo ('C'|'D'), historico?, documento?, dataBalancete?,
// hora?, agenciaOrigem?, lote?, saldoCents? }.
function validarTransacoes(body) {
  const transacoes = Array.isArray(body?.transacoes) ? body.transacoes : null;
  if (!transacoes || !transacoes.length) return { erro: { error: "Nenhuma transação para importar", code: "FIN_EXTRATO_VAZIO" } };
  for (const tx of transacoes) {
    if (!DATA_CIVIL.test(tx?.dataMovimento || "")) return { erro: { error: "Data de movimento inválida", code: "FIN_EXTRATO_DATA" } };
    if (!Number.isInteger(tx?.valorCents) || tx.valorCents <= 0) return { erro: { error: "Valor inválido", code: "FIN_EXTRATO_VALOR" } };
    if (tx?.tipo !== "C" && tx?.tipo !== "D") return { erro: { error: "Tipo deve ser C (crédito) ou D (débito)", code: "FIN_EXTRATO_TIPO" } };
  }
  return { transacoes };
}

// Upload do PDF -> extrai o texto (pdf-parse) -> parseia (parseExtrato, calibrado
// p/ Sicredi e Banestes) -> devolve o PREVIEW das transações, SEM importar. O
// arquivo fica só em memória (extrato é pequeno) e não toca o banco - por isso não
// precisa reentrar no contexto da empresa (ALS). Import é o passo seguinte, com o
// usuário confirmando a conta.
router.post("/extrato/preview", (req, res) => {
  const bb = Busboy({ headers: req.headers, limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
  const partes = [];
  let grande = false;
  let recebeu = false;
  bb.on("file", (_nome, arquivo) => {
    recebeu = true;
    arquivo.on("data", (d) => partes.push(d));
    arquivo.on("limit", () => { grande = true; arquivo.resume(); });
  });
  bb.on("close", async () => {
    if (grande) return res.status(400).json({ error: "Arquivo muito grande", code: "FIN_EXTRATO_GRANDE" });
    if (!recebeu || !partes.length) return res.status(400).json({ error: "Envie um arquivo PDF", code: "FIN_EXTRATO_SEM_ARQUIVO" });
    try {
      const { text } = await new PDFParse({ data: Buffer.concat(partes) }).getText();
      res.json(parseExtrato(text));
    } catch {
      res.status(400).json({ error: "Não foi possível ler este PDF", code: "FIN_EXTRATO_PDF_ILEGIVEL" });
    }
  });
  bb.on("error", () => res.status(400).json({ error: "Falha ao ler o envio", code: "FIN_EXTRATO_PDF_ILEGIVEL" }));
  req.pipe(bb);
});

router.post(
  "/extrato/importar",
  ah(async (req, res) => {
    const { contaId } = req.body || {};
    if (!contaId || !getConta(contaId)) return res.status(400).json({ error: "Conta não encontrada", code: "FIN_CONTA_NOT_FOUND" });
    const { transacoes, erro } = validarTransacoes(req.body);
    if (erro) return res.status(400).json(erro);
    res.status(201).json(importarExtrato({ contaId, transacoes, createdBy: req.user.id }));
  })
);

router.post(
  "/extrato/excel",
  ah(async (req, res) => {
    const { transacoes, erro } = validarTransacoes(req.body);
    if (erro) return res.status(400).json(erro);
    const buffer = await gerarExcelExtrato(transacoes);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="extrato.xlsx"');
    res.send(buffer);
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
