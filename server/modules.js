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
    // core (plano base) porque todo módulo posterior desemboca aqui.
    core: true,
    available: true,
    icon: "financeiro",
    // Dado financeiro é sensível: além do plano da empresa, exige autorização do
    // usuário. O master sempre acessa; os demais só com a concessão
    // (users.finance_access). Ver usuarioAutorizado abaixo e o toggle no UsersPanel.
    restricted: true,
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

// Autorização do USUÁRIO num módulo restrito. Módulo comum não restringe por
// pessoa (todo mundo da empresa entra, como no quadro compartilhado). O
// Financeiro restringe: master sempre; membro só com a concessão. Aceita tanto a
// linha crua do banco (finance_access 0/1) quanto o publicUser (financeAccess
// boolean), porque os dois formatos circulam.
export function usuarioAutorizado(user, moduleId) {
  const mod = getModule(moduleId);
  if (!mod || !mod.restricted) return true;
  if (!user) return false;
  if (user.role === "master") return true;
  if (moduleId === "financeiro") return user.finance_access === 1 || user.financeAccess === true;
  return false;
}

// Um módulo está liberado quando faz parte do plano base (core), já está no ar
// (available) E o usuário tem autorização nele. Add-on fica sempre bloqueado por
// ora — não há como contratá-lo ainda. Quando a cobrança por módulo entrar, é
// aqui que a lista de add-ons contratados da empresa passa a contar, sem o
// cliente precisar saber como a conta foi feita.
//
// Recebe empresa E usuário: a empresa decide o entitlement (plano/add-on), o
// usuário decide a autorização (módulo restrito). Deixar as duas na assinatura
// mantém a decisão de acesso num lugar só.
export function isModuleEnabled(company, user, moduleId) {
  const mod = getModule(moduleId);
  if (!mod) return false;
  if (!(mod.core === true && mod.available === true)) return false;
  return usuarioAutorizado(user, mod.id);
}

// Catálogo já resolvido para a empresa e o usuário: cada módulo com
// enabled/available/core calculados. É o que a rota devolve e o que o launcher
// desenha — módulo sem enabled some da vista de quem não tem acesso.
export function moduleCatalogFor(company, user) {
  return DEFINICOES.map((m) => ({
    id: m.id,
    icon: m.icon,
    core: m.core,
    available: m.available,
    enabled: isModuleEnabled(company, user, m.id),
  }));
}
