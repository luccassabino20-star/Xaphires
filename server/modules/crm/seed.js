// Estágios padrão do funil, semeados na primeira vez que a empresa abre o
// CRM. Mesmo padrão idempotente de seedCategoriasSeVazio (financeiro) e
// seedAnamneseTemplatesSeVazio (saúde & clínicas): só semeia quando não há
// estágio nenhum, pra empresa que apagar tudo não ser re-semeada.
import { countStages, insertStage } from "./repo.js";

const ESTAGIOS_PADRAO = [
  { name: "Novo lead", isWon: false, isLost: false },
  { name: "Contato feito", isWon: false, isLost: false },
  { name: "Proposta enviada", isWon: false, isLost: false },
  { name: "Negociação", isWon: false, isLost: false },
  { name: "Ganho", isWon: true, isLost: false },
  { name: "Perdido", isWon: false, isLost: true },
];

export function seedStagesSeVazio() {
  if (countStages() > 0) return;
  ESTAGIOS_PADRAO.forEach((e, i) => insertStage({ ...e, position: i }));
}
