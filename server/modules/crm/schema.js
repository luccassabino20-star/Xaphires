// Schema do módulo CRM ("vendas-crm"), no banco da EMPRESA. Mesmo padrão de
// applySaudeClinicasSchema: CREATE TABLE IF NOT EXISTS, chamado de db.js
// applySchema() no mesmo ponto preguiçoso (a tabela só nasce na primeira
// requisição autenticada da empresa que abrir o módulo).
//
// "Lead" e "Oportunidade" são a MESMA linha aqui (crm_opportunities): um lead
// é só uma oportunidade que ainda não passou do primeiro estágio do funil -
// não haveria o que uma tabela "leads" guardasse que crm_opportunities não
// guarda, e duas tabelas para a mesma coisa é o tipo de normalização
// prematura que este projeto evita (ver o comentário de `contraparte` em
// financeiro/schema.js). Proposta e Pedido têm tabela própria porque são
// registros de verdade distintos da oportunidade (podem sobreviver a ela).
export function applyCrmSchema(companyDb) {
  companyDb.exec(`
    -- Pessoa ou empresa de contato. Reaproveitado por qualquer oportunidade
    -- do funil, sem duplicar o cadastro a cada negócio novo.
    CREATE TABLE IF NOT EXISTS crm_contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      company_name TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_crmcontacts_name ON crm_contacts(name);

    -- Estágio do funil de vendas. position ordena as colunas do quadro;
    -- is_won/is_lost marcam os estágios terminais (ganho/perdido), pra
    -- relatório futuro não depender de adivinhar pelo nome.
    CREATE TABLE IF NOT EXISTS crm_stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      is_won INTEGER NOT NULL DEFAULT 0,
      is_lost INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- O funil em si: cada linha é um card no quadro do CRM (não tem nenhuma
    -- relação com boards/lists/cards do Kanban genérico - são schemas
    -- separados de propósito, ver o comentário do módulo em routes.js).
    -- position ordena dentro do estágio, mesmo papel de cards.position no
    -- Kanban. moved_at marca a entrada no estágio ATUAL (não a criação),
    -- pra uma futura métrica de "tempo parado em cada fase" sem precisar de
    -- histórico à parte - mesmo espírito de list_entered_at.
    CREATE TABLE IF NOT EXISTS crm_opportunities (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES crm_contacts(id),
      stage_id TEXT NOT NULL REFERENCES crm_stages(id),
      title TEXT NOT NULL,
      value_cents INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      -- 'aberto' | 'ganho' | 'perdido' - redundante com is_won/is_lost do
      -- estágio atual, mas travado no momento em que o negócio fechou: mudar
      -- os estágios do funil depois não pode reescrever o resultado histórico.
      status TEXT NOT NULL DEFAULT 'aberto',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id),
      moved_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_crmopp_stage ON crm_opportunities(stage_id);
    CREATE INDEX IF NOT EXISTS idx_crmopp_contact ON crm_opportunities(contact_id);

    -- ---------- Sem tela ainda (schema pronto para a próxima fase) ----------

    CREATE TABLE IF NOT EXISTS crm_proposals (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id),
      contact_id TEXT NOT NULL REFERENCES crm_contacts(id),
      title TEXT NOT NULL DEFAULT '',
      value_cents INTEGER NOT NULL DEFAULT 0,
      -- 'rascunho' | 'enviada' | 'aceita' | 'recusada'
      status TEXT NOT NULL DEFAULT 'rascunho',
      valid_until TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_crmprop_opp ON crm_proposals(opportunity_id);

    CREATE TABLE IF NOT EXISTS crm_orders (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id),
      contact_id TEXT NOT NULL REFERENCES crm_contacts(id),
      proposal_id TEXT REFERENCES crm_proposals(id),
      value_cents INTEGER NOT NULL DEFAULT 0,
      -- 'pendente' | 'confirmado' | 'cancelado'
      status TEXT NOT NULL DEFAULT 'pendente',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_crmorder_opp ON crm_orders(opportunity_id);
  `);
}
