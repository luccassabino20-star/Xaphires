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
    { nome: "Vendas", tipo: "receita" },
    { nome: "Serviços", tipo: "receita" },
    { nome: "Outras receitas", tipo: "receita" },
    { nome: "Fornecedores", tipo: "despesa" },
    { nome: "Salários", tipo: "despesa" },
    { nome: "Impostos", tipo: "despesa" },
    { nome: "Aluguel", tipo: "despesa" },
    { nome: "Outras despesas", tipo: "despesa" },
  ],
  en: [
    { nome: "Sales", tipo: "receita" },
    { nome: "Services", tipo: "receita" },
    { nome: "Other income", tipo: "receita" },
    { nome: "Suppliers", tipo: "despesa" },
    { nome: "Payroll", tipo: "despesa" },
    { nome: "Taxes", tipo: "despesa" },
    { nome: "Rent", tipo: "despesa" },
    { nome: "Other expenses", tipo: "despesa" },
  ],
  es: [
    { nome: "Ventas", tipo: "receita" },
    { nome: "Servicios", tipo: "receita" },
    { nome: "Otros ingresos", tipo: "receita" },
    { nome: "Proveedores", tipo: "despesa" },
    { nome: "Salarios", tipo: "despesa" },
    { nome: "Impuestos", tipo: "despesa" },
    { nome: "Alquiler", tipo: "despesa" },
    { nome: "Otros gastos", tipo: "despesa" },
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
