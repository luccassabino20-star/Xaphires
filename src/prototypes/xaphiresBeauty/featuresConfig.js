// Catálogo de funcionalidades x planos do protótipo "Xaphires Beauty" -
// produto separado, à parte do Xaphires multiempresa real (Kanban/CRM/ERP/
// Saúde & Clínicas). Não tem módulo real por trás: é só o dado que alimenta
// a vitrine visual (XaphiresBeautyPrototype.jsx) e o hook de exemplo
// (useFeatureAccess.js). Não confundir com server/plans.js, que é a
// autoridade real de planos do produto que existe hoje.
//
// badge é a chave interna (gratis/premium/profissional); PLAN_LEVEL abaixo
// define a hierarquia usada pelo hook pra decidir acesso.
export const PLAN_LEVEL = { gratis: 0, premium: 1, profissional: 2 };

export const PLAN_LABELS = {
  gratis: "Grátis",
  premium: "Premium",
  profissional: "Profissional",
};

export const FEATURE_CATEGORIES = [
  {
    key: "agendamento",
    title: "Agendamento",
    icon: "calendar",
    features: [
      { key: "agenda", title: "Agenda de agendamentos", description: "Criar, editar e excluir agendamentos com facilidade.", badge: "gratis" },
      { key: "agendamento-online", title: "Agendamento online", description: "Página pública para clientes agendarem sozinhos.", badge: "premium" },
      { key: "qr-code", title: "QR Code do agendamento", description: "QR Code para compartilhar link de agendamento.", badge: "premium" },
      { key: "duracao", title: "Agendamentos com duração", description: "Duração configurável por serviço.", badge: "premium" },
      { key: "repetir", title: "Repetir agendamentos", description: "Crie séries recorrentes automaticamente.", badge: "premium" },
      { key: "duplicar", title: "Duplicar agendamentos", description: "Duplique um agendamento existente em um clique.", badge: "premium" },
      { key: "bloqueio-horarios", title: "Bloqueio de horários", description: "Bloqueie períodos para férias, folgas e intervalos.", badge: "premium" },
      { key: "local", title: "Agendamentos com local", description: "Defina local ou endereço do atendimento.", badge: "premium" },
      { key: "link-lembrete", title: "Link de lembrete", description: "Envie link de confirmação ao cliente.", badge: "premium" },
    ],
  },
  {
    key: "financeiro",
    title: "Financeiro",
    icon: "cifrao",
    features: [
      { key: "relatorios-mensais", title: "Relatórios mensais", description: "Visão básica de faturamento mensal.", badge: "gratis" },
      { key: "transacoes", title: "Transações financeiras", description: "Registro de entradas e saídas financeiras.", badge: "premium" },
      { key: "pagamentos-agendamento", title: "Pagamentos no agendamento", description: "Registre PIX, dinheiro ou cartão no atendimento.", badge: "premium" },
      { key: "relatorios-detalhados", title: "Relatórios detalhados", description: "Resumo detalhado de faturamento e performance.", badge: "premium" },
      { key: "comissao", title: "Taxa de comissão", description: "Configure comissão por profissional/serviço.", badge: "premium" },
      { key: "preco-customizado", title: "Preço customizado", description: "Altere preço por agendamento individualmente.", badge: "premium" },
    ],
  },
  {
    key: "gestao",
    title: "Gestão",
    icon: "servicos",
    features: [
      { key: "cadastro-servicos", title: "Cadastro de serviços", description: "Lista completa dos serviços oferecidos.", badge: "gratis" },
      { key: "foto-servicos", title: "Foto nos serviços", description: "Upload de imagem nos serviços/produtos.", badge: "premium" },
      { key: "categorias-servicos", title: "Categorias de serviços", description: "Organize serviços em categorias.", badge: "premium" },
      { key: "gestao-equipe", title: "Gestão de equipe", description: "Cadastrar e gerenciar múltiplos profissionais.", badge: "profissional" },
      { key: "ranking-servicos", title: "Ranking de serviços", description: "Serviços mais populares e rentáveis.", badge: "profissional" },
    ],
  },
  {
    key: "comunicacao",
    title: "Comunicação",
    icon: "comunicacao",
    features: [
      { key: "push", title: "Notificações push", description: "Lembretes via push notification automáticos.", badge: "gratis" },
      { key: "whatsapp", title: "Lembretes por WhatsApp", description: "Envio automático de lembretes por WhatsApp (100/mês).", badge: "profissional" },
    ],
  },
  {
    key: "clientes",
    title: "Clientes",
    icon: "clientes",
    features: [
      { key: "cadastro-clientes", title: "Cadastro de clientes", description: "Cadastro completo com histórico de atendimentos.", badge: "gratis" },
      { key: "relatorios-clientes", title: "Relatórios de clientes", description: "Análise de frequência e histórico.", badge: "premium" },
      { key: "aniversario", title: "Aniversário de clientes", description: "Tracking e notificação de aniversários.", badge: "premium" },
      { key: "ranking-clientes", title: "Ranking de clientes", description: "Classificação por frequência e faturamento.", badge: "profissional" },
      { key: "anamnese", title: "Anamnese de clientes", description: "Fichas customizáveis de anamnese.", badge: "profissional" },
      { key: "link-anamnese", title: "Link público de anamnese", description: "Envie formulário para o cliente preencher.", badge: "profissional" },
    ],
  },
];
