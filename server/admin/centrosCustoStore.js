// Centros de custo HIERÁRQUICOS e MULTIEMPRESA. Mora no banco do diretório (o
// global), e não no banco de cada empresa, de propósito: aqui a estrutura é
// gerida pelo painel da plataforma, que é o único ator com visão cross-empresa.
// Um usuário de empresa nunca vê os centros de outra - ele só recebe, no módulo
// Financeiro, os centros ANALÍTICOS ATIVOS da própria empresa para lançar.
//
// Máscara: código hierárquico com níveis numéricos separados por ponto
// (1.02.01.01.01). O pai é DERIVADO do código - o filho "1.02.01" pertence ao pai
// "1.02". Só SINTÉTICO tem filhos; só ANALÍTICO recebe lançamento. O tipo é
// mantido automaticamente: um nó nasce analítico e vira sintético quando ganha o
// primeiro filho - igual a um plano de contas, onde a conta que se subdivide
// deixa de receber lançamento.

import crypto from "node:crypto";
import { getDirectoryDb } from "../directory.js";

const db = getDirectoryDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS centros_custo (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    codigo     TEXT NOT NULL,
    nome       TEXT NOT NULL,
    parent_id  TEXT,
    tipo       TEXT NOT NULL DEFAULT 'analitico',
    ativo      INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_empresa_codigo ON centros_custo(company_id, codigo);
  CREATE INDEX        IF NOT EXISTS idx_cc_parent        ON centros_custo(parent_id);
`);

const nowIso = () => new Date().toISOString();

// Erro de regra de negócio, com código estável. As rotas transformam em 400.
class RegraError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// Máscara: um ou mais níveis numéricos separados por ponto. "1", "1.02",
// "1.02.01.01.01" valem; "1.", ".1", "1.a", "1..2" não.
const MASCARA = /^\d+(\.\d+)+$|^\d+$/;

export function validarCodigo(codigo) {
  return typeof codigo === "string" && MASCARA.test(codigo.trim());
}

// Nível de profundidade = quantos pontos há (raiz "1" = 0). Serve para a UI
// indentar a árvore sem ter de subir pelos parent_id.
function nivelDe(codigo) {
  return codigo.split(".").length - 1;
}

// Código do pai = o código sem o último nível. Raiz (um nível só) não tem pai.
function codigoDoPai(codigo) {
  const partes = codigo.split(".");
  return partes.length <= 1 ? null : partes.slice(0, -1).join(".");
}

// Ordena numericamente por nível - texto puro poria "1.10" antes de "1.2".
function ordenarPorCodigo(rows) {
  return rows.sort((a, b) => {
    const pa = a.codigo.split(".").map(Number);
    const pb = b.codigo.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const da = pa[i] ?? -1;
      const db_ = pb[i] ?? -1;
      if (da !== db_) return da - db_;
    }
    return 0;
  });
}

function empresaExiste(companyId) {
  return !!db.prepare("SELECT id FROM companies WHERE id = ?").get(companyId);
}

export function acharCentro(id) {
  return db.prepare("SELECT * FROM centros_custo WHERE id = ?").get(id) || null;
}

export function acharPorCodigo(companyId, codigo) {
  return db.prepare("SELECT * FROM centros_custo WHERE company_id = ? AND codigo = ?").get(companyId, codigo) || null;
}

// Lista de uma empresa (ou de todas, quando companyId é omitido), já com o nome da
// empresa junto e ordenada pela árvore. `nivel` acompanha para a indentação.
export function listarCentros(companyId) {
  const rows = companyId
    ? db.prepare(
        `SELECT cc.*, c.name AS empresa_nome FROM centros_custo cc
         LEFT JOIN companies c ON c.id = cc.company_id WHERE cc.company_id = ?`
      ).all(companyId)
    : db.prepare(
        `SELECT cc.*, c.name AS empresa_nome FROM centros_custo cc
         LEFT JOIN companies c ON c.id = cc.company_id`
      ).all();
  return ordenarPorCodigo(rows).map(publicCentro);
}

// Só os analíticos ativos de uma empresa: é o que o módulo Financeiro oferece no
// select de lançamento (sintético não recebe lançamento). Usado quando os
// lançamentos passarem a apontar para esta tabela (fase de integração).
export function listarAnaliticosAtivos(companyId) {
  const rows = db.prepare(
    "SELECT * FROM centros_custo WHERE company_id = ? AND tipo = 'analitico' AND ativo = 1"
  ).all(companyId);
  return ordenarPorCodigo(rows).map(publicCentro);
}

export function publicCentro(r) {
  if (!r) return null;
  return {
    id: r.id,
    companyId: r.company_id,
    empresaNome: r.empresa_nome ?? null,
    codigo: r.codigo,
    nome: r.nome,
    parentId: r.parent_id,
    tipo: r.tipo,
    ativo: r.ativo === 1,
    nivel: nivelDe(r.codigo),
  };
}

// Cria um centro. Deriva o pai pelo código, exige que o pai exista e seja
// sintético (ou o transforma em sintético, se ainda era folha analítica), e barra
// código duplicado na mesma empresa.
export function criarCentro({ companyId, codigo, nome }) {
  const cod = String(codigo || "").trim();
  const desc = String(nome || "").trim();
  if (!companyId || !empresaExiste(companyId)) throw new RegraError("Empresa não encontrada", "CC_EMPRESA_NOT_FOUND");
  if (!validarCodigo(cod)) throw new RegraError("Código inválido - use níveis numéricos separados por ponto (ex.: 1.02.01)", "CC_CODIGO_INVALID");
  if (!desc) throw new RegraError("Informe a descrição do centro de custo", "CC_NOME_REQUIRED");
  if (acharPorCodigo(companyId, cod)) throw new RegraError("Já existe um centro com esse código nesta empresa", "CC_CODIGO_DUPLICADO");

  const codPai = codigoDoPai(cod);
  let parentId = null;
  if (codPai) {
    const pai = acharPorCodigo(companyId, codPai);
    if (!pai) throw new RegraError(`Cadastre o centro pai (${codPai}) antes deste`, "CC_PAI_AUSENTE");
    parentId = pai.id;
    // O pai passa a ter filho: vira sintético (deixa de receber lançamento).
    if (pai.tipo !== "sintetico") {
      db.prepare("UPDATE centros_custo SET tipo = 'sintetico' WHERE id = ?").run(pai.id);
    }
  }

  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO centros_custo (id, company_id, codigo, nome, parent_id, tipo, ativo, created_at) VALUES (?, ?, ?, ?, ?, 'analitico', 1, ?)"
  ).run(id, companyId, cod, desc, parentId, nowIso());
  return publicCentro(acharCentro(id));
}

// Edita só a descrição - o código define a hierarquia e mudá-lo renomearia a
// subárvore inteira; isso fica para uma ação própria, se for preciso.
export function editarCentro(id, { nome }) {
  const atual = acharCentro(id);
  if (!atual) return null;
  const desc = String(nome ?? atual.nome).trim();
  if (!desc) throw new RegraError("Informe a descrição do centro de custo", "CC_NOME_REQUIRED");
  db.prepare("UPDATE centros_custo SET nome = ? WHERE id = ?").run(desc, id);
  return publicCentro(acharCentro(id));
}

// Todos os descendentes (filhos, netos...) de um nó, pelo parent_id.
function descendentes(id) {
  const filhos = db.prepare("SELECT id FROM centros_custo WHERE parent_id = ?").all(id);
  let todos = [];
  for (const f of filhos) {
    todos.push(f.id);
    todos = todos.concat(descendentes(f.id));
  }
  return todos;
}

// Ativa/desativa. Desativar um sintético desativa a subárvore inteira - um centro
// pai inativo com filhos ativos seria uma árvore inconsistente. Reativar exige o
// pai ativo, pelo mesmo motivo.
export function definirAtivo(id, ativo) {
  const atual = acharCentro(id);
  if (!atual) return null;
  if (ativo) {
    if (atual.parent_id) {
      const pai = acharCentro(atual.parent_id);
      if (pai && pai.ativo !== 1) throw new RegraError("Reative o centro pai antes deste", "CC_PAI_INATIVO");
    }
    db.prepare("UPDATE centros_custo SET ativo = 1 WHERE id = ?").run(id);
  } else {
    const ids = [id, ...descendentes(id)];
    const marcas = ids.map(() => "?").join(",");
    db.prepare(`UPDATE centros_custo SET ativo = 0 WHERE id IN (${marcas})`).run(...ids);
  }
  return publicCentro(acharCentro(id));
}

// Exclui um centro e TODA a sua subárvore (descendentes), escopado à empresa.
// Devolve os ids removidos para o chamador anular a referência nos lançamentos.
// Se o pai ficar sem filhos, volta a ser analítico (folha recebe lançamento).
export function excluirCentro(companyId, id) {
  const alvo = acharCentro(id);
  if (!alvo || alvo.company_id !== companyId) return null;
  const ids = [id, ...descendentes(id)];
  const marcas = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM centros_custo WHERE id IN (${marcas}) AND company_id = ?`).run(...ids, companyId);
  if (alvo.parent_id) {
    const aindaTemFilho = db.prepare("SELECT 1 FROM centros_custo WHERE parent_id = ? LIMIT 1").get(alvo.parent_id);
    if (!aindaTemFilho) db.prepare("UPDATE centros_custo SET tipo = 'analitico' WHERE id = ?").run(alvo.parent_id);
  }
  return ids;
}

// Exclui TODOS os centros da empresa. Devolve os ids removidos.
export function excluirTodosCentros(companyId) {
  const ids = db.prepare("SELECT id FROM centros_custo WHERE company_id = ?").all(companyId).map((r) => r.id);
  db.prepare("DELETE FROM centros_custo WHERE company_id = ?").run(companyId);
  return ids;
}

// A empresa já tem algum centro na tabela global? Usado pela migração preguiçosa
// (repo do Financeiro) para saber se ainda precisa importar o legado por-empresa.
export function empresaTemCentros(companyId) {
  return !!db.prepare("SELECT 1 FROM centros_custo WHERE company_id = ? LIMIT 1").get(companyId);
}

// Importa os centros por-empresa antigos (financeiro_centros_custo) para a tabela
// global, PRESERVANDO o id - é o que faz os lançamentos existentes continuarem
// apontando certo (lancamentos.centro_custo_id não muda). Todos entram como raiz
// analítica: o código antigo era texto livre, sem hierarquia; o admin reorganiza
// depois. Código vazio ou repetido vira um sequencial, para respeitar o índice
// único (company_id, codigo).
export function importarLegado(companyId, linhas) {
  if (!linhas?.length) return;
  const usados = new Set(
    db.prepare("SELECT codigo FROM centros_custo WHERE company_id = ?").all(companyId).map((r) => r.codigo)
  );
  const insert = db.prepare(
    "INSERT OR IGNORE INTO centros_custo (id, company_id, codigo, nome, parent_id, tipo, ativo, created_at) VALUES (?, ?, ?, ?, NULL, 'analitico', ?, ?)"
  );
  // node:sqlite (DatabaseSync) não tem o db.transaction() do better-sqlite3; para
  // uma migração pontual de poucas linhas, o loop de INSERTs basta.
  let seq = 1;
  for (const l of linhas) {
    let codigo = String(l.codigo || "").trim();
    if (!codigo || usados.has(codigo)) {
      while (usados.has(String(seq))) seq++;
      codigo = String(seq);
    }
    usados.add(codigo);
    insert.run(l.id, companyId, codigo, l.nome, l.ativo ?? 1, l.created_at || nowIso());
  }
}

export { RegraError };
