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

// Recorte dos bancos mais comuns pro seletor visual do modal "Nova Conta
// Bancária" - subconjunto de BANCOS (mesmo "nome", pra bater com o rótulo
// gravado), mais a Asaas, que não é banco FEBRABAN (é gateway de pagamento)
// e por isso não tem "codigo". Sem logotipo real: não há asset de marca
// nenhum neste projeto, e baixar/hospedar marca de terceiro é fora de
// escopo - o seletor usa badge de iniciais coloridas (ver inicialBanco/
// corBanco abaixo), não o logo de verdade.
export const BANCOS_DESTAQUE = [
  { nome: "Itaú Unibanco" },
  { nome: "Bradesco" },
  { nome: "Santander" },
  { nome: "Nubank" },
  { nome: "Banco Inter" },
  { nome: "Caixa Econômica Federal" },
  { nome: "Banco do Brasil" },
  { nome: "Asaas" },
];

// 1-2 letras pro badge - inicial da primeira e (se houver) da última palavra
// do nome (ex.: "Banco do Brasil" -> "BB", "Nubank" -> "N", "Caixa Econômica
// Federal" -> "CF").
export function inicialBanco(nome) {
  const palavras = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return "?";
  if (palavras.length === 1) return palavras[0][0].toUpperCase();
  return (palavras[0][0] + palavras[palavras.length - 1][0]).toUpperCase();
}

// Cor pastel estável por banco - hash simples do nome sobre uma paleta fixa
// (mesmas ~6 cores já usadas nos badges de tipo de contato), não uma cor por
// banco escolhida à mão: assim "Outro banco" digitado também cai numa cor
// consistente, sem precisar cadastrar cada nome nesta lista.
const PALETA_BANCO = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2"];
export function corBanco(nome) {
  const s = String(nome || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETA_BANCO[hash % PALETA_BANCO.length];
}
