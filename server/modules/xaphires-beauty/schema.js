// Schema do módulo Xaphires Beauty, no banco da EMPRESA
// (companies/<id>/app.sqlite). Mesmo padrão dos outros módulos (ver
// server/modules/saude-clinicas/schema.js): CREATE TABLE IF NOT EXISTS,
// rodado a cada abertura do banco, sem pasta de migrations. Fica junto do
// módulo (não em server/db.js) pelo mesmo motivo dos demais: autocontido,
// mas quem chama é db.js (applySchema), no mesmo ponto preguiçoso - a
// tabela só nasce na primeira requisição autenticada da empresa que abrir
// o módulo, não no arranque do servidor.
//
// Fase 0 criou as quatro tabelas do núcleo de uma vez, no mesmo espírito da
// "casca completa" de Saúde & Clínicas. Fase 2 acrescentou beauty_payments
// (CREATE TABLE IF NOT EXISTS cobre empresa nova e antiga) e a coluna
// from_public_link em beauty_appointments - essa por addColumnIfMissing,
// porque empresas que já tinham aberto o módulo na Fase 0 já têm a tabela
// sem ela.
function addColumnIfMissing(companyDb, table, name, ddl) {
  const columns = companyDb.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(name)) companyDb.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

export function applyXaphiresBeautySchema(companyDb) {
  companyDb.exec(`
    CREATE TABLE IF NOT EXISTS beauty_clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      doc TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_beauty_clients_name ON beauty_clients(name);

    CREATE TABLE IF NOT EXISTS beauty_services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      price_cents INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- "Gestão de equipe" é registro interno do profissional (nome, cargo,
    -- comissão) - sem conta de login própria, decisão confirmada com o
    -- cliente. Se um dia precisar de login, staff_id vira o elo com uma
    -- linha de users, sem quebrar o schema abaixo.
    CREATE TABLE IF NOT EXISTS beauty_staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      -- Fração (0.2 = 20%), não percentual inteiro - evita conversão na
      -- hora de multiplicar pelo valor do serviço.
      commission_rate REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS beauty_appointments (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES beauty_clients(id),
      service_id TEXT NOT NULL REFERENCES beauty_services(id),
      staff_id TEXT REFERENCES beauty_staff(id),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      -- 'agendado' | 'concluido' | 'cancelado'
      status TEXT NOT NULL DEFAULT 'agendado',
      notes TEXT NOT NULL DEFAULT '',
      -- 1 quando veio do link público de agendamento (Fase 4) - a agenda
      -- destaca esses de origem, mesmo espírito de "referralSource" em
      -- Saúde & Clínicas.
      from_public_link INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_beauty_appt_starts ON beauty_appointments(starts_at);

    -- Ledger manual de pagamento (Fase 2) - NÃO é cobrança real, só registro de
    -- que o cliente pagou por fora (pix/dinheiro/cartão na maquininha própria
    -- do salão). Sem gateway aqui: ver o "Fora de escopo" do plano.
    CREATE TABLE IF NOT EXISTS beauty_payments (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL REFERENCES beauty_appointments(id),
      -- 'dinheiro' | 'pix' | 'cartao'
      method TEXT NOT NULL DEFAULT 'dinheiro',
      amount_cents INTEGER NOT NULL,
      paid_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_beauty_payments_paid_at ON beauty_payments(paid_at);
  `);

  addColumnIfMissing(companyDb, "beauty_appointments", "from_public_link", "from_public_link INTEGER NOT NULL DEFAULT 0");
}
