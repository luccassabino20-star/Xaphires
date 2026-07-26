// Validação e máscara de CPF/CNPJ no cliente.
//
// Espelha server/doc.js, que é a autoridade. Aqui a validação existe para dar
// resposta imediata enquanto se digita, em vez de deixar a pessoa clicar em pagar
// para só então descobrir o erro. O algoritmo é padrão fixo; se mudar num lado,
// mude no outro.

export function normalizarDoc(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function digitosIguais(numeros) {
  return /^(\d)\1+$/.test(numeros);
}

function cpfValido(cpf) {
  if (cpf.length !== 11) return false;
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

function cnpjValido(cnpj) {
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

export function docValido(valor) {
  const numeros = normalizarDoc(valor);
  if (numeros.length === 11) return cpfValido(numeros);
  if (numeros.length === 14) return cnpjValido(numeros);
  return false;
}

// Máscara progressiva: formata o que já foi digitado sem exigir o campo completo,
// e escolhe o formato pelo tamanho — até 11 dígitos é CPF, daí em diante CNPJ.
export function formatarDoc(valor) {
  const n = normalizarDoc(valor).slice(0, 14);
  if (n.length <= 11) {
    return n
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return n
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

// Rótulo do que está sendo digitado, para o campo dizer o que espera.
export function tipoDoc(valor) {
  return normalizarDoc(valor).length > 11 ? "CNPJ" : "CPF";
}
