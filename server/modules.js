// Catálogo dos módulos da plataforma e as regras de acesso derivadas dele.
//
// Xaphires deixa de ser um produto (o Kanban) e passa a ser uma plataforma
// dividida pelos pilares da empresa. Este arquivo é a autoridade única do que
// existe e do que a empresa pode abrir — mesmo papel de plans.js para os planos:
// o cliente só desenha o que o servidor calcula aqui, nunca reimplementa a regra.
//
// O modelo comercial é "plano base + módulos add-on":
//   - core:true  → faz parte do plano base, entra junto com a assinatura do
//                  Kanban que já existe (não é comprado à parte).
//   - core:false → add-on, contratado por cima do plano base (cobrança por
//                  módulo virá numa fase seguinte; por ora nenhum é comprável).
//
// available separa o que já está no ar do que é só vitrine ("Em breve"). Hoje só
// Vendas & CRM (que embrulha o Kanban atual) está pronto; os outros quatro
// aparecem no launcher como próximos, no mesmo espírito dos placeholders "Em
// breve" que o app já usa. Ligar um módulo é virar esta flag e plugar o
// componente — a casca já reserva o lugar dele.

// A ordem do array é a ordem em que os cards aparecem no launcher.
const DEFINICOES = [
  {
    id: "vendas-crm",
    // O Kanban de hoje é a visão de funil dentro deste pilar. É o único módulo
    // pronto, e o único core que já responde de verdade.
    core: true,
    available: true,
    icon: "vendas",
  },
  {
    id: "financeiro",
    // A espinha dorsal do ERP: contas a pagar/receber, fluxo de caixa, DRE. É
    // core (plano base) porque todo módulo posterior desemboca aqui, mas ainda
    // não está construído.
    core: true,
    available: false,
    icon: "financeiro",
  },
  {
    id: "compras-estoque",
    core: false,
    available: false,
    icon: "estoque",
  },
  {
    id: "faturamento",
    // Emissão fiscal (NFe/NFSe) depende de gateway externo e certificado — o
    // mais pesado, fica entre os últimos.
    core: false,
    available: false,
    icon: "faturamento",
  },
  {
    id: "relatorios-bi",
    core: false,
    available: false,
    icon: "bi",
  },
];

export const MODULES = DEFINICOES;
export const MODULE_IDS = DEFINICOES.map((m) => m.id);

export function getModule(id) {
  return DEFINICOES.find((m) => m.id === id) || null;
}

// Um módulo está liberado para a empresa quando faz parte do plano base (core) e
// já está no ar (available). Add-on fica sempre bloqueado por ora — não há como
// contratá-lo ainda, então nem o core resolveria o acesso sozinho. Quando a
// cobrança por módulo entrar, é aqui que a lista de add-ons contratados da
// empresa passa a contar (mesmo lugar, mesma função), sem o cliente precisar
// saber como a conta foi feita.
//
// Recebe a empresa inteira (não só o plano) porque a decisão vai depender, na
// fase da cobrança, de campos da própria empresa (add-ons ligados) — deixar a
// assinatura pronta agora evita um refactor depois.
export function isModuleEnabled(company, moduleId) {
  const mod = getModule(moduleId);
  if (!mod) return false;
  return mod.core === true && mod.available === true;
}

// Catálogo já resolvido para a empresa: cada módulo com enabled/available/core
// calculados. É o que a rota devolve e o que o launcher desenha.
export function moduleCatalogFor(company) {
  return DEFINICOES.map((m) => ({
    id: m.id,
    icon: m.icon,
    core: m.core,
    available: m.available,
    enabled: isModuleEnabled(company, m.id),
  }));
}
