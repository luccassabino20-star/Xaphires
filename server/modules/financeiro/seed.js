// Categorias padrão semeadas na primeira vez que a empresa abre o Financeiro.
// Não há coluna de locale na empresa (o cadastro passa o idioma na hora), então
// o mesmo padrão vale aqui: quem chama informa o locale, com pt de fallback -
// igual a getSeedContent do quadro inicial.
//
// Conjunto propositalmente enxuto e genérico: dá para começar a lançar sem parar
// para cadastrar categoria, e cada empresa ajusta o seu depois. tipo agrupa o
// DRE ('receita' no topo do resultado, 'despesa' embaixo).
import { countCategorias, insertCategoria } from "./repo.js";

const PADRAO = {
  pt: [
    // Receitas (grupo 3)
    { codigo: "3.01", nome: "Vendas", tipo: "receita" },
    { codigo: "3.02", nome: "Serviços prestados", tipo: "receita" },
    { codigo: "3.03", nome: "Medições de obra", tipo: "receita" },
    { codigo: "3.04", nome: "Aporte de sócios", tipo: "receita" },
    { codigo: "3.99", nome: "Outras receitas", tipo: "receita" },
    // Despesas (grupo 4) - contas do dia a dia: água, luz, telefone...
    { codigo: "4.01", nome: "Água", tipo: "despesa" },
    { codigo: "4.02", nome: "Energia elétrica", tipo: "despesa" },
    { codigo: "4.03", nome: "Telefone", tipo: "despesa" },
    { codigo: "4.04", nome: "Internet", tipo: "despesa" },
    { codigo: "4.05", nome: "Aluguel", tipo: "despesa" },
    { codigo: "4.06", nome: "Salários", tipo: "despesa" },
    { codigo: "4.07", nome: "Encargos sociais", tipo: "despesa" },
    { codigo: "4.08", nome: "Impostos e taxas", tipo: "despesa" },
    { codigo: "4.09", nome: "Material de construção", tipo: "despesa" },
    { codigo: "4.10", nome: "Material de escritório", tipo: "despesa" },
    { codigo: "4.11", nome: "Combustível", tipo: "despesa" },
    { codigo: "4.12", nome: "Manutenção", tipo: "despesa" },
    { codigo: "4.13", nome: "Serviços de terceiros", tipo: "despesa" },
    { codigo: "4.99", nome: "Outras despesas", tipo: "despesa" },
  ],
  en: [
    { codigo: "3.01", nome: "Sales", tipo: "receita" },
    { codigo: "3.02", nome: "Services rendered", tipo: "receita" },
    { codigo: "3.03", nome: "Project billings", tipo: "receita" },
    { codigo: "3.04", nome: "Owner contributions", tipo: "receita" },
    { codigo: "3.99", nome: "Other income", tipo: "receita" },
    { codigo: "4.01", nome: "Water", tipo: "despesa" },
    { codigo: "4.02", nome: "Electricity", tipo: "despesa" },
    { codigo: "4.03", nome: "Phone", tipo: "despesa" },
    { codigo: "4.04", nome: "Internet", tipo: "despesa" },
    { codigo: "4.05", nome: "Rent", tipo: "despesa" },
    { codigo: "4.06", nome: "Payroll", tipo: "despesa" },
    { codigo: "4.07", nome: "Payroll taxes", tipo: "despesa" },
    { codigo: "4.08", nome: "Taxes and fees", tipo: "despesa" },
    { codigo: "4.09", nome: "Construction materials", tipo: "despesa" },
    { codigo: "4.10", nome: "Office supplies", tipo: "despesa" },
    { codigo: "4.11", nome: "Fuel", tipo: "despesa" },
    { codigo: "4.12", nome: "Maintenance", tipo: "despesa" },
    { codigo: "4.13", nome: "Outsourced services", tipo: "despesa" },
    { codigo: "4.99", nome: "Other expenses", tipo: "despesa" },
  ],
  es: [
    { codigo: "3.01", nome: "Ventas", tipo: "receita" },
    { codigo: "3.02", nome: "Servicios prestados", tipo: "receita" },
    { codigo: "3.03", nome: "Mediciones de obra", tipo: "receita" },
    { codigo: "3.04", nome: "Aporte de socios", tipo: "receita" },
    { codigo: "3.99", nome: "Otros ingresos", tipo: "receita" },
    { codigo: "4.01", nome: "Agua", tipo: "despesa" },
    { codigo: "4.02", nome: "Energía eléctrica", tipo: "despesa" },
    { codigo: "4.03", nome: "Teléfono", tipo: "despesa" },
    { codigo: "4.04", nome: "Internet", tipo: "despesa" },
    { codigo: "4.05", nome: "Alquiler", tipo: "despesa" },
    { codigo: "4.06", nome: "Salarios", tipo: "despesa" },
    { codigo: "4.07", nome: "Cargas sociales", tipo: "despesa" },
    { codigo: "4.08", nome: "Impuestos y tasas", tipo: "despesa" },
    { codigo: "4.09", nome: "Material de construcción", tipo: "despesa" },
    { codigo: "4.10", nome: "Material de oficina", tipo: "despesa" },
    { codigo: "4.11", nome: "Combustible", tipo: "despesa" },
    { codigo: "4.12", nome: "Mantenimiento", tipo: "despesa" },
    { codigo: "4.13", nome: "Servicios de terceros", tipo: "despesa" },
    { codigo: "4.99", nome: "Otros gastos", tipo: "despesa" },
  ],
};

// Semeia só quando não há nenhuma categoria - idempotente, pode ser chamada em
// toda leitura de categorias sem duplicar. Quem já criou (ou apagou todas) não é
// re-semeado; o gatilho é "vazio", não "primeira vez" gravado em lugar nenhum.
export function seedCategoriasSeVazio(locale) {
  if (countCategorias() > 0) return;
  const lista = PADRAO[locale] || PADRAO.pt;
  for (const cat of lista) insertCategoria(cat);
}
