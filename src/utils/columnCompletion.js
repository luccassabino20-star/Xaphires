// Escrito com \u e não com o caractere literal: a faixa de acentos combinantes é
// invisível no editor, e um salvamento em outra codificação a transforma em lixo.
const ACENTOS_RE = new RegExp("[\\u0300-\\u036f]", "g");

// Mesmo conjunto de server/reports/dados.js (colunaDeConclusao) - duplicado
// de propósito, como server/doc.js/src/utils/doc.js: o servidor é a
// autoridade (usada no relatório), este arquivo é só o espelho que deixa o
// cliente decidir pra onde mover um cartão concluído sem round-trip. Mudou
// a lista lá, muda aqui também.
const TITULOS_DE_CONCLUSAO = new Set([
  "concluido", "concluida", "concluidos", "concluidas", "concluir",
  "feito", "feitos", "finalizado", "finalizada", "finalizados", "finalizadas",
  "encerrado", "encerrada", "pronto", "prontos",
  "done", "completed", "complete", "finished", "closed",
  "completado", "completada", "completados", "completadas", "terminado", "terminada",
  "hecho", "hechos", "cerrado", "cerrada",
]);

// Mesma comparação por igualdade sobre o título normalizado que o relatório usa
// (não por "contém") - com "contém", uma lista chamada "A concluir" viraria
// destino de auto-move, que é o oposto do que ela significa.
export function isCompletionColumnTitle(titulo) {
  const limpo = (titulo || "")
    .normalize("NFD")
    .replace(ACENTOS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return TITULOS_DE_CONCLUSAO.has(limpo);
}
