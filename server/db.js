import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { getCurrentCompanyId } from "./context.js";
import { applyFinanceiroSchema } from "./modules/financeiro/schema.js";
import { applySaudeClinicasSchema } from "./modules/saude-clinicas/schema.js";
import { applyCrmSchema } from "./modules/crm/schema.js";
import { applyXaphiresBeautySchema } from "./modules/xaphires-beauty/schema.js";

const dataDir = process.env.KANBAN_DATA_DIR || path.join(process.cwd(), "server", "data");
fs.mkdirSync(dataDir, { recursive: true });

export function companiesDir() {
  return path.join(dataDir, "companies");
}

export function legacyDbPath() {
  return path.join(dataDir, "app.sqlite");
}

function addColumnIfMissing(companyDb, table, name, ddl) {
  const columns = companyDb.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(name)) companyDb.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function applySchema(companyDb) {
  companyDb.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('master','member')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      background TEXT,
      owner_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'shared',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Quem enxerga um quadro privado além do dono. Só o quadro privado usa esta
    -- tabela: no compartilhado todo mundo da empresa entra, e uma linha por
    -- usuário ali seria ruído que precisaria ser mantido em dia a cada cadastro.
    --
    -- A AUTORIDADE SOBRE O DONO CONTINUA SENDO boards.owner_id. A linha com role
    -- 'owner' existe para o painel de compartilhamento listar todo mundo com
    -- acesso numa consulta só, e é derivada — nenhuma decisão de acesso a lê.
    -- Repare no ON DELETE CASCADE dos dois lados: excluir o quadro ou o usuário
    -- leva junto as permissões, senão sobraria concessão apontando para o vazio.
    CREATE TABLE IF NOT EXISTS board_permissions (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (board_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      color TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      labels TEXT NOT NULL DEFAULT '[]',
      due TEXT,
      start_date TEXT,
      location TEXT,
      checklist TEXT NOT NULL DEFAULT '[]',
      member_ids TEXT NOT NULL DEFAULT '[]',
      completed INTEGER NOT NULL DEFAULT 0,
      urgent INTEGER NOT NULL DEFAULT 0,
      important INTEGER NOT NULL DEFAULT 0,
      attachments TEXT NOT NULL DEFAULT '[]',
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );

    -- Rotinas que geram cartões sozinhas. O cartão nasce a partir deste molde;
    -- alterar o molde depois não mexe nos cartões já criados.
    CREATE TABLE IF NOT EXISTS recurrences (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      checklist TEXT NOT NULL DEFAULT '[]',
      labels TEXT NOT NULL DEFAULT '[]',
      member_ids TEXT NOT NULL DEFAULT '[]',
      freq TEXT NOT NULL CHECK(freq IN ('daily','weekly','monthly')),
      weekday INTEGER,
      monthday INTEGER,
      hour INTEGER NOT NULL DEFAULT 0,
      due_in_days INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      created_at TEXT NOT NULL
    );

    -- Uma conversa privada é sempre entre exatamente dois usuários da empresa.
    -- user_a_id < user_b_id por convenção (normalizado em repo.js), para o índice
    -- único enxergar "A com B" e "B com A" como a mesma linha. Excluir qualquer um
    -- dos dois apaga a conversa inteira (CASCADE) - é dado privado dos dois, não
    -- histórico da empresa como o chat geral, então não faz sentido sobreviver ao
    -- usuário como o chat geral faz com author_id SET NULL.
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conversations_pair ON chat_conversations(user_a_id, user_b_id);

    -- O chat geral da empresa (todo mundo vê e escreve, sem convite - mesmo alcance
    -- do quadro compartilhado) e as conversas privadas moram na mesma tabela.
    -- conversation_id NULL é o geral; preenchido é uma linha de chat_conversations.
    -- author_id some (SET NULL) se o usuário for excluído - no geral a mensagem
    -- sobrevive como histórico da empresa; numa privada isso não chega a acontecer,
    -- porque excluir o usuário já apaga a conversa inteira via chat_conversations.
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      conversation_id TEXT REFERENCES chat_conversations(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);

    -- Até onde cada usuário já leu, por conversa. conversation_key é "general" para
    -- o chat geral (chave estável em texto, não NULL - NULL em PRIMARY KEY composta
    -- do SQLite não deduplica do jeito que se espera) ou o id da conversa privada.
    -- Existe para o contador de não lidas sobreviver a um recarregamento de página -
    -- sem isso, era estado só de sessão, e reabrir o app sempre mostraria tudo como
    -- lido ou tudo como não lido.
    CREATE TABLE IF NOT EXISTS chat_reads (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_key TEXT NOT NULL,
      last_read_message_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_key)
    );

    -- Agenda pessoal (Planejador): tarefas fora de qualquer quadro, visíveis só
    -- para quem criou. Não passam por lists/board_permissions de propósito - não
    -- têm quadro, então "Minhas tarefas" as lê direto desta tabela por user_id.
    CREATE TABLE IF NOT EXISTS personal_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_personal_tasks_user ON personal_tasks(user_id);
  `);

  // Arquivamento automático da agenda pessoal: concluída há mais de 2 dias
  // (PERSONAL_TASK_AUTO_ARCHIVE_DAYS, repo.js) some da lista sozinha, mesmo
  // espírito do auto-arquivamento de cartão (completed_at/archived acima),
  // só que sem o botão de configurar - aqui o prazo é fixo, não por usuário.
  addColumnIfMissing(companyDb, "personal_tasks", "completed_at", "completed_at TEXT");
  addColumnIfMissing(companyDb, "personal_tasks", "archived", "archived INTEGER NOT NULL DEFAULT 0");
  // Tarefa pessoal concluída antes destas colunas existirem não tem data - herda o
  // instante da migração, mesmo raciocínio do completed_at de cards: sem isto, o
  // primeiro carregamento depois do deploy arquivaria um lote inteiro de uma vez.
  companyDb
    .prepare("UPDATE personal_tasks SET completed_at = ? WHERE completed = 1 AND completed_at IS NULL")
    .run(new Date().toISOString());
  // Detalhes da tarefa pessoal: descrição livre e checklist de subtarefas, mesmo
  // formato ({text, done} em JSON) que cards.checklist já usa - sem tabela própria
  // porque o volume por tarefa é pequeno e não precisa ser consultado à parte.
  addColumnIfMissing(companyDb, "personal_tasks", "description", "description TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(companyDb, "personal_tasks", "checklist", "checklist TEXT NOT NULL DEFAULT '[]'");

  // Perfil pessoal (routes/profile.js): as únicas duas coisas que o próprio
  // usuário edita sobre si mesmo. E-mail continua fora daqui de propósito -
  // mexe no diretório global de login (directory.js), só master troca
  // (routes/users.js).
  addColumnIfMissing(companyDb, "users", "bio", "bio TEXT NOT NULL DEFAULT ''");
  // uuid do arquivo em companies/<id>/uploads/avatars/, sem extensão - mesmo
  // padrão dos anexos de cartão (attachmentsUploadsDir). NULL = sem foto,
  // mostra iniciais coloridas (Avatar.jsx). avatar_mime é o Content-Type
  // validado no upload (routes/profile.js só aceita imagem), servido de volta
  // tal e qual - sem essa coluna a rota de download teria que adivinhar o
  // tipo pela extensão, que o arquivo no disco não tem.
  addColumnIfMissing(companyDb, "users", "avatar_path", "avatar_path TEXT");
  addColumnIfMissing(companyDb, "users", "avatar_mime", "avatar_mime TEXT");
  // Central de Perfil do Kanban (apelido, cor do badge, exibição padrão,
  // avisos, cor de fundo padrão de quadro novo) - um JSON só em vez de uma
  // coluna por campo, mesmo padrão de cards.labels/checklist: é preferência
  // solta do próprio usuário, não dado relacional que precise de índice ou
  // JOIN. repo.updateProfilePrefs() faz merge parcial, nunca sobrescreve o
  // que não veio no PATCH.
  addColumnIfMissing(companyDb, "users", "prefs", "prefs TEXT NOT NULL DEFAULT '{}'");

  addColumnIfMissing(companyDb, "cards", "completed", "completed INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(companyDb, "cards", "start_date", "start_date TEXT");
  addColumnIfMissing(companyDb, "cards", "location", "location TEXT");
  addColumnIfMissing(companyDb, "boards", "background", "background TEXT");
  addColumnIfMissing(companyDb, "boards", "owner_id", "owner_id TEXT");
  addColumnIfMissing(companyDb, "boards", "visibility", "visibility TEXT NOT NULL DEFAULT 'shared'");
  addColumnIfMissing(companyDb, "lists", "color", "color TEXT");
  addColumnIfMissing(companyDb, "cards", "urgent", "urgent INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(companyDb, "cards", "important", "important INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(companyDb, "cards", "attachments", "attachments TEXT NOT NULL DEFAULT '[]'");
  // Subtarefa é mais rica que item de checklist (responsável, prazo, prioridade),
  // por isso é coluna própria e não um campo a mais no checklist existente - as
  // duas seções convivem no modal, cada uma com o peso que já tinha.
  addColumnIfMissing(companyDb, "cards", "subtasks", "subtasks TEXT NOT NULL DEFAULT '[]'");
  // O cartão arquivado mantém list_id e position, para restaurar de volta à coluna
  // de origem; o que muda é ele deixar de entrar em list.cardIds na leitura.
  addColumnIfMissing(companyDb, "cards", "archived", "archived INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(companyDb, "cards", "archived_at", "archived_at TEXT");
  // Marca quando o cartão foi concluído, base da regra de arquivamento automático.
  addColumnIfMissing(companyDb, "cards", "completed_at", "completed_at TEXT");
  // Quando o cartão entrou na coluna atual. Base do monitor de gargalos.
  addColumnIfMissing(companyDb, "cards", "list_entered_at", "list_entered_at TEXT");
  // Quando o cartão nasceu. A tabela viveu muito tempo sem esta coluna porque o
  // quadro nunca precisou dela - quem precisa é o relatório exportado, que traz
  // "Data de Criação". Fica TEXT ISO, como as outras datas com hora.
  addColumnIfMissing(companyDb, "cards", "created_at", "created_at TEXT");
  // Horas até a coluna acusar gargalo. NULL = coluna não monitorada, que é o padrão:
  // "parado" significa coisas diferentes por coluna, e um prazo global acusaria
  // gargalo em espera legítima como Backlog.
  addColumnIfMissing(companyDb, "lists", "stuck_hours", "stuck_hours INTEGER");
  // Dias até arquivar um concluído. NULL = regra desligada, que é o padrão.
  addColumnIfMissing(companyDb, "boards", "auto_archive_days", "auto_archive_days INTEGER");
  // Segundo dia do mês opcional para rotina mensal, para a mesma rotina nascer
  // duas vezes por mês (ex: fechar balancete no dia 5 e no dia 20) sem precisar
  // de duas regras separadas. NULL = só o dia único de `monthday`, que continua
  // sendo o caso comum. Mesmo raciocínio não se aplica a `weekday`: ninguém pediu.
  addColumnIfMissing(companyDb, "recurrences", "monthday2", "monthday2 INTEGER");
  // chat_messages nasceu só com o chat geral; conversation_id chegou depois para
  // separar as conversas privadas sem duplicar a tabela. NULL preserva as mensagens
  // do geral já gravadas antes desta coluna existir.
  addColumnIfMissing(companyDb, "chat_messages", "conversation_id", "conversation_id TEXT REFERENCES chat_conversations(id) ON DELETE CASCADE");
  // Quem criou o cartão - só quem criou (ou dono do quadro/master da empresa)
  // pode excluí-lo (ver DELETE /api/cards/:id em routes/cards.js). NULL para
  // cartão criado antes desta coluna existir, e de propósito: sem usuário
  // registrado para checar contra, a regra não tem como se aplicar, e o cartão
  // continua excluível por quem já tinha acesso de escrita, como sempre foi.
  addColumnIfMissing(companyDb, "cards", "creator_id", "creator_id TEXT");

  // Cartões já concluídos antes desta coluna existir não têm data. Preenche com o
  // instante da migração, para o relógio deles começar agora: quem ligar a regra
  // não vê um lote inteiro sumir de imediato, só N dias depois.
  companyDb
    .prepare("UPDATE cards SET completed_at = ? WHERE completed = 1 AND completed_at IS NULL")
    .run(new Date().toISOString());
  // Cartões anteriores à coluna não têm entrada registrada. Contam a partir de
  // agora, senão apareceriam todos como parados desde sempre no primeiro uso.
  companyDb
    .prepare("UPDATE cards SET list_entered_at = ? WHERE list_entered_at IS NULL")
    .run(new Date().toISOString());
  // Cartão anterior a created_at não tem data de nascimento em lugar nenhum - ela
  // nunca foi gravada, então não há como recuperá-la. Herda list_entered_at, que é
  // a marca mais antiga que existe do cartão, e só cai para agora quando nem essa
  // existe. Roda DEPOIS do preenchimento acima de propósito: assim o COALESCE
  // encontra list_entered_at já preenchido e os dois contam a mesma história.
  // O relatório de um banco antigo mostra, portanto, a data da migração para os
  // cartões velhos - é aproximação, não invenção de data plausível.
  companyDb
    .prepare("UPDATE cards SET created_at = COALESCE(list_entered_at, ?) WHERE created_at IS NULL")
    .run(new Date().toISOString());

  // Quadros privados criados antes da tabela de permissões não têm a linha do dono.
  // Sem este preenchimento o modal de compartilhamento abriria sem ninguém na lista,
  // como se o quadro não tivesse dono. O JOIN com users é proposital: quadro cujo
  // dono já foi excluído tem owner_id órfão, e a chave estrangeira recusaria a linha.
  companyDb
    .prepare(
      `INSERT OR IGNORE INTO board_permissions (board_id, user_id, role, created_at)
       SELECT b.id, b.owner_id, 'owner', ?
         FROM boards b JOIN users u ON u.id = b.owner_id
        WHERE b.visibility = 'private'`
    )
    .run(new Date().toISOString());

  // `due` é uma data civil (YYYY-MM-DD), o formato que o <input type="date"> produz
  // e que todas as views esperam. As rotinas de recorrência gravaram por um tempo
  // um timestamp ISO completo aqui, e esses cartões apareciam com "Invalid Date" no
  // crachá, não casavam no Calendário e saíam com posição NaN na Linha do tempo.
  // Corta o que veio errado; o horário não tinha uso nenhum.
  companyDb.exec("UPDATE cards SET due = substr(due, 1, 10) WHERE due LIKE '____-__-__T%'");

  // Concessão de acesso ao módulo Financeiro (plataforma modular). O master
  // sempre acessa, com ou sem a flag; membro só com ela ligada. Default 0: numa
  // empresa existente ninguém enxerga o Financeiro até o master liberar, que é a
  // postura segura para dado financeiro. Ver server/modules.js (isModuleEnabled)
  // e o toggle no UsersPanel.
  addColumnIfMissing(companyDb, "users", "finance_access", "finance_access INTEGER NOT NULL DEFAULT 0");

  // Schema do módulo Financeiro. Fica junto do módulo (server/modules/financeiro),
  // mas roda aqui, no mesmo ponto preguiçoso do resto - a tabela nasce na primeira
  // requisição autenticada da empresa, não no arranque do servidor.
  applyFinanceiroSchema(companyDb);

  // Schema do módulo Saúde & Clínicas, mesmo ponto preguiçoso do Financeiro.
  applySaudeClinicasSchema(companyDb);

  // Schema do módulo CRM, mesmo ponto preguiçoso.
  applyCrmSchema(companyDb);

  // Schema do módulo Xaphires Beauty, mesmo ponto preguiçoso.
  applyXaphiresBeautySchema(companyDb);
}

const cache = new Map();

export function getCompanyDb(companyId) {
  if (cache.has(companyId)) return cache.get(companyId);
  const dir = path.join(companiesDir(), companyId);
  fs.mkdirSync(dir, { recursive: true });
  const companyDb = new DatabaseSync(path.join(dir, "app.sqlite"));
  applySchema(companyDb);
  cache.set(companyId, companyDb);
  return companyDb;
}

export function getDb() {
  return getCompanyDb(getCurrentCompanyId());
}

export function closeAllDbs() {
  for (const companyDb of cache.values()) companyDb.close();
  cache.clear();
}
