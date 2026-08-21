// Schema do módulo Saúde & Clínicas, no banco da EMPRESA (companies/<id>/app.sqlite).
//
// Mesmo padrão de applyFinanceiroSchema: CREATE TABLE IF NOT EXISTS, rodado a
// cada abertura do banco, sem pasta de migrations. Fica junto do módulo em vez
// de dentro de db.js pelo mesmo motivo do Financeiro - o módulo é autocontido,
// mas quem chama é db.js (applySchema), no mesmo ponto preguiçoso: a tabela só
// nasce na primeira requisição autenticada da empresa que abrir o módulo.
//
// Esta é a Fase "casca completa": as 10 entidades pedidas entram todas, mas só
// Pacientes e Anamnese têm tela por trás hoje. FaceMapping, DietPlan,
// Anthropometry, ProductLot, PackageSession e Appointment existem no banco para
// as fases seguintes não precisarem alterar schema de novo, e ficam sem uso até
// a tela chegar - mesmo espírito do `data` JSON abaixo em medical_records.
// Mesmo helper de db.js (que não exporta o dele) - coluna nova numa tabela já
// existente precisa de ALTER, porque CREATE TABLE IF NOT EXISTS não altera
// quem já foi criado. Duplicado aqui de propósito: o módulo é autocontido, e
// são 4 linhas.
function addColumnIfMissing(companyDb, table, name, ddl) {
  const columns = companyDb.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(name)) companyDb.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

export function applySaudeClinicasSchema(companyDb) {
  companyDb.exec(`
    -- Linha única (id fixo 'default') com a especialidade da clínica. Não é
    -- por empresa->coluna em outra tabela porque essa configuração é do
    -- módulo, não da empresa em si (o diretório global não precisa saber
    -- disso). O repo garante a linha na leitura (INSERT OR IGNORE).
    CREATE TABLE IF NOT EXISTS clinica_config (
      id TEXT PRIMARY KEY,
      -- 'ESTETICA' | 'NUTRICAO' | 'BIOMEDICINA_ESTETICA' | 'MULTIDISCIPLINAR'
      clinic_type TEXT NOT NULL DEFAULT 'MULTIDISCIPLINAR',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      -- Data civil YYYY-MM-DD, o formato do <input type="date"> - mesma regra
      -- do campo due dos cartões do Kanban.
      birth_date TEXT,
      gender TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      cpf TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);

    -- Prontuário genérico: um registro por atendimento/evento clínico. A
    -- coluna data é JSON livre para atributos estruturados que ainda não
    -- ganharam tela própria (fototipo Fitzpatrick, mapeamento de injetável,
    -- recordatório) - evita normalizar demais antes de a tela existir, no
    -- espírito do campo contraparte texto-livre do financeiro (ver
    -- financeiro/schema.js).
    CREATE TABLE IF NOT EXISTS medical_records (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      -- 'ESTETICA' | 'NUTRICAO' | 'BIOMEDICINA_ESTETICA' | 'GERAL'
      clinic_area TEXT NOT NULL DEFAULT 'GERAL',
      title TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_medrec_patient ON medical_records(patient_id);

    -- Modelo de anamnese: os campos do formulário (JSON) e a especialidade a
    -- que pertence. clinic_area NULL = universal (aparece para qualquer tipo
    -- de clínica). is_default marca os templates semeados por especialidade,
    -- para diferenciar do que a própria clínica construiu.
    CREATE TABLE IF NOT EXISTS anamnesis_templates (
      id TEXT PRIMARY KEY,
      clinic_area TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      -- [{id,label,type,required,options,alert}], type ∈ text|textarea|
      -- single_choice|multi_choice|boolean|file
      fields TEXT NOT NULL DEFAULT '[]',
      is_default INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_anamtpl_area ON anamnesis_templates(clinic_area);

    -- Um envio/preenchimento de anamnese. share_token é o que a rota pública
    -- (server/routes/anamnesePublica.js) usa para achar esta linha sem sessão
    -- - só existe (não-nulo) a partir do momento em que a ficha é enviada.
    CREATE TABLE IF NOT EXISTS anamnesis_responses (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES anamnesis_templates(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      answers TEXT NOT NULL DEFAULT '{}',
      -- 'rascunho' | 'enviado' | 'respondido'
      status TEXT NOT NULL DEFAULT 'rascunho',
      share_token TEXT UNIQUE,
      sent_at TEXT,
      responded_at TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_anamresp_patient ON anamnesis_responses(patient_id);
    CREATE INDEX IF NOT EXISTS idx_anamresp_token ON anamnesis_responses(share_token);

    -- ---------- Entidades sem tela ainda (schema pronto para as próximas fases) ----------

    CREATE TABLE IF NOT EXISTS face_mappings (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      medical_record_id TEXT REFERENCES medical_records(id),
      -- 'face' | 'corpo'
      area TEXT NOT NULL DEFAULT 'face',
      -- [{x,y,region,product,quantity,unit}]
      points TEXT NOT NULL DEFAULT '[]',
      image_ref TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_facemap_patient ON face_mappings(patient_id);

    CREATE TABLE IF NOT EXISTS diet_plans (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      medical_record_id TEXT REFERENCES medical_records(id),
      name TEXT NOT NULL DEFAULT '',
      -- {kcal, protein, carbs, fat, ...}
      targets TEXT NOT NULL DEFAULT '{}',
      -- [{name, items:[...]}]
      meals TEXT NOT NULL DEFAULT '[]',
      generated_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_dietplan_patient ON diet_plans(patient_id);

    CREATE TABLE IF NOT EXISTS anthropometry (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      medical_record_id TEXT REFERENCES medical_records(id),
      measured_at TEXT NOT NULL,
      weight_kg REAL,
      height_cm REAL,
      skinfolds TEXT NOT NULL DEFAULT '{}',
      bioimpedance TEXT NOT NULL DEFAULT '{}',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_anthro_patient ON anthropometry(patient_id);

    CREATE TABLE IF NOT EXISTS product_lots (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      medical_record_id TEXT REFERENCES medical_records(id),
      product_name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      lot_number TEXT NOT NULL DEFAULT '',
      expires_at TEXT,
      -- 'toxina' | 'preenchedor' | 'bioestimulador' | 'outro'
      category TEXT NOT NULL DEFAULT 'outro',
      quantity_used REAL,
      unit TEXT NOT NULL DEFAULT '',
      applied_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_productlot_patient ON product_lots(patient_id);
    CREATE INDEX IF NOT EXISTS idx_productlot_lot ON product_lots(lot_number);

    -- Pacote de sessões vendido ao paciente. O saldo é DERIVADO (total_sessions
    -- - contagem de usos), nunca gravado - mesmo motivo do saldo de conta do
    -- financeiro não ser coluna: nunca fica dessincronizado de um uso desfeito.
    CREATE TABLE IF NOT EXISTS care_packages (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      name TEXT NOT NULL,
      total_sessions INTEGER NOT NULL DEFAULT 1,
      price_cents INTEGER NOT NULL DEFAULT 0,
      sold_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_package_patient ON care_packages(patient_id);

    CREATE TABLE IF NOT EXISTS package_session_uses (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL REFERENCES care_packages(id),
      used_at TEXT NOT NULL,
      appointment_id TEXT REFERENCES appointments(id),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_packageuse_package ON package_session_uses(package_id);

    -- Agenda multiprofissional. date é civil (YYYY-MM-DD) e time é HH:MM no
    -- horário local de quem agenda - mesma regra da aritmética de recorrência
    -- do Kanban (server/recurrence.js), nunca timestamp ISO/UTC aqui.
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      professional_user_id TEXT REFERENCES users(id),
      title TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      time TEXT NOT NULL DEFAULT '09:00',
      duration_min INTEGER NOT NULL DEFAULT 30,
      -- 'agendado' | 'confirmado' | 'concluido' | 'cancelado' | 'faltou'
      status TEXT NOT NULL DEFAULT 'agendado',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
    CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);

    -- Bloqueio de horário (folga, almoço, feriado). Tabela própria, e não
    -- uma linha de appointments sem paciente: um bloqueio não tem paciente,
    -- procedimento nem pagamento, e appointments.patient_id é NOT NULL desde
    -- a Fase "casca completa" - forçar isso a aceitar NULL exigiria recriar a
    -- tabela (ALTER TABLE não solta NOT NULL no SQLite). professional_user_id
    -- NULL = vale para a agenda inteira (ex.: feriado da clínica).
    CREATE TABLE IF NOT EXISTS schedule_blocks (
      id TEXT PRIMARY KEY,
      professional_user_id TEXT REFERENCES users(id),
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 30,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_date ON schedule_blocks(date);

    -- Catálogo de procedimentos com preço - alimenta o seletor do formulário
    -- de agendamento (mostra preço/duração e soma o valor do atendimento).
    CREATE TABLE IF NOT EXISTS procedures (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      duration_min INTEGER NOT NULL DEFAULT 30,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Convênios aceitos pela clínica. Cadastro simples (nome + ativo) - o
    -- preço negociado por procedimento mora em insurance_plan_prices, não
    -- aqui, porque cada convênio paga um valor diferente pelo mesmo
    -- procedimento.
    CREATE TABLE IF NOT EXISTS insurance_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Preço de cada procedimento dentro de um convênio. Sem linha aqui, o
    -- convênio ainda não tem valor definido para aquele procedimento - a
    -- tela mostra "não definido" e nunca cai de volta no preço particular
    -- por conta própria (evitaria cobrar convênio por engano com o preço
    -- particular).
    CREATE TABLE IF NOT EXISTS insurance_plan_prices (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES insurance_plans(id),
      procedure_id TEXT NOT NULL REFERENCES procedures(id),
      price_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(plan_id, procedure_id)
    );
    CREATE INDEX IF NOT EXISTS idx_plan_prices_plan ON insurance_plan_prices(plan_id);

    -- ---------- Financeiro (Saúde & Clínicas) ----------
    -- Painel financeiro próprio do módulo, pedido explicitamente pelo usuário
    -- mesmo depois de ter sido avisado que isso duplica o escopo do módulo
    -- Financeiro (ERP IRES) - decisão consciente, registrada em conversa.
    -- Justamente por isso este bloco NÃO importa nada de
    -- server/modules/financeiro/: schema, repo e rotas são 100% próprios,
    -- sem FK nem código compartilhado com o outro módulo (a regra que
    -- continua valendo é só essa: os dois produtos não se acoplam no código).
    -- Lançamento aqui é direto e já realizado (sem estado provisionado/baixa
    -- como o módulo Financeiro) - o pedido descreveu botões "+ Receita/+
    -- Despesa/+ Transferência" que lançam na hora, não um título em aberto.
    CREATE TABLE IF NOT EXISTS sc_fin_contas (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      banco TEXT NOT NULL DEFAULT '',
      saldo_inicial_cents INTEGER NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sc_fin_categorias (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      -- 'receita' | 'despesa'
      tipo TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sc_fin_centros_custo (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Um lançamento por linha, inclusive transferência (conta_destino_id
    -- preenchido só nesse caso - sai de conta_id, entra em conta_destino_id,
    -- não mexe em receita/despesa). convenio_id e procedure_id são opcionais
    -- e só fazem sentido em receita - alimentam os dois donuts do Resumo
    -- (Receita × Convênio, Receita × Procedimento). Ambos referenciam tabelas
    -- que já são deste módulo (insurance_plans/procedures, de Serviços &
    -- Procedimentos) - não é acoplamento com o Financeiro, é o próprio
    -- domínio clínico.
    CREATE TABLE IF NOT EXISTS sc_fin_lancamentos (
      id TEXT PRIMARY KEY,
      -- 'receita' | 'despesa' | 'transferencia'
      tipo TEXT NOT NULL,
      descricao TEXT NOT NULL DEFAULT '',
      valor_cents INTEGER NOT NULL,
      -- Data civil YYYY-MM-DD, mesma regra do resto do módulo.
      data TEXT NOT NULL,
      conta_id TEXT NOT NULL REFERENCES sc_fin_contas(id),
      conta_destino_id TEXT REFERENCES sc_fin_contas(id),
      categoria_id TEXT REFERENCES sc_fin_categorias(id),
      centro_custo_id TEXT REFERENCES sc_fin_centros_custo(id),
      convenio_id TEXT REFERENCES insurance_plans(id),
      procedure_id TEXT REFERENCES procedures(id),
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sc_fin_lanc_data ON sc_fin_lancamentos(data);
    CREATE INDEX IF NOT EXISTS idx_sc_fin_lanc_conta ON sc_fin_lancamentos(conta_id);

    -- Lista de espera. name/phone ficam gravados na própria linha (não só via
    -- patient_id): quem entra na espera muitas vezes ainda não é um paciente
    -- cadastrado - o cadastro rápido do modal grava aqui direto, e um Patient
    -- de verdade só nasce na conversão para agendamento (ver
    -- converterEsperaEmAgendamento em repo.js). patient_id fica NULL até lá.
    CREATE TABLE IF NOT EXISTS waitlist (
      id TEXT PRIMARY KEY,
      patient_id TEXT REFERENCES patients(id),
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      procedure_id TEXT REFERENCES procedures(id),
      -- 'manha' | 'tarde' | 'qualquer'
      preferred_period TEXT NOT NULL DEFAULT 'qualquer',
      notes TEXT NOT NULL DEFAULT '',
      -- 'aguardando' | 'convertido' | 'cancelado'
      status TEXT NOT NULL DEFAULT 'aguardando',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);

    -- Log de eventos do agendamento (append-only, mesmo espírito de
    -- admin_audit no painel de plataforma: sem função de update/delete no
    -- repo, de propósito). Cada linha é um SNAPSHOT do agendamento no
    -- momento do evento - não um diff - porque é isso que a tela de log
    -- mostra (o estado inteiro em cada ponto do tempo), e snapshot não
    -- perde informação se um campo antigo mudar de significado depois.
    CREATE TABLE IF NOT EXISTS appointment_logs (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL REFERENCES appointments(id),
      -- 'criado' | 'reagendado' (mudou data/hora) | 'status_alterado'
      event TEXT NOT NULL,
      status TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 30,
      payment_type TEXT NOT NULL DEFAULT 'particular',
      procedure_summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_apptlogs_appointment ON appointment_logs(appointment_id);
  `);

  // Colunas novas em appointments (a tabela já existia, sem tela por trás,
  // desde a Fase "casca completa" - ver o comentário lá em cima).
  // payment_type/payment_status alimentam o toggle de pagamento do modal;
  // procedures é o array [{name, priceCents, quantity}] escolhido no
  // agendamento - texto livre (JSON), não FK para procedures: o procedimento
  // pode ter o preço editado na hora (desconto, pacote) sem afetar o
  // catálogo, e um procedimento excluído do catálogo depois não pode
  // invalidar um agendamento passado.
  addColumnIfMissing(companyDb, "appointments", "payment_type", "payment_type TEXT NOT NULL DEFAULT 'particular'");
  addColumnIfMissing(companyDb, "appointments", "payment_status", "payment_status TEXT NOT NULL DEFAULT 'pendente'");
  addColumnIfMissing(companyDb, "appointments", "procedures", "procedures TEXT NOT NULL DEFAULT '[]'");

  // Cadastro completo de paciente (a Fase "casca completa" só tinha nome,
  // nascimento, sexo, telefone, cpf, e-mail, notas - o resto entrou quando a
  // tela de cadastro ganhou as abas Dados pessoais/complementares).
  // patient_number é o "código" sequencial mostrado na tela - não é a chave
  // primária (essa continua sendo o uid), é só um número de referência fácil
  // de falar ao telefone; calculado no repo (MAX+1), não é AUTOINCREMENT
  // porque a PK já é TEXT.
  addColumnIfMissing(companyDb, "patients", "patient_number", "patient_number INTEGER");
  // Nome civil e gênero social são campos de cuidado inclusivo (paciente
  // trans, p.ex.): o nome de registro pode diferir do nome social já
  // cadastrado em `name`, e o gênero social pode diferir do sexo clínico
  // (`gender`) - por isso são colunas separadas, não um only-um-ou-outro.
  addColumnIfMissing(companyDb, "patients", "civil_name", "civil_name TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "patients", "social_gender", "social_gender TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "patients", "rg", "rg TEXT NOT NULL DEFAULT ''");
  // `phone` (já existia) segue sendo o celular - é o que o lembrete por
  // WhatsApp usa. Casa/trabalho são complementares, opcionais.
  addColumnIfMissing(companyDb, "patients", "phone_home", "phone_home TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "patients", "phone_work", "phone_work TEXT NOT NULL DEFAULT ''");
  // Preferência armazenada, sem envio de verdade ainda (não há provedor de
  // SMS no projeto - mesmo estágio do "Gerar Cobrança" no agendamento).
  addColumnIfMissing(companyDb, "patients", "sms_reminder_opt_in", "sms_reminder_opt_in INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(companyDb, "patients", "cep", "cep TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "patients", "address", "address TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "patients", "address_number", "address_number TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "patients", "complement", "complement TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "patients", "neighborhood", "neighborhood TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "patients", "city", "city TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "patients", "state", "state TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "patients", "country", "country TEXT NOT NULL DEFAULT 'Brasil'");
  // Foto de perfil: mesmo desenho de avatar_path/avatar_mime de users (ver
  // server/repo.js) - o arquivo em si mora em
  // companies/<id>/uploads/patients/, nomeado pelo id gravado aqui, nunca
  // pelo nome original do arquivo.
  addColumnIfMissing(companyDb, "patients", "avatar_path", "avatar_path TEXT");
  addColumnIfMissing(companyDb, "patients", "avatar_mime", "avatar_mime TEXT");

  // Aba "Preferências" do cadastro rico: como o paciente chegou até a
  // clínica (indicação, Instagram, Google...) e um alerta clínico crítico
  // (alergia grave, necessidade especial) que precisa saltar aos olhos de
  // quem abre a ficha - por isso vem com nota livre própria, não misturado
  // em `notes` (que é observação geral, sem destaque visual nenhum).
  addColumnIfMissing(companyDb, "patients", "referral_source", "referral_source TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "patients", "critical_alert", "critical_alert INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(companyDb, "patients", "critical_alert_notes", "critical_alert_notes TEXT NOT NULL DEFAULT ''");

  // Tema visual do módulo (Aparência e Temas, em Configurações): cor de
  // destaque que a própria clínica escolhe para os botões/menus/destaques da
  // sua instância - não é o tema claro/escuro do app inteiro (esse já existe
  // por conta própria via ThemeContext), é uma segunda camada só dentro do
  // módulo. 'padrao' mantém a cor neutra atual sem precisar de uma linha
  // NULL/vazia com significado especial.
  addColumnIfMissing(companyDb, "clinica_config", "theme", "theme TEXT NOT NULL DEFAULT 'padrao'");

  // White-label: nome e logo que a clínica escolhe pro topo do módulo (ver
  // "Dados da clínica" em Configurações - o "Em breve" de antes virou real
  // aqui). logo_path/logo_mime é o mesmo desenho do avatar de paciente
  // (avatar_path/avatar_mime): o arquivo em si mora em
  // companies/<id>/uploads/clinic-logo/, nomeado pelo id gravado aqui, nunca
  // pelo nome original do arquivo.
  addColumnIfMissing(companyDb, "clinica_config", "clinic_name", "clinic_name TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "clinica_config", "logo_path", "logo_path TEXT");
  addColumnIfMissing(companyDb, "clinica_config", "logo_mime", "logo_mime TEXT");

  // Campos do agendamento que só a tela de Relatórios usa (nenhum deles
  // aparecia antes): CID é o diagnóstico daquele atendimento específico, não
  // do paciente em geral (a mesma pessoa pode voltar com CID diferente a
  // cada consulta) - por isso mora em appointments, não em patients.
  // insurance_provider é o NOME do convênio (Unimed, Bradesco Saúde...),
  // livre porque não existe catálogo fechado de operadoras no projeto - só
  // faz sentido quando payment_type='convenio', mas não é obrigatório nem
  // nesse caso (clínica pode não ter cadastrado ainda). satisfaction_score
  // é 1-5, gravado manualmente por quem atendeu (não existe envio de
  // pesquisa automática - mesmo estágio de "SMS ainda não disponível" do
  // lembrete de agendamento).
  addColumnIfMissing(companyDb, "appointments", "cid_code", "cid_code TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "appointments", "cid_description", "cid_description TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "appointments", "insurance_provider", "insurance_provider TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "appointments", "satisfaction_score", "satisfaction_score INTEGER");

  // Repasse por profissional (Relatórios › Finanças): percentual de comissão
  // sobre a receita dos atendimentos concluídos daquele profissional. Tabela
  // própria (não coluna em `users`, que é global da plataforma, compartilhada
  // por todos os módulos) - só o Saúde & Clínicas sabe o que é "repasse".
  // user_id é único de propósito: um profissional tem uma comissão só, o
  // repo faz UPSERT nela.
  companyDb.exec(`
    CREATE TABLE IF NOT EXISTS professional_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      commission_pct REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}
