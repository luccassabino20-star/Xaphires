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

  // Fase 5: ficha rica do cliente. avatar_path/avatar_mime no mesmo desenho
  // de patients.avatar_path em Saúde & Clínicas (e de users.avatar_path) -
  // arquivo em companies/<id>/uploads/beauty-clients/, nomeado pelo id
  // gerado no upload, nunca pelo nome original.
  addColumnIfMissing(companyDb, "beauty_clients", "birth_date", "birth_date TEXT");
  addColumnIfMissing(companyDb, "beauty_clients", "avatar_path", "avatar_path TEXT");
  addColumnIfMissing(companyDb, "beauty_clients", "avatar_mime", "avatar_mime TEXT");

  // Fase 6: catálogo rico de serviço. category é texto livre (o salão decide
  // as próprias categorias, sem tabela de apoio - mesmo espírito de "role" em
  // beauty_staff); avatar_path/avatar_mime no mesmo desenho da Fase 5
  // (companies/<id>/uploads/beauty-services/).
  addColumnIfMissing(companyDb, "beauty_services", "category", "category TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "beauty_services", "avatar_path", "avatar_path TEXT");
  addColumnIfMissing(companyDb, "beauty_services", "avatar_mime", "avatar_mime TEXT");

  // Fase 7: comissão configurável por serviço - opcional, por cima do
  // commission_rate padrão do profissional (beauty_staff). Chave composta
  // (não precisa de id próprio: no máximo uma linha por par staff+serviço) -
  // getCommissionsSummary cai no padrão do profissional quando não há linha
  // aqui para o par em questão.
  companyDb.exec(`
    CREATE TABLE IF NOT EXISTS beauty_staff_service_commission (
      staff_id TEXT NOT NULL REFERENCES beauty_staff(id),
      service_id TEXT NOT NULL REFERENCES beauty_services(id),
      commission_rate REAL NOT NULL,
      PRIMARY KEY (staff_id, service_id)
    );
  `);

  // Fase 8: especialidades (quais serviços a pessoa realiza - usado na Fase 9
  // pra filtrar o seletor de profissional pelo serviço escolhido), cor (chip
  // na agenda, também Fase 9) e horário de trabalho (só cadastro/exibição
  // por ora - validar contra ele na hora de agendar fica pra depois). Uma
  // linha por dia da semana em beauty_staff_hours: quem não trabalha naquele
  // dia simplesmente não tem linha, em vez de guardar um "folga" explícito.
  addColumnIfMissing(companyDb, "beauty_staff", "color", "color TEXT NOT NULL DEFAULT '#B76E79'");
  companyDb.exec(`
    CREATE TABLE IF NOT EXISTS beauty_staff_services (
      staff_id TEXT NOT NULL REFERENCES beauty_staff(id),
      service_id TEXT NOT NULL REFERENCES beauty_services(id),
      PRIMARY KEY (staff_id, service_id)
    );
    CREATE TABLE IF NOT EXISTS beauty_staff_hours (
      staff_id TEXT NOT NULL REFERENCES beauty_staff(id),
      weekday INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      PRIMARY KEY (staff_id, weekday)
    );
  `);

  // Fase 9: bloqueio de horário (mesma forma de schedule_blocks em Saúde &
  // Clínicas, mas em datetime civil ingênuo - starts_at/ends_at, igual
  // beauty_appointments - em vez de date+time+duration_min, pra entrar na
  // MESMA consulta de hasOverlap sem converter formato). staff_id NULL =
  // bloqueio da agenda inteira (ex.: feriado do salão); com staff_id, só
  // aquela pessoa fica indisponível (ex.: almoço).
  companyDb.exec(`
    CREATE TABLE IF NOT EXISTS beauty_schedule_blocks (
      id TEXT PRIMARY KEY,
      staff_id TEXT REFERENCES beauty_staff(id),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_beauty_blocks_starts ON beauty_schedule_blocks(starts_at);
  `);

  // Fase 10: personalização da página pública de agendamento - uma linha só
  // por empresa (CHECK id=1, mesmo padrão de singleton). cover_path/logo_path
  // no mesmo desenho de avatar (Fase 5/6), em pasta própria
  // (companies/<id>/uploads/beauty-page/). address/lat/lng é o endereço já
  // geocodificado (server/routes/geocode.js), igual location de card do
  // Kanban - não uma tabela de endereço estruturada, o salão tem um endereço
  // só. booking_rules_text é o texto livre que a página pública mostra
  // (ex.: política de cancelamento).
  companyDb.exec(`
    CREATE TABLE IF NOT EXISTS beauty_page_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cover_path TEXT,
      cover_mime TEXT,
      logo_path TEXT,
      logo_mime TEXT,
      address TEXT NOT NULL DEFAULT '',
      lat REAL,
      lng REAL,
      booking_rules_text TEXT NOT NULL DEFAULT ''
    );
  `);

  // Despesas (Fase 11). due_date é data civil (YYYY-MM-DD), mesma convenção
  // do resto do módulo - "quando" a despesa vence/aconteceu, não um instante.
  // is_template=1 é o modelo de uma despesa recorrente: nunca aparece na
  // listagem (listExpenses filtra is_template=0), só existe para
  // gerarOcorrenciasDoMes (repo.js) gerar a ocorrência real de cada mês -
  // mesmo espírito de recurrence.js no Kanban, só que a automação roda na
  // leitura de /expenses (ver comentário em runExpenseRecurrences), não por
  // cron. recurring_source_id aponta a ocorrência de volta pro modelo que a
  // gerou, só para o dedupe (não gerar duas vezes o mesmo mês).
  companyDb.exec(`
    CREATE TABLE IF NOT EXISTS beauty_expenses (
      id TEXT PRIMARY KEY,
      amount_cents INTEGER NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      due_date TEXT NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      is_template INTEGER NOT NULL DEFAULT 0,
      recurring_source_id TEXT REFERENCES beauty_expenses(id),
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_beauty_expenses_due ON beauty_expenses(due_date);
  `);

  // Fase 12: tela de detalhe do atendimento. Três carimbos de data/hora que
  // beauty_appointments nunca teve (só existia created_at) - completed_at e
  // cancelled_at nascem em setAppointmentStatus, quando a transição
  // acontece de verdade; confirmed_at nasce na página pública do link de
  // lembrete (server/routes/xaphiresBeautyLembrete.js), quando o CLIENTE
  // confirma presença - é o único dos três que o próprio cliente grava, sem
  // login. Todos nascem NULL pra quem já existia: sem isso, um agendamento
  // concluído antes desta fase mostraria "concluído em <criado em>" na
  // linha do tempo, o que seria inventar uma data que não aconteceu -
  // melhor não mostrar o evento do que mostrar um errado.
  addColumnIfMissing(companyDb, "beauty_appointments", "confirmed_at", "confirmed_at TEXT");
  addColumnIfMissing(companyDb, "beauty_appointments", "completed_at", "completed_at TEXT");
  addColumnIfMissing(companyDb, "beauty_appointments", "cancelled_at", "cancelled_at TEXT");

  // Fase 13: ficha técnica do cliente (unhas/cílios/cabelo) - texto livre em
  // vez de enum fechado, mesmo espírito de category em beauty_services (o
  // salão decide os próprios termos - "Fox Eye"/"Almond" variam de salão
  // pra salão, uma lista fixa engessaria). O campo "notes" que já existia
  // continua sendo o texto único do cadastro rápido (renomeado na tela pra
  // "Observações Técnicas/Alergias") - é ele que a aba Geral do detalhe
  // destaca como alerta quando não está vazio, não um campo novo: um cadastro
  // rápido com dois campos de texto livre pra "alergia" só confundiria qual
  // preencher.
  addColumnIfMissing(companyDb, "beauty_clients", "nails_shape", "nails_shape TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "beauty_clients", "nails_size", "nails_size TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "beauty_clients", "nails_color", "nails_color TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "beauty_clients", "lash_mapping", "lash_mapping TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "beauty_clients", "lash_curvature", "lash_curvature TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "beauty_clients", "lash_thickness", "lash_thickness TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "beauty_clients", "lash_style", "lash_style TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "beauty_clients", "hair_tone", "hair_tone TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "beauty_clients", "hair_chemical_history", "hair_chemical_history TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "beauty_clients", "hair_sensitivity", "hair_sensitivity TEXT NOT NULL DEFAULT ''");

  // Histórico de observações datadas (Fase 13) - diferente de "notes" (um
  // valor só, sobrescrito a cada edição), aqui cada relato do atendimento
  // vira uma linha própria, com a própria data - "cliente relatou que a
  // retenção durou 25 dias" não some quando alguém edita o cadastro depois.
  // Append-only por natureza (sem função de update/delete no repo) - é
  // literalmente um diário, não um campo de cadastro.
  companyDb.exec(`
    CREATE TABLE IF NOT EXISTS beauty_client_notes (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES beauty_clients(id),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_beauty_client_notes_client ON beauty_client_notes(client_id);
  `);
}
