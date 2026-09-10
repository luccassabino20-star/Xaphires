// Régua de cobrança e recorrência - tudo CALCULADO NA LEITURA, nada por cron
// (mesmo padrão de runAutoArchive/runRecurrences/varrerCobranca em
// server/billing/lifecycle.js). O projeto não tem envio automático de e-mail
// nem WhatsApp (só link wa.me, que abre a conversa com o texto pronto pra
// pessoa clicar Enviar) - a régua aqui NUNCA dispara mensagem sozinha. O que
// ela faz é: (1) calcular o estágio de cada cobrança pendente, pra colorir a
// linha na grade, e (2) montar o texto do lembrete, pra virar o link de
// WhatsApp quando alguém clica.
import { hojeCivil } from "./repo.js";
import { getReguaConfig, insertCobranca, listRecorrencias, avancarProximaEmissao, getGatewayConfigInterno } from "./cobrancaRepo.js";
import { resolverGateway } from "./gateway/index.js";

function diasEntre(deCivil, ateCivil) {
  const [y1, m1, d1] = deCivil.split("-").map(Number);
  const [y2, m2, d2] = ateCivil.split("-").map(Number);
  const ms = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
  return Math.round(ms / 86400000);
}

// Estágio da régua para uma cobrança ainda pendente: 'pre_vencimento' (dentro
// da janela configurada antes do due), 'vencimento' (é hoje), 'atrasado' (due
// já passou) ou null (nem perto do vencimento ainda, ou já paga/cancelada).
export function estagio(cobranca, { hoje = hojeCivil(), diasAntes } = {}) {
  if (cobranca.status !== "pending") return null;
  const dias = diasEntre(hoje, cobranca.due);
  if (dias < 0) return "atrasado";
  if (dias === 0) return "vencimento";
  if (dias <= diasAntes) return "pre_vencimento";
  return null;
}

// Multa/juros aplicados SÓ NA EXIBIÇÃO quando atrasado - nunca reescreve
// valor_cents (mesmo princípio do billing: o histórico não muda de ciclo).
// juros_percent_mes é pro-rata pelos dias de atraso (não o mês cheio).
export function valorAtualizadoCents(cobranca, { hoje = hojeCivil() } = {}) {
  if (cobranca.status !== "pending") return cobranca.valor_cents;
  const diasAtraso = diasEntre(cobranca.due, hoje);
  if (diasAtraso <= 0) return cobranca.valor_cents;
  const multa = Math.round((cobranca.valor_cents * (cobranca.multa_percent || 0)) / 100);
  const jurosDia = (cobranca.valor_cents * (cobranca.juros_percent_mes || 0)) / 100 / 30;
  const juros = Math.round(jurosDia * diasAtraso);
  return cobranca.valor_cents + multa + juros;
}

// Placeholders {{nome}}/{{valor}}/{{vencimento}}/{{link}} - resolvidos aqui,
// não guardados prontos, porque o valor pode ter multa/juros de exibição por
// cima (ver valorAtualizadoCents) e o link muda por cobrança.
export function montarMensagem(cobranca, estagioAtual, config, { link } = {}) {
  const template =
    estagioAtual === "pre_vencimento" ? config.mensagem_pre : estagioAtual === "vencimento" ? config.mensagem_dia : config.mensagem_pos;
  const valor = (valorAtualizadoCents(cobranca) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const vencimento = cobranca.due.split("-").reverse().join("/");
  return (template || "")
    .replaceAll("{{nome}}", cobranca.contato_nome || "")
    .replaceAll("{{valor}}", valor)
    .replaceAll("{{vencimento}}", vencimento)
    .replaceAll("{{link}}", link || cobranca.checkout_url || cobranca.boleto_pdf_url || "");
}

// Emite a próxima cobrança de cada recorrência ativa vencida (proxima_emissao
// <= hoje), e avança a régua pro próximo ciclo. Rodada na leitura da lista de
// Cobranças (mesmo espírito de varrerCobranca() em server/billing/lifecycle.js)
// - se ninguém abrir a tela num dia, a emissão só acontece na próxima visita,
// limitação já aceita pelo billing de assinatura hoje.
export async function varrerRecorrencias({ createdBy } = {}) {
  const hoje = hojeCivil();
  const pendentes = listRecorrencias().filter((r) => r.ativa && r.proxima_emissao <= hoje);
  if (!pendentes.length) return [];
  const regua = getReguaConfig();
  const { provider, config } = getGatewayConfigInterno();
  const gateway = resolverGateway(provider);
  const emitidas = [];
  for (const r of pendentes) {
    const resultado = await gateway.criarCobranca({ metodo: r.metodo, valorCents: r.valor_cents, descricao: r.descricao, config });
    emitidas.push(
      insertCobranca({
        contatoId: r.contato_id,
        descricao: r.descricao,
        valorCents: r.valor_cents,
        due: r.proxima_emissao,
        metodo: r.metodo,
        recorrenciaId: r.id,
        provider: gateway.nome,
        providerChargeId: resultado.providerChargeId,
        status: resultado.status === "paid" ? "paid" : "pending",
        pixPayload: resultado.pixPayload,
        pixQrcodeB64: resultado.pixQrcodeB64,
        boletoLine: resultado.boletoLine,
        boletoPdfUrl: resultado.boletoPdfUrl,
        checkoutUrl: resultado.checkoutUrl,
        multaPercent: regua.multa_percent,
        jurosPercentMes: regua.juros_percent_mes,
        createdBy,
      })
    );
    avancarProximaEmissao(r.id);
  }
  return emitidas;
}
