// Verificação do adaptador contra a API real do Asaas.
//
// Rode com as credenciais de SANDBOX no .env:
//
//   node server/billing/verificarCredencial.js
//
// É o passo que falta para o adaptador deixar de ser código plausível e virar
// código provado. Exercita o que a documentação pública não garante: se o Asaas
// aceita os nossos payloads de verdade, e devolve os campos nos formatos que
// providers/asaas.js espera.
//
// NÃO IMPRIME CREDENCIAL. Mostra só o prefixo da chave, para confirmar que é a de
// sandbox, e nunca o valor. Cole a saída em qualquer lugar sem medo.
//
// Fica em server/ e não no scratchpad de propósito: é ferramenta de manutenção, e
// quem for revisar a cobrança daqui a seis meses precisa achá-la.

import "dotenv/config";
import { asaas, traduzirStatus } from "./providers/asaas.js";

const ok = (c, m, e = "") => console.log(`${c ? "  ok  " : " FALHA"} ${m}${e ? ` -> ${e}` : ""}`);
let falhas = 0;
const checa = (c, m, e) => {
  ok(c, m, e);
  if (!c) falhas++;
};

const chave = process.env.ASAAS_API_KEY || "";
const ambiente = (process.env.ASAAS_ENV || "sandbox").toLowerCase();

console.log("=== configuração ===");
checa(!!chave, "ASAAS_API_KEY definida", chave ? `${chave.slice(0, 8)}… (${chave.length} caracteres)` : "AUSENTE");
checa(!!process.env.ASAAS_WEBHOOK_TOKEN, "ASAAS_WEBHOOK_TOKEN definido");
checa(ambiente === "sandbox" || ambiente === "production", "ASAAS_ENV é sandbox ou production", ambiente);

// Barreira contra o pior acidente possível: rodar isto com credencial de produção
// cria cobrança de verdade na conta de alguém.
if (ambiente !== "sandbox") {
  console.error("\nASAAS_ENV não é \"sandbox\". Este script cria cobranças (mesmo que Pix/boleto nunca");
  console.error("compensados) numa conta de verdade. Abortando. Use as credenciais de sandbox do painel,");
  console.error("ou rode com PERMITIR_PRODUCAO=1 se souber exatamente o que está fazendo.");
  if (process.env.PERMITIR_PRODUCAO !== "1") process.exit(1);
}
if (!chave) {
  console.error("\nSem chave não há o que verificar. Configure o .env e rode de novo.");
  process.exit(1);
}

// CPF de teste, válido no dígito verificador mas sem titular real - o Asaas
// sandbox aceita qualquer CPF/CNPJ com dígito correto.
const PAGADOR = { name: "Verificação Local", email: "verificacao@example.com", doc: "52998224725" };

console.log("\n=== Pix ===");
try {
  const r = await asaas.criarCobranca({
    amountCents: 34999,
    method: "pix",
    plan: "intermediate",
    payer: PAGADOR,
    paymentId: `verificacao-pix-${Date.now()}`,
  });
  checa(!!r.providerChargeId, "cobrança criada", r.providerChargeId);
  checa(r.status === "pending", "nasce pendente", r.status);
  checa(!!r.pixCode, "VEIO O COPIA-E-COLA", r.pixCode ? `${r.pixCode.slice(0, 30)}…` : "VAZIO - o caminho de leitura está errado");
  checa(!!r.dueAt, "veio o prazo", r.dueAt);

  const consulta = await asaas.consultarCobranca(r.providerChargeId);
  checa(consulta.status === "pending", "consulta devolve o mesmo estado", consulta.status);
} catch (err) {
  falhas++;
  console.log(` FALHA Pix -> ${err.message}`);
  if (err.detalhe) console.log("        detalhe:", JSON.stringify(err.detalhe).slice(0, 400));
}

console.log("\n=== boleto (a linha digitável) ===");
try {
  const r = await asaas.criarCobranca({
    amountCents: 34999,
    method: "boleto",
    plan: "intermediate",
    payer: PAGADOR,
    paymentId: `verificacao-boleto-${Date.now()}`,
  });
  checa(!!r.providerChargeId, "cobrança criada", r.providerChargeId);
  checa(!!r.boletoLine, "VEIO A LINHA DIGITÁVEL", r.boletoLine || "VAZIA - o caminho de leitura está errado");
  checa(!!r.checkoutUrl, "veio a URL do boleto", r.checkoutUrl ? "sim" : "não");
} catch (err) {
  falhas++;
  console.log(` FALHA boleto -> ${err.message}`);
  if (err.detalhe) console.log("        detalhe:", JSON.stringify(err.detalhe).slice(0, 400));
}

console.log("\n=== checkout hospedado (cartão) ===");
// O Asaas recusa successUrl/cancelUrl/expiredUrl que não sejam HTTPS - testado.
// Em produção FRONTEND_URL já é https, então isso nunca aparece; localmente,
// sem um túnel (ngrok ou similar), o retorno de verdade não dá pra testar - só
// a criação do checkout, que é o que este script confere.
if (!/^https:/.test(process.env.FRONTEND_URL || "")) {
  process.env.FRONTEND_URL = "https://example.com";
  console.log("(FRONTEND_URL local não é https - usando https://example.com só para este teste)");
}
try {
  const r = await asaas.criarCobranca({
    amountCents: 34999,
    method: "card",
    plan: "intermediate",
    payer: PAGADOR,
    paymentId: `verificacao-checkout-${Date.now()}`,
  });
  checa(r.providerChargeId === null, "nasce sem id de cobrança (só existe depois do checkout completar)", String(r.providerChargeId));
  checa(r.status === "pending", "nasce pendente", r.status);
  checa(!!r.checkoutUrl, "VEIO O LINK DO CHECKOUT", r.checkoutUrl || "VAZIO - o caminho de leitura está errado");
  if (r.checkoutUrl) console.log(`        abra no navegador pra conferir visualmente: ${r.checkoutUrl}`);
} catch (err) {
  falhas++;
  console.log(` FALHA checkout -> ${err.message}`);
  if (err.detalhe) console.log("        detalhe:", JSON.stringify(err.detalhe).slice(0, 400));
}

console.log("\n=== tradução de status ===");
checa(traduzirStatus("CONFIRMED") === "paid", 'CONFIRMED -> "paid"');
checa(traduzirStatus("RECEIVED") === "paid", 'RECEIVED -> "paid"');
checa(traduzirStatus("PENDING") === "pending", 'PENDING -> "pending"');
checa(traduzirStatus("OVERDUE") === "pending", 'OVERDUE -> "pending" (atraso é prazo nosso, não status novo)');
checa(traduzirStatus("REFUNDED") === "refunded", 'REFUNDED -> "refunded"');
checa(traduzirStatus("DELETED") === "canceled", 'DELETED -> "canceled"');
checa(traduzirStatus("ALGO_NOVO_DO_ASAAS") === null, "estado desconhecido -> null, não um palpite");

console.log(
  falhas === 0
    ? "\nTUDO PASSOU. O adaptador conversa com a API de verdade.\n" +
        "Falta ainda: 1) completar o checkout acima com um cartão de teste, para ver o\n" +
        "webhook de RECURRENT chegando; 2) apontar um webhook de sandbox para este servidor\n" +
        "(ngrok ou similar) e conferir se o token asaas-access-token bate."
    : `\n${falhas} FALHARAM. Nada foi cobrado de verdade (Pix/boleto de sandbox não compensam).`
);
process.exit(falhas === 0 ? 0 : 1);
