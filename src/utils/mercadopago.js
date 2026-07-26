// Carregamento e uso do SDK do Mercado Pago para tokenizar cartão.
//
// O carregamento vem de `@mercadopago/sdk-js`, e não de uma tag <script> montada na
// mão: o pacote resolve a URL do SDK e o carregamento único, e uma mudança de
// endereço do script deixa de ser problema nosso. O que ele traz para a página
// continua sendo o mesmo bundle do Mercado Pago, servido por eles.
//
// AINDA NÃO FOI EXERCITADO: montar os campos exige chave pública de uma conta real.
// Os pontos marcados com "conferir:" são os que quebram calado se a API do SDK for
// diferente do descrito.
//
// POR QUE SECURE FIELDS, E NÃO UM FORMULÁRIO NOSSO
//
// O SDK oferece dois caminhos. Em `mp.createCardToken({ cardNumber, ... })` nós
// montamos os inputs e passamos os valores — o número do cartão vive no estado do
// nosso JavaScript, ainda que não chegue ao servidor. Em Secure Fields, cada campo
// é um iframe do próprio Mercado Pago: o número nunca existe em variável nossa,
// nem em memória, nem em log de erro, nem em snapshot de estado.
//
// A diferença é de escopo de conformidade (SAQ A-EP contra SAQ A) e é o motivo
// desta etapa existir. Formulário próprio seria mais simples de escrever e jogaria
// para o futuro um retrofit muito mais caro.
//
// Consequência prática para quem for mexer: NÃO existe, e não pode passar a
// existir, um estado React com o número do cartão. Se aparecer um `useState` para
// isso em algum lugar, o desenho foi perdido.

let promessaSdk = null;

// Carrega o SDK uma vez só, e só quando alguém escolhe pagar com cartão.
//
// O import é dinâmico de propósito: com import estático o Vite colocaria o pacote no
// bundle principal, e todo visitante da landing baixaria código de pagamento que
// nunca vai usar. Assim ele vira um pedaço separado, buscado no primeiro uso.
export function carregarSdk() {
  if (promessaSdk) return promessaSdk;
  promessaSdk = (async () => {
    try {
      const { loadMercadoPago } = await import("@mercadopago/sdk-js");
      await loadMercadoPago();
      if (!window.MercadoPago) throw new Error("SDK carregou sem expor MercadoPago");
      return window.MercadoPago;
    } catch (err) {
      // Zera para uma nova tentativa poder recarregar: rede cai, e travar o SDK como
      // "falhou para sempre" obrigaria a recarregar a página inteira.
      promessaSdk = null;
      throw new Error("Não foi possível carregar o SDK do Mercado Pago");
    }
  })();
  return promessaSdk;
}

// Monta os três campos seguros nos contêineres informados e devolve um objeto com
// `gerarToken` e `desmontar`.
//
// `alvos` são ids de elementos já presentes no DOM — daí o chamador precisar
// esperar o React renderizar antes de chamar isto.
export async function montarCamposCartao({ publicKey, locale, alvos, onErroCampo }) {
  const MercadoPago = await carregarSdk();
  const mp = new MercadoPago(publicKey, { locale: locale || "pt-BR" });

  // conferir: a API de fields. `mp.fields.create(tipo, opcoes).mount(idDoElemento)`.
  const numero = mp.fields.create("cardNumber", { placeholder: "0000 0000 0000 0000" }).mount(alvos.numero);
  const validade = mp.fields.create("expirationDate", { placeholder: "MM/AA" }).mount(alvos.validade);
  const cvv = mp.fields.create("securityCode", { placeholder: "123" }).mount(alvos.cvv);

  // Erro de validação vem por evento do próprio campo, já que não temos acesso ao
  // conteúdo dele para validar por conta própria.
  if (onErroCampo) {
    for (const campo of [numero, validade, cvv]) {
      campo.on?.("error", (evento) => onErroCampo(evento?.[0]?.message || null));
      campo.on?.("validityChange", (evento) => onErroCampo(evento?.errorMessages?.[0]?.message || null));
    }
  }

  return {
    // Gera o token. Os dados do cartão saem dos iframes direto para o Mercado Pago;
    // o que volta para nós é só um identificador de uso único.
    async gerarToken({ nomeTitular, tipoDoc, numeroDoc }) {
      // conferir: assinatura de createCardToken no modo fields.
      const resposta = await mp.fields.createCardToken({
        cardholderName: nomeTitular,
        ...(numeroDoc ? { identificationType: tipoDoc || "CPF", identificationNumber: numeroDoc } : {}),
      });
      if (!resposta?.id) throw new Error("O Mercado Pago não devolveu um token para este cartão.");
      return resposta.id;
    },
    desmontar() {
      for (const campo of [numero, validade, cvv]) {
        try {
          campo.unmount?.();
        } catch {
          /* já pode ter saído do DOM */
        }
      }
    },
  };
}
