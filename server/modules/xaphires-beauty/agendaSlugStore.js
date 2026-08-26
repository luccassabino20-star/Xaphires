// Slug curto do link público de agendamento (Fase 4) - mora no banco do
// DIRETÓRIO (global), não no da empresa, mesmo motivo de
// saude-clinicas/captacaoStore.js: a rota pública recebe só o slug na URL e
// ainda não sabe de qual empresa é.
//
// Diferente da captação de anamnese (um slug por TEMPLATE), aqui é um slug
// por EMPRESA: o visitante escolhe o serviço/profissional dentro do próprio
// formulário público, não a partir de um link específico de recurso.
import { getDirectoryDb } from "../../directory.js";

const db = getDirectoryDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS beauty_booking_slugs (
    slug TEXT PRIMARY KEY,
    company_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
`);

// Sem 0/O/1/l/I: pares que mais se confundem se alguém precisar digitar o
// link à mão - mesmo alfabeto de captacaoStore.js.
const ALFABETO = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
function gerarSlug() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return s;
}

// Sempre o mesmo slug pra mesma empresa (UNIQUE em company_id): reabrir
// "copiar link" depois não troca o link que já pode estar num cartaz.
export function getOuCriarSlugAgendamento(companyId) {
  const existente = db.prepare("SELECT slug FROM beauty_booking_slugs WHERE company_id = ?").get(companyId);
  if (existente) return existente.slug;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const slug = gerarSlug();
    try {
      db.prepare("INSERT INTO beauty_booking_slugs (slug, company_id, created_at) VALUES (?, ?, ?)").run(slug, companyId, new Date().toISOString());
      return slug;
    } catch {
      // colidiu com um slug existente - tenta de novo com outro sorteio
    }
  }
  throw new Error("Não foi possível gerar um slug de agendamento único");
}

export function getAgendamentoPorSlug(slug) {
  return db.prepare("SELECT company_id FROM beauty_booking_slugs WHERE slug = ?").get(slug) || null;
}
