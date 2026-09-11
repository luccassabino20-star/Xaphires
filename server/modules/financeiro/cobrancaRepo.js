// Acesso ao banco de Cobranças (Financeiro → Faturamento). Mesmo padrão de
// repo.js: tudo passa por getDb(), resolvido pelo AsyncLocalStorage do
// companyId - só funciona dentro de um runWithCompany (requireAuth garante nas
// rotas normais; o webhook reentra na mão, ver routes/financeiroCobrancaWebhook.js).
import crypto from "node:crypto";
import { getDb } from "../../db.js";
import { uid } from "../../repo.js";
import { hojeCivil, addMesesCivil, insertLancamento, baixarLancamento, mudarStatusLancamento, deleteLancamento, getContato, getContaPrincipal } from "./repo.js";

// ---------- Config da régua (uma linha por empresa, id fixo) ----------
const REGUA_ID = "default";

export function getReguaConfig() {
  const c = getDb().prepare("SELECT * FROM financeiro_regua_config WHERE id = ?").get(REGUA_ID);
  if (c) return c;
  // Nasce com default na primeira leitura - evita um passo de "inicializar"
  // separado que alguém precisaria lembrar de chamar.
  const agora = new Date().toISOString();
  getDb()
    .prepare(
      "INSERT INTO financeiro_regua_config (id, dias_antes_vencimento, multa_percent, juros_percent_mes, mensagem_pre, mensagem_dia, mensagem_pos, updated_at) VALUES (?, 3, 0, 0, ?, ?, ?, ?)"
    )
    .run(
      REGUA_ID,
      "Olá {{nome}}, sua cobrança de {{valor}} vence em {{vencimento}}. Pague pelo link: {{link}}",
      "Olá {{nome}}, sua cobrança de {{valor}} vence hoje. Pague pelo link: {{link}}",
      "Olá {{nome}}, sua cobrança de {{valor}} está em atraso desde {{vencimento}}. Pague pelo link: {{link}}",
      agora
    );
  return getDb().prepare("SELECT * FROM financeiro_regua_config WHERE id = ?").get(REGUA_ID);
}

export function salvarReguaConfig(patch) {
  const atual = getReguaConfig();
  getDb()
    .prepare(
      `UPDATE financeiro_regua_config SET
        dias_antes_vencimento = ?, multa_percent = ?, juros_percent_mes = ?,
        mensagem_pre = ?, mensagem_dia = ?, mensagem_pos = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      patch.diasAntesVencimento ?? atual.dias_antes_vencimento,
      patch.multaPercent ?? atual.multa_percent,
      patch.jurosPercentMes ?? atual.juros_percent_mes,
      patch.mensagemPre ?? atual.mensagem_pre,
      patch.mensagemDia ?? atual.mensagem_dia,
      patch.mensagemPos ?? atual.mensagem_pos,
      new Date().toISOString(),
      REGUA_ID
    );
  return getReguaConfig();
}

// ---------- Config do gateway (uma linha por empresa, id fixo) ----------
const GATEWAY_ID = "default";

export function getGatewayConfig() {
  return getDb().prepare("SELECT * FROM financeiro_gateway_config WHERE id = ?").get(GATEWAY_ID) || null;
}

// Nunca devolve config_json pro cliente: é onde mora access_token/client_secret/
// certificado. Só o suficiente para a tela mostrar o que já está configurado e
// montar a URL do webhook.
export function getGatewayConfigPublico() {
  const c = getGatewayConfig();
  if (!c) return { provider: "fake", ambiente: "sandbox", configurado: false, webhookSecret: null };
  return { provider: c.provider, ambiente: c.ambiente, configurado: c.provider !== "fake", webhookSecret: c.webhook_secret };
}

export function salvarGatewayConfig({ provider, ambiente, config }) {
  const atual = getGatewayConfig();
  const agora = new Date().toISOString();
  const webhookSecret = atual?.webhook_secret || crypto.randomBytes(24).toString("hex");
  if (atual) {
    getDb()
      .prepare("UPDATE financeiro_gateway_config SET provider = ?, ambiente = ?, config_json = ?, updated_at = ? WHERE id = ?")
      .run(provider, ambiente, JSON.stringify(config || {}), agora, GATEWAY_ID);
  } else {
    getDb()
      .prepare(
        "INSERT INTO financeiro_gateway_config (id, provider, ambiente, config_json, webhook_secret, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(GATEWAY_ID, provider, ambiente, JSON.stringify(config || {}), webhookSecret, agora, agora);
  }
  return getGatewayConfigPublico();
}

// Config completa (com credencial) - só para uso interno (gateway/index.js
// resolvendo o provedor pra emitir/consultar), nunca exposta em rota.
export function getGatewayConfigInterno() {
  const c = getGatewayConfig();
  if (!c) return { provider: "fake", ambiente: "sandbox", config: {}, webhookSecret: null };
  return { provider: c.provider, ambiente: c.ambiente, config: JSON.parse(c.config_json || "{}"), webhookSecret: c.webhook_secret };
}

// ---------- Cobranças ----------
export function getCobranca(id) {
  return getDb().prepare("SELECT * FROM financeiro_cobrancas WHERE id = ?").get(id) || null;
}

export function getCobrancaByProviderCharge(providerChargeId) {
  return getDb().prepare("SELECT * FROM financeiro_cobrancas WHERE provider_charge_id = ?").get(providerChargeId) || null;
}

// Mesmo JOIN de listCobrancas, só que para uma linha - usado onde o
// nome/e-mail/telefone do contato entra na resposta (ex.: montar a mensagem da
// régua) sem precisar buscar a lista inteira para achar um id.
export function getCobrancaComContato(id) {
  return (
    getDb()
      .prepare(
        `SELECT c.*, ct.nome AS contato_nome, ct.email AS contato_email, ct.telefone AS contato_telefone, ct.doc AS contato_doc
         FROM financeiro_cobrancas c
         JOIN financeiro_contatos ct ON ct.id = c.contato_id
         WHERE c.id = ?`
      )
      .get(id) || null
  );
}

// Filtros: contatoId, metodo, status ('pending'|'paid'|'canceled'|'refunded'|
// 'atrasado' - este último é sintético, filtra pending com due < hoje, porque
// "atrasado" nunca é gravado na coluna), de/ate (intervalo de vencimento).
export function listCobrancas({ contatoId, metodo, status, de, ate } = {}) {
  const cond = [];
  const args = [];
  if (contatoId) { cond.push("c.contato_id = ?"); args.push(contatoId); }
  if (metodo) { cond.push("c.metodo = ?"); args.push(metodo); }
  if (status === "atrasado") { cond.push("c.status = 'pending' AND c.due < ?"); args.push(hojeCivil()); }
  else if (status) { cond.push("c.status = ?"); args.push(status); }
  if (de) { cond.push("c.due >= ?"); args.push(de); }
  if (ate) { cond.push("c.due <= ?"); args.push(ate); }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  return getDb()
    .prepare(
      `SELECT c.*, ct.nome AS contato_nome, ct.email AS contato_email, ct.telefone AS contato_telefone, ct.doc AS contato_doc
       FROM financeiro_cobrancas c
       JOIN financeiro_contatos ct ON ct.id = c.contato_id
       ${where}
       ORDER BY c.due ASC, c.created_at ASC`
    )
    .all(...args);
}

// Cria a cobrança e, junto, o Título a Receber correspondente em
// financeiro_lancamentos - já 'pendente', não só na confirmação do pagamento.
// Antes o título só nascia em confirmarCobranca(), então uma cobrança recém-
// emitida (Pix/boleto ainda não pago) não aparecia em Títulos nem no Fluxo de
// Caixa previsto; agora ela entra na hora, do mesmo jeito que um título criado
// à mão, e confirmarCobranca (abaixo) só dá baixa nele - não cria um segundo.
export function insertCobranca({
  contatoId, descricao, valorCents, due, metodo, recorrenciaId,
  provider, providerChargeId, status, pixPayload, pixQrcodeB64, boletoLine, boletoPdfUrl, checkoutUrl,
  multaPercent, jurosPercentMes, createdBy,
}) {
  const id = uid();
  const numero = getDb().prepare("SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM financeiro_cobrancas").get().n;
  const statusInicial = status || "pending";
  getDb()
    .prepare(
      `INSERT INTO financeiro_cobrancas
        (id, numero, contato_id, descricao, valor_cents, due, metodo, status, recorrencia_id,
         provider, provider_charge_id, pix_payload, pix_qrcode_b64, boleto_line, boleto_pdf_url, checkout_url,
         multa_percent, juros_percent_mes, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, numero, contatoId, descricao || "", valorCents, due, metodo, statusInicial, recorrenciaId || null,
      provider, providerChargeId || null, pixPayload || null, pixQrcodeB64 || null, boletoLine || null, boletoPdfUrl || null, checkoutUrl || null,
      multaPercent || 0, jurosPercentMes || 0, new Date().toISOString(), createdBy || null
    );
  const contato = getContato(contatoId);
  const lancamento = insertLancamento({
    tipo: "receber",
    descricao: descricao || `Cobrança #${numero}`,
    valorCents,
    due,
    formaPagto: metodo,
    contatoId,
    contraparte: contato?.nome || "",
    // "Origem: ID da cobrança" pedido no rastreio - o id técnico do provedor
    // (providerChargeId, tipo "fake_b3dd52b4-...") não diz nada pra quem olha a
    // grade de Títulos; o número da cobrança sim, e é o mesmo número que
    // aparece na aba Cobranças.
    doc: `Cobrança #${numero}`,
    origem: "cobranca",
    createdBy,
  });
  getDb().prepare("UPDATE financeiro_cobrancas SET lancamento_id = ? WHERE id = ?").run(lancamento.id, id);
  // Cartão aprova na hora (ver POST /cobrancas em routes.js): a cobrança já
  // nasce paga, então o título já nasce baixado junto - sem isto o Fluxo de
  // Caixa/DRE não veriam esse recebimento até alguém chamar confirmarCobranca,
  // que por sua vez já acharia status='paid' e não faria nada (idempotente).
  if (statusInicial === "paid") {
    baixarLancamento(lancamento.id, { paidAt: hojeCivil(), contaId: getContaPrincipal()?.id });
    getDb().prepare("UPDATE financeiro_cobrancas SET paid_at = ? WHERE id = ?").run(hojeCivil(), id);
  }
  return getCobranca(id);
}

// Único caminho que confirma o PAGAMENTO de uma cobrança - mesma regra de ouro
// do billing de assinatura (confirmarPagamento é o único que libera acesso):
// nenhuma outra função baixa esse título. Idempotente: chamar de novo numa
// cobrança já paga não repete a baixa. Dá baixa no título que já nasceu junto
// com a cobrança (ver insertCobranca); só cria um agora para cobrança antiga,
// de antes deste vínculo existir (lancamento_id nulo).
//
// contaId: pra onde vai o crédito. Confirmação AUTOMÁTICA (webhook, dev-
// confirmar, ou o /baixar de hoje, que nenhum ainda deixa escolher) cai na
// conta marcada como principal - sem isso o título ficava 'finalizado' sem
// conta_id, e um título sem conta não aparece na Movimentação de conta
// nenhuma, então nunca dá pra conciliar contra o extrato de verdade depois.
// Passar contaId explícito (ex.: uma baixa manual que deixe escolher no
// futuro) sempre tem prioridade sobre esse default.
export function confirmarCobranca(id, { paidAt, contaId } = {}) {
  const atual = getCobranca(id);
  if (!atual) return null;
  if (atual.status === "paid") return atual;
  const data = paidAt || hojeCivil();
  let lancamentoId = atual.lancamento_id;
  if (!lancamentoId) {
    const contato = getContato(atual.contato_id);
    lancamentoId = insertLancamento({
      tipo: "receber",
      descricao: atual.descricao || `Cobrança #${atual.numero}`,
      valorCents: atual.valor_cents,
      due: atual.due,
      formaPagto: atual.metodo,
      contatoId: atual.contato_id,
      contraparte: contato?.nome || "",
      doc: `Cobrança #${atual.numero}`,
      origem: "cobranca",
    }).id;
  }
  baixarLancamento(lancamentoId, { paidAt: data, contaId: contaId || getContaPrincipal()?.id });
  getDb()
    .prepare("UPDATE financeiro_cobrancas SET status = 'paid', paid_at = ?, lancamento_id = ? WHERE id = ?")
    .run(data, lancamentoId, id);
  return getCobranca(id);
}

// Cancela a cobrança e anula o título vinculado junto (mesmo espírito de
// mudarStatusLancamento('anulado') tirar o título de fluxo/DRE) - sem isso um
// Pix cancelado continuaria contando como "a receber" nos Títulos.
export function cancelarCobranca(id) {
  const atual = getCobranca(id);
  if (!atual) return null;
  if (atual.status === "paid" || atual.status === "canceled") return atual;
  if (atual.lancamento_id) mudarStatusLancamento(atual.lancamento_id, "anulado");
  getDb()
    .prepare("UPDATE financeiro_cobrancas SET status = 'canceled', canceled_at = ? WHERE id = ?")
    .run(hojeCivil(), id);
  return getCobranca(id);
}

// Apaga a cobrança e, junto, o título vinculado - "Excluir" é mais forte que
// "Cancelar": não deixa rastro nenhum dos dois lados. deleteLancamento já
// cuida da própria descendência (impostos aplicados, apropriações, anexos); a
// trava de mês fechado é conferida na rota, do mesmo jeito que a exclusão
// direta de um título em /lancamentos/:id.
export function excluirCobranca(id) {
  const atual = getCobranca(id);
  if (!atual) return false;
  // A cobrança primeiro, o título depois - nessa ordem. financeiro_cobrancas.
  // lancamento_id é FK pra financeiro_lancamentos; com FKs ligadas, apagar o
  // título enquanto a cobrança ainda aponta pra ele falha com "constraint
  // failed" (constatado ao testar). Ao contrário: apagar a cobrança primeiro
  // remove a única referência, e o título fica livre pra sumir em seguida.
  getDb().prepare("DELETE FROM financeiro_cobrancas WHERE id = ?").run(id);
  if (atual.lancamento_id) deleteLancamento(atual.lancamento_id);
  return true;
}

export function marcarReembolsada(id) {
  const atual = getCobranca(id);
  if (!atual) return null;
  getDb().prepare("UPDATE financeiro_cobrancas SET status = 'refunded' WHERE id = ?").run(id);
  return getCobranca(id);
}

export function registrarLembreteEnviado(id, estagio) {
  getDb()
    .prepare("UPDATE financeiro_cobrancas SET lembrete_estagio = ?, lembrete_em = ? WHERE id = ?")
    .run(estagio, hojeCivil(), id);
}

// ---------- Recorrências ----------
export function listRecorrencias() {
  return getDb()
    .prepare(
      `SELECT r.*, ct.nome AS contato_nome
       FROM financeiro_cobranca_recorrencias r
       JOIN financeiro_contatos ct ON ct.id = r.contato_id
       ORDER BY r.ativa DESC, r.proxima_emissao ASC`
    )
    .all();
}

export function getRecorrencia(id) {
  return getDb().prepare("SELECT * FROM financeiro_cobranca_recorrencias WHERE id = ?").get(id) || null;
}

export function insertRecorrencia({ contatoId, descricao, valorCents, metodo, intervaloMeses, diaVencimento, primeiraEmissao, createdBy }) {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO financeiro_cobranca_recorrencias
        (id, contato_id, descricao, valor_cents, metodo, intervalo_meses, dia_vencimento, proxima_emissao, ativa, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(id, contatoId, descricao || "", valorCents, metodo, intervaloMeses || 1, diaVencimento, primeiraEmissao, new Date().toISOString(), createdBy || null);
  return getRecorrencia(id);
}

export function definirRecorrenciaAtiva(id, ativa) {
  getDb().prepare("UPDATE financeiro_cobranca_recorrencias SET ativa = ? WHERE id = ?").run(ativa ? 1 : 0, id);
  return getRecorrencia(id);
}

export function avancarProximaEmissao(id) {
  const r = getRecorrencia(id);
  if (!r) return null;
  const proxima = addMesesCivil(r.proxima_emissao, r.intervalo_meses);
  getDb().prepare("UPDATE financeiro_cobranca_recorrencias SET proxima_emissao = ? WHERE id = ?").run(proxima, id);
  return getRecorrencia(id);
}

// ---------- KPIs do dashboard ----------
export function kpis() {
  const hoje = hojeCivil();
  const inicioMes = hoje.slice(0, 7) + "-01";
  const recebidoMes = getDb()
    .prepare("SELECT COALESCE(SUM(valor_cents), 0) AS s FROM financeiro_cobrancas WHERE status = 'paid' AND paid_at >= ?")
    .get(inicioMes).s;
  const aReceber = getDb()
    .prepare("SELECT COALESCE(SUM(valor_cents), 0) AS s FROM financeiro_cobrancas WHERE status = 'pending' AND due >= ?")
    .get(hoje).s;
  const atrasado = getDb()
    .prepare("SELECT COALESCE(SUM(valor_cents), 0) AS s FROM financeiro_cobrancas WHERE status = 'pending' AND due < ?")
    .get(hoje).s;
  // Saldo disponível é saldo de CONTA no gateway - sem provedor real conectado,
  // aproxima pelo total pago (o real vem de gateway.consultarSaldo() nas fases
  // seguintes, ver cobrancaEngine.js).
  const saldoAproximado = getDb().prepare("SELECT COALESCE(SUM(valor_cents), 0) AS s FROM financeiro_cobrancas WHERE status = 'paid'").get().s;
  return { recebidoMesCents: recebidoMes, aReceberCents: aReceber, atrasadoCents: atrasado, saldoDisponivelCents: saldoAproximado };
}
