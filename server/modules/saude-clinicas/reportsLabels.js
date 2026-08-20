// Textos dos arquivos exportados (CSV/PDF) dos Relatórios - mesmo motivo do
// server/reports/labels.js do Kanban: quem escreve o arquivo é o servidor, e
// carregar os locales inteiros do cliente pra pegar 30 chaves não compensa.
// Só pt/en/es, mesmo alcance do labels.js original - fr/de caem no pt (ver
// `rotulos`), que é o padrão de fallback do app inteiro.

const TITULOS = {
  pt: {
    "atendimentos-realizados": "Atendimentos realizados",
    "pacientes-retorno": "Pacientes para retorno",
    "pacientes-periodo": "Pacientes por período",
    "pacientes-cid": "Pacientes por CID",
    "pacientes-indicacao": "Paciente por indicação",
    "faltas-paciente": "Faltas por paciente",
    "analise-receitas": "Análise de receitas",
    "repasse-profissionais": "Repasse por profissionais",
    "satisfacao-paciente": "Satisfação do paciente",
    aniversariantes: "Aniversariantes",
  },
  en: {
    "atendimentos-realizados": "Appointments completed",
    "pacientes-retorno": "Patients due for return",
    "pacientes-periodo": "Patients by period",
    "pacientes-cid": "Patients by diagnosis (ICD)",
    "pacientes-indicacao": "Patients by referral",
    "faltas-paciente": "No-shows by patient",
    "analise-receitas": "Revenue analysis",
    "repasse-profissionais": "Professional payouts",
    "satisfacao-paciente": "Patient satisfaction",
    aniversariantes: "Birthdays",
  },
  es: {
    "atendimentos-realizados": "Atenciones realizadas",
    "pacientes-retorno": "Pacientes para retorno",
    "pacientes-periodo": "Pacientes por período",
    "pacientes-cid": "Pacientes por CIE",
    "pacientes-indicacao": "Paciente por indicación",
    "faltas-paciente": "Ausencias por paciente",
    "analise-receitas": "Análisis de ingresos",
    "repasse-profissionais": "Comisión por profesional",
    "satisfacao-paciente": "Satisfacción del paciente",
    aniversariantes: "Cumpleaños",
  },
};

const COLUNAS = {
  pt: {
    data: "Data", hora: "Hora", paciente: "Paciente", profissional: "Profissional",
    procedimentos: "Procedimentos", convenio: "Convênio", telefone: "Telefone",
    ultimaConsulta: "Última consulta", primeiraConsulta: "Primeira consulta", numConsultas: "Nº consultas",
    cid: "CID", descricao: "Descrição", ocorrencias: "Ocorrências", pacientes: "Pacientes",
    origem: "Origem", numPacientes: "Nº pacientes", numFaltas: "Nº faltas", ultimaFalta: "Última falta",
    grupo: "Grupo", numAtendimentos: "Nº atendimentos", receitaCents: "Receita", comissaoPct: "Comissão",
    repasseCents: "Valor a repassar", nota: "Nota", quantidade: "Quantidade", percentual: "Percentual",
    dataNascimento: "Data de nascimento",
  },
  en: {
    data: "Date", hora: "Time", paciente: "Patient", profissional: "Professional",
    procedimentos: "Procedures", convenio: "Insurance", telefone: "Phone",
    ultimaConsulta: "Last visit", primeiraConsulta: "First visit", numConsultas: "# visits",
    cid: "ICD", descricao: "Description", ocorrencias: "Occurrences", pacientes: "Patients",
    origem: "Source", numPacientes: "# patients", numFaltas: "# no-shows", ultimaFalta: "Last no-show",
    grupo: "Group", numAtendimentos: "# appointments", receitaCents: "Revenue", comissaoPct: "Commission",
    repasseCents: "Payout amount", nota: "Score", quantidade: "Count", percentual: "Percentage",
    dataNascimento: "Date of birth",
  },
  es: {
    data: "Fecha", hora: "Hora", paciente: "Paciente", profissional: "Profesional",
    procedimentos: "Procedimientos", convenio: "Convenio", telefone: "Teléfono",
    ultimaConsulta: "Última consulta", primeiraConsulta: "Primera consulta", numConsultas: "Nº consultas",
    cid: "CIE", descricao: "Descripción", ocorrencias: "Ocurrencias", pacientes: "Pacientes",
    origem: "Origen", numPacientes: "Nº pacientes", numFaltas: "Nº ausencias", ultimaFalta: "Última ausencia",
    grupo: "Grupo", numAtendimentos: "Nº atenciones", receitaCents: "Ingresos", comissaoPct: "Comisión",
    repasseCents: "Monto a pagar", nota: "Nota", quantidade: "Cantidad", percentual: "Porcentaje",
    dataNascimento: "Fecha de nacimiento",
  },
};

const GERAL = {
  pt: { geradoEm: "Gerado em", periodo: "Período", profissional: "Profissional", todos: "Todos", semDados: "Nenhum registro encontrado.", pagina: "Página", de: "de", media: "Média" },
  en: { geradoEm: "Generated on", periodo: "Period", profissional: "Professional", todos: "All", semDados: "No records found.", pagina: "Page", de: "of", media: "Average" },
  es: { geradoEm: "Generado el", periodo: "Período", profissional: "Profesional", todos: "Todos", semDados: "Ningún registro encontrado.", pagina: "Página", de: "de", media: "Promedio" },
};

export function rotulos(idioma) {
  const l = COLUNAS[idioma] ? idioma : "pt";
  return { titulo: TITULOS[l], coluna: COLUNAS[l], geral: GERAL[l] };
}
