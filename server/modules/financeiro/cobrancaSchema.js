// Schema de Cobranças (Financeiro → Faturamento): cada empresa emite Pix/boleto/
// cartão para os PRÓPRIOS clientes dela (financeiro_contatos) - diferente do
// billing de assinatura (server/billing/), que cobra a própria empresa pelo uso
// do Xaphires com uma credencial global. Aqui cada empresa tem sua conta e sua
// chave no provedor, gravada em financeiro_gateway_config.
//
// Mesmo padrão de schema.js: CREATE TABLE IF NOT EXISTS, chamado a partir de
// applyFinanceiroSchema (nasce só na 1ª requisição autenticada da empresa).
export function applyCobrancaSchema(companyDb) {
  companyDb.exec(`
    CREATE TABLE IF NOT EXISTS financeiro_cobrancas (
      id TEXT PRIMARY KEY,
      numero INTEGER,
      contato_id TEXT NOT NULL REFERENCES financeiro_contatos(id),
      descricao TEXT NOT NULL DEFAULT '',
      valor_cents INTEGER NOT NULL,
      -- Vencimento, data civil YYYY-MM-DD - mesma convenção do resto do módulo.
      due TEXT NOT NULL,
      metodo TEXT NOT NULL,
      -- pending | paid | canceled | refunded - mesmo vocabulário normalizado do
      -- server/billing/gateway.js. "Atrasado" NUNCA é gravado: é due < hoje com
      -- status ainda pending, calculado na leitura (ver cobrancaEngine.js) -
      -- assim uma cobrança que ficou atrasada e depois foi paga não passa por um
      -- estado intermediário que precisaria ser desfeito.
      status TEXT NOT NULL DEFAULT 'pending',
      recorrencia_id TEXT REFERENCES financeiro_cobranca_recorrencias(id),
      provider TEXT NOT NULL DEFAULT 'fake',
      provider_charge_id TEXT,
      pix_payload TEXT,
      pix_qrcode_b64 TEXT,
      boleto_line TEXT,
      boleto_pdf_url TEXT,
      checkout_url TEXT,
      -- Encargo desta cobrança específica - cópia da config da régua no momento
      -- da emissão (mesmo motivo de financeiro_lancamento_impostos guardar
      -- snapshot): mudar a config depois não reescreve cobrança já emitida.
      multa_percent INTEGER NOT NULL DEFAULT 0,
      juros_percent_mes INTEGER NOT NULL DEFAULT 0,
      -- Título gerado na CONFIRMAÇÃO do pagamento (ver confirmarCobranca em
      -- cobrancaRepo.js) - é o que entra no Fluxo de Caixa/DRE que já existem.
      -- Nenhuma outra função grava isto; NULL enquanto pendente.
      lancamento_id TEXT REFERENCES financeiro_lancamentos(id),
      paid_at TEXT,
      canceled_at TEXT,
      -- Último estágio da régua já mostrado/enviado manualmente (ver
      -- cobrancaEngine.estagio) - guardado só para o histórico da linha, não
      -- para decidir envio automático (não existe: ver CLAUDE.md/regua).
      lembrete_estagio TEXT,
      lembrete_em TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_fin_cobr_due ON financeiro_cobrancas(due);
    CREATE INDEX IF NOT EXISTS idx_fin_cobr_status ON financeiro_cobrancas(status);
    CREATE INDEX IF NOT EXISTS idx_fin_cobr_contato ON financeiro_cobrancas(contato_id);

    -- Regra de recorrência: a INTENÇÃO (mesmo par intenção/histórico de
    -- subscriptions/payments em server/billing/store.js). Cada ciclo emite uma
    -- linha própria em financeiro_cobrancas; varrida na LEITURA
    -- (cobrancaEngine.varrerRecorrencias), nunca por cron.
    CREATE TABLE IF NOT EXISTS financeiro_cobranca_recorrencias (
      id TEXT PRIMARY KEY,
      contato_id TEXT NOT NULL REFERENCES financeiro_contatos(id),
      descricao TEXT NOT NULL DEFAULT '',
      valor_cents INTEGER NOT NULL,
      metodo TEXT NOT NULL,
      intervalo_meses INTEGER NOT NULL DEFAULT 1,
      dia_vencimento INTEGER NOT NULL,
      proxima_emissao TEXT NOT NULL,
      ativa INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_fin_cobr_rec_proxima ON financeiro_cobranca_recorrencias(proxima_emissao);

    -- Uma linha por empresa (id fixo 'default'). config_json guarda o formato
    -- específico do provedor escolhido (ex.: access_token no Mercado Pago;
    -- client_id/client_secret/certificado no Banco Inter) - nunca devolvido
    -- inteiro pra API depois de salvo (ver cobrancaRepo.getGatewayConfigPublico).
    CREATE TABLE IF NOT EXISTS financeiro_gateway_config (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'fake',
      ambiente TEXT NOT NULL DEFAULT 'sandbox',
      config_json TEXT NOT NULL DEFAULT '{}',
      webhook_secret TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Uma linha por empresa (id fixo 'default'). As mensagens são templates com
    -- placeholders {{nome}}/{{valor}}/{{vencimento}}/{{link}}, resolvidos na
    -- hora de montar o link de WhatsApp (ver cobrancaEngine.montarMensagem) -
    -- nunca enviados sozinhos, só usados quando alguém clica "Enviar WhatsApp".
    CREATE TABLE IF NOT EXISTS financeiro_regua_config (
      id TEXT PRIMARY KEY,
      dias_antes_vencimento INTEGER NOT NULL DEFAULT 3,
      multa_percent INTEGER NOT NULL DEFAULT 0,
      juros_percent_mes INTEGER NOT NULL DEFAULT 0,
      mensagem_pre TEXT NOT NULL DEFAULT '',
      mensagem_dia TEXT NOT NULL DEFAULT '',
      mensagem_pos TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);
}
