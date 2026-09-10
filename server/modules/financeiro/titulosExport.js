// CSV/PDF da lista de Títulos (contas a pagar e a receber). Mesmo molde de
// contatosExport.js/movimentacaoExport.js: BOM/SEP ";"/CRLF e neutralização de
// fórmula no CSV (descrição/documento são texto digitado por usuário), tabela
// paisagem no PDF. Fonte única dos números: montarExportTitulos() decide as
// linhas (inclusive "Vencido", que não é um status real - é aberto com
// vencimento no passado), CSV e PDF só desenham a mesma lista.
import PDFDocument from "pdfkit";
import { liquidoCents } from "./repo.js";

const BOM = "﻿";
const SEP = ";";
const EOL = "\r\n";
const GATILHO_DE_FORMULA = /^[=+\-@\t\r]/;
const ABERTOS = ["provisionado", "pendente", "disponivel"];

function celula(valor) {
  let texto = valor === null || valor === undefined ? "" : String(valor);
  if (GATILHO_DE_FORMULA.test(texto)) texto = `'${texto}`;
  if (texto.includes('"') || texto.includes(SEP) || texto.includes("\n") || texto.includes("\r")) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}
function linha(campos) {
  return campos.map(celula).join(SEP);
}
function moeda(cents, idioma) {
  const valor = (cents || 0) / 100;
  return new Intl.NumberFormat(idioma, { style: "currency", currency: "BRL" }).format(valor);
}
function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ROTULOS = {
  pt: {
    titulo: "Títulos", colNumero: "Nº", colDoc: "Documento", colContraparte: "Cliente/Fornecedor", colDescricao: "Descrição",
    colTipo: "Tipo", colVencimento: "Vencimento", colValor: "Valor", colStatus: "Situação",
    tipo: { receber: "A receber", pagar: "A pagar" },
    status: { provisionado: "Provisionado", pendente: "Pendente", disponivel: "Disponível", finalizado: "Pago", anulado: "Cancelado", vencido: "Vencido" },
    geradoEm: "Gerado em", vazio: "Nenhum título cadastrado",
  },
  en: {
    titulo: "Titles", colNumero: "No.", colDoc: "Document", colContraparte: "Customer/Supplier", colDescricao: "Description",
    colTipo: "Type", colVencimento: "Due date", colValor: "Amount", colStatus: "Status",
    tipo: { receber: "Receivable", pagar: "Payable" },
    status: { provisionado: "Forecast", pendente: "Pending", disponivel: "Available", finalizado: "Paid", anulado: "Canceled", vencido: "Overdue" },
    geradoEm: "Generated on", vazio: "No titles registered",
  },
  es: {
    titulo: "Títulos", colNumero: "Nº", colDoc: "Documento", colContraparte: "Cliente/Proveedor", colDescricao: "Descripción",
    colTipo: "Tipo", colVencimento: "Vencimiento", colValor: "Valor", colStatus: "Estado",
    tipo: { receber: "Por cobrar", pagar: "Por pagar" },
    status: { provisionado: "Previsto", pendente: "Pendiente", disponivel: "Disponible", finalizado: "Pagado", anulado: "Cancelado", vencido: "Vencido" },
    geradoEm: "Generado el", vazio: "Ningún título registrado",
  },
};

function rotulos(idioma) {
  return ROTULOS[idioma] || ROTULOS.pt;
}

// Uma linha por título já com os textos resolvidos e o líquido calculado -
// CSV e PDF iteram a mesma lista, para nunca discordar sobre o que é
// "Vencido" ou quanto vale o título.
export function montarExportTitulos(lancamentos, { contatoById = {} } = {}, idioma) {
  const t = rotulos(idioma);
  const hoje = hojeCivil();
  return lancamentos.map((l) => {
    const contato = contatoById[l.contato_id];
    const aberto = ABERTOS.includes(l.status);
    const vencido = aberto && l.due < hoje;
    return {
      numero: l.numero,
      doc: l.doc || "-",
      contraparte: contato?.nome || l.contraparte || "-",
      descricao: l.descricao || "-",
      tipo: t.tipo[l.tipo] || l.tipo,
      vencimento: l.due,
      valor: (l.tipo === "receber" ? "+ " : "- ") + moeda(liquidoCents(l), idioma),
      status: vencido ? t.status.vencido : (t.status[l.status] || l.status),
    };
  });
}

export function gerarTitulosCsv(linhas, idioma) {
  const t = rotulos(idioma);
  const saida = [linha([t.colNumero, t.colDoc, t.colContraparte, t.colDescricao, t.colTipo, t.colVencimento, t.colValor, t.colStatus])];
  if (!linhas.length) {
    saida.push(linha([t.vazio]));
  } else {
    for (const l of linhas) saida.push(linha([l.numero, l.doc, l.contraparte, l.descricao, l.tipo, l.vencimento, l.valor, l.status]));
  }
  saida.push("");
  saida.push(linha([t.geradoEm, new Date().toLocaleString(idioma === "en" ? "en-US" : idioma === "es" ? "es-ES" : "pt-BR")]));
  return Buffer.from(BOM + saida.join(EOL) + EOL, "utf8");
}

const COR = { tinta: "#111827", suave: "#6b7280", linha: "#e5e7eb", faixa: "#f9fafb", cabecalho: "#1f2937", branco: "#ffffff" };
const MARGEM = 36;
const ALTURA_LINHA = 20;
const COLUNAS = [
  { chave: "numero", peso: 0.7 },
  { chave: "doc", peso: 1 },
  { chave: "contraparte", peso: 1.7 },
  { chave: "descricao", peso: 1.8 },
  { chave: "tipo", peso: 0.9 },
  { chave: "vencimento", peso: 0.9 },
  { chave: "valor", peso: 1.1 },
  { chave: "status", peso: 0.9 },
];

function truncar(doc, texto, largura) {
  const valor = String(texto ?? "");
  if (doc.widthOfString(valor) <= largura) return valor;
  let corte = valor;
  while (corte.length > 1 && doc.widthOfString(corte + "…") > largura) corte = corte.slice(0, -1);
  return corte + "…";
}

export async function gerarTitulosPdf(linhas, idioma) {
  const t = rotulos(idioma);
  const doc = new PDFDocument({ layout: "landscape", size: "A4", margin: MARGEM, bufferPages: true });
  const pedacos = [];
  const pronto = new Promise((resolve, reject) => {
    doc.on("data", (p) => pedacos.push(p));
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    doc.on("error", reject);
  });

  const larguraUtil = doc.page.width - MARGEM * 2;
  const somaPesos = COLUNAS.reduce((s, c) => s + c.peso, 0);
  const larguras = COLUNAS.map((c) => (c.peso / somaPesos) * larguraUtil);
  const cabecalhos = [t.colNumero, t.colDoc, t.colContraparte, t.colDescricao, t.colTipo, t.colVencimento, t.colValor, t.colStatus];

  function cabecalhoPagina() {
    doc.rect(MARGEM, MARGEM, larguraUtil, 44).fill(COR.cabecalho);
    doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(16).text(t.titulo, MARGEM + 14, MARGEM + 10);
    doc.font("Helvetica").fontSize(9).text(`${t.geradoEm}: ${new Date().toLocaleString()}`, MARGEM + 14, MARGEM + 29);
    return MARGEM + 58;
  }
  function cabecalhoDaTabela(yy) {
    doc.rect(MARGEM, yy, larguraUtil, ALTURA_LINHA).fill(COR.cabecalho);
    doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(8.5);
    let x = MARGEM;
    cabecalhos.forEach((h, i) => {
      doc.text(h, x + 6, yy + 6, { width: larguras[i] - 10, lineBreak: false });
      x += larguras[i];
    });
    return yy + ALTURA_LINHA;
  }

  let y = cabecalhoDaTabela(cabecalhoPagina());
  if (!linhas.length) {
    doc.fillColor(COR.suave).font("Helvetica").fontSize(9).text(t.vazio, MARGEM + 6, y + 6);
  }
  linhas.forEach((l, i) => {
    if (y + ALTURA_LINHA > doc.page.height - MARGEM - 20) {
      doc.addPage();
      y = cabecalhoDaTabela(cabecalhoPagina());
    }
    if (i % 2 === 1) doc.rect(MARGEM, y, larguraUtil, ALTURA_LINHA).fill(COR.faixa);
    doc.font("Helvetica").fontSize(8.5);
    let x = MARGEM;
    COLUNAS.forEach((c) => {
      doc.fillColor(COR.tinta).text(truncar(doc, l[c.chave], (c.peso / somaPesos) * larguraUtil - 10), x + 6, y + 6, { width: (c.peso / somaPesos) * larguraUtil - 10, lineBreak: false });
      x += (c.peso / somaPesos) * larguraUtil;
    });
    doc.moveTo(MARGEM, y + ALTURA_LINHA).lineTo(MARGEM + larguraUtil, y + ALTURA_LINHA).lineWidth(0.3).stroke(COR.linha);
    y += ALTURA_LINHA;
  });

  const faixa = doc.bufferedPageRange();
  for (let i = 0; i < faixa.count; i++) {
    doc.switchToPage(faixa.start + i);
    doc.page.margins.bottom = 0;
    doc.fillColor(COR.suave).font("Helvetica").fontSize(8).text(`Xaphires`, MARGEM, doc.page.height - MARGEM - 6, { width: larguraUtil, align: "right", lineBreak: false });
  }

  doc.end();
  return pronto;
}
