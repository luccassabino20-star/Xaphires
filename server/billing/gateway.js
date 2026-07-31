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
//   criarCobranca({..., paymentId})  emite uma cobrança avulsa de um ciclo.
//                               Devolve { providerChargeId, status, checkoutUrl?,
//                               pixCode?, boletoLine?, dueAt? }. providerChargeId
//                               pode vir null (checkout hospedado que ainda não
//                               foi completado) — nesse caso o pagamento local
//                               nasce sem id de cobrança, e só o webhook, casando
//                               por externalReference (= paymentId, que o
//                               chamador já gerou e passou), preenche depois.
//   consultarCobranca(id)       estado atual no gateway. Devolve { status } —
//                               usado para conferir sem depender do webhook.
//                               Chamado com null quando ainda não há
//                               providerChargeId (checkout pendente): o provedor
//                               deve devolver { status: null } sem falhar.
//   criarAssinatura({...})      débito recorrente. Devolve
//                               { providerSubscriptionId, status }.
//                               providerSubscriptionId pode vir null quando o
//                               provedor só sabe o id real depois que a pessoa
//                               completa um checkout hospedado — o webhook
//                               preenche via providerSubscriptionId (ver abaixo).
//   cancelarAssinatura(id)      encerra o débito recorrente.
//   lerWebhook(req)             traduz o aviso do gateway para
//                               { providerChargeId, status?, consultar?,
//                               externalReference?, providerSubscriptionId? }, ou
//                               null se não reconhecer / autenticação inválida.
//                               externalReference e providerSubscriptionId são
//                               opcionais — só provedores com checkout hospedado
//                               e renovação nativa (Asaas) os usam; a rota do
//                               webhook trata a ausência deles normalmente.
//
// `status` é sempre um dos nossos: pending | paid | failed | canceled | refunded.
// Traduzir o vocabulário do provedor para o nosso é responsabilidade dele, para o
// resto do sistema não precisar conhecer "approved", "RECEIVED_IN_CASH" e afins.

import { fake } from "./providers/fake.js";
import { asaas } from "./providers/asaas.js";

const PROVEDORES = { fake, asaas };

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

// Confere a configuração no arranque, e não na primeira cobrança. Um provedor real
// sem credencial só falharia quando alguém tentasse pagar — no pior momento
// possível, e com o cliente na frente da tela. Aqui o erro aparece no log de quem
// subiu o servidor, que é quem pode consertar.
if (gateway.nome !== "fake") {
  const faltando = [];
  if (gateway.nome === "asaas") {
    if (!process.env.ASAAS_API_KEY) faltando.push("ASAAS_API_KEY");
    // Sem o token do webhook a validação recusa tudo, de propósito, e nenhum
    // pagamento seria confirmado pelo aviso do gateway.
    if (!process.env.ASAAS_WEBHOOK_TOKEN) faltando.push("ASAAS_WEBHOOK_TOKEN");
  }
  if (faltando.length > 0) {
    console.error(
      `[billing] PROVEDOR "${gateway.nome}" SELECIONADO SEM CONFIGURAÇÃO COMPLETA. Faltando: ${faltando.join(", ")}. ` +
        `As cobranças vão falhar. Defina as variáveis ou rode com BILLING_PROVIDER=fake.`
    );
  } else {
    console.log(`[billing] provedor ativo: ${gateway.nome}`);
  }
}

export const METODOS = ["card", "pix", "boleto"];

export function metodoValido(metodo) {
  return METODOS.includes(metodo);
}

// Só o cartão tem débito automático. Pix e boleto não: a recorrência deles é uma
// cobrança nova que nós emitimos a cada ciclo, e o cliente paga.
export function metodoTemDebitoAutomatico(metodo) {
  return metodo === "card";
}

// Débito automático não é sempre "o gateway cobra sozinho, sem depender de nós de
// novo" — depende do PROVEDOR, não só do método. O Asaas cria uma assinatura de
// verdade no checkout hospedado, que renova o cartão sem nenhuma chamada nossa; o
// simulado (fake.js) não tem esse motor, e cobra de novo só quando emitirCobranca()
// é chamada, do mesmo jeito que Pix e boleto — é assim que dá para exercitar
// renovação e cancelamento em desenvolvimento, sem credencial nenhuma. Cada
// provedor declara `renovaCartaoSozinho` para dizer de qual lado está.
//
// lifecycle.js usa isto (não metodoTemDebitoAutomatico) para decidir se agenda
// next_charge_at: agendar quando o próprio gateway já vai cobrar de novo criaria
// uma segunda cobrança por cima da automática.
export function metodoRenovaSozinho(metodo) {
  return metodoTemDebitoAutomatico(metodo) && !!gateway.renovaCartaoSozinho;
}
