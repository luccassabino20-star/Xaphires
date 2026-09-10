// Contrato do provedor de Cobranças, e a escolha de qual usar.
//
// Diferente de server/billing/gateway.js (singleton escolhido UMA VEZ no boot,
// a partir de uma variável de ambiente): aqui cada EMPRESA tem sua própria
// conta no provedor, então o gateway é resolvido A CADA CHAMADA a partir da
// config gravada no banco dela (financeiro_gateway_config, ver cobrancaRepo.js)
// - nunca de uma env var global.
//
// Um provedor implementa:
//
//   nome                    string, gravada em financeiro_cobrancas.provider
//   metodosSuportados()     ['pix','boleto','card'] - nem todo provedor cobra
//                           cartão (ex.: Banco Inter só tem Pix/boleto); a UI
//                           usa isto para desabilitar o método que falta.
//   criarCobranca({ metodo, valorCents, descricao, contato, config, cardNumber? })
//                           emite a cobrança. Devolve { providerChargeId, status,
//                           pixPayload?, pixQrcodeB64?, boletoLine?, boletoPdfUrl?,
//                           checkoutUrl? }. cardNumber só é usado pelo provedor
//                           fake (ver providers/fake.js) - nenhum provedor real
//                           recebe número de cartão do nosso servidor; cartão de
//                           verdade é sempre checkout hospedado (checkoutUrl).
//   consultarCobranca(id, config)   estado atual no gateway. { status }.
//   cancelarCobranca(id, config)    cancela/estorna no gateway.
//   consultarSaldo(config)          saldo disponível na conta do provedor
//                           (a KPI "Saldo disponível para saque" do dashboard).
//                           { saldoCents } ou { saldoCents: null } quando o
//                           provedor não expõe isso (o simulado, por ex.).
//   lerWebhook(req, config) traduz o aviso do provedor para
//                           { providerChargeId, status? } ou null se não
//                           reconhecer / autenticação inválida.
//
// `status` é sempre um dos nossos: pending | paid | failed | canceled | refunded.
import { fake } from "./providers/fake.js";

// mercadopago.js e bancointer.js chegam nas fases seguintes (ver o plano) -
// nenhum dos dois foi integrado neste projeto ainda, e cada um precisa do
// próprio script de verificação contra sandbox antes de ir para produção,
// mesmo espírito de server/billing/verificarCredencial.js.
const PROVEDORES = { fake };

export function resolverGateway(provider) {
  return PROVEDORES[provider] || fake;
}

export const METODOS = ["pix", "boleto", "card"];

export function metodoValido(metodo) {
  return METODOS.includes(metodo);
}
