// CSV e PDF dos Relatórios - genéricos por natureza (colunas variam por tipo
// de relatório), ao contrário dos geradores do Kanban (server/reports/), que
// são hardcoded pras nove colunas de cartão. Mesmas três regras de "abrir no
// Excel com dois cliques" do CSV do Kanban (separador ; , BOM UTF-8, CRLF) e
// a mesma neutralização de fórmula - nome de paciente e origem/indicação são
// texto digitado por usuário, igual título de cartão.
import PDFDocument from "pdfkit";

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

const COLUNAS_MOEDA = new Set(["receitaCents", "repasseCents"]);
const COLUNAS_PERCENTUAL = new Set(["comissaoPct", "percentual"]);

function formatarValor(chave, valor, idioma) {
  if (valor === null || valor === undefined) return "-";
  if (COLUNAS_MOEDA.has(chave)) return (valor / 100).toLocaleString(idioma === "en" ? "en-US" : idioma === "es" ? "es-ES" : "pt-BR", { style: "currency", currency: "BRL" });
  if (COLUNAS_PERCENTUAL.has(chave)) return `${valor}%`;
  return valor;
}

export function gerarCsvRelatorio({ tipo, colunas, linhas, idioma, t, periodoLabel }) {
  const saida = [];
  saida.push(linha(colunas.map((c) => t.coluna[c] || c)));
  for (const l of linhas) saida.push(linha(colunas.map((c) => formatarValor(c, l[c], idioma))));
  if (linhas.length === 0) saida.push(linha([t.geral.semDados]));
  saida.push("");
  saida.push(linha([t.titulo[tipo] || tipo]));
  saida.push(linha([t.geral.periodo, periodoLabel]));
  saida.push(linha([t.geral.geradoEm, new Date().toLocaleString(idioma === "en" ? "en-US" : idioma === "es" ? "es-ES" : "pt-BR")]));
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

export function gerarPdfRelatorio({ tipo, colunas, linhas, idioma, t, periodoLabel, empresa }) {
  const doc = new PDFDocument({ layout: "landscape", size: "A4", margin: MARGEM, bufferPages: true });
  const pedacos = [];
  const pronto = new Promise((resolve, reject) => {
    doc.on("data", (p) => pedacos.push(p));
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    doc.on("error", reject);
  });

  const larguraUtil = doc.page.width - MARGEM * 2;
  doc.rect(MARGEM, MARGEM, larguraUtil, 44).fill(COR.cabecalho);
  doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(16).text(t.titulo[tipo] || tipo, MARGEM + 14, MARGEM + 10);
  doc.font("Helvetica").fontSize(9).text([empresa, `${t.geral.geradoEm}: ${new Date().toLocaleString()}`].filter(Boolean).join("   |   "), MARGEM + 14, MARGEM + 29);
  doc.fillColor(COR.suave).fontSize(9).text(`${t.geral.periodo}: ${periodoLabel}`, MARGEM, MARGEM + 52);
  doc.y = MARGEM + 70;

  const larguraColuna = larguraUtil / colunas.length;

  function cabecalhoDaTabela(y) {
    doc.rect(MARGEM, y, larguraUtil, ALTURA_LINHA).fill(COR.cabecalho);
    doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(8.5);
    let x = MARGEM + 6;
    for (const c of colunas) {
      doc.text(truncar(doc, t.coluna[c] || c, larguraColuna - 10), x, y + 5, { width: larguraColuna - 10, lineBreak: false });
      x += larguraColuna;
    }
    return y + ALTURA_LINHA;
  }

  let y = cabecalhoDaTabela(doc.y);
  if (linhas.length === 0) {
    doc.fillColor(COR.suave).font("Helvetica-Oblique").fontSize(9).text(t.geral.semDados, MARGEM + 6, y + 8);
    doc.y = y + 30;
  } else {
    linhas.forEach((l, i) => {
      if (y + ALTURA_LINHA > doc.page.height - MARGEM - 20) {
        doc.addPage();
        y = cabecalhoDaTabela(MARGEM);
      }
      if (i % 2 === 1) doc.rect(MARGEM, y, larguraUtil, ALTURA_LINHA).fill(COR.faixa);
      let x = MARGEM + 6;
      doc.font("Helvetica").fontSize(8.5);
      for (const c of colunas) {
        doc.fillColor(COR.tinta).text(truncar(doc, formatarValor(c, l[c], idioma), larguraColuna - 10), x, y + 5, { width: larguraColuna - 10, lineBreak: false });
        x += larguraColuna;
      }
      doc.moveTo(MARGEM, y + ALTURA_LINHA).lineTo(MARGEM + larguraUtil, y + ALTURA_LINHA).lineWidth(0.3).stroke(COR.linha);
      y += ALTURA_LINHA;
    });
  }

  const faixa = doc.bufferedPageRange();
  for (let i = 0; i < faixa.count; i++) {
    doc.switchToPage(faixa.start + i);
    doc.page.margins.bottom = 0;
    doc.fillColor(COR.suave).font("Helvetica").fontSize(8).text(`Xaphires      ${t.geral.pagina} ${i + 1} ${t.geral.de} ${faixa.count}`, MARGEM, doc.page.height - MARGEM - 6, { width: larguraUtil, align: "right", lineBreak: false });
  }

  doc.end();
  return pronto;
}
