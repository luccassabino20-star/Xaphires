// Slug curto do link de captação de anamnese (ver AnamneseView.jsx e
// server/routes/anamnesePublica.js) - mora no banco do DIRETÓRIO (global),
// não no da empresa, pelo mesmo motivo de billing/store.js e admin/store.js:
// a rota pública recebe só o slug na URL e ainda não sabe de qual empresa é
// (companyId/templateId estão DENTRO do banco da empresa, que só dá pra
// abrir depois de já saber a empresa - problema de ovo e galinha que só o
// banco global resolve).
import { getDirectoryDb } from "../../directory.js";

const db = getDirectoryDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS anamnese_captacao_slugs (
    slug TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_captacao_empresa_template ON anamnese_captacao_slugs(company_id, template_id);
`);

// Sem 0/O/1/l/I: são os pares que mais se confundem se alguém precisar
// ditar ou digitar o link à mão em vez de clicar - 8 caracteres nesse
// alfabeto (54^8, ~7.8×10^13 combinações) torna colisão praticamente
// impossível mesmo sem checagem além do UNIQUE da própria coluna.
const ALFABETO = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
function gerarSlug() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return s;
}

// Sempre o mesmo slug pro mesmo template (índice único em company_id+
// template_id): reabrir "Copiar link de captação" depois não troca o link
// que já pode estar impresso num cartaz ou salvo na bio de alguém.
export function getOuCriarSlugCaptacao(companyId, templateId) {
  const existente = db
    .prepare("SELECT slug FROM anamnese_captacao_slugs WHERE company_id = ? AND template_id = ?")
    .get(companyId, templateId);
  if (existente) return existente.slug;
  // Tenta algumas vezes até um slug não colidir - o UNIQUE da coluna é
  // quem de fato garante a integridade; isto só evita a exceção no caso
  // (extremamente raro) de sortear um slug já usado por outro template.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const slug = gerarSlug();
    try {
      db.prepare("INSERT INTO anamnese_captacao_slugs (slug, company_id, template_id, created_at) VALUES (?, ?, ?, ?)").run(
        slug,
        companyId,
        templateId,
        new Date().toISOString()
      );
      return slug;
    } catch {
      // colidiu com um slug existente - tenta de novo com outro sorteio
    }
  }
  throw new Error("Não foi possível gerar um slug de captação único");
}

export function getCaptacaoPorSlug(slug) {
  return db.prepare("SELECT company_id, template_id FROM anamnese_captacao_slugs WHERE slug = ?").get(slug) || null;
}
