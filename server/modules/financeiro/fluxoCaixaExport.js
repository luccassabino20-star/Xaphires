// CSV/PDF/Excel do Fluxo de Caixa em matriz (linha de grupo fixo x coluna de
// período) - forma distinta dos relatórios de coluna livre, então não reaproveita
// nenhum gerador genérico. Mesmas três regras de "abrir no Excel com dois
// cliques" do resto do projeto (separador ; , BOM UTF-8, CRLF) e a mesma
// neutralização de fórmula (descrição de lançamento é texto de usuário).
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

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

function localeIntl(idioma) {
  return idioma === "en" ? "en-US" : idioma === "es" ? "es-ES" : "pt-BR";
}
function moeda(cents, idioma) {
  return ((cents || 0) / 100).toLocaleString(localeIntl(idioma), { style: "currency", currency: "BRL" });
}
// "diario" já rotula o dia (DD); "mensal" formata a chave YYYY-MM como "ago/26" no
// idioma de quem exporta - mesmo raciocínio de nomesMeses em FluxoView.jsx, só que
// no servidor (o arquivo é gerado lá, sem acesso ao i18n do cliente).
function labelColuna(coluna, view, idioma) {
  if (view === "diario") return coluna.label;
  const [ano, mes] = coluna.key.split("-").map(Number);
  const fmt = new Intl.DateTimeFormat(localeIntl(idioma), { month: "short", year: "2-digit" });
  return fmt.format(new Date(ano, mes - 1, 1)).replace(".", "");
}

// Achata a matriz (seções + linhas de grupo + subtotais + resumo) numa lista
// única, na ordem de leitura do relatório - CSV, PDF e Excel iteram a MESMA
// lista, para não haver três lógicas de "que linha vem depois de qual" divergindo.
function linhasDaMatriz(matriz, t) {
  const porColuna = (mapa) => matriz.colunas.map((c) => mapa[c.key] || 0);
  const linhas = [{ tipo: "secao", label: t.secao.receitas }];
  for (const r of matriz.receitas) linhas.push({ tipo: "grupo", label: t.grupo[r.grupo], valores: porColuna(r.valores) });
  linhas.push({ tipo: "subtotal", label: t.totalReceitas, valores: porColuna(matriz.totalReceitas) });
  linhas.push({ tipo: "secao", label: t.secao.despesas });
  for (const r of matriz.despesas) linhas.push({ tipo: "grupo", label: t.grupo[r.grupo], valores: porColuna(r.valores) });
  linhas.push({ tipo: "subtotal", label: t.totalDespesas, valores: porColuna(matriz.totalDespesas) });
  linhas.push({ tipo: "secao", label: t.secao.transferencias });
  for (const r of matriz.transferencias) linhas.push({ tipo: "grupo", label: t.grupo[r.grupo], valores: porColuna(r.valores) });
  linhas.push({ tipo: "secao", label: t.secao.resumo });
  linhas.push({ tipo: "resumo", label: t.resumo.geracaoCaixa, valores: porColuna(matriz.resumo.geracaoCaixa) });
  linhas.push({ tipo: "resumo", label: t.resumo.saldoAnterior, valores: porColuna(matriz.resumo.saldoAnterior) });
  linhas.push({ tipo: "resumo", id: "saldoFinal", label: t.resumo.saldoFinal, valores: porColuna(matriz.resumo.saldoFinal) });
  return linhas;
}

export function gerarCsvFluxoCaixa({ matriz, idioma, t, contaNome }) {
  const cabecalho = [t.periodoColuna, ...matriz.colunas.map((c) => labelColuna(c, matriz.view, idioma))];
  const saida = [linha(cabecalho)];
  for (const l of linhasDaMatriz(matriz, t)) {
    saida.push(l.tipo === "secao" ? linha([l.label]) : linha([l.label, ...l.valores.map((v) => moeda(v, idioma))]));
  }
  saida.push("");
  saida.push(linha([t.titulo]));
  saida.push(linha([t.conta, contaNome || t.contaTodas]));
  saida.push(linha([t.geradoEm, new Date().toLocaleString(localeIntl(idioma))]));
  return Buffer.from(BOM + saida.join(EOL) + EOL, "utf8");
}

const COR = { tinta: "#111827", suave: "#6b7280", linha: "#e5e7eb", faixa: "#f9fafb", cabecalho: "#1f2937", branco: "#ffffff" };
const MARGEM = 36;
const ALTURA_LINHA = 18;

function truncar(doc, texto, largura) {
  const valor = String(texto ?? "");
  if (doc.widthOfString(valor) <= largura) return valor;
  let corte = valor;
  while (corte.length > 1 && doc.widthOfString(corte + "…") > largura) corte = corte.slice(0, -1);
  return corte + "…";
}

// PDF paisagem A4 com PAGINAÇÃO HORIZONTAL: a visão diária tem até 31 colunas de
// período, que não cabem lado a lado numa página impressa (diferente da tela, que
// rola). Cada "grupo" de colunas ganha sua própria sequência de páginas, com a
// mesma paginação VERTICAL de linhas quando a matriz não cabe numa página só.
export async function gerarPdfFluxoCaixa({ matriz, idioma, t, contaNome, empresa }) {
  const doc = new PDFDocument({ layout: "landscape", size: "A4", margin: MARGEM, bufferPages: true });
  const pedacos = [];
  const pronto = new Promise((resolve, reject) => {
    doc.on("data", (p) => pedacos.push(p));
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    doc.on("error", reject);
  });

  const larguraUtil = doc.page.width - MARGEM * 2;
  const larguraRotulo = 170;
  const LARGURA_MIN_COLUNA = 62;
  const colunasPorPagina = Math.max(1, Math.floor((larguraUtil - larguraRotulo) / LARGURA_MIN_COLUNA));
  const linhas = linhasDaMatriz(matriz, t);
  const grupos = [];
  for (let i = 0; i < matriz.colunas.length; i += colunasPorPagina) {
    grupos.push({ colunas: matriz.colunas.slice(i, i + colunasPorPagina), offset: i });
  }

  function cabecalhoPagina(periodoLabel) {
    doc.rect(MARGEM, MARGEM, larguraUtil, 44).fill(COR.cabecalho);
    doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(16).text(t.titulo, MARGEM + 14, MARGEM + 10);
    doc.font("Helvetica").fontSize(9).text([empresa, `${t.geradoEm}: ${new Date().toLocaleString()}`].filter(Boolean).join("   |   "), MARGEM + 14, MARGEM + 29);
    doc.fillColor(COR.suave).fontSize(9).text(`${t.conta}: ${contaNome || t.contaTodas}   |   ${periodoLabel}`, MARGEM, MARGEM + 52);
    return MARGEM + 70;
  }

  grupos.forEach((grupo, gi) => {
    if (gi > 0) doc.addPage();
    const larguraColuna = (larguraUtil - larguraRotulo) / grupo.colunas.length;
    const periodoLabel = `${labelColuna(grupo.colunas[0], matriz.view, idioma)} – ${labelColuna(grupo.colunas[grupo.colunas.length - 1], matriz.view, idioma)}`;

    function cabecalhoDaTabela(yy) {
      doc.rect(MARGEM, yy, larguraUtil, ALTURA_LINHA).fill(COR.cabecalho);
      doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(8.5);
      doc.text(t.periodoColuna, MARGEM + 6, yy + 5, { width: larguraRotulo - 10, lineBreak: false });
      let x = MARGEM + larguraRotulo;
      for (const c of grupo.colunas) {
        doc.text(labelColuna(c, matriz.view, idioma), x, yy + 5, { width: larguraColuna - 6, align: "right", lineBreak: false });
        x += larguraColuna;
      }
      return yy + ALTURA_LINHA;
    }

    let y = cabecalhoDaTabela(cabecalhoPagina(periodoLabel));
    linhas.forEach((l) => {
      if (y + ALTURA_LINHA > doc.page.height - MARGEM - 20) {
        doc.addPage();
        y = cabecalhoDaTabela(cabecalhoPagina(periodoLabel));
      }
      if (l.tipo === "secao") {
        doc.rect(MARGEM, y, larguraUtil, ALTURA_LINHA).fill(COR.faixa);
        doc.fillColor(COR.tinta).font("Helvetica-Bold").fontSize(8.5).text(l.label, MARGEM + 6, y + 5, { width: larguraUtil - 12, lineBreak: false });
      } else {
        const negrito = l.tipo === "subtotal" || l.tipo === "resumo";
        doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
        doc.fillColor(COR.tinta).text(truncar(doc, l.label, larguraRotulo - 12), MARGEM + 6, y + 5, { width: larguraRotulo - 12, lineBreak: false });
        const valores = l.valores.slice(grupo.offset, grupo.offset + grupo.colunas.length);
        let x = MARGEM + larguraRotulo;
        valores.forEach((v) => {
          doc.fillColor(COR.tinta).text(moeda(v, idioma), x, y + 5, { width: larguraColuna - 6, align: "right", lineBreak: false });
          x += larguraColuna;
        });
      }
      doc.moveTo(MARGEM, y + ALTURA_LINHA).lineTo(MARGEM + larguraUtil, y + ALTURA_LINHA).lineWidth(0.3).stroke(COR.linha);
      y += ALTURA_LINHA;
    });
  });

  const faixa = doc.bufferedPageRange();
  for (let i = 0; i < faixa.count; i++) {
    doc.switchToPage(faixa.start + i);
    doc.page.margins.bottom = 0;
    doc.fillColor(COR.suave).font("Helvetica").fontSize(8).text(`Xaphires      ${t.pagina} ${i + 1} ${t.de} ${faixa.count}`, MARGEM, doc.page.height - MARGEM - 6, { width: larguraUtil, align: "right", lineBreak: false });
  }

  doc.end();
  return pronto;
}

const TINTA_XLSX = { cabecalho: "FF1F2937", cabecalhoTexto: "FFFFFFFF", faixa: "FFF9FAFB", destaque: "FF111827", positivo: "FF15803D", negativo: "FFB91C1C" };

// Excel não tem o problema de paginação horizontal do PDF (a planilha rola), então
// vira uma tabela só, com o cabeçalho de coluna congelado (mesma técnica de
// server/reports/excel.js: views: [{state:'frozen'}]) - útil com 31 colunas na
// visão diária.
export async function gerarExcelFluxoCaixa({ matriz, idioma, t, contaNome, empresa }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Xaphires";
  wb.created = new Date();
  const aba = wb.addWorksheet(t.titulo.slice(0, 31), { pageSetup: { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 } });

  const tituloLinha = aba.addRow([t.titulo]);
  tituloLinha.font = { bold: true, size: 14, color: { argb: TINTA_XLSX.destaque } };
  if (empresa) aba.addRow([empresa]).font = { size: 10, color: { argb: "FF6B7280" } };
  aba.addRow([`${t.conta}: ${contaNome || t.contaTodas}`]).font = { size: 10, color: { argb: "FF6B7280" } };
  aba.addRow([]);

  const cabecalho = aba.addRow([t.periodoColuna, ...matriz.colunas.map((c) => labelColuna(c, matriz.view, idioma))]);
  cabecalho.eachCell((celula) => {
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA_XLSX.cabecalho } };
    celula.font = { bold: true, color: { argb: TINTA_XLSX.cabecalhoTexto }, size: 10 };
  });
  const primeiraLinhaTabela = aba.lastRow.number;
  aba.getColumn(1).width = 34;
  for (let i = 2; i <= matriz.colunas.length + 1; i++) aba.getColumn(i).width = 13;

  linhasDaMatriz(matriz, t).forEach((l, i) => {
    if (l.tipo === "secao") {
      const linhaSecao = aba.addRow([l.label]);
      linhaSecao.font = { bold: true, size: 10, color: { argb: TINTA_XLSX.destaque } };
      linhaSecao.eachCell((celula) => (celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA_XLSX.faixa } }));
      return;
    }
    const linhaXlsx = aba.addRow([l.label, ...l.valores.map((v) => v / 100)]);
    const negrito = l.tipo === "subtotal" || l.tipo === "resumo";
    linhaXlsx.eachCell((celula, col) => {
      const positivoOuNegativo = l.id === "saldoFinal" && col > 1 ? { argb: l.valores[col - 2] >= 0 ? TINTA_XLSX.positivo : TINTA_XLSX.negativo } : null;
      celula.font = positivoOuNegativo ? { bold: negrito, size: 10, color: positivoOuNegativo } : { bold: negrito, size: 10 };
      if (col > 1) celula.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    });
    if (!negrito && i % 2 === 1) linhaXlsx.eachCell((celula) => (celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA_XLSX.faixa } }));
  });

  aba.views = [{ state: "frozen", xSplit: 1, ySplit: primeiraLinhaTabela }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
