import ExcelJS from "exceljs";

// Import de classes (categorias) por planilha Excel. Lê um .xlsx com três colunas
// - Código, Descrição e Tipo (receita/despesa) - detectando o cabeçalho, ou caindo
// em A=código, B=descrição, C=tipo quando não há cabeçalho. A criação em si é do
// repo (importarCategorias); aqui só extraímos as linhas. Também gera o MODELO.
// Segue o mesmo formato do import de centros de custo, com a coluna Tipo a mais -
// classe não tem hierarquia obrigatória, mas o DRE precisa saber se soma no topo
// (receita) ou embaixo (despesa).

// Valor de célula em texto, tolerando os formatos do exceljs (número, richText,
// fórmula, data). Código hierárquico deve ser texto ("4.08"); o modelo formata a
// coluna como texto e aqui convertemos com cuidado.
function celStr(cell) {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim();
    if (v.text != null) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    return "";
  }
  return String(v).trim();
}

// Normaliza o tipo digitado para "receita" | "despesa" | "" (desconhecido). É
// tolerante: aceita variações comuns e os três idiomas, sem acento e sem caixa, e
// as iniciais R/D. O repo decide o que fazer com o "" (erro na linha).
export function normalizarTipoCategoria(bruto) {
  const s = String(bruto || "")
    .trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!s) return "";
  if (/^(receita|receitas|entrada|entradas|income|revenue|ingreso|ingresos|credito|r)$/.test(s)) return "receita";
  if (/^(despesa|despesas|saida|saidas|expense|expenses|gasto|gastos|egreso|egresos|debito|d)$/.test(s)) return "despesa";
  return "";
}

export async function parseCategoriasXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { erro: "ILEGIVEL", linhas: [] };
  }
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount === 0) return { linhas: [] };

  // Detecção de cabeçalho: procura "código", "nome/descrição" e "tipo" na 1ª linha.
  let colCodigo = 1, colNome = 2, colTipo = 3, primeira = 1;
  const cab = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { cab[col] = celStr(c).toLowerCase(); });
  const iCod = cab.findIndex((x) => /c[óo]digo|code/.test(x || ""));
  const iNome = cab.findIndex((x) => /nome|descri|name/.test(x || ""));
  const iTipo = cab.findIndex((x) => /tipo|type/.test(x || ""));
  if (iCod > 0 && iNome > 0) {
    colCodigo = iCod; colNome = iNome;
    if (iTipo > 0) colTipo = iTipo;
    primeira = 2;
  }

  const linhas = [];
  for (let i = primeira; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const codigo = celStr(row.getCell(colCodigo));
    const nome = celStr(row.getCell(colNome));
    const tipo = celStr(row.getCell(colTipo));
    if (!codigo && !nome && !tipo) continue; // linha em branco
    linhas.push({ codigo, nome, tipo, row: i });
  }
  return { linhas };
}

// Modelo .xlsx para download: cabeçalho + exemplos, com a coluna de código
// formatada como TEXTO (senão o Excel transforma "4.10" em 4,1 e perde o nível).
export async function modeloCategoriasXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Classes");
  ws.columns = [
    { header: "Código", key: "codigo", width: 20 },
    { header: "Descrição", key: "nome", width: 40 },
    { header: "Tipo", key: "tipo", width: 16 },
  ];
  ws.getColumn(1).numFmt = "@"; // texto
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  const exemplos = [
    ["3.01", "Vendas", "receita"],
    ["3.02", "Serviços prestados", "receita"],
    ["4.01", "Água", "despesa"],
    ["4.06", "Salários", "despesa"],
    ["4.08", "Impostos e taxas", "despesa"],
  ];
  for (const [codigo, nome, tipo] of exemplos) {
    const r = ws.addRow({ codigo, nome, tipo });
    r.getCell(1).numFmt = "@";
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
