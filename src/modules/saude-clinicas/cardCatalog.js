// Catálogo dos cards da aba Saúde & Clínicas: um por funcionalidade do pedido
// original, com a(s) especialidade(s) a que pertence e se já tem tela por trás
// (`real`) ou é vitrine "Em breve" (mesmo tratamento do launcher de módulos -
// ver module-card-locked em index.css, reaproveitado aqui).
//
// `areas: "all"` cobre tanto os módulos universais (Pacientes, Anamnese, que
// fazem sentido para qualquer especialidade) quanto os transversais (Agenda,
// Pacotes, Estoque, que atravessam especialidades) - os dois aparecem sempre,
// independente do clinicType escolhido. Os demais só aparecem quando a área
// bate, ou quando a clínica é MULTIDISCIPLINAR (mostra tudo).
export const CARDS = [
  { id: "pacientes", icon: "pacientes", areas: "all", real: true, view: "pacientes" },
  { id: "anamnese", icon: "anamnese", areas: "all", real: true, view: "anamnese" },

  { id: "prontuario-estetico", icon: "prontuario", areas: ["ESTETICA"], real: false },
  { id: "mapeamento-procedimentos", icon: "mapeamento", areas: ["ESTETICA"], real: false },
  { id: "galeria-antes-depois", icon: "galeria", areas: ["ESTETICA"], real: false },

  { id: "prontuario-injetaveis", icon: "prontuario", areas: ["BIOMEDICINA_ESTETICA"], real: false },
  { id: "rastreabilidade-lotes", icon: "lotes", areas: ["BIOMEDICINA_ESTETICA"], real: false },
  { id: "termos-legais", icon: "termos", areas: ["BIOMEDICINA_ESTETICA"], real: false },

  { id: "prontuario-nutricional", icon: "prontuario", areas: ["NUTRICAO"], real: false },
  { id: "avaliacao-antropometrica", icon: "antropometria", areas: ["NUTRICAO"], real: false },
  { id: "gerador-plano-alimentar", icon: "plano-alimentar", areas: ["NUTRICAO"], real: false },
  { id: "prescritor-suplementos", icon: "suplementos", areas: ["NUTRICAO"], real: false },

  // Agenda saiu daqui: virou seção própria da sidebar (ver SaudeSidebar.jsx),
  // não um card dentro de Pacientes - dois pontos de entrada pra mesma coisa
  // confundiria mais do que ajudaria.
  { id: "pacotes-sessoes", icon: "pacotes", areas: "all", real: false },
  { id: "estoque-insumos", icon: "estoque", areas: "all", real: false },
];

export function cardsParaClinicType(clinicType) {
  if (clinicType === "MULTIDISCIPLINAR") return CARDS;
  return CARDS.filter((c) => c.areas === "all" || c.areas.includes(clinicType));
}
