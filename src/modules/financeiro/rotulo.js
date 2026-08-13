// Rótulo "código - nome" para centro de custo e classe, no estilo do plano de
// contas (ex.: "1.01.01 - IMG ESCRITÓRIO", "2.30.04 - Aporte"). Sem código, cai
// só no nome - classe/centro antigos, criados sem código, continuam legíveis.
export function comCodigo(item) {
  if (!item) return "";
  const cod = (item.codigo || "").trim();
  return cod ? `${cod} - ${item.nome}` : item.nome;
}

// Agência e conta bancária de uma conta corrente, em "Ag 1234 · Cc 56789-0". Só
// mostra as partes preenchidas; conta sem esses dados devolve string vazia.
export function detalheConta(c) {
  if (!c) return "";
  const partes = [];
  if ((c.agencia || "").trim()) partes.push(`Ag ${c.agencia.trim()}`);
  if ((c.numero || "").trim()) partes.push(`Cc ${c.numero.trim()}`);
  return partes.join(" · ");
}

// Rótulo da conta para selects: nome + agência/conta quando houver.
export function rotuloConta(c) {
  if (!c) return "";
  const det = detalheConta(c);
  return det ? `${c.nome} (${det})` : c.nome;
}
