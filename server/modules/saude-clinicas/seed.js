// Templates de anamnese semeados na primeira vez que a empresa abre a aba
// Anamnese. Só em pt: diferente das categorias do Financeiro (que já
// nasceram com 3 locales porque acompanham o cadastro da empresa), este
// conteúdo é só um ponto de partida editável pela própria clínica - não há
// seleção de idioma no cadastro de anamnese, e o público-alvo do módulo é
// nacional. Mesmo padrão idempotente: só semeia quando não há template nenhum.
import {
  listAnamneseTemplates, insertAnamneseTemplate, countProcedures, insertProcedure,
  listAllFinCategorias, insertFinCategoria, insertFinSubcategoria,
} from "./repo.js";

const ALERGIA = { id: "alergias", label: "Possui alguma alergia conhecida?", type: "textarea", required: true, alert: true };

const TEMPLATES = [
  {
    clinicArea: "ESTETICA",
    name: "Anamnese de Estética",
    description: "Ficha padrão para procedimentos estéticos faciais e corporais.",
    fields: [
      { id: "queixa", label: "Queixa principal / objetivo com o tratamento", type: "textarea", required: true },
      { id: "fototipo", label: "Fototipo de pele (Fitzpatrick)", type: "single_choice", required: false, options: ["I", "II", "III", "IV", "V", "VI"] },
      { id: "gestante", label: "Está grávida ou amamentando?", type: "boolean", required: true, alert: true },
      { id: "procedimentos_anteriores", label: "Já realizou procedimentos estéticos antes? Quais?", type: "textarea", required: false },
      ALERGIA,
    ],
  },
  {
    clinicArea: "BIOMEDICINA_ESTETICA",
    name: "Anamnese de Injetáveis & Harmonização",
    description: "Ficha para procedimentos com toxina botulínica, preenchedores e bioestimuladores.",
    fields: [
      { id: "queixa", label: "Queixa principal / objetivo com o tratamento", type: "textarea", required: true },
      { id: "gestante", label: "Está grávida ou amamentando?", type: "boolean", required: true, alert: true },
      { id: "anticoagulante", label: "Usa algum anticoagulante ou tem distúrbio de coagulação?", type: "boolean", required: true, alert: true },
      { id: "herpes", label: "Tem histórico de herpes labial recorrente?", type: "boolean", required: false, alert: true },
      { id: "procedimentos_anteriores", label: "Já realizou toxina/preenchimento antes? Quando e onde?", type: "textarea", required: false },
      ALERGIA,
    ],
  },
  {
    clinicArea: "NUTRICAO",
    name: "Anamnese Nutricional",
    description: "Ficha de recordatório alimentar e histórico metabólico.",
    fields: [
      { id: "objetivo", label: "Objetivo com o acompanhamento", type: "single_choice", required: true, options: ["Emagrecimento", "Ganho de massa", "Reeducação alimentar", "Condição clínica específica", "Outro"] },
      { id: "recordatorio", label: "Descreva um dia alimentar típico", type: "textarea", required: true },
      { id: "condicoes", label: "Possui alguma condição diagnosticada (diabetes, hipertensão, etc.)?", type: "textarea", required: false, alert: true },
      { id: "medicamentos", label: "Faz uso de medicamentos ou suplementos contínuos?", type: "textarea", required: false },
      ALERGIA,
    ],
  },
];

export function seedAnamneseTemplatesSeVazio() {
  if (listAnamneseTemplates().length > 0) return;
  for (const tpl of TEMPLATES) insertAnamneseTemplate(tpl, null, true);
}

// Catálogo de procedimentos ponto de partida, mesmo padrão idempotente.
// Preços em centavos, arredondados - a clínica ajusta depois; o importante é
// o seletor do agendamento não nascer vazio.
const PROCEDIMENTOS_PADRAO = [
  { name: "Consulta", priceCents: 25000, durationMin: 30 },
  { name: "Retorno", priceCents: 0, durationMin: 20 },
  { name: "Avaliação inicial", priceCents: 15000, durationMin: 45 },
];

export function seedProceduresSeVazio() {
  if (countProcedures() > 0) return;
  for (const p of PROCEDIMENTOS_PADRAO) insertProcedure(p);
}

// Plano de contas ponto de partida (Financeiro > Configurações > Categorias
// financeiras): 6 categorias e ~100 subcategorias, pedido explícito do
// usuário com a lista exata extraída de um sistema de referência. Só em
// pt: mesma justificativa do catálogo de procedimentos acima - ponto de
// partida editável, não texto de interface.
const CATEGORIAS_FINANCEIRAS_PADRAO = [
  {
    nome: "Atendimento", tipo: "receita",
    subcategorias: ["Atendimento", "Consulta"],
  },
  {
    nome: "Despesas", tipo: "despesa",
    subcategorias: [
      "Ajuste de caixa", "Aluguel", "Assessorias e Associações", "Cartório", "Combustível e translado",
      "Comissão de vendedores", "Confraternizações", "Contabilidade", "Correios", "Cursos e treinamentos",
      "Distribuição de lucros", "Empréstimos", "Energia elétrica e água", "Fornecedor",
      "Licença ou aluguel de softwares", "Limpeza", "Manutenção de equipamentos", "Marketing e publicidade",
      "Material de escritório", "Material de reforma", "Rescisões trabalhistas", "Segurança", "Supermercado",
      "Taxas bancárias", "Telefone celular", "Telefone fixo", "Telefonia e Internet", "Translado",
      "Transportadora", "Treinamentos", "Vale Alimentação", "Vale Transporte", "Viagens",
    ],
  },
  {
    nome: "Despesas Financeiras", tipo: "despesa",
    subcategorias: ["Empréstimos", "Juros", "Tarifas bancárias"],
  },
  {
    nome: "Funcionários", tipo: "despesa",
    subcategorias: [
      "13º salário", "Adiantamento", "Alimentação", "Assistência médica e odontológica",
      "Exames pré e demissionais", "FGTS", "Horas Extras", "INSS", "Remuneração",
      "Rescisões trabalhistas", "Vale transporte",
    ],
  },
  {
    nome: "Impostos", tipo: "despesa",
    subcategorias: [
      "Alvará", "Cofins", "CSLL", "GPS", "ICMS", "Imposto de Renda", "IOF", "IPI", "IPTU", "IPVA",
      "IR", "IRPJ", "IRRF", "ISS", "Juros", "PIS", "Simples Nacional",
    ],
  },
  {
    nome: "Receitas", tipo: "receita",
    subcategorias: [
      "Adiantamento", "Ajuste de caixa", "Cobrança", "Comissão", "Depósito", "Empréstimo",
      "Mensalidade", "Procedimento", "Rendimentos", "Transferência", "Vendas",
    ],
  },
];

export function seedCategoriasFinanceirasSeVazio() {
  if (listAllFinCategorias().length > 0) return;
  for (const cat of CATEGORIAS_FINANCEIRAS_PADRAO) {
    const categoria = insertFinCategoria({ nome: cat.nome, tipo: cat.tipo });
    for (const nome of cat.subcategorias) insertFinSubcategoria({ categoriaId: categoria.id, nome });
  }
}
