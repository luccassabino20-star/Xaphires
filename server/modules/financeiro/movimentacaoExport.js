// CSV/PDF do extrato de Movimentação. Mesmas três regras de "abrir no Excel com
// dois cliques" do resto do projeto (separador ; , BOM UTF-8, CRLF) e a mesma
// neutralização de fórmula do server/reports/csv.js - descrição/contraparte é
// texto digitado por usuário. Fonte única: montarExportMovimentacao() decide as
// linhas (incluindo o valor líquido, mesma fórmula de calculos.js), CSV e PDF só
// desenham.
import PDFDocument from "pdfkit";
import { liquidoCents } from "./repo.js";
import { dataHoraExibicaoSP, dataHoraLocaleSP } from "../../timezone.js";

const BOM = "﻿";
const SEP = ";";
const EOL = "\r\n";
const GATILHO_DE_FORMULA = /^[=+\-@\t\r]/;

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
  return ((cents || 0) / 100).toLocaleString(idioma === "en" ? "en-US" : idioma === "es" ? "es-ES" : "pt-BR", { style: "currency", currency: "BRL" });
}
function dataCivilBr(data, idioma) {
  if (!data) return "-";
  const [ano, mes, dia] = String(data).split("-");
  return idioma === "en" ? `${mes}/${dia}/${ano}` : `${dia}/${mes}/${ano}`;
}

const ROTULOS = {
  pt: {
    titulo: "Movimentação",
    colData: "Data", colNumero: "Nº", colDescricao: "Descrição", colContraparte: "Contraparte",
    colConta: "Conta", colTipo: "Tipo", colValor: "Valor", colConciliado: "Conciliado",
    entrada: "Entrada", saida: "Saída", sim: "Sim", nao: "Não",
    geradoEm: "Gerado em", vazio: "Nenhuma movimentação no período",
  },
  en: {
    titulo: "Transactions",
    colData: "Date", colNumero: "No.", colDescricao: "Description", colContraparte: "Counterparty",
    colConta: "Account", colTipo: "Type", colValor: "Amount", colConciliado: "Reconciled",
    entrada: "Inflow", saida: "Outflow", sim: "Yes", nao: "No",
    geradoEm: "Generated on", vazio: "No transactions in this period",
  },
  es: {
    titulo: "Movimiento",
    colData: "Fecha", colNumero: "Nº", colDescricao: "Descripción", colContraparte: "Contraparte",
    colConta: "Cuenta", colTipo: "Tipo", colValor: "Importe", colConciliado: "Conciliado",
    entrada: "Entrada", saida: "Salida", sim: "Sí", nao: "No",
    geradoEm: "Generado el", vazio: "Ningún movimiento en el período",
  },
};
function rotulos(idioma) {
  return ROTULOS[idioma] || ROTULOS.pt;
}

// Uma linha por movimento, já com os textos e o valor líquido resolvidos - CSV e
// PDF iteram a mesma lista.
export function montarExportMovimentacao(movimentos, idioma) {
  const t = rotulos(idioma);
  return movimentos.map((m) => ({
    data: dataCivilBr(m.data, idioma),
    numero: m.numero || "-",
    descricao: m.descricao || "-",
    contraparte: m.contraparte || "-",
    conta: m.contaNome || m.banco || "-",
    tipo: m.tipo === "receber" ? t.entrada : t.saida,
    valor: (m.tipo === "receber" ? "+ " : "- ") + moeda(liquidoCents(m), idioma),
    conciliado: m.conferido === 1 ? t.sim : t.nao,
  }));
}

export function gerarMovimentacaoCsv(linhas, idioma) {
  const t = rotulos(idioma);
  const saida = [linha([t.colData, t.colNumero, t.colDescricao, t.colContraparte, t.colConta, t.colTipo, t.colValor, t.colConciliado])];
  if (!linhas.length) {
    saida.push(linha([t.vazio]));
  } else {
    for (const l of linhas) saida.push(linha([l.data, l.numero, l.descricao, l.contraparte, l.conta, l.tipo, l.valor, l.conciliado]));
  }
  saida.push("");
  saida.push(linha([t.geradoEm, dataHoraLocaleSP(new Date(), idioma === "en" ? "en-US" : idioma === "es" ? "es-ES" : "pt-BR")]));
  return Buffer.from(BOM + saida.join(EOL) + EOL, "utf8");
}

const COR = { tinta: "#111827", suave: "#6b7280", linha: "#e5e7eb", faixa: "#f9fafb", cabecalho: "#1f2937", branco: "#ffffff" };
const MARGEM = 36;
const ALTURA_LINHA = 20;
const COLUNAS = [
  { chave: "data", peso: 0.9 },
  { chave: "numero", peso: 0.6 },
  { chave: "descricao", peso: 2 },
  { chave: "contraparte", peso: 1.4 },
  { chave: "conta", peso: 1.3 },
  { chave: "tipo", peso: 0.9 },
  { chave: "valor", peso: 1.1 },
  { chave: "conciliado", peso: 0.8 },
];

function truncar(doc, texto, largura) {
  const valor = String(texto ?? "");
  if (doc.widthOfString(valor) <= largura) return valor;
  let corte = valor;
  while (corte.length > 1 && doc.widthOfString(corte + "…") > largura) corte = corte.slice(0, -1);
  return corte + "…";
}

export async function gerarMovimentacaoPdf(linhas, idioma) {
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
  const cabecalhos = [t.colData, t.colNumero, t.colDescricao, t.colContraparte, t.colConta, t.colTipo, t.colValor, t.colConciliado];

  function cabecalhoPagina() {
    doc.rect(MARGEM, MARGEM, larguraUtil, 44).fill(COR.cabecalho);
    doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(16).text(t.titulo, MARGEM + 14, MARGEM + 10);
    doc.font("Helvetica").fontSize(9).text(`${t.geradoEm}: ${dataHoraExibicaoSP()}`, MARGEM + 14, MARGEM + 29);
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
