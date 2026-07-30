import PDFDocument from "pdfkit";
import { nomeDoStatus } from "./labels.js";

// Documento executivo: paisagem, resumo geral e UMA tabela só com todo mundo junto
// (pendentes e concluídas), em vez de uma seção nova por responsável. Cabe numa
// página só no caso comum; transborda pra página 2+ só se a lista de tarefas for
// grande demais para a folha - a paginação natural de `tabelaDeTarefas` cuida disso
// sozinha, repetindo o cabeçalho da tabela. Paisagem não é estética - são nove
// informações por tarefa, e em retrato a tabela ou perde colunas ou vira fonte 6.

const COR = {
  tinta: "#111827",
  suave: "#6b7280",
  linha: "#e5e7eb",
  faixa: "#f9fafb",
  atrasado: "#b91c1c",
  fundoAtrasado: "#fdecea",
  cabecalho: "#1f2937",
  branco: "#ffffff",
};

const MARGEM = 36;
const ALTURA_LINHA = 16;

// Colunas da tabela, em pontos. A soma tem de fechar com a largura útil da página
// (842 - 2*36 = 770 no A4 paisagem): sobrar faz a última coluna flutuar longe da
// borda, faltar joga texto para fora do papel.
const COLUNAS = [
  { chave: "titulo", largura: 180 },
  { chave: "descricao", largura: 150 },
  { chave: "quadro", largura: 80 },
  { chave: "coluna", largura: 60 },
  { chave: "responsaveis", largura: 90 },
  { chave: "prazo", largura: 55 },
  { chave: "situacao", largura: 60 },
  { chave: "prioridade", largura: 55 },
  { chave: "checklist", largura: 40 },
];

function truncar(doc, texto, largura) {
  const valor = String(texto ?? "");
  if (doc.widthOfString(valor) <= largura) return valor;
  let corte = valor;
  while (corte.length > 1 && doc.widthOfString(corte + "…") > largura) corte = corte.slice(0, -1);
  return corte + "…";
}

function baseDaPagina(doc) {
  return doc.page.height - MARGEM - 18; // 18 reservados para o rodapé
}

function cabecalhoDoDocumento(doc, relatorio) {
  const t = relatorio.t;
  const largura = doc.page.width - MARGEM * 2;
  doc.rect(MARGEM, MARGEM, largura, 54).fill(COR.cabecalho);
  doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(18).text(t.relatorio, MARGEM + 16, MARGEM + 12);
  doc.font("Helvetica").fontSize(9);
  const direita = [
    relatorio.empresa,
    `${t.geradoEm}: ${relatorio.geradoEm.toLocaleString()}`,
  ].filter(Boolean);
  doc.text(direita.join("   |   "), MARGEM + 16, MARGEM + 36, { width: largura - 32 });

  doc.fillColor(COR.suave).fontSize(9);
  const filtros = [
    `${t.escopo}: ${relatorio.escopo}`,
    `${t.responsavel}: ${relatorio.membroEscolhido || t.todosOsResponsaveis}`,
    `${t.status}: ${nomeDoStatus(t, relatorio.status)}`,
  ];
  doc.text(filtros.join("      "), MARGEM, MARGEM + 64, { width: largura });
  doc.y = MARGEM + 82;
}

// Os indicadores em caixas de mesma largura. Número grande em cima da legenda: é a
// ordem em que se lê um painel, e evita ter de procurar o valor ao lado do rótulo.
function faixaDeKpis(doc, t, kpis, y) {
  const largura = doc.page.width - MARGEM * 2;
  const campos = [
    [t.total, String(kpis.total), COR.tinta],
    [t.concluidos, String(kpis.concluidos), COR.tinta],
    [t.pendentes, String(kpis.pendentes), COR.tinta],
    [t.atrasados, String(kpis.atrasados), kpis.atrasados > 0 ? COR.atrasado : COR.tinta],
    [t.urgentes, String(kpis.urgentes), COR.tinta],
    [t.importantes, String(kpis.importantes), COR.tinta],
    [t.taxaConclusao, `${kpis.taxaConclusao}%`, COR.tinta],
  ];
  const larguraCaixa = largura / campos.length;
  campos.forEach(([rotulo, valor, cor], i) => {
    const x = MARGEM + i * larguraCaixa;
    doc.rect(x, y, larguraCaixa - 6, 44).fill(COR.faixa);
    doc.fillColor(cor).font("Helvetica-Bold").fontSize(17).text(valor, x, y + 7, { width: larguraCaixa - 6, align: "center" });
    doc
      .fillColor(COR.suave)
      .font("Helvetica")
      .fontSize(8)
      .text(rotulo.toUpperCase(), x, y + 29, { width: larguraCaixa - 6, align: "center" });
  });
  return y + 56;
}

function cabecalhoDaTabela(doc, t, y) {
  const titulos = {
    titulo: t.colTitulo,
    descricao: t.colDescricao,
    quadro: t.colQuadro,
    coluna: t.colColuna,
    responsaveis: t.colResponsaveis,
    prazo: t.colPrazo,
    situacao: t.colSituacao,
    prioridade: t.colPrioridade,
    checklist: t.colChecklist,
  };
  doc.rect(MARGEM, y, doc.page.width - MARGEM * 2, 18).fill(COR.cabecalho);
  doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(8);
  let x = MARGEM + 4;
  for (const col of COLUNAS) {
    doc.text(truncar(doc, titulos[col.chave], col.largura - 8), x, y + 5, { width: col.largura - 8, lineBreak: false });
    x += col.largura;
  }
  return y + 18;
}

function linhaDaTabela(doc, relatorio, cartao, y, indice) {
  const t = relatorio.t;
  const atrasado = relatorio.atrasado(cartao);
  const largura = doc.page.width - MARGEM * 2;

  if (atrasado) doc.rect(MARGEM, y, largura, ALTURA_LINHA).fill(COR.fundoAtrasado);
  else if (indice % 2 === 1) doc.rect(MARGEM, y, largura, ALTURA_LINHA).fill(COR.faixa);

  const valores = {
    titulo: cartao.titulo,
    // Achatada numa linha só: a célula do PDF não quebra texto (lineBreak: false),
    // e uma descrição com quebras de linha ficaria com o cursor de texto pulando
    // para fora da coluna. O CSV e o Excel trazem a descrição inteira, sem corte.
    descricao: (cartao.descricao || "").replace(/\s+/g, " ").trim() || "-",
    quadro: cartao.quadro,
    coluna: cartao.coluna,
    responsaveis: cartao.responsaveis.join(", "),
    prazo: cartao.due || "-",
    situacao: cartao.completed ? t.feito : atrasado ? t.atrasada : t.aFazer,
    prioridade: [cartao.urgent ? t.urgente : null, cartao.important ? t.importante : null].filter(Boolean).join(" + ") || "-",
    checklist: cartao.checklistTotal ? `${cartao.checklistFeitos}/${cartao.checklistTotal}` : "-",
  };

  const cor = atrasado ? COR.atrasado : cartao.completed ? COR.suave : COR.tinta;
  let x = MARGEM + 4;
  for (const col of COLUNAS) {
    const primeira = col.chave === "titulo";
    doc
      .fillColor(cor)
      .font(primeira && (atrasado || !cartao.completed) ? "Helvetica-Bold" : "Helvetica")
      .fontSize(8)
      .text(truncar(doc, valores[col.chave], col.largura - 8), x, y + 4, {
        width: col.largura - 8,
        lineBreak: false,
        // Riscar só o título: riscar a linha inteira deixa a tabela ilegível, e o
        // título já é o que identifica a tarefa concluída de relance.
        strike: primeira && cartao.completed && !atrasado,
      });
    x += col.largura;
  }
  doc
    .moveTo(MARGEM, y + ALTURA_LINHA)
    .lineTo(doc.page.width - MARGEM, y + ALTURA_LINHA)
    .lineWidth(0.3)
    .stroke(COR.linha);
  return y + ALTURA_LINHA;
}

function tabelaDeTarefas(doc, relatorio, cartoes) {
  const t = relatorio.t;
  let y = cabecalhoDaTabela(doc, t, doc.y);
  if (cartoes.length === 0) {
    doc.fillColor(COR.suave).font("Helvetica-Oblique").fontSize(9).text(t.semTarefas, MARGEM + 4, y + 6);
    doc.y = y + 24;
    return;
  }
  cartoes.forEach((cartao, indice) => {
    // Quebra de página no meio da tabela repete o cabeçalho. Sem isso a segunda
    // página vira uma grade de números sem legenda.
    if (y + ALTURA_LINHA > baseDaPagina(doc)) {
      doc.addPage();
      y = cabecalhoDaTabela(doc, t, MARGEM);
    }
    y = linhaDaTabela(doc, relatorio, cartao, y, indice);
  });
  doc.y = y + 8;
}

function tabelaPorQuadro(doc, relatorio) {
  const t = relatorio.t;
  if (relatorio.porQuadro.length === 0) return;
  doc.fillColor(COR.tinta).font("Helvetica-Bold").fontSize(11).text(t.porQuadro, MARGEM, doc.y);
  let y = doc.y + 6;
  const colunas = [
    [t.colQuadro, 300],
    [t.total, 70],
    [t.concluidos, 80],
    [t.pendentes, 80],
    [t.atrasados, 80],
    [t.taxaConclusao, 80],
  ];
  doc.rect(MARGEM, y, doc.page.width - MARGEM * 2, 16).fill(COR.cabecalho);
  doc.fillColor(COR.branco).font("Helvetica-Bold").fontSize(8);
  let x = MARGEM + 4;
  for (const [titulo, largura] of colunas) {
    doc.text(truncar(doc, titulo, largura - 8), x, y + 4, { width: largura - 8, lineBreak: false });
    x += largura;
  }
  y += 16;
  relatorio.porQuadro.forEach((q, i) => {
    if (i % 2 === 1) doc.rect(MARGEM, y, doc.page.width - MARGEM * 2, 15).fill(COR.faixa);
    const valores = [q.titulo, q.total, q.concluidos, q.pendentes, q.atrasados, `${q.taxaConclusao}%`];
    x = MARGEM + 4;
    valores.forEach((valor, j) => {
      const atrasadoDestacado = j === 4 && q.atrasados > 0;
      doc
        .fillColor(atrasadoDestacado ? COR.atrasado : COR.tinta)
        .font(atrasadoDestacado ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8)
        .text(truncar(doc, valor, colunas[j][1] - 8), x, y + 4, { width: colunas[j][1] - 8, lineBreak: false });
      x += colunas[j][1];
    });
    y += 15;
  });
  doc.y = y + 12;
}

function rodapes(doc, t) {
  const faixa = doc.bufferedPageRange();
  for (let i = 0; i < faixa.count; i++) {
    doc.switchToPage(faixa.start + i);
    // O texto vai a 6pt do fundo, dentro da margem inferior de 36pt - mas o pdfkit
    // mede a caixa de uma linha de 8pt como maior que esses 6pt e entende que
    // "não coube", criando uma página nova em branco pra continuar o rodapé. Zerar
    // a margem inferior só durante este texto engana essa conta sem mexer no layout;
    // como é a última coisa escrita em cada página, não precisa restaurar depois.
    doc.page.margins.bottom = 0;
    doc
      .fillColor(COR.suave)
      .font("Helvetica")
      .fontSize(8)
      .text(
        `Cantiere      ${t.pagina} ${i + 1} ${t.de} ${faixa.count}`,
        MARGEM,
        doc.page.height - MARGEM - 6,
        { width: doc.page.width - MARGEM * 2, align: "right", lineBreak: false }
      );
  }
}

export function gerarPdf(relatorio) {
  const t = relatorio.t;
  // bufferPages é obrigatório para o rodapé: "página 3 de 7" só existe depois que a
  // última página foi escrita, e sem buffer as anteriores já teriam ido para o fluxo.
  const doc = new PDFDocument({ layout: "landscape", size: "A4", margin: MARGEM, bufferPages: true });
  const pedacos = [];
  const pronto = new Promise((resolve, reject) => {
    doc.on("data", (p) => pedacos.push(p));
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    doc.on("error", reject);
  });

  cabecalhoDoDocumento(doc, relatorio);
  doc.y = faixaDeKpis(doc, t, relatorio.kpis, doc.y);
  tabelaPorQuadro(doc, relatorio);

  // Uma tabela só, com todo mundo (o responsável já é uma das colunas) - ver o
  // comentário no topo do arquivo sobre por que não é mais uma seção por pessoa.
  doc.fillColor(COR.tinta).font("Helvetica-Bold").fontSize(11).text(t.total, MARGEM, doc.y);
  doc.y += 6;
  tabelaDeTarefas(doc, relatorio, relatorio.cartoes);

  rodapes(doc, t);
  doc.end();
  return pronto;
}
