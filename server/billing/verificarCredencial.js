// Verificação do adaptador contra a API real do Mercado Pago.
//
// Rode com as credenciais de TESTE no .env:
//
//   node server/billing/verificarCredencial.js
//
// É o passo que falta para o adaptador deixar de ser código plausível e virar
// código provado. Exercita o que os tipos do SDK não cobrem: se o Mercado Pago
// aceita os nossos payloads de verdade.
//
// NÃO IMPRIME CREDENCIAL. Mostra só o prefixo do token, para confirmar que é o de
// teste, e nunca o valor. Cole a saída em qualquer lugar sem medo.
//
// Fica em server/ e não no scratchpad de propósito: é ferramenta de manutenção, e
// quem for ligar a cobrança daqui a seis meses precisa achá-la.

import "dotenv/config";
import { mercadoPago } from "./providers/mercadopago.js";

const ok = (c, m, e = "") => console.log(`${c ? "  ok  " : " FALHA"} ${m}${e ? ` -> ${e}` : ""}`);
let falhas = 0;
const checa = (c, m, e) => {
  ok(c, m, e);
  if (!c) falhas++;
};

const token = process.env.MERCADOPAGO_ACCESS_TOKEN || "";
const publica = process.env.MERCADOPAGO_PUBLIC_KEY || "";

console.log("=== configuração ===");
checa(!!token, "MERCADOPAGO_ACCESS_TOKEN definido", token ? `${token.slice(0, 5)}… (${token.length} caracteres)` : "AUSENTE");
checa(!!publica, "MERCADOPAGO_PUBLIC_KEY definida", publica ? `${publica.slice(0, 5)}…` : "AUSENTE (só afeta o cartão)");
checa(!!process.env.MERCADOPAGO_WEBHOOK_SECRET, "MERCADOPAGO_WEBHOOK_SECRET definido");

// Barreira contra o pior acidente possível: rodar isto com credencial de produção
// cria cobrança de verdade na conta de alguém.
if (token && !token.startsWith("TEST-")) {
  console.error("\nO token NÃO começa com TEST-. Isto parece credencial de produção, e este");
  console.error("script cria cobranças reais. Abortando. Use as credenciais de teste do painel,");
  console.error("ou rode com PERMITIR_PRODUCAO=1 se souber exatamente o que está fazendo.");
  if (process.env.PERMITIR_PRODUCAO !== "1") process.exit(1);
}
if (!token) {
  console.error("\nSem token não há o que verificar. Configure o .env e rode de novo.");
  process.exit(1);
}

// E-mail de comprador de teste. O Mercado Pago recusa cobrança em que pagador e
// vendedor são a mesma conta, então isto não pode ser o seu e-mail.
const PAGADOR = { email: process.env.MP_TESTE_EMAIL || "test_user_comprador@testuser.com", doc: "52998224725" };

console.log("\n=== Pix ===");
try {
  const r = await mercadoPago.criarCobranca({
    amountCents: 34999,
    method: "pix",
    plan: "intermediate",
    companyId: "verificacao-local",
    payer: PAGADOR,
    idempotencyKey: `verificacao-pix-${Date.now()}`,
  });
  checa(!!r.providerChargeId, "cobrança criada", r.providerChargeId);
  checa(r.status === "pending", "nasce pendente", r.status);
  checa(!!r.pixCode, "veio o copia-e-cola", r.pixCode ? `${r.pixCode.slice(0, 30)}…` : "VAZIO");
  checa(!!r.dueAt, "veio o prazo", r.dueAt);

  const consulta = await mercadoPago.consultarCobranca(r.providerChargeId);
  checa(consulta.status === "pending", "consulta devolve o mesmo estado", consulta.status);
} catch (err) {
  falhas++;
  console.log(` FALHA Pix -> ${err.message}`);
  if (err.detalhe) console.log("        detalhe:", JSON.stringify(err.detalhe).slice(0, 300));
}

console.log("\n=== boleto (o defeito da linha digitável) ===");
try {
  const r = await mercadoPago.criarCobranca({
    amountCents: 34999,
    method: "boleto",
    plan: "intermediate",
    companyId: "verificacao-local",
    payer: { ...PAGADOR, doc: "52998224725" },
    idempotencyKey: `verificacao-boleto-${Date.now()}`,
  });
  checa(!!r.providerChargeId, "cobrança criada", r.providerChargeId);
  checa(!!r.boletoLine, "VEIO A LINHA DIGITÁVEL", r.boletoLine || "VAZIA - o caminho de leitura está errado");
  checa(!!r.checkoutUrl, "veio a URL do boleto", r.checkoutUrl ? "sim" : "não");
} catch (err) {
  falhas++;
  console.log(` FALHA boleto -> ${err.message}`);
  if (err.detalhe) console.log("        detalhe:", JSON.stringify(err.detalhe).slice(0, 300));
}

console.log("\n=== idempotência ===");
try {
  const chave = `verificacao-idem-${Date.now()}`;
  const args = {
    amountCents: 34999,
    method: "pix",
    plan: "intermediate",
    companyId: "verificacao-local",
    payer: PAGADOR,
    idempotencyKey: chave,
  };
  const a = await mercadoPago.criarCobranca(args);
  const b = await mercadoPago.criarCobranca(args);
  checa(
    a.providerChargeId === b.providerChargeId,
    "mesma chave devolve a MESMA cobrança, não uma segunda",
    `${a.providerChargeId} / ${b.providerChargeId}`
  );
} catch (err) {
  falhas++;
  console.log(` FALHA idempotência -> ${err.message}`);
}

console.log(
  falhas === 0
    ? "\nTUDO PASSOU. O adaptador conversa com a API de verdade.\n" +
        "Falta ainda o webhook, que precisa de um aviso real chegando ao servidor:\n" +
        "exponha a porta 4000 (ngrok ou similar), aponte a URL no painel e pague um Pix de teste."
    : `\n${falhas} FALHARAM. Nada foi cobrado de verdade se o token é de teste.`
);
process.exit(falhas === 0 ? 0 : 1);
