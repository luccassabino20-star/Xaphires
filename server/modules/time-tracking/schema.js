// Schema do módulo Xaphires Time & Tracking, no banco da EMPRESA
// (companies/<id>/app.sqlite). Mesmo padrão dos outros módulos: CREATE TABLE
// IF NOT EXISTS, rodado a cada abertura do banco (ver db.js applySchema),
// sem pasta de migrations.
//
// Fase 1: "tarefa" (tt_tasks) é um catálogo PRÓPRIO deste módulo, sem vínculo
// com cartão do Kanban, cliente do Xaphires Beauty ou lançamento do
// Financeiro - a plataforma tem três catálogos de "cliente" diferentes por
// vertical, e escolher um deles de propósito exigiria decisão do produto que
// ainda não foi tomada. project_name é texto livre (mesmo espírito de
// beauty_services.category): a empresa nomeia os próprios projetos, sem
// tabela separada só para isso.
export function applyTimeTrackingSchema(companyDb) {
  companyDb.exec(`
    CREATE TABLE IF NOT EXISTS tt_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      project_name TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- start_time/end_time são o instante real (UTC, via toISOString - mesmo
    -- padrão de created_at/confirmed_at no Xaphires Beauty), porque marcam
    -- quando o cronômetro rodou de verdade. "date" é civil (YYYY-MM-DD, dia
    -- local de quem apontou) - é o dia que a grade semanal soma, e pode não
    -- bater com a data UTC de start_time perto da virada do dia.
    -- end_time NULL = cronômetro rodando; duration_minutes some enquanto
    -- roda e é calculado na hora de parar.
    CREATE TABLE IF NOT EXISTS tt_time_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      task_id TEXT REFERENCES tt_tasks(id),
      date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      billable INTEGER NOT NULL DEFAULT 1,
      hourly_rate_cents INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_tt_entries_user_date ON tt_time_entries(user_id, date);

    -- Semana como unidade de aprovação (start_date = segunda-feira civil).
    -- UNIQUE(user_id, start_date) porque só existe uma folha por pessoa por
    -- semana - submeter de novo reaproveita a mesma linha.
    CREATE TABLE IF NOT EXISTS tt_timesheets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      submitted_at TEXT,
      reviewed_at TEXT,
      reviewed_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      UNIQUE(user_id, start_date)
    );
  `);
}
