// CSV/PDF/Excel da DRE em cascata contábil. Mesmas três regras de "abrir no
// Excel com dois cliques" do resto do projeto (separador ; , BOM UTF-8, CRLF)
// e o mesmo par de bibliotecas já usado em fluxoCaixaExport.js (pdfkit +
// exceljs). montarLinhasDreCascata() é a fonte única da ORDEM e do que
// soma/subtrai - CSV, PDF e Excel iteram a mesma lista, e o cliente (tela)
// monta a árvore de novo a partir dos mesmos totais brutos, então os dois
// nunca podem discordar sobre o resultado final.
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
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
function localeIntl(idioma) {
  return idioma === "en" ? "en-US" : idioma === "es" ? "es-ES" : "pt-BR";
}
function moeda(cents, idioma) {
  return ((cents || 0) / 100).toLocaleString(localeIntl(idioma), { style: "currency", currency: "BRL" });
}
function pct(valor, base) {
  if (!base) return "0,0%";
  return `${((valor / base) * 100).toFixed(1)}%`;
}

const ROTULOS = {
  pt: {
    titulo: "DRE - Demonstração do Resultado do Exercício",
    colLinha: "Estrutura do DRE", colValor: "Valor (R$)", colAv: "AV %",
    receitaBruta: "(=) Receita Operacional Bruta", vendasProdutos: "(+) Vendas de Produtos / Mercadorias",
    prestacaoServicos: "(+) Prestação de Serviços", outrasReceitas: "(+) Outras Receitas Operacionais",
    deducoes: "(-) Deduções da Receita e Impostos", impostosVendas: "(-) Impostos sobre Vendas",
    receitaLiquida: "(=) Receita Operacional Líquida",
    cpv: "(-) Custos das Mercadorias e Serviços Prestados", custosDiretos: "(-) Custos Diretos / Insumos / Terceirizados",
    lucroBruto: "(=) Lucro Bruto (Margem Bruta)",
    despesasOperacionais: "(-) Despesas Operacionais", despesaPessoal: "(-) Despesas com Pessoal / Folha de Pagamento",
    despesaAdministrativa: "(-) Despesas Administrativas e Ocupação", despesaComercial: "(-) Despesas Comerciais e Marketing",
    despesaOutrasOperacionais: "(-) Outras Despesas Operacionais",
    ebitda: "(=) EBITDA / Resultado Antes dos Juros e Impostos",
    resultadoFinanceiro: "(+/-) Resultado Financeiro Líquido", receitasFinanceiras: "(+) Receitas Financeiras / Juros Recebidos",
    despesasFinanceiras: "(-) Despesas Financeiras / Tarifas Bancárias",
    lucroLiquido: "(=) Lucro / Prejuízo Líquido do Exercício",
    geradoEm: "Gerado em", periodo: "Período",
  },
  en: {
    titulo: "P&L - Income Statement",
    colLinha: "P&L Structure", colValor: "Amount (R$)", colAv: "% of Revenue",
    receitaBruta: "(=) Gross Operating Revenue", vendasProdutos: "(+) Product / Merchandise Sales",
    prestacaoServicos: "(+) Services Rendered", outrasReceitas: "(+) Other Operating Revenue",
    deducoes: "(-) Revenue Deductions and Taxes", impostosVendas: "(-) Sales Taxes",
    receitaLiquida: "(=) Net Operating Revenue",
    cpv: "(-) Cost of Goods / Services Sold", custosDiretos: "(-) Direct Costs / Supplies / Outsourcing",
    lucroBruto: "(=) Gross Profit (Gross Margin)",
    despesasOperacionais: "(-) Operating Expenses", despesaPessoal: "(-) Personnel / Payroll Expenses",
    despesaAdministrativa: "(-) Administrative and Occupancy Expenses", despesaComercial: "(-) Sales and Marketing Expenses",
    despesaOutrasOperacionais: "(-) Other Operating Expenses",
    ebitda: "(=) EBITDA",
    resultadoFinanceiro: "(+/-) Net Financial Result", receitasFinanceiras: "(+) Financial Income / Interest Received",
    despesasFinanceiras: "(-) Financial Expenses / Bank Fees",
    lucroLiquido: "(=) Net Income / Loss for the Period",
    geradoEm: "Generated on", periodo: "Period",
  },
  es: {
    titulo: "ERI - Estado de Resultados",
    colLinha: "Estructura del ERI", colValor: "Valor (R$)", colAv: "% Ingresos",
    receitaBruta: "(=) Ingresos Operacionales Brutos", vendasProdutos: "(+) Ventas de Productos / Mercancías",
    prestacaoServicos: "(+) Prestación de Servicios", outrasReceitas: "(+) Otros Ingresos Operacionales",
    deducoes: "(-) Deducciones de Ingresos e Impuestos", impostosVendas: "(-) Impuestos sobre Ventas",
    receitaLiquida: "(=) Ingresos Operacionales Netos",
    cpv: "(-) Costo de Mercancías y Servicios Prestados", custosDiretos: "(-) Costos Directos / Insumos / Tercerizados",
    lucroBruto: "(=) Utilidad Bruta (Margen Bruto)",
    despesasOperacionais: "(-) Gastos Operacionales", despesaPessoal: "(-) Gastos de Personal / Nómina",
    despesaAdministrativa: "(-) Gastos Administrativos y de Ocupación", despesaComercial: "(-) Gastos Comerciales y de Marketing",
    despesaOutrasOperacionais: "(-) Otros Gastos Operacionales",
    ebitda: "(=) EBITDA",
    resultadoFinanceiro: "(+/-) Resultado Financiero Neto", receitasFinanceiras: "(+) Ingresos Financieros / Intereses Recibidos",
    despesasFinanceiras: "(-) Gastos Financieros / Comisiones Bancarias",
    lucroLiquido: "(=) Utilidad / Pérdida Neta del Ejercicio",
    geradoEm: "Generado el", periodo: "Período",
  },
};
function rotulos(idioma) {
  return ROTULOS[idioma] || ROTULOS.pt;
}

// Monta a lista achatada, na ordem de leitura da cascata - fonte única de
// "o que soma/subtrai" pros 3 formatos de export. `totais` é o que
// calculos.montarDreCascata devolve (grupos brutos, sempre positivos).
export function montarLinhasDreCascata(totais, idioma) {
  const t = rotulos(idioma);
  const receitaBruta = totais.receitaProdutos + totais.receitaServicos + totais.receitaOutras;
  const receitaLiquida = receitaBruta - totais.impostosSobreVendas;
  const lucroBruto = receitaLiquida - totais.cpv;
  const despesasOperacionais = totais.despesaPessoal + totais.despesaAdministrativa + totais.despesaComercial + totais.despesaOutrasOperacionais;
  const ebitda = lucroBruto - despesasOperacionais;
  const resultadoFinanceiro = totais.receitaFinanceira - totais.despesaFinanceira;
  const lucroLiquido = ebitda + resultadoFinanceiro;

  const av = (v) => pct(v, receitaBruta);
  const L = (chave, valor, nivel, tipo) => ({ label: t[chave], valor, av: av(valor), nivel, tipo });

  return [
    L("receitaBruta", receitaBruta, 0, "subtotal"),
    L("vendasProdutos", totais.receitaProdutos, 1, "linha"),
    L("prestacaoServicos", totais.receitaServicos, 1, "linha"),
    L("outrasReceitas", totais.receitaOutras, 1, "linha"),
    L("deducoes", -totais.impostosSobreVendas, 0, "subtotal"),
    L("impostosVendas", -totais.impostosSobreVendas, 1, "linha"),
    L("receitaLiquida", receitaLiquida, 0, "subtotal"),
    L("cpv", -totais.cpv, 0, "subtotal"),
    L("custosDiretos", -totais.cpv, 1, "linha"),
    L("lucroBruto", lucroBruto, 0, "subtotal"),
    L("despesasOperacionais", -despesasOperacionais, 0, "subtotal"),
    L("despesaPessoal", -totais.despesaPessoal, 1, "linha"),
    L("despesaAdministrativa", -totais.despesaAdministrativa, 1, "linha"),
    L("despesaComercial", -totais.despesaComercial, 1, "linha"),
    L("despesaOutrasOperacionais", -totais.despesaOutrasOperacionais, 1, "linha"),
    L("ebitda", ebitda, 0, "subtotal"),
    L("resultadoFinanceiro", resultadoFinanceiro, 0, "subtotal"),
    L("receitasFinanceiras", totais.receitaFinanceira, 1, "linha"),
    L("despesasFinanceiras", -totais.despesaFinanceira, 1, "linha"),
    L("lucroLiquido", lucroLiquido, 0, "final"),
  ];
}

export function gerarDreCsv(linhas, de, ate, idioma) {
  const t = rotulos(idioma);
  const saida = [linha([t.colLinha, t.colValor, t.colAv])];
  for (const l of linhas) saida.push(linha([l.label, moeda(l.valor, idioma), l.av]));
  saida.push("");
  saida.push(linha([t.periodo, `${de} - ${ate}`]));
  saida.push(linha([t.geradoEm, dataHoraLocaleSP(new Date(), localeIntl(idioma))]));
  return Buffer.from(BOM + saida.join(EOL) + EOL, "utf8");
}

const COR = { tinta: "#111827", suave: "#6b7280", linha: "#e5e7eb", faixa: "#f9fafb", cabecalho: "#1f2937", branco: "#ffffff", final: "#0f172a" };
const MARGEM = 36;
const ALTURA_LINHA = 20;

function truncar(doc, texto, largura) {
  const valor = String(texto ?? "");
  if (doc.widthOfString(valor) <= largura) return valor;
  let corte = valor;
  while (corte.length > 1 && doc.widthOfString(corte + "…") > largura) corte = corte.slice(0, -1);
  return corte + "…";
}

export async function gerarDrePdf(linhas, de, ate, idioma) {
  const t = rotulos(idioma);
  const doc = new PDFDocument({ layout: "portrait", size: "A4", margin: MARGEM, bufferPages: true });
  const pedacos = [];
  const pronto = new Promise((resolve, reject) => {
    doc.on("data", (p) => pedacos.push(p));
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    doc.on("error", reject);
  });

  const larguraUtil = doc.page.width - MARGEM * 2;
  const larguraValor = 110, larguraAv = 70;
  const larguraLabel = larguraUtil - larguraValor - larguraAv;

  function cabecalhoPagina() {
    doc.rect(MARGEM, MARGEM, larguraUtil, 44).fill(COR.cabecalho);
    doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(15).text(t.titulo, MARGEM + 14, MARGEM + 10);
    doc.font("Helvetica").fontSize(9).text(`${t.periodo}: ${de} - ${ate}   |   ${t.geradoEm}: ${dataHoraExibicaoSP()}`, MARGEM + 14, MARGEM + 29);
    return MARGEM + 58;
  }
  function cabecalhoDaTabela(yy) {
    doc.rect(MARGEM, yy, larguraUtil, ALTURA_LINHA).fill(COR.cabecalho);
    doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(8.5);
    doc.text(t.colLinha, MARGEM + 6, yy + 6, { width: larguraLabel - 10, lineBreak: false });
    doc.text(t.colValor, MARGEM + larguraLabel, yy + 6, { width: larguraValor - 10, align: "right", lineBreak: false });
    doc.text(t.colAv, MARGEM + larguraLabel + larguraValor, yy + 6, { width: larguraAv - 10, align: "right", lineBreak: false });
    return yy + ALTURA_LINHA;
  }

  let y = cabecalhoDaTabela(cabecalhoPagina());
  linhas.forEach((l) => {
    if (y + ALTURA_LINHA > doc.page.height - MARGEM - 20) {
      doc.addPage();
      y = cabecalhoDaTabela(cabecalhoPagina());
    }
    const ehFinal = l.tipo === "final";
    const ehSubtotal = l.tipo === "subtotal";
    if (ehFinal) doc.rect(MARGEM, y, larguraUtil, ALTURA_LINHA).fill(COR.final);
    else if (ehSubtotal) doc.rect(MARGEM, y, larguraUtil, ALTURA_LINHA).fill(COR.faixa);
    const corTexto = ehFinal ? COR.branco : COR.tinta;
    doc.font(ehSubtotal || ehFinal ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
    const indent = l.nivel === 1 ? 14 : 0;
    doc.fillColor(corTexto).text(truncar(doc, l.label, larguraLabel - 10 - indent), MARGEM + 6 + indent, y + 6, { width: larguraLabel - 10 - indent, lineBreak: false });
    doc.fillColor(corTexto).text(moeda(l.valor, idioma), MARGEM + larguraLabel, y + 6, { width: larguraValor - 10, align: "right", lineBreak: false });
    doc.fillColor(corTexto).text(l.av, MARGEM + larguraLabel + larguraValor, y + 6, { width: larguraAv - 10, align: "right", lineBreak: false });
    doc.moveTo(MARGEM, y + ALTURA_LINHA).lineTo(MARGEM + larguraUtil, y + ALTURA_LINHA).lineWidth(0.3).stroke(COR.linha);
    y += ALTURA_LINHA;
  });

  const faixa = doc.bufferedPageRange();
  for (let i = 0; i < faixa.count; i++) {
    doc.switchToPage(faixa.start + i);
    doc.page.margins.bottom = 0;
    doc.fillColor(COR.suave).font("Helvetica").fontSize(8).text("Xaphires", MARGEM, doc.page.height - MARGEM - 6, { width: larguraUtil, align: "right", lineBreak: false });
  }

  doc.end();
  return pronto;
}

const TINTA_XLSX = { cabecalho: "FF1F2937", cabecalhoTexto: "FFFFFFFF", faixa: "FFF9FAFB", final: "FF0F172A", finalTexto: "FFFFFFFF" };

export async function gerarDreExcel(linhas, de, ate, idioma) {
  const t = rotulos(idioma);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Xaphires";
  wb.created = new Date();
  const aba = wb.addWorksheet(t.titulo.slice(0, 31), { pageSetup: { orientation: "portrait", fitToWidth: 1, fitToHeight: 0 } });

  aba.addRow([t.titulo]).font = { bold: true, size: 14 };
  aba.addRow([`${t.periodo}: ${de} - ${ate}`]).font = { size: 10, color: { argb: "FF6B7280" } };
  aba.addRow([]);

  const cabecalho = aba.addRow([t.colLinha, t.colValor, t.colAv]);
  cabecalho.eachCell((celula) => {
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA_XLSX.cabecalho } };
    celula.font = { bold: true, color: { argb: TINTA_XLSX.cabecalhoTexto }, size: 10 };
  });
  const primeiraLinhaTabela = aba.lastRow.number;
  aba.getColumn(1).width = 48;
  aba.getColumn(2).width = 18;
  aba.getColumn(3).width = 12;

  linhas.forEach((l) => {
    const ehFinal = l.tipo === "final";
    const ehSubtotal = l.tipo === "subtotal";
    const linhaXlsx = aba.addRow([(l.nivel === 1 ? "   " : "") + l.label, l.valor / 100, l.av]);
    linhaXlsx.getCell(2).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    if (ehFinal) {
      linhaXlsx.eachCell((celula) => {
        celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA_XLSX.final } };
        celula.font = { bold: true, color: { argb: TINTA_XLSX.finalTexto }, size: 10.5 };
      });
    } else if (ehSubtotal) {
      linhaXlsx.eachCell((celula) => {
        celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA_XLSX.faixa } };
        celula.font = { bold: true, size: 10 };
      });
    } else {
      linhaXlsx.font = { size: 10 };
    }
  });

  aba.views = [{ state: "frozen", ySplit: primeiraLinhaTabela }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
