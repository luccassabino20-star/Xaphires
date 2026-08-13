// Formatação e parsing de dinheiro no cliente. O servidor guarda CENTAVOS
// INTEIROS (nunca decimal), então a conversão para reais acontece só na borda,
// aqui. Mesma disciplina do resto do projeto - float em dinheiro acumula erro.

// Centavos inteiros -> texto de moeda BRL, no idioma de quem olha.
export function formatCents(cents, lang = "pt") {
  const valor = (cents || 0) / 100;
  return new Intl.NumberFormat(lang, { style: "currency", currency: "BRL" }).format(valor);
}

// Texto/numero em reais digitado -> centavos inteiros. Aceita "1500,50" e
// "1500.50". Devolve null quando não dá um número válido e positivo, para o
// formulário poder recusar antes de mandar (o servidor também recusa).
export function reaisParaCents(entrada) {
  if (entrada === null || entrada === undefined || entrada === "") return null;
  const s = String(entrada).trim();
  // Com vírgula é digitação brasileira: ponto é milhar, vírgula é decimal. Sem
  // vírgula (caso do <input type="number">), o ponto é o próprio decimal e fica.
  const normalizado = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const reais = Number(normalizado);
  if (!Number.isFinite(reais) || reais <= 0) return null;
  return Math.round(reais * 100);
}

// Como centsOuZero, mas aceita NEGATIVO. Para o saldo inicial de conta, que pode
// ser negativo (cheque especial) - reaisParaCents/centsOuZero devolvem 0 para <= 0
// e engoliriam um saldo negativo em silêncio.
export function centsAssinado(entrada) {
  if (entrada === null || entrada === undefined || String(entrada).trim() === "") return 0;
  const s = String(entrada).trim();
  const normalizado = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const reais = Number(normalizado);
  return Number.isFinite(reais) ? Math.round(reais * 100) : 0;
}

// Como reaisParaCents, mas 0/vazio é um valor VÁLIDO (retorna 0). Para os campos
// de imposto/desconto/retenção, onde "nenhum" é legítimo, diferente do valor do
// título que precisa ser > 0.
export function centsOuZero(entrada) {
  if (entrada === null || entrada === undefined || String(entrada).trim() === "") return 0;
  const cents = reaisParaCents(entrada);
  return cents == null ? 0 : cents;
}

// Centésimos de ponto percentual (150 = 1,50%) -> texto "1,50%". Mesma escala de
// reaisParaCents/centsOuZero (dividir por 100 dá o valor com 2 casas), só o
// rótulo muda de moeda para percentual - por isso o formulário de imposto
// reaproveita centsOuZero para converter o que a pessoa digita.
export function formatPercent(centesimos, lang = "pt") {
  const valor = (centesimos || 0) / 100;
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor) + "%";
}

// Espelha liquidoCents do servidor (repo.js), para telas que já têm a lista de
// lançamentos em mãos mostrarem o líquido sem outra chamada de API.
export function liquidoDoLancamento(l) {
  if (!l) return 0;
  const liq =
    (l.valor_cents || 0) - (l.desconto_cents || 0) - (l.imposto_retido_cents || 0) - (l.retencao_cents || 0) +
    (l.imposto_acrescido_cents || 0) + (l.multa_cents || 0) + (l.juros_cents || 0);
  return Math.max(0, liq);
}
