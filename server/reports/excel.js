import ExcelJS from "exceljs";
import { nomeDoStatus } from "./labels.js";

// Paleta do arquivo. Tons chapados e escuros no cabeçalho porque a planilha é feita
// para ser impressa e projetada: o cinza-claro do app some no projetor.
const TINTA = {
  cabecalho: "FF1F2937",
  cabecalhoTexto: "FFFFFFFF",
  faixa: "FFF3F4F6",
  atrasado: "FFFDECEA",
  atrasadoTexto: "FFB91C1C",
  concluido: "FF6B7280",
  rotulo: "FF6B7280",
  destaque: "FF111827",
  borda: "FFE5E7EB",
};

// O Excel recusa : \ / ? * [ ] no nome da aba e corta em 31 caracteres. Nome de
// pessoa passa dos 31 com facilidade, e dois "Maria Silva Santos..." truncados
// iguais fariam o addWorksheet estourar - daí o sufixo numérico.
function nomeDeAba(bruto, usados) {
  const limpo = (bruto || "-").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "-";
  let nome = limpo;
  let n = 2;
  while (usados.has(nome.toLowerCase())) {
    const sufixo = ` (${n++})`;
    nome = limpo.slice(0, 31 - sufixo.length) + sufixo;
  }
  usados.add(nome.toLowerCase());
  return nome;
}

function tituloDaAba(aba, texto, colunas) {
  const linha = aba.addRow([texto]);
  linha.font = { bold: true, size: 14, color: { argb: TINTA.destaque } };
  linha.height = 22;
  aba.mergeCells(linha.number, 1, linha.number, colunas);
  return linha;
}

function linhaDeCampo(aba, rotulo, valor, colunas) {
  const linha = aba.addRow([rotulo, valor]);
  linha.getCell(1).font = { bold: true, color: { argb: TINTA.rotulo }, size: 10 };
  linha.getCell(2).font = { size: 10 };
  aba.mergeCells(linha.number, 2, linha.number, colunas);
  return linha;
}

// Faixa de indicadores: rótulos numa linha, números grandes na de baixo. É o
// formato que se lê de relance, que é para o que serve um KPI.
function faixaDeKpis(aba, t, kpis, colunaInicial = 1) {
  const campos = [
    [t.total, kpis.total],
    [t.concluidos, kpis.concluidos],
    [t.pendentes, kpis.pendentes],
    [t.atrasados, kpis.atrasados],
    [t.urgentes, kpis.urgentes],
    [t.importantes, kpis.importantes],
    [t.taxaConclusao, `${kpis.taxaConclusao}%`],
  ];
  const rotulos = aba.addRow([]);
  const valores = aba.addRow([]);
  campos.forEach(([rotulo, valor], i) => {
    const col = colunaInicial + i;
    const celulaRotulo = rotulos.getCell(col);
    celulaRotulo.value = rotulo;
    celulaRotulo.font = { size: 9, bold: true, color: { argb: TINTA.rotulo } };
    celulaRotulo.alignment = { horizontal: "center" };
    const celulaValor = valores.getCell(col);
    celulaValor.value = valor;
    celulaValor.font = { size: 16, bold: true, color: { argb: TINTA.destaque } };
    celulaValor.alignment = { horizontal: "center" };
    // Atrasado em vermelho mesmo quando é zero: a cor é do indicador, não do valor,
    // e piscar de cor conforme o número dificulta comparar duas execuções.
    if (rotulo === t.atrasados && kpis.atrasados > 0) {
      celulaValor.font = { size: 16, bold: true, color: { argb: TINTA.atrasadoTexto } };
    }
  });
  valores.height = 22;
  return valores;
}

function cabecalhoDeTabela(aba, titulos, larguras) {
  const linha = aba.addRow(titulos);
  linha.eachCell((celula, col) => {
    if (col > titulos.length) return;
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA.cabecalho } };
    celula.font = { bold: true, color: { argb: TINTA.cabecalhoTexto }, size: 10 };
    celula.alignment = { vertical: "middle", horizontal: "left" };
  });
  linha.height = 20;
  if (larguras) larguras.forEach((w, i) => (aba.getColumn(i + 1).width = w));
  return linha;
}

const COLUNAS_TAREFA = [46, 40, 20, 18, 26, 12, 12, 13, 14, 16, 12, 9, 26];

function linhasDeTarefas(aba, relatorio, cartoes) {
  const t = relatorio.t;
  cabecalhoDeTabela(
    aba,
    [
      t.colTitulo,
      t.colDescricao,
      t.colQuadro,
      t.colColuna,
      t.colResponsaveis,
      t.colInicio,
      t.colPrazo,
      t.colSituacao,
      t.colPrioridade,
      t.colEtiquetas,
      t.colChecklist,
      t.colAnexos,
      t.colLocal,
    ],
    COLUNAS_TAREFA
  );
  const primeiraLinha = aba.lastRow.number;

  if (cartoes.length === 0) {
    const vazia = aba.addRow([t.semTarefas]);
    vazia.getCell(1).font = { italic: true, color: { argb: TINTA.rotulo } };
    aba.mergeCells(vazia.number, 1, vazia.number, COLUNAS_TAREFA.length);
    return;
  }

  cartoes.forEach((c, indice) => {
    const atrasado = relatorio.atrasado(c);
    const prioridade = [c.urgent ? t.urgente : null, c.important ? t.importante : null].filter(Boolean).join(" + ");
    const linha = aba.addRow([
      c.titulo,
      c.descricao,
      c.quadro,
      c.coluna,
      c.responsaveis.join(", "),
      c.startDate || "",
      c.due || "",
      c.completed ? t.feito : atrasado ? t.atrasada : t.aFazer,
      prioridade,
      c.etiquetas.join(", "),
      c.checklistTotal ? `${c.checklistFeitos}/${c.checklistTotal}` : "",
      c.anexos || "",
      c.local,
    ]);
    linha.alignment = { vertical: "top", wrapText: false };
    linha.eachCell((celula) => {
      celula.border = { bottom: { style: "hair", color: { argb: TINTA.borda } } };
      celula.font = { size: 10 };
    });
    // O destaque visual segue uma ordem: atrasado ganha de concluído, porque uma
    // tarefa concluída não fica atrasada e a única leitura possível é a urgência.
    if (atrasado) {
      linha.eachCell((celula) => {
        celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA.atrasado } };
        celula.font = { size: 10, color: { argb: TINTA.atrasadoTexto }, bold: celula.col === 1 };
      });
    } else if (c.completed) {
      linha.eachCell((celula) => {
        celula.font = { size: 10, color: { argb: TINTA.concluido }, strike: celula.col === 1 };
      });
    } else if (indice % 2 === 1) {
      linha.eachCell((celula) => {
        celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA.faixa } };
      });
    }
  });

  // Congelar e filtrar valem para a tabela inteira, e é o que torna a planilha
  // utilizável com algumas centenas de linhas.
  aba.autoFilter = {
    from: { row: primeiraLinha, column: 1 },
    to: { row: aba.lastRow.number, column: COLUNAS_TAREFA.length },
  };
  aba.views = [{ state: "frozen", ySplit: primeiraLinha }];
}

export async function gerarExcel(relatorio) {
  const t = relatorio.t;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Xaphires";
  wb.created = relatorio.geradoEm;

  // ---------- Aba de resumo ----------
  const resumo = wb.addWorksheet(t.resumo, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  tituloDaAba(resumo, t.relatorio, 7);
  if (relatorio.empresa) linhaDeCampo(resumo, t.empresa, relatorio.empresa, 7);
  linhaDeCampo(resumo, t.geradoEm, relatorio.geradoEm.toLocaleString(), 7);
  linhaDeCampo(resumo, t.escopo, relatorio.escopo, 7);
  linhaDeCampo(resumo, t.responsavel, relatorio.membroEscolhido || t.todosOsResponsaveis, 7);
  linhaDeCampo(resumo, t.status, nomeDoStatus(t, relatorio.status), 7);
  resumo.addRow([]);
  faixaDeKpis(resumo, t, relatorio.kpis);
  resumo.addRow([]);

  tituloDaAba(resumo, t.porQuadro, 7);
  cabecalhoDeTabela(
    resumo,
    [t.colQuadro, t.total, t.concluidos, t.pendentes, t.atrasados, t.taxaConclusao],
    [40, 12, 14, 14, 14, 14]
  );
  for (const q of relatorio.porQuadro) {
    const linha = resumo.addRow([q.titulo, q.total, q.concluidos, q.pendentes, q.atrasados, `${q.taxaConclusao}%`]);
    linha.eachCell((celula) => (celula.font = { size: 10 }));
    if (q.atrasados > 0) linha.getCell(5).font = { size: 10, bold: true, color: { argb: TINTA.atrasadoTexto } };
  }
  resumo.addRow([]);

  tituloDaAba(resumo, t.porResponsavel, 7);
  cabecalhoDeTabela(
    resumo,
    [t.responsavel, t.total, t.concluidos, t.pendentes, t.atrasados, t.taxaConclusao],
    [40, 12, 14, 14, 14, 14]
  );
  for (const s of relatorio.secoes) {
    const linha = resumo.addRow([s.nome, s.kpis.total, s.kpis.concluidos, s.kpis.pendentes, s.kpis.atrasados, `${s.kpis.taxaConclusao}%`]);
    linha.eachCell((celula) => (celula.font = { size: 10 }));
    if (s.kpis.atrasados > 0) linha.getCell(5).font = { size: 10, bold: true, color: { argb: TINTA.atrasadoTexto } };
  }

  // ---------- Uma aba por responsável ----------
  const usados = new Set([t.resumo.toLowerCase()]);
  for (const secao of relatorio.secoes) {
    const aba = wb.addWorksheet(nomeDeAba(secao.nome, usados), {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    tituloDaAba(aba, secao.nome, COLUNAS_TAREFA.length);
    if (secao.email) linhaDeCampo(aba, "E-mail", secao.email, COLUNAS_TAREFA.length);
    aba.addRow([]);
    faixaDeKpis(aba, t, secao.kpis);
    aba.addRow([]);
    linhasDeTarefas(aba, relatorio, secao.cartoes);
  }

  // Buffer, e não stream para a resposta: o exceljs escreve um zip, e só dá para
  // mandar o Content-Length correto com o arquivo pronto. Relatório de quadro cabe
  // folgado na memória; se um dia não couber, o caminho é paginar o relatório, não
  // trocar por stream.
  return Buffer.from(await wb.xlsx.writeBuffer());
}
