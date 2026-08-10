// Validação de CPF e CNPJ.
//
// O servidor é a autoridade: o cliente valida igual em src/utils/doc.js para dar
// resposta imediata, mas quem decide é aqui. As duas cópias implementam o mesmo
// algoritmo de dígito verificador, que é padrão fixo e não muda — se um dia mudar
// alguma coisa, mude nos dois.
//
// Validar de verdade, e não só contar dígitos, evita o pior caminho: mandar um
// documento inválido para o gateway e receber de volta um erro genérico que ninguém
// consegue explicar na tela.

export function normalizarDoc(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function digitosIguais(numeros) {
  return /^(\d)\1+$/.test(numeros);
}

function cpfValido(cpf) {
  if (cpf.length !== 11) return false;
  // 111.111.111-11 e afins passam na conta do dígito verificador, mas não existem.
  if (digitosIguais(cpf)) return false;
  for (const [tamanho, pesoInicial] of [
    [9, 10],
    [10, 11],
  ]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    const digito = resto === 10 ? 0 : resto;
    if (digito !== Number(cpf[tamanho])) return false;
  }
  return true;
}

export function cnpjValido(cnpj) {
  if (cnpj.length !== 14) return false;
  if (digitosIguais(cnpj)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const tamanho of [12, 13]) {
    const usados = pesos.slice(pesos.length - tamanho);
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cnpj[i]) * usados[i];
    const resto = soma % 11;
    const digito = resto < 2 ? 0 : 11 - resto;
    if (digito !== Number(cnpj[tamanho])) return false;
  }
  return true;
}

// Aceita CPF ou CNPJ: empresa paga com um ou com outro, e recusar CNPJ deixaria
// de fora justamente o cliente maior.
export function docValido(valor) {
  const numeros = normalizarDoc(valor);
  if (numeros.length === 11) return cpfValido(numeros);
  if (numeros.length === 14) return cnpjValido(numeros);
  return false;
}
