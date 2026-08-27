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
    id: "quadro",
    // O Kanban genérico que o produto sempre teve - virou módulo próprio,
    // separado do CRM (abaixo). Continua core: é a base gratuita de sempre,
    // com os limites de sempre vindos do plano (quantidade de quadros,
    // usuários, anexo, features como arquivamento automático) - nada disso
    // muda com o módulo virar dois. Ver plans.js, inalterado por este split.
    core: true,
    available: true,
    icon: "quadro",
  },
  {
    id: "vendas-crm",
    // CRM de verdade (leads, funil, propostas, orçamentos, pedidos) - antes
    // "vendas-crm" era só um apelido para o quadro genérico acima; agora é
    // um módulo próprio, add-on como Financeiro/Saúde & Clínicas.
    core: false,
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
    id: "saude-clinicas",
    // Fase 2: vertical de gestão para clínicas de estética, biomedicina
    // estética, nutrição e multidisciplinares. Add-on (não é core), e sem
    // restrição por usuário — diferente do Financeiro, aqui não há dado
    // sensível o bastante para justificar um segundo gate por pessoa.
    core: false,
    available: true,
    icon: "saude",
  },
  {
    id: "xaphires-beauty",
    // Vertical separada para salões/clínicas de estética (agenda, clientes,
    // financeiro, equipe) — schema e rotas próprios, sem reaproveitar
    // saude-clinicas apesar da sobreposição óbvia (decisão do produto).
    // Fase 0 (casca): módulo aparece e abre, sem CRUD ainda. Add-on, sem
    // restrição por usuário, mesmo perfil de saude-clinicas.
    core: false,
    available: true,
    icon: "beauty",
  },
  // Compras & Estoque, Faturamento e Relatórios & BI deixaram de ser cards
  // próprios do launcher - viraram abas "Em breve" dentro do ERP IRES (id
  // "financeiro" acima; ver ABAS em src/modules/financeiro/FinanceiroModule.jsx).
  // Não há mais entitlement separado pra eles: quem tem acesso ao ERP IRES já
  // "tem" as três, mesmo enquanto seguem sem tela.
  {
    id: "time-tracking",
    // Apontamento de horas (tarefas/projetos próprios do módulo, cronômetro,
    // grade semanal, aprovação). Fase 1: sem vínculo com cartão do Kanban,
    // cliente do Beauty ou lançamento do Financeiro - "tarefa" é um catálogo
    // próprio (tt_tasks), decisão tomada pra não escolher errado qual desses
    // três catálogos de "cliente" a plataforma tem. Add-on, sem restrição por
    // usuário, mesmo perfil de saude-clinicas/xaphires-beauty.
    core: false,
    available: true,
    icon: "tempo",
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

// A lista de módulos que a EMPRESA pode usar, controlada pelo painel de
// plataforma (companies.enabled_modules). NULL = a plataforma ainda não definiu:
// o padrão então são os módulos core, para nenhuma empresa existente ficar sem o
// que já tinha. Definida a lista, ela manda — inclusive para liberar add-on ou
// tirar um core de uma empresa específica.
function parseEnabledModules(company) {
  if (!company?.enabled_modules) return null;
  try {
    const arr = JSON.parse(company.enabled_modules);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

// A empresa tem direito ao módulo? available é pré-requisito sempre (não se libera
// o que ainda não existe). Com lista definida, vale a lista; sem lista, o padrão
// é core. "*" na lista é acesso total: entitled a qualquer módulo já
// disponível e a qualquer um que vier a ficar available depois, sem precisar
// tocar na empresa de novo a cada módulo novo lançado - é o que dá a uma
// empresa (ex.: a conta interna da própria plataforma) acesso permanente a
// tudo, "sempre que for implantado", sem virar uma lista pra manter manualmente.
export function companyEntitled(company, moduleId) {
  const mod = getModule(moduleId);
  if (!mod || !mod.available) return false;
  const lista = parseEnabledModules(company);
  if (lista === null) return mod.core === true;
  if (lista.includes("*")) return true;
  return lista.includes(moduleId);
}

// Um módulo está liberado quando a EMPRESA tem direito a ele (entitlement do
// painel) E o USUÁRIO tem autorização nele (módulo restrito). Duas camadas
// independentes: a plataforma decide o que a empresa contratou; o master decide
// quem, dentro dela, acessa.
export function isModuleEnabled(company, user, moduleId) {
  if (!companyEntitled(company, moduleId)) return false;
  return usuarioAutorizado(user, moduleId);
}

// Módulos que a plataforma pode gerir para uma empresa: todos, com core/available
// e o direito atual resolvido. É o que o painel de administração desenha.
export function moduleEntitlementsFor(company) {
  const lista = parseEnabledModules(company);
  return DEFINICOES.map((m) => ({
    id: m.id,
    core: m.core,
    available: m.available,
    entitled: companyEntitled(company, m.id),
    // O que está de fato GRAVADO para a empresa, independente de o módulo já
    // existir (available). É o que o painel precisa para desenhar a marca e para
    // remontar a lista ao alternar: usar `entitled` descartava a pré-autorização
    // de um módulo "Em breve" - a marca voltava desmarcada e, pior, o próximo
    // toque em qualquer outro módulo apagava a pré-autorização gravada.
    stored: lista === null ? m.core === true : (lista.includes("*") || lista.includes(m.id)),
  }));
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
