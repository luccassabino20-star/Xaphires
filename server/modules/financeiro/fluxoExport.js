// CSV/PDF do Fluxo de Caixa (aba "Fluxo de caixa" - visão mês a mês do ano,
// não confundir com a Matriz de Caixa, que já tem export próprio em
// fluxoCaixaExport.js sobre outra fonte, montarFluxoCaixaMatriz). Mesmo
// molde de titulosExport.js: BOM/SEP ";"/CRLF no CSV, tabela paisagem no
// PDF. Fonte única dos números: montarFluxo() em calculos.js decide as
// linhas, CSV e PDF só desenham.
import PDFDocument from "pdfkit";
import { dataHoraExibicaoSP, dataHoraLocaleSP } from "../../timezone.js";

const BOM = "﻿";
const SEP = ";";
const EOL = "\r\n";

function celula(valor) {
  const texto = valor === null || valor === undefined ? "" : String(valor);
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

const ROTULOS = {
  pt: {
    titulo: "Fluxo de Caixa", colMes: "Mês",
    colEntradasReal: "Entradas Realizadas", colSaidasReal: "Saídas Realizadas", colSaldoReal: "Saldo Realizado", colAcumulado: "Saldo Acumulado",
    colEntradasPrev: "Entradas Previstas", colSaidasPrev: "Saídas Previstas", colSaldoPrev: "Saldo Previsto",
    geradoEm: "Gerado em", vazio: "Nenhuma movimentação neste ano",
  },
  en: {
    titulo: "Cash Flow", colMes: "Month",
    colEntradasReal: "Actual Inflows", colSaidasReal: "Actual Outflows", colSaldoReal: "Actual Balance", colAcumulado: "Cumulative Balance",
    colEntradasPrev: "Projected Inflows", colSaidasPrev: "Projected Outflows", colSaldoPrev: "Projected Balance",
    geradoEm: "Generated on", vazio: "No activity this year",
  },
  es: {
    titulo: "Flujo de Caja", colMes: "Mes",
    colEntradasReal: "Entradas Realizadas", colSaidasReal: "Salidas Realizadas", colSaldoReal: "Saldo Realizado", colAcumulado: "Saldo Acumulado",
    colEntradasPrev: "Entradas Previstas", colSaidasPrev: "Salidas Previstas", colSaldoPrev: "Saldo Previsto",
    geradoEm: "Generado el", vazio: "Ningún movimiento este año",
  },
};
function rotulos(idioma) {
  return ROTULOS[idioma] || ROTULOS.pt;
}

const NOMES_MES = {
  pt: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
};
function nomeMes(mes, idioma) {
  return (NOMES_MES[idioma] || NOMES_MES.pt)[mes - 1];
}

// Uma linha por mês, já com os textos resolvidos - CSV e PDF iteram a mesma
// lista, mesmo padrão do resto do módulo.
export function montarExportFluxo(fluxo, idioma) {
  return fluxo.linhas.map((l) => ({
    mes: nomeMes(l.mes, idioma),
    entradasReal: moeda(l.entradasRealizadas, idioma),
    saidasReal: moeda(l.saidasRealizadas, idioma),
    saldoReal: moeda(l.saldoRealizado, idioma),
    acumulado: moeda(l.saldoAcumulado, idioma),
    entradasPrev: moeda(l.entradasPrevistas, idioma),
    saidasPrev: moeda(l.saidasPrevistas, idioma),
    saldoPrev: moeda(l.saldoPrevisto, idioma),
  }));
}

export function gerarFluxoCsv(linhas, idioma) {
  const t = rotulos(idioma);
  const saida = [linha([t.colMes, t.colEntradasReal, t.colSaidasReal, t.colSaldoReal, t.colAcumulado, t.colEntradasPrev, t.colSaidasPrev, t.colSaldoPrev])];
  if (!linhas.length) {
    saida.push(linha([t.vazio]));
  } else {
    for (const l of linhas) saida.push(linha([l.mes, l.entradasReal, l.saidasReal, l.saldoReal, l.acumulado, l.entradasPrev, l.saidasPrev, l.saldoPrev]));
  }
  saida.push("");
  saida.push(linha([t.geradoEm, dataHoraLocaleSP(new Date(), idioma === "en" ? "en-US" : idioma === "es" ? "es-ES" : "pt-BR")]));
  return Buffer.from(BOM + saida.join(EOL) + EOL, "utf8");
}

const COR = { tinta: "#111827", suave: "#6b7280", linha: "#e5e7eb", faixa: "#f9fafb", cabecalho: "#1f2937", branco: "#ffffff" };
const MARGEM = 36;
const ALTURA_LINHA = 20;
const COLUNAS = [
  { chave: "mes", peso: 0.7 },
  { chave: "entradasReal", peso: 1 },
  { chave: "saidasReal", peso: 1 },
  { chave: "saldoReal", peso: 1 },
  { chave: "acumulado", peso: 1 },
  { chave: "entradasPrev", peso: 1 },
  { chave: "saidasPrev", peso: 1 },
  { chave: "saldoPrev", peso: 1 },
];

function truncar(doc, texto, largura) {
  const valor = String(texto ?? "");
  if (doc.widthOfString(valor) <= largura) return valor;
  let corte = valor;
  while (corte.length > 1 && doc.widthOfString(corte + "…") > largura) corte = corte.slice(0, -1);
  return corte + "…";
}

export async function gerarFluxoPdf(linhas, ano, idioma) {
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
  const cabecalhos = [t.colMes, t.colEntradasReal, t.colSaidasReal, t.colSaldoReal, t.colAcumulado, t.colEntradasPrev, t.colSaidasPrev, t.colSaldoPrev];

  function cabecalhoPagina() {
    doc.rect(MARGEM, MARGEM, larguraUtil, 44).fill(COR.cabecalho);
    doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(16).text(`${t.titulo} - ${ano}`, MARGEM + 14, MARGEM + 10);
    doc.font("Helvetica").fontSize(9).text(`${t.geradoEm}: ${dataHoraExibicaoSP()}`, MARGEM + 14, MARGEM + 29);
    return MARGEM + 58;
  }
  function cabecalhoDaTabela(yy) {
    doc.rect(MARGEM, yy, larguraUtil, ALTURA_LINHA).fill(COR.cabecalho);
    doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(8);
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
    doc.font("Helvetica").fontSize(8);
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
