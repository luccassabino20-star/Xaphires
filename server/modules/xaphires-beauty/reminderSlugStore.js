// Slug curto do link de lembrete por agendamento (Fase 9) - mora no banco
// do DIRETÓRIO (global), mesmo motivo de agendaSlugStore.js: a rota pública
// recebe só o slug na URL e ainda não sabe de qual empresa é. Diferente do
// slug de agendamento online (um por EMPRESA), aqui é um por AGENDAMENTO -
// mesma forma de captacaoStore.js (um por template), só trocando o campo.
import { getDirectoryDb } from "../../directory.js";

const db = getDirectoryDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS beauty_reminder_slugs (
    slug TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    appointment_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_empresa_agendamento ON beauty_reminder_slugs(company_id, appointment_id);
`);

const ALFABETO = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
function gerarSlug() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return s;
}

// Sempre o mesmo slug pro mesmo agendamento (índice único em company_id+
// appointment_id): pedir o link de novo depois não troca o que já foi
// mandado pro cliente.
export function getOuCriarSlugLembrete(companyId, appointmentId) {
  const existente = db
    .prepare("SELECT slug FROM beauty_reminder_slugs WHERE company_id = ? AND appointment_id = ?")
    .get(companyId, appointmentId);
  if (existente) return existente.slug;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const slug = gerarSlug();
    try {
      db.prepare("INSERT INTO beauty_reminder_slugs (slug, company_id, appointment_id, created_at) VALUES (?, ?, ?, ?)").run(
        slug,
        companyId,
        appointmentId,
        new Date().toISOString()
      );
      return slug;
    } catch {
      // colidiu com um slug existente - tenta de novo com outro sorteio
    }
  }
  throw new Error("Não foi possível gerar um slug de lembrete único");
}

export function getLembretePorSlug(slug) {
  return db.prepare("SELECT company_id, appointment_id FROM beauty_reminder_slugs WHERE slug = ?").get(slug) || null;
}
