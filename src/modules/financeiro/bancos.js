// Bancos comuns no Brasil (código FEBRABAN + nome), para o select de "Banco" no
// cadastro de conta corrente - o mesmo estilo "código - nome" do SIGIM (ex.:
// "748 - SICREDI"). Não é a tabela FEBRABAN inteira (são centenas); cobre os
// mais usados e o cadastro sempre tem a opção "Outro" para digitar o resto.
export const BANCOS = [
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "033", nome: "Santander" },
  { codigo: "041", nome: "Banrisul" },
  { codigo: "077", nome: "Banco Inter" },
  { codigo: "104", nome: "Caixa Econômica Federal" },
  { codigo: "208", nome: "BTG Pactual" },
  { codigo: "212", nome: "Banco Original" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "260", nome: "Nubank" },
  { codigo: "290", nome: "PagBank" },
  { codigo: "336", nome: "C6 Bank" },
  { codigo: "341", nome: "Itaú Unibanco" },
  { codigo: "380", nome: "PicPay" },
  { codigo: "422", nome: "Banco Safra" },
  { codigo: "623", nome: "Banco Pan" },
  { codigo: "633", nome: "Banco Rendimento" },
  { codigo: "735", nome: "Banco Neon" },
  { codigo: "748", nome: "Sicredi" },
  { codigo: "756", nome: "Sicoob" },
];

// "código - nome", pronto para o value guardado em financeiro_contas.banco.
export function rotuloBanco(b) {
  return `${b.codigo} - ${b.nome}`;
}
