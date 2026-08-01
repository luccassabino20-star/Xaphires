// Mesmas convenções do CSV de relatório (server/reports/csv.js): separador
// ponto e vírgula e BOM para abrir certo no Excel pt-BR/es-ES, CRLF, e apóstrofo
// na frente de célula que começa como fórmula - título de tarefa é texto de
// usuário, então "=HYPERLINK(...)" não pode virar fórmula ativa na planilha de
// quem abrir o export.
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

// `rows` é a lista já achatada de GanttRows.buildGanttRows (respeita busca e
// grupos recolhidos - exporta o que está visível na tela, não tudo que existe).
// `resolveStatus(task)` traduz o status pro mesmo texto que a barra lateral
// mostra (ver SidebarTaskRow em GanttSidebar.jsx) - sem isso a planilha sairia
// com o código interno ("todo", "done") em vez do que a pessoa vê na tela.
export function buildGanttCsv(rows, headers, resolveStatus) {
  const linhas = [linha(headers)];
  let grupoAtual = "";
  rows.forEach((row) => {
    if (row.type === "group") {
      grupoAtual = row.title;
      return;
    }
    const t = row.task;
    linhas.push(linha([grupoAtual, (row.depth > 0 ? "- " : "") + t.title, resolveStatus(t), t.start || "", t.end || ""]));
  });
  return BOM + linhas.join(EOL) + EOL;
}

export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
