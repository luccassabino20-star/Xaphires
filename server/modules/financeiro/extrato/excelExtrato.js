import ExcelJS from "exceljs";

// Exporta as transações de um extrato bancário para Excel, com a formatação
// pedida: cabeçalho azul escuro, zebra, valores em moeda (R$), débitos em
// vermelho, totais de crédito/débito por fórmula SUMIF e largura autoajustada.
// Recebe as transações já ESTRUTURADAS (o parser do PDF é outro passo) - assim
// este arquivo independe do formato do banco e é testável sozinho.

const AZUL = "FF1F4E79"; // cabeçalho azul escuro pedido (#1F4E79)
const BRANCO = "FFFFFFFF";
const ZEBRA = "FFF2F5FA"; // azul/cinza bem claro
const VERMELHO = "FFC0000B"; // débitos/saídas
const BORDA = "FFD9E1F2";
const MOEDA = 'R$ #,##0.00;[Red]-R$ #,##0.00';

// Colunas na ordem do extrato do BB. `moeda` marca as que são valor (numéricas,
// para o SUMIF somar); as demais são texto.
const COLUNAS = [
  { chave: "dataBalancete", titulo: "Data Balancete" },
  { chave: "dataMovimento", titulo: "Data Movimento" },
  { chave: "hora", titulo: "Hora" },
  { chave: "agenciaOrigem", titulo: "Ag. Origem" },
  { chave: "lote", titulo: "Lote" },
  { chave: "historico", titulo: "Histórico" },
  { chave: "documento", titulo: "Documento" },
  { chave: "valor", titulo: "Valor (R$)", moeda: true },
  { chave: "tipo", titulo: "Tipo" },
  { chave: "saldo", titulo: "Saldo (R$)", moeda: true },
];

const cents = (v) => (Number(v) || 0) / 100;

export async function gerarExcelExtrato(transacoes = [], { titulo = "Extrato" } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Xaphires";
  const ws = wb.addWorksheet("Extrato");

  // Cabeçalho.
  const cab = ws.addRow(COLUNAS.map((c) => c.titulo));
  cab.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    cell.font = { bold: true, color: { argb: BRANCO } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: AZUL } } };
  });
  cab.height = 20;

  // Linhas de dados.
  transacoes.forEach((tx, i) => {
    const linha = ws.addRow(
      COLUNAS.map((c) => {
        if (c.chave === "valor") return cents(tx.valorCents);
        if (c.chave === "saldo") return tx.saldoCents == null ? null : cents(tx.saldoCents);
        return tx[c.chave] ?? "";
      })
    );
    const zebra = i % 2 === 1;
    linha.eachCell((cell, col) => {
      if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      cell.border = { bottom: { style: "hair", color: { argb: BORDA } } };
      const def = COLUNAS[col - 1];
      if (def?.moeda) cell.numFmt = MOEDA;
    });
    // Débito/saída em vermelho na coluna de valor.
    if (tx.tipo === "D") {
      const colValor = COLUNAS.findIndex((c) => c.chave === "valor") + 1;
      linha.getCell(colValor).font = { color: { argb: VERMELHO } };
    }
  });

  // Totais por fórmula SUMIF, para o Excel recalcular se editarem as linhas.
  const colValorLetra = ws.getColumn(COLUNAS.findIndex((c) => c.chave === "valor") + 1).letter;
  const colTipoLetra = ws.getColumn(COLUNAS.findIndex((c) => c.chave === "tipo") + 1).letter;
  const primeira = 2;
  const ultima = 1 + transacoes.length;
  const faixaTipo = `${colTipoLetra}${primeira}:${colTipoLetra}${ultima}`;
  const faixaValor = `${colValorLetra}${primeira}:${colValorLetra}${ultima}`;
  const colRotulo = COLUNAS.findIndex((c) => c.chave === "historico") + 1;
  const colValor = COLUNAS.findIndex((c) => c.chave === "valor") + 1;

  function linhaTotal(rotulo, letraCritério) {
    const linha = ws.addRow([]);
    const cRot = linha.getCell(colRotulo);
    cRot.value = rotulo;
    cRot.font = { bold: true };
    const cVal = linha.getCell(colValor);
    cVal.value = transacoes.length ? { formula: `SUMIF(${faixaTipo},"${letraCritério}",${faixaValor})` } : 0;
    cVal.numFmt = MOEDA;
    cVal.font = { bold: true, color: { argb: letraCritério === "D" ? VERMELHO : "FF1F4E79" } };
    return linha;
  }
  ws.addRow([]);
  linhaTotal("Total de créditos (C)", "C");
  linhaTotal("Total de débitos (D)", "D");

  // Largura autoajustada: maior conteúdo por coluna, com teto para o histórico.
  ws.columns.forEach((col, idx) => {
    let max = COLUNAS[idx].titulo.length;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const texto = v && typeof v === "object" && "formula" in v ? "0000000" : String(v ?? "");
      if (texto.length > max) max = texto.length;
    });
    col.width = Math.min(Math.max(max + 2, 10), 48);
  });

  ws.getRow(1).getCell(1).note = titulo;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
