import ExcelJS from "exceljs";

// Import de centros de custo por planilha Excel. Lê um .xlsx com duas colunas -
// Código e Descrição - detectando o cabeçalho (ou caindo em A=código, B=descrição
// quando não há cabeçalho). A criação em si (com as regras de hierarquia) é do
// repo/centrosCustoStore; aqui só extraímos as linhas. Também gera o MODELO para
// o usuário saber o formato.

// Valor de célula em texto, tolerando os vários formatos do exceljs (número,
// richText, fórmula, data). Código hierárquico deve ser texto ("1.02"); por isso
// o modelo formata a coluna como texto e aqui apenas convertemos com cuidado.
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

export async function parseCentrosXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { erro: "ILEGIVEL", linhas: [] };
  }
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount === 0) return { linhas: [] };

  // Detecção de cabeçalho: procura colunas "código" e "nome/descrição" na 1ª linha.
  let colCodigo = 1, colNome = 2, primeira = 1;
  const cab = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { cab[col] = celStr(c).toLowerCase(); });
  const iCod = cab.findIndex((x) => /c[óo]digo|code/.test(x || ""));
  const iNome = cab.findIndex((x) => /nome|descri|name/.test(x || ""));
  if (iCod > 0 && iNome > 0) { colCodigo = iCod; colNome = iNome; primeira = 2; }

  const linhas = [];
  for (let i = primeira; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const codigo = celStr(row.getCell(colCodigo));
    const nome = celStr(row.getCell(colNome));
    if (!codigo && !nome) continue; // linha em branco
    linhas.push({ codigo, nome, row: i });
  }
  return { linhas };
}

// Modelo .xlsx para download: cabeçalho + exemplos, com a coluna de código
// formatada como TEXTO (senão o Excel transforma "1.10" em 1,1 e perde o nível).
export async function modeloCentrosXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Centros de custo");
  ws.columns = [
    { header: "Código", key: "codigo", width: 20 },
    { header: "Descrição", key: "nome", width: 40 },
  ];
  ws.getColumn(1).numFmt = "@"; // texto
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  const exemplos = [
    ["1", "Empresa"],
    ["1.01", "Administrativo"],
    ["1.01.01", "Recursos Humanos"],
    ["1.02", "Operações"],
    ["1.02.01", "Obra Prainha"],
  ];
  for (const [codigo, nome] of exemplos) {
    const r = ws.addRow({ codigo, nome });
    r.getCell(1).numFmt = "@";
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
