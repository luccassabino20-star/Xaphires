// Contrato do provedor de pagamento, e a escolha de qual usar.
//
// Toda a cobrança conversa só com esta interface. Nenhum outro arquivo importa SDK
// de gateway nem monta requisição para a API de ninguém — é o que permite trocar de
// provedor, ou rodar o ciclo inteiro localmente sem cobrar de verdade, sem tocar na
// lógica de assinatura.
//
// Um provedor implementa:
//
//   nome                        string, gravada em payments.provider
//   criarCobranca({...})        emite uma cobrança avulsa de um ciclo.
//                               Devolve { providerChargeId, status, checkoutUrl?,
//                               pixCode?, boletoLine?, dueAt? }
//   consultarCobranca(id)       estado atual no gateway. Devolve { status } —
//                               usado para conferir sem depender do webhook.
//   criarAssinatura({...})      débito recorrente no cartão. Devolve
//                               { providerSubscriptionId, status }
//   cancelarAssinatura(id)      encerra o débito recorrente.
//   lerWebhook(req)             traduz o aviso do gateway para
//                               { providerChargeId, status } ou null se não
//                               reconhecer / assinatura inválida.
//
// `status` é sempre um dos nossos: pending | paid | failed | canceled | refunded.
// Traduzir o vocabulário do provedor para o nosso é responsabilidade dele, para o
// resto do sistema não precisar conhecer "approved", "accredited" e afins.

import { fake } from "./providers/fake.js";
import { mercadoPago } from "./providers/mercadopago.js";

const PROVEDORES = { fake, mercadopago: mercadoPago };

// Padrão é o simulado: uma instalação sem credencial configurada não deve começar a
// tentar cobrança real, e um esquecimento de variável de ambiente não pode virar
// cobrança silenciosa no cartão de ninguém.
const escolhido = (process.env.BILLING_PROVIDER || "fake").toLowerCase();

export const gateway = PROVEDORES[escolhido] || fake;

if (!PROVEDORES[escolhido]) {
  console.warn(
    `[billing] BILLING_PROVIDER="${escolhido}" não é um provedor conhecido (${Object.keys(PROVEDORES).join(", ")}). Usando o simulado.`
  );
}

export const METODOS = ["card", "pix", "boleto"];

export function metodoValido(metodo) {
  return METODOS.includes(metodo);
}

// Só o cartão renova sozinho. Pix e boleto não têm débito automático: a recorrência
// deles é uma cobrança nova que nós emitimos a cada ciclo, e o cliente paga.
export function metodoTemDebitoAutomatico(metodo) {
  return metodo === "card";
}
