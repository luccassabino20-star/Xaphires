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

// Ficha de pré-consulta nutricional completa, pedida pelo usuário com o
// conteúdo exato das 8 seções (a "Apresentação e boas-vindas" virou a
// `description` do template, mostrada como texto de intro na primeira etapa
// - ver AnamnesePublicPage.jsx). Cada `{ type: "section" }` não é pergunta,
// é só o título que abre uma etapa nova do formulário (agruparEmEtapas).
// Exportada à parte (não só dentro de TEMPLATES) para o mesmo conteúdo poder
// ser usado por um script de atualização pontual em empresas que já tinham
// semeado a versão curta anterior deste template.
export const ANAMNESE_NUTRICIONAL_PRE_CONSULTA = [
  { id: "sec_dados_pessoais", label: "Dados Pessoais e Identificação", type: "section" },
  { id: "nome_completo", label: "Nome completo", type: "text", required: true },
  { id: "apelido", label: "Como prefere ser chamado(a)?", type: "text" },
  { id: "data_nascimento", label: "Data de nascimento", type: "date", required: true },
  { id: "cpf", label: "CPF", type: "text" },
  { id: "profissao", label: "Profissão/Ocupação", type: "text" },
  { id: "telefone", label: "Telefone / WhatsApp", type: "tel", required: true },
  { id: "email", label: "E-mail", type: "email", required: true },

  { id: "sec_objetivos", label: "Objetivos e Histórico de Peso", type: "section" },
  {
    id: "objetivo_principal", label: "Qual é o seu objetivo principal com o acompanhamento?", type: "single_choice", required: true,
    options: [
      "Emagrecimento / Redução de gordura",
      "Ganho de massa muscular (Hipertrofia)",
      "Melhora da performance esportiva",
      "Reeducação alimentar e saúde geral",
      "Controle de exames ou condição de saúde específica",
      "Outro",
    ],
  },
  { id: "objetivo_outro", label: "Se 'Outro', especifique", type: "text" },
  { id: "peso_altura", label: "Qual seu peso atual aproximado (kg) e sua altura (cm)?", type: "text" },
  { id: "historico_peso", label: "Qual foi o seu menor e maior peso na vida adulta? Há quanto tempo tenta alcançar seu objetivo atual?", type: "textarea" },
  { id: "dificuldades", label: "Existe alguma dificuldade ou obstáculo específico que você gostaria de trabalhar na consulta?", type: "textarea" },

  { id: "sec_saude_familiar", label: "Histórico de Saúde e Familiar", type: "section" },
  {
    id: "doenca_diagnosticada", label: "Possui alguma doença ou condição de saúde diagnosticada? (ex: Diabetes, Hipertensão, SOP, Tireoide, Gastrite)",
    type: "single_choice", required: true, alert: true, options: ["Não", "Sim"],
  },
  { id: "doenca_especificar", label: "Se sim, especifique", type: "textarea", alert: true },
  { id: "medicacao_continua", label: "Faz uso contínuo de medicação ou anticoncepcional? Quais?", type: "textarea" },
  {
    id: "alergia_intolerancia", label: "Possui alguma alergia ou intolerância alimentar diagnosticada ou suspeita?",
    type: "single_choice", required: true, alert: true, options: ["Não", "Sim"],
  },
  { id: "alergia_especificar", label: "Se sim, especifique", type: "textarea", alert: true },
  { id: "cirurgias", label: "Já realizou cirurgias ou procedimentos de relevante importância? (ex: Bariátrica, Vesícula, Estética)", type: "textarea" },
  {
    id: "historico_familiar", label: "Histórico familiar de saúde", type: "multi_choice",
    options: [
      "Diabetes", "Hipertensão", "Obesidade", "Doenças cardiovasculares / Infarto",
      "Colesterol ou triglicerídeos elevados", "Doenças gastrointestinais", "Doenças renais", "Nenhum / Desconheço",
    ],
  },

  { id: "sec_estilo_vida", label: "Estilo de Vida, Sono e Exercício", type: "section" },
  { id: "rotina_diaria", label: "Como é sua rotina diária de trabalho/estudos? (Horários, nível de estresse e sedentarismo)", type: "textarea" },
  {
    id: "horas_sono", label: "Quantas horas costuma dormir por noite?", type: "single_choice", required: true,
    options: ["Menos de 5h", "5 a 6h", "6 a 7h", "7 a 8h", "Mais de 8h"],
  },
  {
    id: "qualidade_sono", label: "Como avalia a qualidade do seu sono?", type: "single_choice",
    options: ["Ruim / Acordo cansado(a)", "Razoável", "Excelente / Repousante"],
  },
  {
    id: "pratica_atividade", label: "Pratica atividade física atualmente?", type: "single_choice", required: true,
    options: ["Não", "Sim, regularmente", "Sim, de forma irregular"],
  },
  { id: "detalhes_atividade", label: "Se sim, qual modalidade, frequência semanal, duração e horário do treino?", type: "text" },
  { id: "suplementos", label: "Usa ou já usou algum tipo de suplemento ou ergogênico? (ex: Whey, Creatina, Pré-treino, Multivitamínico)", type: "text" },

  { id: "sec_habitos_alimentares", label: "Hábitos Alimentares e Comportamento", type: "section" },
  {
    id: "refeicoes_dia", label: "Quantas refeições costuma fazer por dia?", type: "single_choice", required: true,
    options: ["1 a 2", "3 a 4", "5 a 6", "7 ou mais"],
  },
  {
    id: "consumo_agua", label: "Qual o seu consumo diário aproximado de água?", type: "single_choice", required: true,
    options: ["Menos de 1L", "1L a 1,5L", "1,5L a 2L", "2L a 3L", "Mais de 3L"],
  },
  {
    id: "frequencia_ultraprocessados", label: "Frequência de consumo de doces, fast-food ou ultraprocessados", type: "single_choice", required: true,
    options: ["Raramente", "Algumas vezes por mês", "1 a 2x por semana", "Diariamente"],
  },
  {
    id: "consumo_alcool", label: "Consumo de bebidas alcoólicas, refrigerantes ou sucos adoçados", type: "single_choice", required: true,
    options: ["Não consumo", "Raramente", "Finais de semana", "Diariamente"],
  },
  { id: "periodo_mais_fome", label: "Em qual período do dia você sente mais fome ou vontade de beliscar?", type: "text" },
  {
    id: "comportamento_alimentar",
    label: "Em momentos de ansiedade, estresse ou tédio, você percebe alterações na sua alimentação ou episódios de exagero/perda de controle?",
    type: "single_choice", required: true, options: ["Não percebo", "Às vezes", "Frequentemente"],
  },

  { id: "sec_preferencias", label: "Preferências Alimentares", type: "section" },
  { id: "alimentos_nao_gosta", label: "Quais alimentos você NÃO GOSTA ou não consome de jeito nenhum?", type: "textarea", required: true },
  { id: "alimentos_gosta", label: "Quais alimentos você AMA e gostaria de manter no seu plano alimentar?", type: "textarea", required: true },
  {
    id: "padrao_alimentar", label: "Segue algum padrão alimentar específico?", type: "single_choice", required: true,
    options: ["Nenhum", "Vegetariano", "Vegano", "Low Carb", "Sem lactose", "Sem glúten", "Outro"],
  },
  { id: "padrao_alimentar_outro", label: "Se 'Outro', especifique", type: "text" },

  { id: "sec_saude_intestinal", label: "Saúde Intestinal e Digestiva", type: "section" },
  {
    id: "funcionamento_intestino", label: "Como você considera o funcionamento do seu intestino?", type: "single_choice", required: true,
    options: [
      "Regular (evacuo diariamente sem esforço)",
      "Constipado / Preso (evacuo poucas vezes na semana)",
      "Diarreico / Solto frequente",
      "Alternado (dias preso, dias solto)",
    ],
  },
  {
    id: "frequencia_evacuacao", label: "Com que frequência costuma evacuar?", type: "single_choice", required: true,
    options: ["Mais de uma vez ao dia", "1x ao dia", "3 a 5x por semana", "Menos de 2x por semana"],
  },
  {
    id: "aspecto_fezes", label: "Aspecto das fezes (Escala de Bristol)", type: "single_choice",
    options: [
      "Em caroços duros (difícil de passar)",
      "Moldado, porém em pedaços / seco",
      "Formato de salsicha macia e suave (ideal)",
      "Pastoso ou completamente líquido",
    ],
  },
  {
    id: "sintomas_digestivos", label: "Sintomas digestivos frequentes", type: "multi_choice",
    options: ["Inchaço abdominal (estufamento)", "Gases excessivos", "Azia ou refluxo", "Dor ou desconforto abdominal", "Náuseas", "Nenhum sintoma"],
  },
  { id: "alimento_desconforto", label: "Existe algum alimento específico que causa desconforto digestivo imediato?", type: "text" },
];

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
    description:
      "Antes da nossa consulta, gostaria de conhecer um pouco mais sobre você, sua rotina, seus hábitos alimentares e sua saúde. " +
      "Este formulário foi elaborado para garantir um atendimento 100% individualizado, respeitando sua realidade, preferências e objetivos. " +
      "Reserve cerca de 5 a 10 minutos para responder com calma e sinceridade. As informações fornecidas são confidenciais e protegidas.",
    fields: ANAMNESE_NUTRICIONAL_PRE_CONSULTA,
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
