import { Router } from "express";
import { requireAuth, hasBoardAccess } from "../middleware.js";
import { getBoardAccessInfo } from "../repo.js";
import { ah } from "../asyncHandler.js";
import { montarRelatorio, statusValido } from "../reports/dados.js";
import { gerarExcel } from "../reports/excel.js";
import { gerarPdf } from "../reports/pdf.js";
import { gerarCsv } from "../reports/csv.js";

const router = Router();
router.use(requireAuth);

const IDIOMAS = new Set(["pt", "en", "es"]);

// Escrito com \u e não com o caractere literal: a faixa de acentos combinantes é
// invisível no editor, e um salvamento em outra codificação a transforma em lixo.
const ACENTOS_RE = new RegExp("[\\u0300-\\u036f]", "g");

// Sem acento nem espaço no nome do arquivo: Content-Disposition com caractere fora
// do ASCII precisa da forma RFC 5987, e navegador antigo salva o nome cru como lixo.
function nomeDeArquivo(relatorio, extensao) {
  const pedaco = (texto) =>
    (texto || "")
      .normalize("NFD")
      .replace(ACENTOS_RE, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .toLowerCase();
  const partes = ["relatorio", pedaco(relatorio.membroEscolhido), relatorio.hoje].filter(Boolean);
  return `${partes.join("-")}.${extensao}`;
}

// "id1,id2,id3" -> ["id1","id2","id3"]; ausente ou vazio -> []. É o mesmo formato
// dos dois lados: o cliente já manda assim (ver filtrosDoRelatorio em api.js).
function idsDaQuery(valor) {
  if (!valor) return [];
  return String(valor)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// O acesso a cada quadro é conferido ANTES de montar qualquer coisa, e só quando
// vieram boardIds. Sem boardIds o relatório é do workspace inteiro, e aí quem
// filtra é o próprio getWorkspace, que já devolve apenas o que a pessoa pode ver.
// Com boardIds, um id que a pessoa não pode ver não pode simplesmente desaparecer
// do resultado sem avisar - getWorkspace já faria isso sozinho, mas silenciosamente,
// e quem pediu 3 quadros e recebeu 2 não tem como notar que um foi ignorado.
const conferirQuadros = ah(async (req, res, next) => {
  for (const id of idsDaQuery(req.query.boardIds)) {
    const acesso = await getBoardAccessInfo(id);
    if (!acesso || !hasBoardAccess(req.user, acesso)) {
      return res.status(403).json({ error: "Você não tem acesso a um dos quadros selecionados", code: "FORBIDDEN_BOARD_ACCESS" });
    }
  }
  next();
});

function comQuadroOpcional(handler) {
  return (req, res, next) => (req.query.boardIds ? conferirQuadros(req, res, () => handler(req, res, next)) : handler(req, res, next));
}

const TIPO_DO_FORMATO = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  // charset explícito no cabeçalho, além do BOM dentro do arquivo: o BOM resolve o
  // Excel, o charset resolve quem abrir o mesmo link direto no navegador.
  csv: "text/csv; charset=utf-8",
};

const gerar = ah(async (req, res) => {
  const formato = req.params.formato;
  if (!TIPO_DO_FORMATO[formato]) {
    return res.status(400).json({ error: "Formato não suportado", code: "REPORT_FORMAT_INVALID" });
  }
  const status = req.query.status || "todos";
  if (!statusValido(status)) {
    return res.status(400).json({ error: "Filtro de situação inválido", code: "REPORT_STATUS_INVALID" });
  }
  const idioma = IDIOMAS.has(req.query.lang) ? req.query.lang : "pt";

  const relatorio = await montarRelatorio({
    userId: req.user.id,
    companyId: req.companyId,
    boardIds: idsDaQuery(req.query.boardIds),
    memberId: req.query.memberId || null,
    status,
    idioma,
  });
  // montarRelatorio devolve null quando o memberId não existe nesta empresa. É 404 e
  // não 403 de propósito: o id não é de ninguém aqui dentro, e o banco da empresa é
  // o único lugar consultado - não há como pedir o relatório de outra empresa.
  if (!relatorio) return res.status(404).json({ error: "Usuário não encontrado", code: "USER_NOT_FOUND" });

  const arquivo =
    formato === "xlsx" ? await gerarExcel(relatorio) : formato === "csv" ? gerarCsv(relatorio) : await gerarPdf(relatorio);
  res.setHeader("Content-Type", TIPO_DO_FORMATO[formato]);
  res.setHeader("Content-Disposition", `attachment; filename="${nomeDeArquivo(relatorio, formato)}"`);
  res.setHeader("Content-Length", arquivo.length);
  res.send(arquivo);
});

// Contador do modal, que reage a cada mudança de filtro. Devolve o número que o
// arquivo trará, e não uma contagem própria: sai do MESMO montarRelatorio que gera
// o CSV e o PDF, então "12 cartões encontrados" e as 12 linhas da planilha não têm
// como divergir. Contar de novo aqui, por mais barato que parecesse, seria uma
// segunda definição de "cartão que conta" para alguém esquecer de atualizar depois.
const contar = ah(async (req, res) => {
  const status = req.query.status || "todos";
  if (!statusValido(status)) {
    return res.status(400).json({ error: "Filtro de situação inválido", code: "REPORT_STATUS_INVALID" });
  }
  const relatorio = await montarRelatorio({
    userId: req.user.id,
    companyId: req.companyId,
    boardIds: idsDaQuery(req.query.boardIds),
    memberId: req.query.memberId || null,
    status,
  });
  if (!relatorio) return res.status(404).json({ error: "Usuário não encontrado", code: "USER_NOT_FOUND" });
  res.json({ total: relatorio.kpis.total, concluidos: relatorio.kpis.concluidos, pendentes: relatorio.kpis.pendentes });
});

// Antes de "/:formato", senão o parâmetro engole "contagem" e o contador tenta
// gerar um arquivo de formato inexistente.
router.get("/contagem", comQuadroOpcional(contar));
router.get("/:formato", comQuadroOpcional(gerar));

export { router };
