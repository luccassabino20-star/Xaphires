// Parser de extrato bancário em texto (o texto vem do pdf-parse; a leitura do PDF
// fica na rota). Calibrado contra extratos REAIS de Sicredi e Banestes - os dois
// formatos são bem diferentes, então há um parser por banco e uma detecção.
//
// Saída: { banco, transacoes: [{ dataMovimento, historico, documento, valorCents,
// tipo:'C'|'D', saldoCents|null }], resumo: { creditos, debitos, count } }. Os
// campos que um banco não fornece (hora, agência, lote) ficam ausentes - o
// exportador Excel já tolera.

const MESES = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };

// "10.593,09" -> 1059309 (centavos, inteiro positivo). Ignora sinal (o chamador
// decide C/D). Ponto é milhar, vírgula é decimal - padrão brasileiro.
function valorBRParaCents(s) {
  const limpo = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Math.abs(Number(limpo));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function civilDeDDMMYYYY(d) {
  const [dia, mes, ano] = d.split("/");
  return `${ano}-${mes}-${dia}`;
}

function resumir(banco, transacoes) {
  let creditos = 0, debitos = 0;
  for (const t of transacoes) (t.tipo === "C" ? (creditos += t.valorCents) : (debitos += t.valorCents));
  return { banco, transacoes, resumo: { creditos, debitos, count: transacoes.length } };
}

// ---------- Sicredi ----------
// Uma linha por transação: "DD/MM/AAAA <descrição+documento> <valor> <saldo>".
// Valor sinalizado (negativo = débito). Cabeçalho, "SALDO ANTERIOR" e marcadores
// de página não casam a regex e são ignorados naturalmente.
const RE_SICREDI = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})$/;

function parseSicredi(texto) {
  const transacoes = [];
  for (const bruta of texto.split("\n")) {
    const linha = bruta.trim();
    const m = linha.match(RE_SICREDI);
    if (!m) continue;
    const negativo = m[3].trim().startsWith("-");
    transacoes.push({
      dataMovimento: civilDeDDMMYYYY(m[1]),
      historico: m[2].trim(),
      documento: "",
      valorCents: valorBRParaCents(m[3]),
      tipo: negativo ? "D" : "C",
      saldoCents: (m[4].trim().startsWith("-") ? -1 : 1) * valorBRParaCents(m[4]),
    });
  }
  return resumir("sicredi", transacoes);
}

// ---------- Banestes ----------
// Formato tabular achatado pelo PDF: o DIA aparece como número no início de um
// bloco e o MÊS como "JUL/26" (repetido); as duas coisas juntas formam a data. O
// débito é marcado por "- " (hífen + espaço) antes do valor; crédito é o valor
// puro. Descrições quebram em várias linhas até o valor no fim. Linhas de "Saldo
// Conta/Rende+" e cabeçalhos/rodapés são ruído.
const RE_MES = /^([A-Z]{3})\/(\d{2})\s*(.*)$/;
const RE_DIA = /^(\d{1,2})(?:\s+(.*))?$/;
// Valor no fim da linha. Aceita com OU sem separador de milhar: se o pdf-parse
// renderizar "1234,56" em vez de "1.234,56", a transação >= 1000 ainda casa (a
// exigência estrita de milhar descartava essas linhas em silêncio).
const RE_VALOR_FIM = /^(.*?)\s+(-\s+)?(\d[\d.]*,\d{2})$/;

function ehRuidoBanestes(l) {
  return (
    /^Extrato/i.test(l) ||
    /^Data\s+Lançamento/i.test(l) ||
    /^Data\/Hora/i.test(l) ||
    /^Agência:/i.test(l) ||
    /^Cliente:/i.test(l) ||
    /^SALDO TOTAL|^ENTRADAS/i.test(l) ||
    /^R\$\s/.test(l) ||
    /^--\s|--$/.test(l) ||
    /^Saldo Anterior/i.test(l) ||
    /^Saldos?$/i.test(l) ||
    /Saldo Conta\/Rende/i.test(l) ||
    /^Saldo (Conta|Rende|Total)/i.test(l) ||
    /^Rendimento Previsto/i.test(l) ||
    /^[A-Za-z0-9]{16,}$/.test(l) // hash de emissão, sem espaços
  );
}

function parseBanestes(texto) {
  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);

  // Mês/ano padrão: do "Período: 01/07/2026 à ..." ou do primeiro "JUL/26".
  let mesAtual = null, anoAtual = null;
  const per = texto.match(/Per[ií]odo:\s*\d{2}\/(\d{2})\/(\d{4})/i);
  if (per) { mesAtual = Number(per[1]); anoAtual = Number(per[2]); }
  else {
    const mm = texto.match(/\b([A-Z]{3})\/(\d{2})\b/);
    if (mm && MESES[mm[1]]) { mesAtual = MESES[mm[1]]; anoAtual = 2000 + Number(mm[2]); }
  }

  const transacoes = [];
  let diaAtual = null;
  let buffer = "";

  const emitir = () => {
    const m = buffer.match(RE_VALOR_FIM);
    if (!m) { buffer = ""; return; }
    const historico = m[1].trim();
    const debito = !!m[2];
    if (diaAtual && mesAtual && anoAtual) {
      transacoes.push({
        dataMovimento: `${anoAtual}-${String(mesAtual).padStart(2, "0")}-${String(diaAtual).padStart(2, "0")}`,
        historico,
        documento: "",
        valorCents: valorBRParaCents(m[3]),
        tipo: debito ? "D" : "C",
        saldoCents: null,
      });
    }
    buffer = "";
  };

  for (const linha of linhas) {
    if (ehRuidoBanestes(linha)) continue;
    let trabalho = linha;

    // Prefixo de mês ("JUL/26 ...") atualiza o mês e segue com o resto.
    const mm = trabalho.match(RE_MES);
    if (mm && MESES[mm[1]]) { mesAtual = MESES[mm[1]]; anoAtual = 2000 + Number(mm[2]); trabalho = mm[3]; }
    if (!trabalho) continue;
    if (ehRuidoBanestes(trabalho)) continue;

    // Fora de uma transação em curso, um número solto no início é o DIA.
    if (!buffer) {
      const dm = trabalho.match(RE_DIA);
      if (dm && Number(dm[1]) >= 1 && Number(dm[1]) <= 31) {
        diaAtual = Number(dm[1]);
        trabalho = dm[2] || "";
      }
      if (!trabalho) continue;
      if (ehRuidoBanestes(trabalho)) continue;
    }

    buffer = buffer ? `${buffer} ${trabalho}` : trabalho;
    if (RE_VALOR_FIM.test(buffer)) emitir();
  }
  return resumir("banestes", transacoes);
}

// ---------- Detecção + entrada ----------
export function parseExtrato(texto) {
  const t = texto || "";
  if (/banestes/i.test(t)) return parseBanestes(t);
  if (/sicredi|cooperativa/i.test(t)) return parseSicredi(t);
  // Sem marca conhecida: tenta Sicredi (formato de uma linha), o mais comum.
  const sic = parseSicredi(t);
  if (sic.transacoes.length) return sic;
  return parseBanestes(t);
}

export { parseSicredi, parseBanestes, valorBRParaCents };
