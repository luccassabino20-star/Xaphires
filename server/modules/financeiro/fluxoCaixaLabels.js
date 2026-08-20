// Rótulos do arquivo exportado do Fluxo de Caixa em matriz - separado dos rótulos
// de outros relatórios porque a forma é outra (linha de grupo fixo x coluna de
// período, não coluna livre por tipo de relatório). Mesmo motivo do
// reportsLabels.js de Saúde & Clínicas: quem escreve o arquivo é o servidor, e
// carregar o i18n inteiro do cliente pra pegar poucas chaves não compensa. Chaves
// de grupo espelham exatamente calculos.js (GRUPOS_RECEITA/GRUPOS_DESPESA/
// GRUPOS_TRANSFERENCIA) e resumo.*.
const FLUXO_CAIXA = {
  pt: {
    titulo: "Fluxo de caixa", conta: "Conta", contaTodas: "Todas as contas", periodoColuna: "Grupo",
    grupo: {
      receita_atendimento: "Atendimento / Procedimentos", receita_produtos: "Vendas de Produtos", receita_outras: "Outras Receitas",
      despesa_operacional: "Despesas Operacionais / Suprimentos", despesa_financeira: "Despesas Financeiras / Taxas de Cartão",
      despesa_pessoal: "Funcionários & Pro-labore", despesa_impostos: "Impostos e Tributos", despesa_outras: "Outras Despesas",
      transferencia_entrada: "Transferências (Entrada)", transferencia_saida: "Transferências (Saída)",
    },
    secao: { receitas: "Receitas", despesas: "Despesas", transferencias: "Transferências", resumo: "Resumo Financeiro" },
    resumo: { geracaoCaixa: "Geração de Caixa", saldoAnterior: "Saldo Anterior", saldoFinal: "Saldo Final" },
    totalReceitas: "Total Receitas", totalDespesas: "Total Despesas",
    geradoEm: "Gerado em", pagina: "Página", de: "de",
  },
  en: {
    titulo: "Cash flow", conta: "Account", contaTodas: "All accounts", periodoColuna: "Group",
    grupo: {
      receita_atendimento: "Appointments / Procedures", receita_produtos: "Product Sales", receita_outras: "Other Revenue",
      despesa_operacional: "Operating Expenses / Supplies", despesa_financeira: "Financial Expenses / Card Fees",
      despesa_pessoal: "Staff & Owner Draws", despesa_impostos: "Taxes", despesa_outras: "Other Expenses",
      transferencia_entrada: "Transfers (In)", transferencia_saida: "Transfers (Out)",
    },
    secao: { receitas: "Revenue", despesas: "Expenses", transferencias: "Transfers", resumo: "Financial Summary" },
    resumo: { geracaoCaixa: "Cash Generated", saldoAnterior: "Opening Balance", saldoFinal: "Closing Balance" },
    totalReceitas: "Total Revenue", totalDespesas: "Total Expenses",
    geradoEm: "Generated on", pagina: "Page", de: "of",
  },
  es: {
    titulo: "Flujo de caja", conta: "Cuenta", contaTodas: "Todas las cuentas", periodoColuna: "Grupo",
    grupo: {
      receita_atendimento: "Atención / Procedimientos", receita_produtos: "Venta de Productos", receita_outras: "Otros Ingresos",
      despesa_operacional: "Gastos Operativos / Insumos", despesa_financeira: "Gastos Financieros / Tasas de Tarjeta",
      despesa_pessoal: "Personal y Retiros", despesa_impostos: "Impuestos", despesa_outras: "Otros Gastos",
      transferencia_entrada: "Transferencias (Entrada)", transferencia_saida: "Transferencias (Salida)",
    },
    secao: { receitas: "Ingresos", despesas: "Gastos", transferencias: "Transferencias", resumo: "Resumen Financiero" },
    resumo: { geracaoCaixa: "Generación de Caja", saldoAnterior: "Saldo Anterior", saldoFinal: "Saldo Final" },
    totalReceitas: "Total Ingresos", totalDespesas: "Total Gastos",
    geradoEm: "Generado el", pagina: "Página", de: "de",
  },
};

export function rotulosFluxoCaixa(idioma) {
  return FLUXO_CAIXA[idioma] || FLUXO_CAIXA.pt;
}
