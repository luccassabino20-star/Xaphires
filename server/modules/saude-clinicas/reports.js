// Fonte única dos Relatórios (mesmo espírito de dashboard.js e do
// reports/dados.js do Kanban): um `montarRelatorio(tipo, filtros)` só, que
// devolve sempre a mesma forma - {colunas, linhas, total} - pra tela e pra
// exportação (CSV/PDF) nunca poderem discordar do que a tabela mostra.
//
// Cobre só os relatórios com dado real no banco. "Análise de despesas" e
// "Fluxo de caixa" não entram aqui de propósito - são o Financeiro da
// empresa (outro módulo, outra fonte de verdade), não dado de agendamento;
// duplicar a lógica dele aqui divergiria cedo ou tarde. A rota devolve 404
// pra esses dois tipos, e o cliente mostra o aviso "disponível no módulo
// Financeiro" em vez de tentar carregar uma tabela vazia.
import { getDb } from "../../db.js";

function nomesProcedimentos(procedimentosJson) {
  try {
    const arr = JSON.parse(procedimentosJson || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function receitaDoAgendamento(procedimentosJson) {
  return nomesProcedimentos(procedimentosJson).reduce((s, p) => s + (Number(p.priceCents) || 0) * (Number(p.quantity) || 1), 0);
}

function paginar(linhas, page, pageSize) {
  const p = Math.max(1, Number(page) || 1);
  const tam = Math.min(200, Math.max(1, Number(pageSize) || 25));
  const inicio = (p - 1) * tam;
  return { linhas: linhas.slice(inicio, inicio + tam), total: linhas.length, page: p, pageSize: tam };
}

function atendimentosRealizados(db, { from, to, professionalId }) {
  const filtroProf = professionalId ? "AND a.professional_user_id = ?" : "";
  const params = professionalId ? [from, to, professionalId] : [from, to];
  const rows = db
    .prepare(
      `SELECT a.date, a.time, p.name AS paciente, u.name AS profissional, a.procedures, a.insurance_provider, a.payment_type
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         LEFT JOIN users u ON u.id = a.professional_user_id
        WHERE a.date BETWEEN ? AND ? AND a.status = 'concluido' ${filtroProf}
        ORDER BY a.date, a.time`
    )
    .all(...params);
  return {
    colunas: ["data", "hora", "paciente", "profissional", "procedimentos", "convenio"],
    linhas: rows.map((r) => ({
      data: r.date,
      hora: r.time,
      paciente: r.paciente,
      profissional: r.profissional || "-",
      procedimentos: nomesProcedimentos(r.procedures).map((p) => p.name).join(", ") || "-",
      convenio: r.payment_type === "convenio" ? r.insurance_provider || "-" : "Particular",
    })),
  };
}

// "Para retorno": última consulta concluída do paciente caiu dentro do
// período pedido, e não existe nenhum agendamento futuro (data >= hoje)
// pra ele - ou seja, foi atendido e ainda não voltou a marcar.
function pacientesRetorno(db, { from, to, professionalId }) {
  const filtroProf = professionalId ? "AND a.professional_user_id = ?" : "";
  const params = professionalId ? [from, to, professionalId] : [from, to];
  const hoje = new Date().toISOString().slice(0, 10);
  const rows = db
    .prepare(
      `SELECT a.patient_id, p.name AS paciente, p.phone, MAX(a.date) AS ultima, u.name AS profissional
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         LEFT JOIN users u ON u.id = a.professional_user_id
        WHERE a.status = 'concluido' AND a.date BETWEEN ? AND ? ${filtroProf}
        GROUP BY a.patient_id`
    )
    .all(...params);
  const semRetorno = rows.filter((r) => {
    const futuro = db.prepare("SELECT 1 FROM appointments WHERE patient_id = ? AND date >= ? AND status NOT IN ('cancelado','faltou') LIMIT 1").get(r.patient_id, hoje);
    return !futuro;
  });
  return {
    colunas: ["paciente", "telefone", "ultimaConsulta", "profissional"],
    linhas: semRetorno.map((r) => ({ paciente: r.paciente, telefone: r.phone || "-", ultimaConsulta: r.ultima, profissional: r.profissional || "-" })),
  };
}

function pacientesPeriodo(db, { from, to, professionalId }) {
  const filtroProf = professionalId ? "AND a.professional_user_id = ?" : "";
  const params = professionalId ? [from, to, professionalId] : [from, to];
  const rows = db
    .prepare(
      `SELECT a.patient_id, p.name AS paciente, p.phone, MIN(a.date) AS primeira, MAX(a.date) AS ultima, COUNT(*) AS n
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
        WHERE a.status != 'cancelado' AND a.date BETWEEN ? AND ? ${filtroProf}
        GROUP BY a.patient_id
        ORDER BY p.name COLLATE NOCASE`
    )
    .all(...params);
  return {
    colunas: ["paciente", "telefone", "primeiraConsulta", "ultimaConsulta", "numConsultas"],
    linhas: rows.map((r) => ({ paciente: r.paciente, telefone: r.phone || "-", primeiraConsulta: r.primeira, ultimaConsulta: r.ultima, numConsultas: r.n })),
  };
}

function pacientesCid(db, { from, to, professionalId }) {
  const filtroProf = professionalId ? "AND a.professional_user_id = ?" : "";
  const params = professionalId ? [from, to, professionalId] : [from, to];
  const rows = db
    .prepare(
      `SELECT a.cid_code, a.cid_description, COUNT(*) AS ocorrencias, COUNT(DISTINCT a.patient_id) AS pacientes
         FROM appointments a
        WHERE a.status = 'concluido' AND a.cid_code != '' AND a.date BETWEEN ? AND ? ${filtroProf}
        GROUP BY a.cid_code, a.cid_description
        ORDER BY ocorrencias DESC`
    )
    .all(...params);
  return {
    colunas: ["cid", "descricao", "ocorrencias", "pacientes"],
    linhas: rows.map((r) => ({ cid: r.cid_code, descricao: r.cid_description || "-", ocorrencias: r.ocorrencias, pacientes: r.pacientes })),
  };
}

function pacientesIndicacao(db, { from, to, professionalId }) {
  // Base é "paciente atendido no período" (mesma regra de pacientesPeriodo) -
  // a origem é do CADASTRO do paciente (referral_source), não do
  // agendamento, então agrupar por paciente distinto evita contar a mesma
  // indicação várias vezes por causa de retorno.
  const filtroProf = professionalId ? "AND a.professional_user_id = ?" : "";
  const params = professionalId ? [from, to, professionalId] : [from, to];
  const pacientesIds = db
    .prepare(`SELECT DISTINCT a.patient_id FROM appointments a WHERE a.status != 'cancelado' AND a.date BETWEEN ? AND ? ${filtroProf}`)
    .all(...params)
    .map((r) => r.patient_id);
  if (pacientesIds.length === 0) return { colunas: ["origem", "numPacientes"], linhas: [] };
  const marcadores = pacientesIds.map(() => "?").join(",");
  const rows = db.prepare(`SELECT referral_source, COUNT(*) AS n FROM patients WHERE id IN (${marcadores}) GROUP BY referral_source`).all(...pacientesIds);
  const linhas = rows
    .map((r) => ({ origem: r.referral_source || "Não informado", numPacientes: r.n }))
    .sort((a, b) => b.numPacientes - a.numPacientes);
  return { colunas: ["origem", "numPacientes"], linhas };
}

function faltasPaciente(db, { from, to, professionalId }) {
  const filtroProf = professionalId ? "AND a.professional_user_id = ?" : "";
  const params = professionalId ? [from, to, professionalId] : [from, to];
  const rows = db
    .prepare(
      `SELECT a.patient_id, p.name AS paciente, p.phone, COUNT(*) AS n, MAX(a.date) AS ultima
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
        WHERE a.status = 'faltou' AND a.date BETWEEN ? AND ? ${filtroProf}
        GROUP BY a.patient_id
        ORDER BY n DESC`
    )
    .all(...params);
  return {
    colunas: ["paciente", "telefone", "numFaltas", "ultimaFalta"],
    linhas: rows.map((r) => ({ paciente: r.paciente, telefone: r.phone || "-", numFaltas: r.n, ultimaFalta: r.ultima })),
  };
}

// Base comum de receita: um agendamento concluído gera um valor (soma dos
// procedimentos) e um grupo, escolhido por `groupBy` - as duas telas
// (Análise de receitas e Repasse) partem daqui, cada uma agregando à sua
// maneira, pra não terem duas contas de receita que podem divergir.
function linhasDeReceita(db, { from, to, professionalId }) {
  const filtroProf = professionalId ? "AND a.professional_user_id = ?" : "";
  const params = professionalId ? [from, to, professionalId] : [from, to];
  return db
    .prepare(
      `SELECT a.procedures, a.insurance_provider, a.payment_type, a.professional_user_id, u.name AS profissional
         FROM appointments a
         LEFT JOIN users u ON u.id = a.professional_user_id
        WHERE a.status = 'concluido' AND a.date BETWEEN ? AND ? ${filtroProf}`
    )
    .all(...params);
}

function analiseReceitas(db, { from, to, professionalId, groupBy }) {
  const base = linhasDeReceita(db, { from, to, professionalId });
  const mapa = new Map();
  for (const r of base) {
    const procs = nomesProcedimentos(r.procedures);
    const valorTotal = procs.reduce((s, p) => s + (Number(p.priceCents) || 0) * (Number(p.quantity) || 1), 0);
    if (groupBy === "profissional") {
      const chave = r.profissional || "Sem profissional";
      const atual = mapa.get(chave) || { grupo: chave, numAtendimentos: 0, receitaCents: 0 };
      atual.numAtendimentos++;
      atual.receitaCents += valorTotal;
      mapa.set(chave, atual);
    } else if (groupBy === "convenio") {
      const chave = r.payment_type === "convenio" ? r.insurance_provider || "Convênio (sem nome)" : "Particular";
      const atual = mapa.get(chave) || { grupo: chave, numAtendimentos: 0, receitaCents: 0 };
      atual.numAtendimentos++;
      atual.receitaCents += valorTotal;
      mapa.set(chave, atual);
    } else {
      // categoria = por procedimento (um agendamento com 2 procedimentos
      // conta em duas linhas - é a receita DAQUELE item, não do agendamento).
      for (const p of procs) {
        const chave = p.name || "?";
        const atual = mapa.get(chave) || { grupo: chave, numAtendimentos: 0, receitaCents: 0 };
        atual.numAtendimentos += Number(p.quantity) || 1;
        atual.receitaCents += (Number(p.priceCents) || 0) * (Number(p.quantity) || 1);
        mapa.set(chave, atual);
      }
    }
  }
  const linhas = [...mapa.values()].sort((a, b) => b.receitaCents - a.receitaCents);
  return { colunas: ["grupo", "numAtendimentos", "receitaCents"], linhas };
}

function repasseProfissionais(db, { from, to, professionalId }) {
  const base = linhasDeReceita(db, { from, to, professionalId });
  const comissoes = new Map(db.prepare("SELECT user_id, commission_pct FROM professional_settings").all().map((r) => [r.user_id, r.commission_pct]));
  const mapa = new Map();
  for (const r of base) {
    if (!r.professional_user_id) continue;
    const valor = receitaDoAgendamento(r.procedures);
    const atual = mapa.get(r.professional_user_id) || { profissional: r.profissional || "-", numAtendimentos: 0, receitaCents: 0 };
    atual.numAtendimentos++;
    atual.receitaCents += valor;
    mapa.set(r.professional_user_id, atual);
  }
  const linhas = [...mapa.entries()]
    .map(([userId, v]) => {
      const pct = comissoes.get(userId) || 0;
      return { ...v, comissaoPct: pct, repasseCents: Math.round((v.receitaCents * pct) / 100) };
    })
    .sort((a, b) => b.receitaCents - a.receitaCents);
  return { colunas: ["profissional", "numAtendimentos", "receitaCents", "comissaoPct", "repasseCents"], linhas };
}

function satisfacaoPaciente(db, { from, to, professionalId }) {
  const filtroProf = professionalId ? "AND a.professional_user_id = ?" : "";
  const params = professionalId ? [from, to, professionalId] : [from, to];
  const rows = db
    .prepare(`SELECT satisfaction_score AS nota, COUNT(*) AS n FROM appointments a WHERE a.status = 'concluido' AND a.satisfaction_score IS NOT NULL AND a.date BETWEEN ? AND ? ${filtroProf} GROUP BY satisfaction_score`)
    .all(...params);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const linhas = [5, 4, 3, 2, 1].map((nota) => {
    const r = rows.find((x) => x.nota === nota);
    const n = r ? r.n : 0;
    return { nota, quantidade: n, percentual: total > 0 ? Math.round((n / total) * 100) : 0 };
  });
  return { colunas: ["nota", "quantidade", "percentual"], linhas, media: total > 0 ? Math.round((rows.reduce((s, r) => s + r.nota * r.n, 0) / total) * 10) / 10 : null };
}

// Aniversariantes usa só o MÊS (o ano de nascimento não importa pra "quem
// faz aniversário") - `from` traz o mês escolhido, ignorando o dia.
function aniversariantesRelatorio(db, { from }) {
  const mes = (from || new Date().toISOString().slice(0, 10)).slice(5, 7);
  const rows = db
    .prepare("SELECT name, birth_date, phone FROM patients WHERE active = 1 AND birth_date IS NOT NULL AND substr(birth_date, 6, 2) = ? ORDER BY substr(birth_date, 9, 2)")
    .all(mes);
  return {
    colunas: ["paciente", "dataNascimento", "telefone"],
    linhas: rows.map((r) => ({ paciente: r.name, dataNascimento: r.birth_date, telefone: r.phone || "-" })),
  };
}

const CONSTRUTORES = {
  "atendimentos-realizados": atendimentosRealizados,
  "pacientes-retorno": pacientesRetorno,
  "pacientes-periodo": pacientesPeriodo,
  "pacientes-cid": pacientesCid,
  "pacientes-indicacao": pacientesIndicacao,
  "faltas-paciente": faltasPaciente,
  "analise-receitas": analiseReceitas,
  "repasse-profissionais": repasseProfissionais,
  "satisfacao-paciente": satisfacaoPaciente,
  aniversariantes: aniversariantesRelatorio,
};

export const TIPOS_RELATORIO = Object.keys(CONSTRUTORES);

export function montarRelatorio(tipo, filtros) {
  const construtor = CONSTRUTORES[tipo];
  if (!construtor) return null;
  const db = getDb();
  const resultado = construtor(db, filtros);
  const { linhas, total, page, pageSize } = paginar(resultado.linhas, filtros.page, filtros.pageSize);
  return { colunas: resultado.colunas, linhas, total, page, pageSize, media: resultado.media };
}
