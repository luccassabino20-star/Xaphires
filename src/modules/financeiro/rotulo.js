// Rótulo "código - nome" para centro de custo e classe, no estilo do plano de
// contas (ex.: "1.01.01 - IMG ESCRITÓRIO", "2.30.04 - Aporte"). Sem código, cai
// só no nome - classe/centro antigos, criados sem código, continuam legíveis.
export function comCodigo(item) {
  if (!item) return "";
  const cod = (item.codigo || "").trim();
  return cod ? `${cod} - ${item.nome}` : item.nome;
}
