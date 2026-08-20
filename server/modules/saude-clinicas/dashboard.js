// Fonte única dos números do Dashboard (mesmo espírito de reports/dados.js):
// uma consulta agregada só, e a rota só devolve o que esta função calcula -
// nenhum dos blocos da tela reimplementa a conta por conta própria, senão os
// cards do topo e os gráficos do meio poderiam discordar do mesmo período.
import { getDb } from "../../db.js";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diasNoPeriodo(from, to) {
  const [ya, ma, da] = from.split("-").map(Number);
  const [yb, mb, db_] = to.split("-").map(Number);
  const ms = new Date(yb, mb - 1, db_) - new Date(ya, ma - 1, da);
  return Math.round(ms / 86400000) + 1;
}

// Nomes de procedimento vêm gravados soltos em appointment.procedures (JSON,
// sem FK - ver o comentário em schema.js sobre preço/quantidade congelados
// na hora do agendamento). Aqui só interessa nome+quantidade pra somar.
function nomesQuantidades(procedimentosJson) {
  try {
    const arr = JSON.parse(procedimentosJson || "[]");
    return Array.isArray(arr) ? arr.map((p) => ({ nome: p.name || "?", qtd: Number(p.quantity) || 1 })) : [];
  } catch {
    return [];
  }
}

export function montarDashboard({ from, to, professionalId }) {
  const db = getDb();
  const filtroProf = professionalId ? "AND a.professional_user_id = ?" : "";
  const params = professionalId ? [from, to, professionalId] : [from, to];

  // ---------- KPIs do topo ----------
  const porStatus = db
    .prepare(`SELECT status, COUNT(*) AS n FROM appointments a WHERE a.date BETWEEN ? AND ? ${filtroProf} GROUP BY status`)
    .all(...params);
  const kpis = { agendados: 0, confirmados: 0, atendidos: 0, faltas: 0 };
  for (const r of porStatus) {
    if (r.status === "agendado") kpis.agendados = r.n;
    else if (r.status === "confirmado") kpis.confirmados = r.n;
    else if (r.status === "concluido") kpis.atendidos = r.n;
    else if (r.status === "faltou") kpis.faltas = r.n;
  }

  // ---------- Pacientes: novos x recorrentes, gênero ----------
  // "Novo" = a primeira consulta de verdade desse paciente (em toda a
  // história, não só no período) cai dentro do período aberto na tela -
  // paciente com histórico anterior ao período é sempre recorrente, mesmo
  // que só tenha uma consulta agora.
  const pacientesIds = db
    .prepare(`SELECT DISTINCT patient_id FROM appointments a WHERE a.date BETWEEN ? AND ? AND status != 'cancelado' ${filtroProf}`)
    .all(...params)
    .map((r) => r.patient_id);

  let novos = 0;
  let recorrentes = 0;
  const genero = { masculino: 0, feminino: 0, outro: 0 };
  if (pacientesIds.length > 0) {
    const marcadores = pacientesIds.map(() => "?").join(",");
    const primeiras = db
      .prepare(`SELECT patient_id, MIN(date) AS primeira FROM appointments WHERE patient_id IN (${marcadores}) AND status != 'cancelado' GROUP BY patient_id`)
      .all(...pacientesIds);
    const mapaPrimeira = new Map(primeiras.map((r) => [r.patient_id, r.primeira]));
    for (const pid of pacientesIds) {
      if ((mapaPrimeira.get(pid) || "") >= from) novos++;
      else recorrentes++;
    }
    const infos = db.prepare(`SELECT gender FROM patients WHERE id IN (${marcadores})`).all(...pacientesIds);
    for (const p of infos) {
      if (p.gender === "masculino") genero.masculino++;
      else if (p.gender === "feminino") genero.feminino++;
      else genero.outro++;
    }
  }

  // ---------- Procedimentos realizados (só agendamentos concluídos) ----------
  const concluidos = db
    .prepare(`SELECT procedures FROM appointments a WHERE a.date BETWEEN ? AND ? AND status = 'concluido' ${filtroProf}`)
    .all(...params);
  const mapaProc = new Map();
  for (const row of concluidos) {
    for (const { nome, qtd } of nomesQuantidades(row.procedures)) {
      mapaProc.set(nome, (mapaProc.get(nome) || 0) + qtd);
    }
  }
  // Só os 3 procedimentos mais frequentes ganham cor própria no gráfico - o
  // resto soma dentro de "Outros" (validado pela skill de dataviz: paleta
  // categórica com mais de 3 fatias visíveis ao mesmo tempo não segura
  // contraste suficiente entre todas as combinações de cor).
  const ranking = [...mapaProc.entries()].sort((a, b) => b[1] - a[1]);
  const procedimentos = ranking.slice(0, 3).map(([nome, total]) => ({ nome, total }));
  const somaOutros = ranking.slice(3).reduce((s, [, n]) => s + n, 0);
  if (somaOutros > 0) procedimentos.push({ nome: null, total: somaOutros });
  const totalProcedimentos = ranking.reduce((s, [, n]) => s + n, 0);

  // ---------- Convênio x particular, e duração média ----------
  const porPagamento = db
    .prepare(`SELECT payment_type, COUNT(*) AS n FROM appointments a WHERE a.date BETWEEN ? AND ? AND status != 'cancelado' ${filtroProf} GROUP BY payment_type`)
    .all(...params);
  const convenio = { particular: 0, convenio: 0 };
  for (const r of porPagamento) {
    if (r.payment_type === "convenio") convenio.convenio += r.n;
    else convenio.particular += r.n;
  }
  const mediaRow = db
    .prepare(`SELECT AVG(duration_min) AS media FROM appointments a WHERE a.date BETWEEN ? AND ? AND status != 'cancelado' ${filtroProf}`)
    .get(...params);
  const duracaoMediaMin = Math.round(mediaRow?.media || 0);

  // ---------- Evolução no período ----------
  // Período curto (~2 meses ou menos) agrupa por dia; mais longo que isso
  // vira mês, senão o gráfico de linha teria ponto demais pra caber.
  const porDia = diasNoPeriodo(from, to) <= 62;
  const evolucaoRows = porDia
    ? db.prepare(`SELECT a.date AS chave, COUNT(*) AS n FROM appointments a WHERE a.date BETWEEN ? AND ? AND status != 'cancelado' ${filtroProf} GROUP BY a.date ORDER BY a.date`).all(...params)
    : db.prepare(`SELECT substr(a.date,1,7) AS chave, COUNT(*) AS n FROM appointments a WHERE a.date BETWEEN ? AND ? AND status != 'cancelado' ${filtroProf} GROUP BY chave ORDER BY chave`).all(...params);

  // ---------- Aniversariantes do dia ----------
  // Sempre HOJE, de propósito - independente do período/profissional
  // escolhido no filtro: é uma lembrança operacional pro dia corrente, não
  // uma métrica do intervalo analisado.
  const mesDia = hojeCivil().slice(5); // "MM-DD"
  const aniversariantes = db
    .prepare(`SELECT id, name, birth_date, phone FROM patients WHERE active = 1 AND birth_date IS NOT NULL AND substr(birth_date, 6) = ? ORDER BY name COLLATE NOCASE`)
    .all(mesDia);

  return {
    periodo: { from, to, agrupamento: porDia ? "dia" : "mes" },
    kpis,
    pacientes: { novos, recorrentes, genero, total: pacientesIds.length },
    procedimentos: { itens: procedimentos, total: totalProcedimentos },
    convenio,
    duracaoMediaMin,
    evolucao: evolucaoRows.map((r) => ({ chave: r.chave, total: r.n })),
    aniversariantes,
  };
}
