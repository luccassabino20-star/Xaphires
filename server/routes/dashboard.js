import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { ah } from "../asyncHandler.js";
import { getCompany } from "../directory.js";
import { isModuleEnabled } from "../modules.js";
import { canUseBeautyFinance } from "../plans.js";
import { getWorkspace } from "../repo.js";
import * as beauty from "../modules/xaphires-beauty/repo.js";
import { montarDRE } from "../modules/financeiro/calculos.js";
import { lancamentosPagosNoPeriodo } from "../modules/financeiro/repo.js";

const router = Router();
router.use(requireAuth);

// Agregador do Dashboard central (Hub) - mesmo espírito de /api/plan e
// /api/modules: o servidor já calcula tudo, o cliente só desenha o que veio.
// Cada bloco de módulo (Beauty/Financeiro) só entra quando isModuleEnabled()
// autoriza a empresa E o usuário - a mesma checagem que os próprios routers
// desses módulos usam, então o dashboard nunca mostra um número de algo que
// o usuário não teria como abrir na tela de origem. Kanban não passa por
// isModuleEnabled porque "quadro" é core e não tem gate de módulo.

function doisDig(n) {
  return String(n).padStart(2, "0");
}
function dataCivil(d) {
  return `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;
}
function isoLocal(d) {
  return `${dataCivil(d)}T${doisDig(d.getHours())}:${doisDig(d.getMinutes())}:${doisDig(d.getSeconds())}`;
}
function inicioDoDia(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fimDoDia(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
// Segunda-feira como início de semana (convenção do produto, ver Agenda).
function inicioDaSemana(d) {
  const x = inicioDoDia(d);
  const dia = x.getDay();
  x.setDate(x.getDate() - (dia === 0 ? 6 : dia - 1));
  return x;
}
function fimDaSemana(d) {
  const x = inicioDaSemana(d);
  x.setDate(x.getDate() + 7);
  x.setMilliseconds(x.getMilliseconds() - 1);
  return x;
}
function inicioDoMes(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function crescimentoPct(atual, anterior) {
  if (!anterior) return null; // sem base de comparação - não inventa 0% nem infinito
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

router.get(
  "/resumo",
  ah(async (req, res) => {
    const company = getCompany(req.companyId);
    const user = req.user;
    const agora = new Date();

    // ---------- Kanban (core, sempre disponível) ----------
    const workspace = getWorkspace(user.id);
    let tarefasPendentes = 0;
    const cardsRecentes = [];
    for (const board of workspace) {
      for (const card of Object.values(board.cards)) {
        if (!card.completed && !card.archived) tarefasPendentes++;
        if (!card.archived && card.createdAt) cardsRecentes.push({ titulo: card.title, em: card.createdAt });
      }
    }

    const resumo = {
      tarefasPendentes,
      atendimentosHoje: null,
      proximosAgendamentos: [],
      ocupacaoSemana: null,
      faturamentoMes: null,
      faturamentoMesAnterior: null,
      atividades: [],
    };

    const eventos = cardsRecentes
      .sort((a, b) => Date.parse(b.em) - Date.parse(a.em))
      .slice(0, 3)
      .map((c) => ({ tipo: "tarefa_criada", em: c.em, titulo: c.titulo }));

    let faturamentoBeauty = 0;
    let faturamentoBeautyAnterior = 0;
    let faturamentoFinanceiro = 0;
    let faturamentoFinanceiroAnterior = 0;
    let temFaturamento = false;

    // ---------- Xaphires Beauty ----------
    if (isModuleEnabled(company, user, "xaphires-beauty")) {
      const inicioHoje = inicioDoDia(agora);
      const fimHoje = fimDoDia(agora);
      const agendamentosHoje = beauty
        .listAppointments(isoLocal(inicioHoje), isoLocal(fimHoje))
        .filter((a) => a.status !== "cancelado");
      resumo.atendimentosHoje = agendamentosHoje.length;
      resumo.proximosAgendamentos = agendamentosHoje
        .filter((a) => a.ends_at >= isoLocal(agora))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          clientName: a.client_name,
          serviceName: a.service_name,
          startsAt: a.starts_at,
          status: a.status,
        }));

      // Ocupação da semana: minutos ocupados / capacidade cadastrada em
      // beauty_staff_hours. Sem capacidade cadastrada (ninguém preencheu o
      // próprio expediente ainda), fica null - não é 0%, é "sem dado".
      const inicioSemana = inicioDaSemana(agora);
      const fimSemana = fimDaSemana(agora);
      const agendamentosSemana = beauty
        .listAppointments(isoLocal(inicioSemana), isoLocal(fimSemana))
        .filter((a) => a.status !== "cancelado");
      const minutosOcupados = agendamentosSemana.reduce((soma, a) => {
        const min = (new Date(a.ends_at) - new Date(a.starts_at)) / 60000;
        return soma + Math.max(0, min);
      }, 0);
      const capacidade = beauty.getWeeklyCapacityMinutes();
      resumo.ocupacaoSemana = capacidade > 0 ? Math.round((minutosOcupados / capacidade) * 100) : null;

      if (canUseBeautyFinance(company.plan)) {
        temFaturamento = true;
        const inicioMesAtual = isoLocal(inicioDoMes(agora));
        const inicioMesAnterior = isoLocal(inicioDoMes(new Date(agora.getFullYear(), agora.getMonth() - 1, 1)));
        faturamentoBeauty = beauty.somarPagamentosNoPeriodo(inicioMesAtual, isoLocal(agora));
        faturamentoBeautyAnterior = beauty.somarPagamentosNoPeriodo(inicioMesAnterior, inicioMesAtual);
      }

      const clientes = beauty.listRecentClients(5);
      const confirmacoes = beauty.listRecentConfirmations(5);
      eventos.push(
        ...clientes.map((c) => ({ tipo: "cliente_novo", em: c.created_at, nome: c.name })),
        ...confirmacoes.map((a) => ({ tipo: "agendamento_confirmado", em: a.confirmed_at, nome: a.client_name }))
      );
      if (canUseBeautyFinance(company.plan)) {
        const despesas = beauty.listRecentExpenses(5);
        eventos.push(...despesas.map((d) => ({ tipo: "despesa_lancada", em: d.created_at, descricao: d.description, valorCents: d.amount_cents })));
      }
    }

    // ---------- Financeiro (ERP IRES) ----------
    if (isModuleEnabled(company, user, "financeiro")) {
      temFaturamento = true;
      const de = dataCivil(inicioDoMes(agora));
      const ate = dataCivil(agora);
      const mesAnteriorInicio = dataCivil(new Date(agora.getFullYear(), agora.getMonth() - 1, 1));
      const mesAnteriorFim = dataCivil(new Date(agora.getFullYear(), agora.getMonth(), 0));
      const dreAtual = montarDRE(de, ate);
      const dreAnterior = montarDRE(mesAnteriorInicio, mesAnteriorFim);
      faturamentoFinanceiro = dreAtual.totalReceitas;
      faturamentoFinanceiroAnterior = dreAnterior.totalReceitas;

      const lancamentos = lancamentosPagosNoPeriodo(de, ate)
        .filter((l) => l.tipo === "receber")
        .sort((a, b) => (b.paid_at || "").localeCompare(a.paid_at || ""))
        .slice(0, 5);
      eventos.push(...lancamentos.map((l) => ({ tipo: "venda_lancada", em: `${l.paid_at}T12:00:00`, descricao: l.descricao, valorCents: l.valor_cents })));
    }

    if (temFaturamento) {
      resumo.faturamentoMes = faturamentoBeauty + faturamentoFinanceiro;
      resumo.faturamentoMesAnterior = faturamentoBeautyAnterior + faturamentoFinanceiroAnterior;
      resumo.crescimentoPct = crescimentoPct(resumo.faturamentoMes, resumo.faturamentoMesAnterior);
    } else {
      resumo.crescimentoPct = null;
    }

    // Date.parse (não localeCompare) porque as fontes não usam o mesmo
    // formato: Beauty/Kanban gravam created_at/confirmed_at em UTC ("Z", via
    // nowIso()), e o lançamento do Financeiro só tem data civil (paid_at,
    // sem hora) - comparar como string ordenaria errado perto da virada do
    // dia/mês. Date.parse entende os dois e devolve o instante real.
    resumo.atividades = eventos
      .filter((e) => e.em)
      .sort((a, b) => Date.parse(b.em) - Date.parse(a.em))
      .slice(0, 8);

    res.json(resumo);
  })
);

export { router };
